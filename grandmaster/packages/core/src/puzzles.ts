import { Chess } from "chess.js";
import type { Motif } from "./motifs";

export interface Puzzle {
  id: string;
  fen: string;
  /** full solution in UCI including forced opponent replies (user moves at even indices) */
  solution: string[];
  motifs: Motif[];
  rating: number; // approximate difficulty
  source: "original" | "lichess_cc0" | "user_game" | "master_game";
  sourceRef?: string;
  themeNote?: { es: string; en: string };
}

/**
 * Original, hand-constructed positions. Each is verified in CI by Stockfish to have a unique
 * winning first move (see apps/server/test/engine-content.test.ts).
 */
export const SEED_PUZZLES: Puzzle[] = [
  { id: "o-backrank-1", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", solution: ["d1d8"], motifs: ["back_rank_mate", "mate"], rating: 900, source: "original",
    themeNote: { es: "El rey negro está encerrado por sus propios peones.", en: "Black's king is boxed in by its own pawns." } },
  { id: "o-fork-1", fen: "r3k3/8/8/1N6/8/8/5PPP/6K1 w - - 0 1", solution: ["b5c7"], motifs: ["fork"], rating: 1000, source: "original",
    themeNote: { es: "Rey y torre en casillas atacables por un caballo.", en: "King and rook on squares a knight can hit together." } },
  { id: "o-skewer-1", fen: "q7/8/8/3k4/8/8/4BPPP/6K1 w - - 0 1", solution: ["e2f3"], motifs: ["skewer"], rating: 1200, source: "original",
    themeNote: { es: "Rey y dama en la misma diagonal.", en: "King and queen on the same diagonal." } },
  { id: "o-disc-1", fen: "4q1k1/5p1p/8/8/4N3/8/5PPP/4R1K1 w - - 0 1", solution: ["e4f6"], motifs: ["discovered_attack", "fork"], rating: 1300, source: "original",
    themeNote: { es: "El caballo tapa la columna de la torre; si sale con jaque, la dama cae.", en: "The knight blocks the rook's file; if it moves with check, the queen falls." } },
  { id: "o-smother-1", fen: "4r2k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1", solution: ["d5g8", "e8g8", "h6f7"], motifs: ["sacrifice", "mate"], rating: 1500, source: "original",
    themeNote: { es: "Mate ahogado: atrae la torre a g8.", en: "Smothered mate: decoy the rook to g8." } },
  { id: "o-deflect-1", fen: "1r4k1/1P3ppp/8/7n/8/8/5PPP/2R3K1 w - - 0 1", solution: ["c1c8"], motifs: ["promotion"], rating: 1300, source: "original",
    themeNote: { es: "Desvía al único defensor de la casilla de coronación.", en: "Deflect the only defender of the promotion square." } },
  { id: "o-pawnfork-1", fen: "4k3/p5pp/2n1n3/8/3P4/8/5PPP/R5K1 w - - 0 1", solution: ["d4d5"], motifs: ["fork"], rating: 900, source: "original",
    themeNote: { es: "Hasta un peón puede hacer un ataque doble.", en: "Even a pawn can fork." } },
  { id: "o-pin-1", fen: "4k3/8/8/4q3/8/8/3K4/R7 w - - 0 1", solution: ["a1e1"], motifs: ["pin"], rating: 1000, source: "original",
    themeNote: { es: "La dama está en la misma columna que su rey.", en: "The queen shares a file with its king." } },
];

export interface PuzzleAttempt { correct: boolean; expected?: string; finished: boolean; reply?: string; }

/** Check the user's move at step `index` (even indices are user moves). Accepts alternative mates in one. */
export function checkPuzzleMove(p: Puzzle, playedUci: string[], index: number): PuzzleAttempt {
  const c = new Chess(p.fen);
  for (let i = 0; i < index; i++) c.move({ from: p.solution[i].slice(0, 2), to: p.solution[i].slice(2, 4), promotion: p.solution[i][4] });
  const expected = p.solution[index];
  const u = playedUci[index];
  let correct = u === expected;
  if (!correct) {
    try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (c.isCheckmate()) correct = true; c.undo(); } catch { /* illegal */ }
  }
  const finished = correct && (index + 1 >= p.solution.length || (c.isCheckmate()));
  return { correct, expected, finished, reply: correct && !finished ? p.solution[index + 1] : undefined };
}

/** Parse one row of the Lichess puzzle database (CC0). Format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags */
export function parseLichessPuzzleCsv(row: string): Puzzle | null {
  const cols = row.split(",");
  if (cols.length < 8 || cols[0] === "PuzzleId") return null;
  const [id, fen, moves, rating, , , , themes, url] = cols;
  const mv = moves.trim().split(" ");
  // In the Lichess DB, the FIRST move is the opponent's move that creates the puzzle position.
  const c = new Chess(fen);
  try { c.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: mv[0][4] }); } catch { return null; }
  const map: Record<string, Motif> = { fork: "fork", pin: "pin", skewer: "skewer", discoveredAttack: "discovered_attack", doubleCheck: "double_check", hangingPiece: "hanging_piece", promotion: "promotion", sacrifice: "sacrifice", quietMove: "quiet_move", intermezzo: "intermezzo", backRankMate: "back_rank_mate", mate: "mate", defensiveMove: "defensive_resource", trappedPiece: "trapped_piece", deflection: "sacrifice" };
  const motifs = [...new Set(themes.split(" ").map((th) => map[th]).filter(Boolean))] as Motif[];
  return { id: "li-" + id, fen: c.fen(), solution: mv.slice(1), motifs, rating: Number(rating), source: "lichess_cc0", sourceRef: url };
}
