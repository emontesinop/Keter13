import { Chess } from "chess.js";
import type { ClassificationThresholds, GamePhase, MoveClass, PositionAnalysis } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";
import { classifyMove, gameAccuracy, moveAccuracy, scoreToCp, winPercentFromScore, negate, toWhitePov } from "./eval";
import type { ParsedGame } from "./pgn";
import { gamePhase } from "./features";
import { explainMove, type Lang, type MoveExplanation } from "./explain";
import { detectMotifs, type Motif } from "./motifs";

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  phase: GamePhase;
  bestUci?: string;
  bestSan?: string;
  /** white-POV centipawns before/after (mate mapped to ±10000) */
  evalBefore: number;
  evalAfter: number;
  /** mover-POV win% */
  winBefore: number;
  winAfter: number;
  cpLoss: number;
  accuracy: number;
  classification: MoveClass;
  isUserMove: boolean;
  clock?: number;
  timeSpent?: number;
  motifsMissed: Motif[];
  /** opponent made an error that the user could exploit next move */
  opportunity?: boolean;
  missedOpportunity?: boolean;
  missedDefense?: boolean;
  errorType?: "tactical" | "strategic";
  explanation?: MoveExplanation;
}

export interface PhaseStats { moves: number; accuracy: number | null; acpl: number | null; blunders: number; mistakes: number; inaccuracies: number; }

export interface CriticalMoment { ply: number; san: string; swing: number; description: string; fen: string; }

export interface TimeReport {
  available: boolean;
  avgTimePerMove?: number;
  timeTroubleMoves?: number;
  errorsInTimeTrouble?: number;
  longestThinkPly?: number;
  longestThinkSeconds?: number;
  fastErrors?: number; // errors played in under 5s
  assessment?: string;
}

export interface GeneratedExercise {
  fen: string;
  solutionUci: string[];
  motifs: Motif[];
  sourcePly: number;
  prompt: string;
  kind: "find_best" | "find_threat" | "missed_opportunity";
}

export interface GameReport {
  userColor: "w" | "b";
  result: string;
  userResult: "win" | "loss" | "draw" | "unknown";
  accuracy: { user: number | null; opponent: number | null };
  acpl: { user: number | null; opponent: number | null };
  counts: { blunders: number; mistakes: number; inaccuracies: number; best: number };
  phases: Record<GamePhase, PhaseStats>;
  moves: AnalyzedMove[];
  criticalMoments: CriticalMoment[];
  topMistakes: AnalyzedMove[];
  missedOpportunities: AnalyzedMove[];
  missedDefenses: AnalyzedMove[];
  tacticalAccuracy: number | null;
  strategicAccuracy: number | null;
  time: TimeReport;
  openingDeviation?: { ply: number; san: string; expected?: string };
  assessment: string;
  lessons: string[];
  exercises: GeneratedExercise[];
  disclaimer: string;
}

export interface BuildReportOptions {
  userColor: "w" | "b";
  thresholds?: ClassificationThresholds;
  lang?: Lang;
  /** plies considered "book" (e.g. matched repertoire or opening explorer) */
  bookPlies?: number;
  openingDeviation?: { ply: number; san: string; expected?: string };
}

const isForcing = (pv: string[], fen: string) => {
  // a best line is "tactical" if it starts with a capture/check or wins material/mates quickly
  return detectMotifs({ fen, line: pv.slice(0, 5) }).some((m) => m !== "quiet_move" && m !== "check");
};

/**
 * Build a full game report from per-position engine analyses.
 * `analyses[i]` must be the analysis of the position BEFORE ply i+1, and `analyses[n]` the final position.
 */
