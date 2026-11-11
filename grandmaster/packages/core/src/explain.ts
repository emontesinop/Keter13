import { Chess, type Square } from "chess.js";
import type { MoveClass, PvLine } from "./types";
import {
  hangingPieces, opponentThreats, pawnStructure, kingSafety, mobility, outposts, PIECE_NAME_ES, PIECE_NAME_EN,
  type Threat, material,
} from "./features";
import { detectMotifs, MOTIF_LABEL, type Motif } from "./motifs";
import { formatLine, uciLineToSan, moveToUci } from "./pgn";

export type Lang = "es" | "en";
const L = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);
const pieceName = (lang: Lang, t: keyof typeof PIECE_NAME_ES) => (lang === "es" ? PIECE_NAME_ES[t] : PIECE_NAME_EN[t]);

export interface ExplanationPoint {
  kind: "threat" | "hanging" | "refutation" | "tactic" | "structure" | "king" | "activity" | "plan" | "material" | "principle";
  text: string;
}

export interface MoveExplanation {
  headline: string;
  points: ExplanationPoint[];
  bestSan?: string;
  bestLine?: string;
  refutationLine?: string;
  motifsBest: Motif[];
  motifsRefutation: Motif[];
  threatsIgnored: Threat[];
  /** knowledge-base concept ids relevant to the lesson */
  concepts: string[];
  /** true when every claim was derived from the board + engine lines (no LLM involved) */
  grounded: true;
}

export interface ExplainInput {
  fenBefore: string;
  playedUci: string;
  bestLine?: PvLine; // engine line for fenBefore
  afterLine?: PvLine; // engine line for position after played move (opponent to move)
  winBefore?: number; // mover POV
  winAfter?: number;
  classification?: MoveClass;
  lang?: Lang;
}

