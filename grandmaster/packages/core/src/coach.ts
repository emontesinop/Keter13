import { Chess } from "chess.js";
import type { PvLine } from "./types";
import { formatScore } from "./eval";
import { extractFeatures, PIECE_NAME_EN, mobility, pieces } from "./features";
import { formatLine, uciLineToSan } from "./pgn";
import type { Lang } from "./explain";
import type { Concept } from "./knowledge";

export type CoachMode = "grandmaster" | "tactical" | "positional" | "opening" | "endgame" | "tournament" | "performance";

export const COACH_MODES: Record<CoachMode, { es: string; en: string; focus: string }> = {
  grandmaster: { es: "Entrenador GM", en: "Grandmaster Coach", focus: "comprehensive strategic and tactical instruction" },
  tactical: { es: "Entrenador táctico", en: "Tactical Coach", focus: "calculation, forcing moves and pattern recognition" },
  positional: { es: "Entrenador posicional", en: "Positional Coach", focus: "pawn structures, weak squares, outposts, prophylaxis and piece activity" },
  opening: { es: "Entrenador de aperturas", en: "Opening Coach", focus: "opening understanding over memorisation: the idea behind each move, the pawn structure it leads to, each side's plans and pawn breaks, typical mistakes, and how to handle unfamiliar moves with opening principles" },
  endgame: { es: "Entrenador de finales", en: "Endgame Coach", focus: "theoretical and technical endgames, conversion and defence" },
  tournament: { es: "Entrenador de torneo", en: "Tournament Coach", focus: "practical decision-making, time management and preparation" },
  performance: { es: "Entrenador de rendimiento", en: "Performance Coach", focus: "concentration, emotional control, consistency and post-game reflection" },
};

export interface StudentProfile { name?: string; rating: number; goal: number; whiteRepertoire: string; blackRepertoire: string; minutesPerDay: number; lang: Lang; }

/** Stable system prompt (kept byte-identical across turns so it can be prompt-cached). */
export function buildCoachSystemPrompt(mode: CoachMode, profile: StudentProfile): string {
  const m = COACH_MODES[mode];
  return [
    `You are an elite chess coach acting as the student's personal Grandmaster trainer. Mode: ${m.en} — focus on ${m.focus}.`,
    `Student: approx. ${profile.rating} rating, goal ${profile.goal}+. Repertoire: ${profile.whiteRepertoire} (White), ${profile.blackRepertoire} (Black). Daily training ≈${profile.minutesPerDay} min.`,
    `Respond in ${profile.lang === "es" ? "Spanish" : "English"}. Use standard algebraic notation (SAN). Pitch explanations at a club player around ${profile.rating}: skip beginner basics, introduce advanced concepts progressively.`,
    "GROUNDING RULES (mandatory):",
    "1. Only state concrete moves, variations and evaluations that appear in the VERIFIED POSITION FACTS or ENGINE LINES blocks, or that are legal moves you explicitly flag as your own suggestion to be checked. Never invent engine evaluations.",
    "2. If the facts don't support a claim, say you are not sure and propose checking it with the engine.",
    "3. Never attribute an idea to a specific book or player unless the KNOWLEDGE block provides that attribution.",
    "4. Explain WHY: name the positional feature, the tactical resource, the opponent's best defence and the follow-up plan.",
    "5. Be demanding and honest. No generic motivation; tie feedback to the student's recurring weaknesses when the MEMORY block mentions them.",
    "6. When SOCRATIC mode is requested, ask one focused question at a time (threats → worst piece → candidates → calculation) and wait for the student's answer before revealing the solution.",
    "7. Software cannot guarantee a title or rating; distinguish online ratings, FIDE rating and estimated strength.",
  ].join("\n");
}

export interface PositionContextInput { fen: string; lines?: PvLine[]; history?: string[]; lastMoveSan?: string; lang?: Lang; }

/** A compact, fully verified description of the position for the LLM. */
export function buildPositionContext(i: PositionContextInput): string {
  const f = extractFeatures(i.fen);
  const c = new Chess(i.fen);
  const stm = f.sideToMove === "w" ? "White" : "Black";
  const out: string[] = ["VERIFIED POSITION FACTS (computed by the chess rules engine):", `FEN: ${i.fen}`, `Side to move: ${stm}${f.inCheck ? " (in check)" : ""}. Phase: ${f.phase}.`];
  out.push(`Material: White ${f.material.w}, Black ${f.material.b} (diff ${f.material.diff > 0 ? "+" : ""}${f.material.diff}).`);
  if (i.history?.length) out.push(`Moves so far: ${i.history.slice(-24).join(" ")}`);
  if (i.lastMoveSan) out.push(`Last move: ${i.lastMoveSan}`);
  out.push(`Legal moves (${c.moves().length}): ${c.moves().slice(0, 60).join(" ")}`);
  const th = f.threatsAgainstSideToMove;
  out.push(`Opponent threats if ${stm} passed: ${th.length ? th.map((t) => `${t.san} (${t.kind}${t.kind === "capture" ? ` ≈${t.gain}` : ""})`).join(", ") : "none detected"}.`);
  for (const col of ["w", "b"] as const) {
    const name = col === "w" ? "White" : "Black";
    const h = f.hanging[col];
    const ps = f.pawns[col];
    const k = f.king[col];
    out.push(`${name}: mobility ${f.mobility[col]}; loose/en-prise pieces: ${h.length ? h.map((x) => `${PIECE_NAME_EN[x.type]} ${x.square}`).join(", ") : "none"}; isolated ${ps.isolated.join(",") || "-"}, doubled ${ps.doubled.join(",") || "-"}, backward ${ps.backward.join(",") || "-"}, passed ${ps.passed.join(",") || "-"}; outposts ${f.outposts[col].join(",") || "-"}; king ${k?.square ?? "?"} shield ${k?.shield ?? 0}/3${k?.castled ? " (castled)" : ""}.`);
  }
  out.push(`Open files: ${f.files.open.map((x) => "abcdefgh"[x]).join(",") || "none"}.`);
  if (i.lines?.length) {
    out.push("ENGINE LINES (Stockfish, White-POV evaluations):");
    for (const l of i.lines.slice(0, 3)) {
      const wpov = f.sideToMove === "w" ? l.score : l.score.mate !== undefined ? { mate: -l.score.mate } : { cp: -(l.score.cp ?? 0) };
      out.push(`#${l.multipv} [${formatScore(wpov)} depth ${l.depth}] ${formatLine(i.fen, uciLineToSan(i.fen, l.pv.slice(0, 10)))}`);
    }
  } else {
    out.push("ENGINE LINES: not available for this request — do not quote evaluations.");
  }
  return out.join("\n");
}