export function buildGameReport(game: ParsedGame, analyses: PositionAnalysis[], opts: BuildReportOptions): GameReport {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const lang = opts.lang ?? "es";
  const moves: AnalyzedMove[] = [];
  if (analyses.length < game.moves.length + 1) throw new Error("Need one analysis per position (moves + 1)");

  game.moves.forEach((m, idx) => {
    const a = analyses[idx], b = analyses[idx + 1];
    const best = a.lines[0];
    const stm = m.color;
    // scores are side-to-move POV
    const sBefore = best?.score ?? { cp: 0 };
    let sAfterMover = b.lines[0] ? negate(b.lines[0].score) : { cp: 0 };
    const finalPos = idx === game.moves.length - 1;
    if (finalPos && !b.lines.length) {
      // terminal position: mate or stalemate
      sAfterMover = /#/.test(m.san) ? { mate: 1 } : { cp: 0 };
    }
    const winBefore = winPercentFromScore(sBefore);
    let winAfter = winPercentFromScore(sAfterMover);
    const isBest = best?.pv[0] === m.uci;
    if (isBest) winAfter = Math.max(winAfter, winBefore - 0.5); // depth noise
    const evalBefore = scoreToCp(toWhitePov(sBefore, stm));
    const evalAfter = scoreToCp(toWhitePov(sAfterMover, stm));
    const cpLoss = Math.max(0, Math.min(1000, scoreToCp(sBefore) - scoreToCp(sAfterMover)));
    const onlyMove = a.lines.length === 1 && a.lines[0].pv.length > 0 && countLegal(m.fenBefore) === 1;
    const classification = classifyMove({ winBefore, winAfter, isBest, onlyLegalMove: onlyMove, inBook: (opts.bookPlies ?? 0) >= m.ply }, t);
    const isUserMove = stm === opts.userColor;
    const am: AnalyzedMove = {
      ply: m.ply, moveNumber: m.moveNumber, color: stm, san: m.san, uci: m.uci, fenBefore: m.fenBefore, fenAfter: m.fenAfter,
      phase: gamePhase(m.fenBefore, m.ply),
      bestUci: best?.pv[0], bestSan: undefined, evalBefore, evalAfter, winBefore, winAfter, cpLoss,
      accuracy: moveAccuracy(winBefore, winAfter), classification, isUserMove, clock: m.clock, timeSpent: m.timeSpent, motifsMissed: [],
    };
    if (["inaccuracy", "mistake", "blunder"].includes(classification) && best) {
      am.motifsMissed = detectMotifs({ fen: m.fenBefore, line: best.pv, mateIn: best.score.mate, winGain: winBefore - winAfter });
      am.errorType = isForcing(best.pv, m.fenBefore) || (b.lines[0] && isForcing(b.lines[0].pv, m.fenAfter)) ? "tactical" : "strategic";
      am.explanation = explainMove({ fenBefore: m.fenBefore, playedUci: m.uci, bestLine: best, afterLine: b.lines[0], winBefore, winAfter, classification, lang });
      am.bestSan = am.explanation.bestSan;
      // Missed defensive resource: mover was worse, a holding move existed, played move collapses
      if (winBefore < 40 && winBefore - winAfter >= t.mistake) am.missedDefense = true;
    }
    moves.push(am);
  });

  // Opportunities: opponent erred (mistake/blunder) — did the user punish it on the next move?
  for (let i = 0; i < moves.length - 1; i++) {
    const opp = moves[i], next = moves[i + 1];
    if (!opp.isUserMove && ["mistake", "blunder"].includes(opp.classification)) {
      opp.opportunity = true;
      if (["inaccuracy", "mistake", "blunder"].includes(next.classification) && next.winBefore >= 60) next.missedOpportunity = true;
    }
  }

  const user = moves.filter((m) => m.isUserMove), opp = moves.filter((m) => !m.isUserMove);
  const acpl = (arr: AnalyzedMove[]) => (arr.length ? Math.round(arr.reduce((s, m) => s + m.cpLoss, 0) / arr.length) : null);
  const phaseStats = (ph: GamePhase): PhaseStats => {
    const arr = user.filter((m) => m.phase === ph);
    return {
      moves: arr.length, accuracy: gameAccuracy(arr.map((m) => m.accuracy)), acpl: acpl(arr),
      blunders: arr.filter((m) => m.classification === "blunder").length,
      mistakes: arr.filter((m) => m.classification === "mistake").length,
      inaccuracies: arr.filter((m) => m.classification === "inaccuracy").length,
    };
  };

  const errors = user.filter((m) => ["inaccuracy", "mistake", "blunder"].includes(m.classification));
  const topMistakes = errors.slice().sort((a, b) => (b.winBefore - b.winAfter) - (a.winBefore - a.winAfter)).slice(0, 3);
  const critical: CriticalMoment[] = moves
    .map((m) => ({ m, swing: Math.abs(m.winBefore - m.winAfter) }))
    .filter((x) => x.swing >= t.mistake)
    .sort((a, b) => b.swing - a.swing)
    .slice(0, 5)
    .sort((a, b) => a.m.ply - b.m.ply)
    .map(({ m, swing }) => ({
      ply: m.ply, san: m.san, swing: Math.round(swing), fen: m.fenBefore,
      description: m.isUserMove
        ? (lang === "es" ? `Tu jugada ${m.moveNumber}${m.color === "w" ? "." : "..."}${m.san} cambió la evaluación (${Math.round(swing)} pts de probabilidad).` : `Your move ${m.moveNumber}${m.color === "w" ? "." : "..."}${m.san} swung the evaluation (${Math.round(swing)} win% points).`)
        : (lang === "es" ? `El rival jugó ${m.san}: oportunidad para ti.` : `Opponent played ${m.san}: an opportunity for you.`),
    }));

  const tactical = errors.filter((m) => m.errorType === "tactical");
  const strategic = errors.filter((m) => m.errorType === "strategic");
  const pct = (n: number, d: number) => (d ? Math.round((1 - n / d) * 1000) / 10 : null);

  const userResult = game.result === "1/2-1/2" ? "draw" : game.result === "*" ? "unknown" : (game.result === "1-0") === (opts.userColor === "w") ? "win" : "loss";
  const time = timeReport(user, game, lang);
  const exercises = generateExercises(moves, lang);
  const lessons = deriveLessons({ user, errors, tactical, strategic, time, lang });
  const userAcc = gameAccuracy(user.map((m) => m.accuracy));
  const phases = { opening: phaseStats("opening"), middlegame: phaseStats("middlegame"), endgame: phaseStats("endgame") };

  return {
    userColor: opts.userColor, result: game.result, userResult,
    accuracy: { user: userAcc, opponent: gameAccuracy(opp.map((m) => m.accuracy)) },
    acpl: { user: acpl(user), opponent: acpl(opp) },
    counts: {
      blunders: user.filter((m) => m.classification === "blunder").length,
      mistakes: user.filter((m) => m.classification === "mistake").length,
      inaccuracies: user.filter((m) => m.classification === "inaccuracy").length,
      best: user.filter((m) => m.classification === "best").length,
    },
    phases, moves, criticalMoments: critical, topMistakes,
    missedOpportunities: moves.filter((m) => m.missedOpportunity),
    missedDefenses: moves.filter((m) => m.missedDefense && m.isUserMove),
    tacticalAccuracy: pct(tactical.length, user.length), strategicAccuracy: pct(strategic.length, user.length),
    time, openingDeviation: opts.openingDeviation,
    assessment: overallAssessment({ userAcc, phases, userResult, errors, topMistakes, lang }),
    lessons, exercises,
    disclaimer: lang === "es"
      ? "La pérdida en centipeones y la 'precisión' son modelos estadísticos del motor; no miden por sí solos la calidad humana de una decisión práctica (tiempo, riesgo, complejidad)."
      : "Centipawn loss and 'accuracy' are statistical engine models; on their own they do not measure the human quality of a practical decision (time, risk, complexity).",
  };
}

