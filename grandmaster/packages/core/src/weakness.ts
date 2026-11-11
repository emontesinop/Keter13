import { Chess } from "chess.js";
import type { GamePhase, MoveClass, TrainingDomain } from "./types";
import type { Motif } from "./motifs";
import type { GameReport } from "./report";
import { pieces } from "./features";

/** Compact record of one user error, stored per analysed game. */
export interface ErrorRecord {
  gameId: string;
  playedAt: string; // ISO
  ply: number;
  fen: string;
  phase: GamePhase;
  classification: MoveClass;
  winDrop: number;
  motifsMissed: Motif[];
  threatIgnored: boolean;
  errorType?: "tactical" | "strategic";
  fast?: boolean;
  timeTrouble?: boolean;
  opening?: string;
  endgameType?: string;
  conversion?: boolean; // was clearly winning (≥70%) before the error
  missedDefense?: boolean;
  missedOpportunity?: boolean;
}

export function endgameType(fen: string): string {
  const c = new Chess(fen);
  const ps = pieces(c).filter((p) => p.type !== "k" && p.type !== "p");
  const types = new Set(ps.map((p) => p.type));
  if (!ps.length) return "pawn";
  if (types.size === 1 && types.has("r")) return "rook";
  if (types.size === 1 && types.has("q")) return "queen";
  if ([...types].every((t) => t === "b" || t === "n")) {
    const bishops = ps.filter((p) => p.type === "b");
    if (bishops.length === 2 && ps.length === 2 && bishops[0].color !== bishops[1].color && c.squareColor(bishops[0].square) !== c.squareColor(bishops[1].square)) return "opposite_bishops";
    return "minor_piece";
  }
  if (types.has("r") && !types.has("q")) return "rook_and_minor";
  return "complex";
}

export function errorsFromReport(gameId: string, playedAt: string, report: GameReport, opening?: string): ErrorRecord[] {
  return report.moves
    .filter((m) => m.isUserMove && ["inaccuracy", "mistake", "blunder"].includes(m.classification))
    .map((m) => ({
      gameId, playedAt, ply: m.ply, fen: m.fenBefore, phase: m.phase, classification: m.classification,
      winDrop: Math.round((m.winBefore - m.winAfter) * 10) / 10,
      motifsMissed: m.motifsMissed,
      threatIgnored: !!m.explanation?.threatsIgnored.length,
      errorType: m.errorType,
      fast: m.timeSpent !== undefined && m.timeSpent < 5 && m.phase !== "opening",
      timeTrouble: m.clock !== undefined && report.time.available && m.clock < 30,
      opening: m.phase === "opening" ? opening : undefined,
      endgameType: m.phase === "endgame" ? endgameType(m.fenBefore) : undefined,
      conversion: m.winBefore >= 70,
      missedDefense: m.missedDefense,
      missedOpportunity: m.missedOpportunity,
    }));
}

export interface Weakness {
  id: string;
  domain: TrainingDomain;
  label: { es: string; en: string };
  score: number; // average win% lost per game, recency weighted
  occurrences: number;
  examples: { gameId: string; ply: number; fen: string }[];
  detail?: Record<string, number>;
}

const LABELS: Record<string, { es: string; en: string; domain: TrainingDomain }> = {
  threat_awareness: { es: "No detectar las amenazas del rival", en: "Missing opponent threats", domain: "threat_awareness" },
  tactical_vision: { es: "Visión táctica (motivos no vistos)", en: "Tactical vision (missed motifs)", domain: "tactics" },
  calculation: { es: "Cálculo de variantes forzadas", en: "Calculating forcing lines", domain: "calculation" },
  positional: { es: "Decisiones posicionales y planes", en: "Positional decisions & plans", domain: "positional" },
  opening: { es: "Preparación de aperturas", en: "Opening preparation", domain: "openings" },
  endgame: { es: "Técnica de finales", en: "Endgame technique", domain: "endgames" },
  conversion: { es: "Convertir posiciones ganadas", en: "Converting winning positions", domain: "positional" },
  defense: { es: "Defensa en posiciones difíciles", en: "Defending difficult positions", domain: "calculation" },
  time: { es: "Gestión del tiempo / jugar rápido en momentos críticos", en: "Time management / rushing critical moments", domain: "time_management" },
};

export function detectWeaknesses(errors: ErrorRecord[], gamesAnalysed: number, now = new Date()): Weakness[] {
  const buckets = new Map<string, { score: number; n: number; ex: ErrorRecord[]; detail: Record<string, number> }>();
  const add = (id: string, e: ErrorRecord, w: number, detailKey?: string) => {
    const b = buckets.get(id) ?? { score: 0, n: 0, ex: [], detail: {} };
    b.score += w; b.n += 1; b.ex.push(e);
    if (detailKey) b.detail[detailKey] = (b.detail[detailKey] ?? 0) + 1;
    buckets.set(id, b);
  };
  for (const e of errors) {
    const age = (now.getTime() - new Date(e.playedAt).getTime()) / 86400000;
    const w = e.winDrop * Math.pow(0.5, Math.max(0, age) / 30);
    if (e.threatIgnored) add("threat_awareness", e, w);
    if (e.errorType === "tactical") {
      if (e.motifsMissed.length) for (const m of e.motifsMissed) add("tactical_vision", e, w / e.motifsMissed.length, m);
      else add("calculation", e, w);
    }
    if (e.errorType === "strategic" && e.phase === "middlegame") add("positional", e, w);
    if (e.phase === "opening") add("opening", e, w, e.opening ?? "unknown");
    if (e.phase === "endgame") add("endgame", e, w, e.endgameType ?? "unknown");
    if (e.conversion) add("conversion", e, w);
    if (e.missedDefense) add("defense", e, w);
    if (e.fast || e.timeTrouble) add("time", e, w, e.fast ? "fast" : "time_trouble");
  }
  const g = Math.max(1, gamesAnalysed);
  return [...buckets.entries()]
    .map(([id, b]) => ({
      id, domain: LABELS[id].domain, label: { es: LABELS[id].es, en: LABELS[id].en },
      score: Math.round((b.score / g) * 10) / 10, occurrences: b.n,
      examples: b.ex.sort((x, y) => y.winDrop - x.winDrop).slice(0, 5).map((e) => ({ gameId: e.gameId, ply: e.ply, fen: e.fen })),
      detail: Object.keys(b.detail).length ? b.detail : undefined,
    }))
    .sort((a, b) => b.score - a.score);
}