export function buildKnowledgeBlock(concepts: Concept[], lang: Lang): string {
  if (!concepts.length) return "";
  return ["KNOWLEDGE (retrieved; cite sources only as listed):", ...concepts.map((c) => `- ${c.title[lang]}: ${c.body[lang]}${c.sources?.length ? ` [Sources: ${c.sources.map((s) => `${s.title}${s.author ? ` — ${s.author}` : ""}`).join("; ")}]` : ""}`)].join("\n");
}

const SAN_RE = /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?/g;

/**
 * Hallucination guard: find SAN tokens in an LLM answer that are not legal in the position and do not
 * appear in any verified line (engine PVs, game history, the student's own line). Bare pawn moves like "e4"
 * are ignored because they are indistinguishable from square names.
 */
export function findUnverifiedMoves(text: string, fen: string, verifiedSanLines: string[][] = []): string[] {
  const allowed = new Set<string>();
  const norm = (s: string) => s.replace(/[+#!?]/g, "");
  try { for (const m of new Chess(fen).moves()) allowed.add(norm(m)); } catch { /* ignore */ }
  for (const l of verifiedSanLines) for (const s of l) allowed.add(norm(s));
  // Also allow legal moves along each verified line's positions (the coach may discuss alternatives there)
  for (const l of verifiedSanLines) {
    const c = new Chess(fen);
    for (const s of l) { try { c.move(s); for (const m of c.moves()) allowed.add(norm(m)); } catch { break; } }
  }
  const found = text.match(SAN_RE) ?? [];
  return [...new Set(found.map(norm).filter((s) => !allowed.has(s)))];
}

/** Socratic guided-analysis steps (the order a strong coach would ask). */
export const SOCRATIC_STEPS = [
  { id: "threat", es: "¿Qué amenaza tu rival en esta posición? (escribe la jugada que haría o 'nada')", en: "What does your opponent threaten here? (write the move they'd play, or 'nothing')" },
  { id: "worst-piece", es: "¿Cuál es tu pieza peor situada? (indica la casilla)", en: "Which is your worst-placed piece? (give its square)" },
  { id: "candidates", es: "Escribe 2–4 jugadas candidatas.", en: "Write 2–4 candidate moves." },
  { id: "calculation", es: "Calcula la variante principal de tu mejor candidata (varias jugadas, sin mover piezas).", en: "Calculate the main line of your best candidate (several moves, without moving pieces)." },
  { id: "decision", es: "Tu jugada final y, en una frase, por qué.", en: "Your final move and, in one sentence, why." },
] as const;

export function gradeThreatAnswer(fen: string, answer: string, lang: Lang = "es") {
  const es = lang === "es";
  const f = extractFeatures(fen);
  const threats = f.threatsAgainstSideToMove.filter((t) => t.kind === "mate" || t.gain >= 1);
  const a = answer.trim().replace(/[+#!?]/g, "");
  const saysNone = /^(nada|ninguna|none|nothing|-)$/i.test(a);
  if (!threats.length) return { correct: saysNone, threats: [], feedback: saysNone ? (es ? "Correcto: no hay amenazas directas." : "Correct: no direct threats.") : (es ? "No hay amenazas tácticas directas; la pregunta clave pasa a ser el plan del rival." : "No direct tactical threats; the key question becomes the opponent's plan.") };
  const hit = threats.find((t) => t.san.replace(/[+#]/g, "") === a);
  return {
    correct: !!hit, threats: threats.map((t) => t.san),
    feedback: hit ? (es ? `Exacto: ${hit.san}.` : `Exactly: ${hit.san}.`) : (es ? `La amenaza principal es ${threats[0].san}${threats[0].kind === "mate" ? " (¡mate!)" : ""}.` : `The main threat is ${threats[0].san}${threats[0].kind === "mate" ? " (mate!)" : ""}.`),
  };
}

/** Heuristic worst piece: own non-pawn, non-king pieces with the fewest safe moves. */
export function worstPieces(fen: string): string[] {
  const c = new Chess(fen);
  const stm = c.turn();
  const scored = pieces(c, stm).filter((p) => p.type !== "p" && p.type !== "k").map((p) => ({ sq: p.square, n: c.moves({ square: p.square }).length }));
  void mobility;
  scored.sort((a, b) => a.n - b.n);
  return scored.slice(0, 2).map((s) => s.sq);
}