function countLegal(fen: string): number {
  return new Chess(fen).moves().length;
}

function timeReport(user: AnalyzedMove[], game: ParsedGame, lang: Lang): TimeReport {
  const timed = user.filter((m) => m.timeSpent !== undefined);
  if (!timed.length || !game.timeControl) return { available: false, assessment: lang === "es" ? "La partida no contiene datos de reloj ([%clk])." : "The game has no clock data ([%clk])." };
  const base = game.timeControl.base;
  const trouble = user.filter((m) => m.clock !== undefined && m.clock < Math.max(10, base * 0.1));
  const isErr = (m: AnalyzedMove) => ["mistake", "blunder"].includes(m.classification);
  const longest = timed.reduce((a, b) => ((b.timeSpent ?? 0) > (a.timeSpent ?? 0) ? b : a));
  const fastErrors = timed.filter((m) => isErr(m) && (m.timeSpent ?? 99) < 5 && m.phase !== "opening").length;
  const avg = Math.round((timed.reduce((s, m) => s + (m.timeSpent ?? 0), 0) / timed.length) * 10) / 10;
  const errorsInTrouble = trouble.filter(isErr).length;
  const parts: string[] = [];
  if (errorsInTrouble) parts.push(lang === "es" ? `${errorsInTrouble} error(es) con apuros de tiempo.` : `${errorsInTrouble} error(s) in time trouble.`);
  if (fastErrors) parts.push(lang === "es" ? `${fastErrors} error(es) jugados en menos de 5 s fuera de la apertura: falta de verificación de amenazas.` : `${fastErrors} error(s) played in under 5 s outside the opening: no blunder-check.`);
  if (longest.timeSpent && longest.timeSpent > base * 0.15) parts.push(lang === "es" ? `Pensaste ${Math.round(longest.timeSpent)} s en ${longest.san}; considera si ese momento lo merecía.` : `You spent ${Math.round(longest.timeSpent)} s on ${longest.san}; consider whether that moment deserved it.`);
  if (!parts.length) parts.push(lang === "es" ? "Distribución del tiempo razonable." : "Reasonable time distribution.");
  return { available: true, avgTimePerMove: avg, timeTroubleMoves: trouble.length, errorsInTimeTrouble: errorsInTrouble, longestThinkPly: longest.ply, longestThinkSeconds: longest.timeSpent, fastErrors, assessment: parts.join(" ") };
}