function applyUci(fen: string, uci: string): { fen: string; san: string } | null {
  try {
    const c = new Chess(fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return { fen: c.fen(), san: m.san };
  } catch { return null; }
}

function motifList(lang: Lang, motifs: Motif[]) {
  return motifs.map((m) => MOTIF_LABEL[m][lang]).join(", ");
}

/**
 * Build a grounded explanation of why the played move was weaker than the engine's choice.
 * Every sentence references concrete squares, pieces or engine lines — nothing is invented.
 */
export function explainMove(i: ExplainInput): MoveExplanation {
  const lang = i.lang ?? "es";
  const points: ExplanationPoint[] = [];
  const concepts = new Set<string>();
  const mover = new Chess(i.fenBefore).turn();
  const played = applyUci(i.fenBefore, i.playedUci);
  if (!played) throw new Error("Illegal played move for explanation");
  const best = i.bestLine?.pv[0] ? applyUci(i.fenBefore, i.bestLine.pv[0]) : null;
  const isBest = !!best && i.bestLine!.pv[0] === i.playedUci;

  // 1) Threat awareness — what did the opponent threaten before our move?
  const threats = opponentThreats(i.fenBefore).filter((t) => t.kind === "mate" || t.gain >= 2);
  const refutationFirst = i.afterLine?.pv[0];
  const threatsIgnored = threats.filter((t) => t.uci === refutationFirst);
  if (threatsIgnored.length) {
    const t = threatsIgnored[0];
    points.push({
      kind: "threat",
      text: t.kind === "mate"
        ? L(lang, `Tu rival amenazaba mate con ${t.san} y ${played.san} no lo impide.`, `Your opponent threatened mate with ${t.san}, and ${played.san} does not stop it.`)
        : L(lang, `Antes de jugar, tu rival ya amenazaba ${t.san} (gana ≈${t.gain} de material). ${played.san} no atiende esa amenaza.`,
            `Before your move, the opponent already threatened ${t.san} (wins ≈${t.gain} material). ${played.san} doesn't address it.`),
    });
    concepts.add("threat-check");
  } else if (threats.length && !isBest) {
    points.push({ kind: "threat", text: L(lang, `Amenazas del rival a vigilar en esta posición: ${threats.map((t) => t.san).join(", ")}.`, `Opponent threats to watch here: ${threats.map((t) => t.san).join(", ")}.`) });
    concepts.add("threat-check");
  }

  // 2) Pieces left en prise by the played move
  const hangBefore = new Set(hangingPieces(i.fenBefore, mover).map((h) => h.square));
  const hangAfter = hangingPieces(played.fen, mover).filter((h) => !hangBefore.has(h.square));
  for (const h of hangAfter.slice(0, 2)) {
    points.push({ kind: "hanging", text: L(lang,
      `Después de ${played.san}, tu ${pieceName(lang, h.type)} en ${h.square} queda insuficientemente defendido (el intercambio te costaría ≈${h.see}).`,
      `After ${played.san}, your ${pieceName(lang, h.type)} on ${h.square} is insufficiently defended (the exchange would cost ≈${h.see}).`) });
    concepts.add("loose-pieces");
  }

  // 3) The refutation: what the opponent does now
  let motifsRefutation: Motif[] = [];
  let refutationLine: string | undefined;
  if (i.afterLine?.pv.length && !isBest) {
    motifsRefutation = detectMotifs({ fen: played.fen, line: i.afterLine.pv, mateIn: i.afterLine.score.mate });
    refutationLine = formatLine(played.fen, uciLineToSan(played.fen, i.afterLine.pv.slice(0, 6)));
    if ((i.winBefore ?? 0) - (i.winAfter ?? 0) >= 5) {
      points.push({ kind: "refutation", text: L(lang,
        `La respuesta precisa del rival es ${refutationLine}${motifsRefutation.length ? ` — motivo: ${motifList(lang, motifsRefutation)}` : ""}.`,
        `The opponent's accurate reply is ${refutationLine}${motifsRefutation.length ? ` — motif: ${motifList(lang, motifsRefutation)}` : ""}.`) });
    }
  }

  // 4) Why the best move works (tactics)
  let motifsBest: Motif[] = [];
  let bestLine: string | undefined;
  if (best && i.bestLine) {
    const gain = (i.winBefore ?? 50) - (i.winAfter ?? 50);
    motifsBest = detectMotifs({ fen: i.fenBefore, line: i.bestLine.pv, mateIn: i.bestLine.score.mate, winGain: gain });
    bestLine = formatLine(i.fenBefore, uciLineToSan(i.fenBefore, i.bestLine.pv.slice(0, 8)));
    if (!isBest) {
      if (motifsBest.length) {
        points.push({ kind: "tactic", text: L(lang,
          `${best.san} era más fuerte: ${bestLine}. Idea táctica: ${motifList(lang, motifsBest)}.`,
          `${best.san} was stronger: ${bestLine}. Tactical idea: ${motifList(lang, motifsBest)}.`) });
        motifsBest.forEach((m) => concepts.add(`motif-${m}`));
      } else {
        points.push({ kind: "plan", text: L(lang, `La continuación del motor es ${bestLine}.`, `The engine continuation is ${bestLine}.`) });
      }
    }

    // 5) Positional comparison after best vs after played (from mover's perspective)
    if (!isBest) {
      const ps = pawnStructure(played.fen, mover), bs = pawnStructure(best.fen, mover);
      const weakP = ps.isolated.length + ps.doubled.length + ps.backward.length;
      const weakB = bs.isolated.length + bs.doubled.length + bs.backward.length;
      if (weakP > weakB) {
        const list = [...new Set([...ps.isolated, ...ps.doubled, ...ps.backward])].filter((s) => !bs.isolated.includes(s) && !bs.doubled.includes(s) && !bs.backward.includes(s));
        points.push({ kind: "structure", text: L(lang,
          `${played.san} debilita tu estructura de peones${list.length ? ` (${list.join(", ")})` : ""}; ${best.san} la mantiene sana.`,
          `${played.san} weakens your pawn structure${list.length ? ` (${list.join(", ")})` : ""}; ${best.san} keeps it healthy.`) });
        concepts.add("pawn-weaknesses");
      }
      const kp = kingSafety(played.fen, mover), kb = kingSafety(best.fen, mover);
      if (kp && kb && kp.shield < kb.shield) {
        points.push({ kind: "king", text: L(lang, `${played.san} reduce el escudo de peones de tu rey (${kb.shield}→${kp.shield}).`, `${played.san} reduces your king's pawn shield (${kb.shield}→${kp.shield}).`) });
        concepts.add("king-safety");
      }
      const mp = mobility(played.fen, mover), mb = mobility(best.fen, mover);
      if (mb - mp >= 5) {
        points.push({ kind: "activity", text: L(lang, `${best.san} da a tus piezas más actividad (${mb} vs ${mp} jugadas disponibles).`, `${best.san} gives your pieces more activity (${mb} vs ${mp} available moves).`) });
        concepts.add("piece-activity");
      }
      const op = outposts(played.fen, mover), ob = outposts(best.fen, mover);
      const newOut = ob.filter((s) => !op.includes(s as Square));
      if (newOut.length) {
        points.push({ kind: "activity", text: L(lang, `${best.san} establece una pieza en un puesto avanzado (${newOut.join(", ")}): protegida por un peón y sin peones rivales que puedan expulsarla.`, `${best.san} establishes a piece on an outpost (${newOut.join(", ")}): pawn-protected and impossible to chase with enemy pawns.`) });
        concepts.add("outposts");
      }
      const ppB = bs.passed.length, ppP = ps.passed.length;
      if (ppB > ppP) points.push({ kind: "structure", text: L(lang, `${best.san} crea o conserva un peón pasado.`, `${best.san} creates or keeps a passed pawn.`) });
    }
  }

  // Material comparison along the lines (concrete)
  if (best && i.bestLine && i.afterLine && !isBest) {
    const endBest = endFen(i.fenBefore, i.bestLine.pv.slice(0, 6));
    const endPlayed = endFen(played.fen, i.afterLine.pv.slice(0, 5));
    const sign = mover === "w" ? 1 : -1;
    const dm = sign * (material(endBest).diff - material(endPlayed).diff);
    if (dm >= 2) points.push({ kind: "material", text: L(lang, `Comparando ambas líneas, la diferencia es ≈${dm} puntos de material a favor de ${best.san}.`, `Comparing both lines, the difference is ≈${dm} points of material in favour of ${best.san}.`) });
  }

  const cls = i.classification;
  const headline = isBest
    ? L(lang, `${played.san} es la mejor jugada según el motor.`, `${played.san} is the engine's top choice.`)
    : cls === "blunder" ? L(lang, `${played.san} es un error grave.`, `${played.san} is a blunder.`)
    : cls === "mistake" ? L(lang, `${played.san} es un error.`, `${played.san} is a mistake.`)
    : cls === "inaccuracy" ? L(lang, `${played.san} es una imprecisión.`, `${played.san} is an inaccuracy.`)
    : L(lang, `${played.san} es jugable${best ? `, pero ${best.san} era más preciso` : ""}.`, `${played.san} is playable${best ? `, but ${best.san} was more precise` : ""}.`);

  if (!points.length && !isBest) {
    points.push({ kind: "principle", text: L(lang,
      "La diferencia es posicional y sutil: compara la actividad de tus piezas y los planes en ambas líneas antes de mirar la evaluación.",
      "The difference is positional and subtle: compare piece activity and plans in both lines before looking at the evaluation.") });
  }

  return {
    headline, points, bestSan: best?.san, bestLine, refutationLine, motifsBest, motifsRefutation,
    threatsIgnored, concepts: [...concepts], grounded: true,
  };
}

function endFen(fen: string, uci: string[]): string {
  const c = new Chess(fen);
  for (const u of uci) { try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } }
  return c.fen();
}

export { moveToUci };
