import type { ClassificationThresholds, EngineScore, MoveClass } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";

/** Convert a mate score to a large centipawn value so it can be compared numerically. */
export function scoreToCp(s: EngineScore): number {
  if (s.mate !== undefined && s.mate !== null) {
    if (s.mate === 0) return -10000; // side to move is mated
    return s.mate > 0 ? 10000 - s.mate * 10 : -10000 - s.mate * 10;
  }
  return s.cp ?? 0;
}

/** Negate a score (switch point of view). */
export function negate(s: EngineScore): EngineScore {
  if (s.mate !== undefined) return { mate: -s.mate };
  return { cp: -(s.cp ?? 0) };
}

/**
 * Win probability (0..100) for the side whose POV the centipawn value is from.
 * Logistic model used by Lichess (coefficient fitted on real games). It is a model, not a law.
 */
export function winPercent(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function winPercentFromScore(s: EngineScore): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  return winPercent(s.cp ?? 0);
}

/** Per-move accuracy (0..100) from win% before/after for the mover (Lichess formula). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const diff = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * diff) - 3.1669;
  return Math.max(0, Math.min(100, raw + 1)); // +1 uncertainty bonus as in Lichess
}

/** Harmonic-weighted aggregate accuracy: harmonic mean punishes a few big errors. */
export function gameAccuracy(accuracies: number[]): number | null {
  if (!accuracies.length) return null;
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const harm = accuracies.length / accuracies.reduce((a, b) => a + 1 / Math.max(b, 1), 0);
  return Math.round(((mean + harm) / 2) * 10) / 10;
}

export interface ClassifyInput {
  winBefore: number; // mover POV, best play
  winAfter: number; // mover POV, after played move
  isBest: boolean;
  onlyLegalMove?: boolean;
  inBook?: boolean;
}

export function classifyMove(i: ClassifyInput, t: ClassificationThresholds = DEFAULT_THRESHOLDS): MoveClass {
  if (i.inBook) return "book";
  if (i.onlyLegalMove) return "forced";
  if (i.isBest) return "best";
  const drop = i.winBefore - i.winAfter;
  if (drop >= t.blunder) return "blunder";
  if (drop >= t.mistake) return "mistake";
  if (drop >= t.inaccuracy) return "inaccuracy";
  if (drop <= 1) return "excellent";
  return "good";
}

export function formatScore(s: EngineScore, povWhite = true): string {
  if (s.mate !== undefined) {
    const m = povWhite ? s.mate : -s.mate;
    return (m > 0 ? "#" : "#-") + Math.abs(m);
  }
  const v = ((povWhite ? 1 : -1) * (s.cp ?? 0)) / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

/** Convert a side-to-move score to white's POV. */
export function toWhitePov(s: EngineScore, sideToMove: "w" | "b"): EngineScore {
  return sideToMove === "w" ? s : negate(s);
}