function generateExercises(moves: AnalyzedMove[], lang: Lang): GeneratedExercise[] {
  const out: GeneratedExercise[] = [];
  for (const m of moves) {
    if (!m.isUserMove || !m.bestUci) continue;
    if (["mistake", "blunder"].includes(m.classification) || m.missedOpportunity) {
      out.push({
        fen: m.fenBefore, solutionUci: [m.bestUci], motifs: m.motifsMissed, sourcePly: m.ply,
        kind: m.missedOpportunity ? "missed_opportunity" : "find_best",
        prompt: m.missedOpportunity
          ? (lang === "es" ? "Tu rival acaba de cometer un error. ¿Cómo lo castigas?" : "Your opponent just erred. How do you punish it?")
          : (lang === "es" ? `En la partida jugaste ${m.san}. Encuentra una jugada mejor y explica por qué.` : `In the game you played ${m.san}. Find a better move and explain why.`),
      });
    }
    if (m.explanation?.threatsIgnored.length) {
      out.push({
        fen: m.fenBefore, solutionUci: [m.explanation.threatsIgnored[0].uci], motifs: [], sourcePly: m.ply, kind: "find_threat",
        prompt: lang === "es" ? "Si tu rival pudiera mover ahora, ¿qué jugaría? (identifica la amenaza)" : "If your opponent could move now, what would they play? (identify the threat)",
      });
    }
  }
  return out.slice(0, 8);
}

