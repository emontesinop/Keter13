import type { Color, PieceSymbol, Square } from "chess.js";
export type { Color, PieceSymbol, Square };

/** Engine score from the side-to-move's point of view, as reported by UCI. */
export interface EngineScore {
  /** centipawns (side to move POV) — undefined when mate is set */
  cp?: number;
  /** mate in N (positive = side to move mates, negative = gets mated) */
  mate?: number;
}

export interface PvLine {
  multipv: number;
  depth: number;
  score: EngineScore;
  /** UCI moves, e.g. ["e2e4","e7e5"] */
  pv: string[];
}

export interface PositionAnalysis {
  fen: string;
  depth: number;
  lines: PvLine[];
  /** engine id string, for provenance */
  engine?: string;
}

export type MoveClass =
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "book"
  | "forced";

export type GamePhase = "opening" | "middlegame" | "endgame";

export interface ClassificationThresholds {
  /** Win-probability drop (0..100 percentage points) at which a move becomes an inaccuracy. */
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

/** Defaults follow the widely used Lichess-style win-chance thresholds (5/10/15 points on a 0–100 scale)
 *  — configurable per user. Centipawn loss alone never fully describes human move quality. */
export const DEFAULT_THRESHOLDS: ClassificationThresholds = { inaccuracy: 5, mistake: 10, blunder: 15 };

export type RatingPool =
  | "chesscom_rapid"
  | "chesscom_blitz"
  | "chesscom_bullet"
  | "chesscom_daily"
  | "lichess_rapid"
  | "lichess_blitz"
  | "lichess_bullet"
  | "lichess_classical"
  | "lichess_correspondence"
  | "fide_standard"
  | "fide_rapid"
  | "fide_blitz";

export const RATING_POOL_LABEL: Record<RatingPool, string> = {
  chesscom_rapid: "Chess.com Rapid",
  chesscom_blitz: "Chess.com Blitz",
  chesscom_bullet: "Chess.com Bullet",
  chesscom_daily: "Chess.com Daily",
  lichess_rapid: "Lichess Rapid",
  lichess_blitz: "Lichess Blitz",
  lichess_bullet: "Lichess Bullet",
  lichess_classical: "Lichess Classical",
  lichess_correspondence: "Lichess Correspondence",
  fide_standard: "FIDE Standard",
  fide_rapid: "FIDE Rapid",
  fide_blitz: "FIDE Blitz",
};

export type TrainingDomain =
  | "tactics"
  | "calculation"
  | "threat_awareness"
  | "openings"
  | "positional"
  | "endgames"
  | "review"
  | "time_management";