function deriveLessons(x: { user: AnalyzedMove[]; errors: AnalyzedMove[]; tactical: AnalyzedMove[]; strategic: AnalyzedMove[]; time: TimeReport; lang: Lang }): string[] {
  const es = x.lang === "es";
  const L: string[] = [];
  const threatMisses = x.errors.filter((m) => m.explanation?.threatsIgnored.length).length;
  if (threatMisses) L.push(es ? `En ${threatMisses} jugada(s) ignoraste una amenaza directa. Rutina: antes de mover, pregúntate "¿qué quiere hacer mi rival?" y revisa jaques, capturas y amenazas.` : `On ${threatMisses} move(s) you ignored a direct threat. Routine: before moving ask "what does my opponent want?" and check checks, captures and threats.`);
  const motifCounts = new Map<Motif, number>();
  for (const m of x.errors) for (const mo of m.motifsMissed) motifCounts.set(mo, (motifCounts.get(mo) ?? 0) + 1);
  const topMotif = [...motifCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMotif) L.push(es ? `Motivo táctico que se te escapó con más frecuencia: ${topMotif[0]} (${topMotif[1]}×). Lo entrenaremos en el laboratorio táctico.` : `Most frequently missed tactical motif: ${topMotif[0]} (${topMotif[1]}×). We'll drill it in the tactics lab.`);
  if (x.strategic.length > x.tactical.length && x.strategic.length >= 2) L.push(es ? "La mayoría de tus errores fueron posicionales (sin táctica inmediata): trabaja la planificación y la evaluación de desequilibrios." : "Most of your errors were positional (no immediate tactic): work on planning and evaluating imbalances.");
  if (x.time.available && (x.time.fastErrors ?? 0) > 0) L.push(es ? "Errores rápidos: en posiciones críticas (capturas, jaques, cambios de estructura) invierte tiempo en calcular." : "Fast errors: in critical positions (captures, checks, structural changes) invest time in calculation.");
  const endErr = x.errors.filter((m) => m.phase === "endgame").length;
  if (endErr >= 2) L.push(es ? `Cometiste ${endErr} errores en el final: refuerza la técnica en el laboratorio de finales.` : `You made ${endErr} errors in the endgame: reinforce technique in the endgame lab.`);
  if (!L.length) L.push(es ? "Partida sólida. Revisa los momentos críticos para entender qué decisiones fueron realmente difíciles." : "Solid game. Review the critical moments to understand which decisions were genuinely hard.");
  return L;
}

function overallAssessment(x: { userAcc: number | null; phases: Record<GamePhase, PhaseStats>; userResult: string; errors: AnalyzedMove[]; topMistakes: AnalyzedMove[]; lang: Lang }): string {
  const es = x.lang === "es";
  const phaseOrder: GamePhase[] = ["opening", "middlegame", "endgame"];
  const label = (p: GamePhase) => (es ? { opening: "apertura", middlegame: "medio juego", endgame: "final" }[p] : p);
  const played = phaseOrder.filter((p) => x.phases[p].moves > 0);
  const weakest = played.slice().sort((a, b) => (x.phases[a].accuracy ?? 100) - (x.phases[b].accuracy ?? 100))[0];
  const big = x.topMistakes[0];
  const parts = [
    es ? `Precisión estimada: ${x.userAcc ?? "—"}%.` : `Estimated accuracy: ${x.userAcc ?? "—"}%.`,
    weakest ? (es ? `Fase más débil: ${label(weakest)}.` : `Weakest phase: ${label(weakest)}.`) : "",
    big ? (es ? `El momento decisivo fue ${big.moveNumber}${big.color === "w" ? "." : "..."}${big.san}${big.bestSan ? ` (mejor: ${big.bestSan})` : ""}.` : `The decisive moment was ${big.moveNumber}${big.color === "w" ? "." : "..."}${big.san}${big.bestSan ? ` (better: ${big.bestSan})` : ""}.`) : "",
  ];
  return parts.filter(Boolean).join(" ");
}
