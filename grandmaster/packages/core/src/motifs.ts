import { Chess, type Square, type Color, type PieceSymbol } from "chess.js";
import { PIECE_VALUE, fileOf, rankOf, toSquare, other, staticExchange, opponentThreats } from "./features";

export type Motif =
  | "mate"
  | "back_rank_mate"
  | "fork"
  | "pin"
  | "skewer"
  | "discovered_attack"
  | "discovered_check"
  | "double_check"
  | "hanging_piece"
  | "promotion"
  | "sacrifice"
  | "quiet_move"
  | "intermezzo"
  | "defensive_resource"
  | "check"
  | "trapped_piece"
  | "material_gain";

export const MOTIF_LABEL: Record<Motif, { es: string; en: string }> = {
  mate: { es: "Mate", en: "Checkmate" },
  back_rank_mate: { es: "Mate en la última fila", en: "Back-rank mate" },
  fork: { es: "Ataque doble (horquilla)", en: "Fork" },
  pin: { es: "Clavada", en: "Pin" },
  skewer: { es: "Enfilada (rayos X)", en: "Skewer" },
  discovered_attack: { es: "Ataque a la descubierta", en: "Discovered attack" },
  discovered_check: { es: "Jaque a la descubierta", en: "Discovered check" },
  double_check: { es: "Jaque doble", en: "Double check" },
  hanging_piece: { es: "Pieza colgada", en: "Hanging piece" },
  promotion: { es: "Coronación", en: "Promotion" },
  sacrifice: { es: "Sacrificio", en: "Sacrifice" },
  quiet_move: { es: "Jugada tranquila", en: "Quiet move" },
  intermezzo: { es: "Jugada intermedia (zwischenzug)", en: "Zwischenzug" },
  defensive_resource: { es: "Recurso defensivo", en: "Defensive resource" },
  check: { es: "Jaque", en: "Check" },
  trapped_piece: { es: "Pieza atrapada", en: "Trapped piece" },
  material_gain: { es: "Ganancia de material", en: "Material gain" },
};

const DIRS_ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS_BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function rays(type: PieceSymbol): number[][] {
  if (type === "r") return DIRS_ROOK;
  if (type === "b") return DIRS_BISHOP;
  if (type === "q") return [...DIRS_ROOK, ...DIRS_BISHOP];
  return [];
}

/** First two pieces encountered along each ray from a slider. */
function rayPieces(chess: Chess, from: Square, type: PieceSymbol) {
  const out: { first: { sq: Square; type: PieceSymbol; color: Color }; second?: { sq: Square; type: PieceSymbol; color: Color } }[] = [];
  for (const [df, dr] of rays(type)) {
    let f = fileOf(from) + df, r = rankOf(from) + dr;
    let first: any = null;
    while (true) {
      const s = toSquare(f, r);
      if (!s) break;
      const p = chess.get(s);
      if (p) {
        if (!first) first = { sq: s, ...p };
        else { out.push({ first, second: { sq: s, ...p } }); first = "done"; break; }
      }
      f += df; r += dr;
    }
    if (first && first !== "done") out.push({ first });
  }
  return out;
}

/** Squares attacked by the piece on `sq` (using chess.js attackers query on every enemy piece). */
function attackedEnemyPieces(chess: Chess, sq: Square, color: Color) {
  const res: { sq: Square; type: PieceSymbol }[] = [];
  for (const row of chess.board())
    for (const p of row)
      if (p && p.color !== color && chess.attackers(p.square, color).includes(sq)) res.push({ sq: p.square, type: p.type });
  return res;
}

export interface MotifContext {
  /** position before the first move of the line */
  fen: string;
  /** UCI line (e.g. engine PV) */
  line: string[];
  /** engine mate score for the side to move, if any */
  mateIn?: number;
  /** gain in win-percentage points vs alternatives (for quiet move / sacrifice heuristics) */
  winGain?: number;
}

/**
 * Detect the tactical motifs present in a line. Heuristic & conservative: we only tag a motif when the
 * geometry is actually on the board, so the coach never invents a "fork" that does not exist.
 */
export function detectMotifs(ctx: MotifContext): Motif[] {
  const motifs = new Set<Motif>();
  const chess = new Chess(ctx.fen);
  const us = chess.turn();
  const line = ctx.line.slice(0, 7);
  if (!line.length) return [];

  // Pre-move context: was there a threat against us, and was a recapture available?
  const threatsBefore = opponentThreats(ctx.fen);

  let materialSwing = 0;
  for (let i = 0; i < line.length; i++) {
    const u = line[i];
    const mover = chess.turn();
    const fenBefore = chess.fen();
    let mv;
    try { mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    const ours = mover === us;
    if (mv.captured) materialSwing += (ours ? 1 : -1) * PIECE_VALUE[mv.captured];
    if (mv.promotion) { materialSwing += (ours ? 1 : -1) * (PIECE_VALUE[mv.promotion] - 1); if (ours) motifs.add("promotion"); }
    if (!ours) continue;

    const firstMove = i === 0;
    if (chess.isCheckmate()) {
      motifs.add("mate");
      const k = chess.board().flat().find((p) => p && p.type === "k" && p.color !== us);
      if (k && (rankOf(k.square) === 0 || rankOf(k.square) === 7)) {
        const enemy = other(us);
        const dir = enemy === "w" ? 1 : -1;
        const escapeBlocked = [-1, 0, 1].every((df) => {
          const s = toSquare(fileOf(k.square) + df, rankOf(k.square) + dir);
          if (!s) return true;
          const p = chess.get(s);
          return !!p && p.color === enemy;
        });
        if (escapeBlocked && (mv.piece === "r" || mv.piece === "q")) motifs.add("back_rank_mate");
      }
    }

    // Discovered / double check
    if (chess.inCheck()) {
      const kingSq = chess.board().flat().find((p) => p && p.type === "k" && p.color !== us)!.square;
      const checkers = chess.attackers(kingSq, us);
      if (checkers.length >= 2) motifs.add("double_check");
      else if (checkers.length === 1 && checkers[0] !== mv.to) motifs.add("discovered_check");
      else if (firstMove) motifs.add("check");
    }

    // Fork: moved piece attacks two+ valuable targets (king counts), each worth more than the forker or undefended
    if (i <= 2) {
      const targets = attackedEnemyPieces(chess, mv.to as Square, us).filter((t) => {
        if (t.type === "k") return true;
        if (PIECE_VALUE[t.type] > PIECE_VALUE[mv.piece]) return true;
        return chess.attackers(t.sq, other(us)).length === 0 && t.type !== "p";
      });
      const moverSafe = staticExchange(chess.fen(), mv.to as Square, other(us)) <= 0 || targets.some((t) => t.type === "k");
      if (targets.length >= 2 && moverSafe) motifs.add("fork");
    }

    // Pins & skewers from sliders that just moved
    if (["b", "r", "q"].includes(mv.piece) && i <= 2) {
      for (const ray of rayPieces(chess, mv.to as Square, mv.piece)) {
        const a = ray.first, b = ray.second;
        if (!b || a.color === us || b.color === us) continue;
        const va = a.type === "k" ? 100 : PIECE_VALUE[a.type];
        const vb = b.type === "k" ? 100 : PIECE_VALUE[b.type];
        if (vb > va && va < PIECE_VALUE[mv.piece] + 100) { if (b.type === "k" || vb >= 5) motifs.add("pin"); }
        else if (va > vb && va >= 5 && b.type !== "p") motifs.add("skewer");
      }
    }

    // Discovered attack: a friendly slider behind the moved piece now attacks an enemy piece
    if (i <= 2 && !mv.captured) {
      const before = new Chess(fenBefore);
      for (const row of chess.board())
        for (const p of row) {
          if (!p || p.color !== us || !["b", "r", "q"].includes(p.type) || p.square === mv.to) continue;
          for (const ray of rayPieces(chess, p.square, p.type)) {
            const t = ray.first;
            if (t.color === us || t.type === "p") continue;
            const wasAttacked = before.attackers(t.sq, us).includes(p.square);
            if (!wasAttacked && PIECE_VALUE[t.type] >= 3) motifs.add("discovered_attack");
          }
        }
    }

    if (firstMove) {
      if (mv.captured) {
        const defended = new Chess(fenBefore).attackers(mv.to as Square, other(us)).length > 0;
        if (!defended && PIECE_VALUE[mv.captured] >= 3) motifs.add("hanging_piece");
        // Sacrifice: capture/move where the moved piece can be won back cheaply but line still wins
        if (defended && PIECE_VALUE[mv.piece] > PIECE_VALUE[mv.captured] + 1 && (ctx.winGain ?? 0) > 0) motifs.add("sacrifice");
      } else if (!chess.inCheck()) {
        const see = staticExchange(chess.fen(), mv.to as Square, other(us));
        if (see >= 3 && (ctx.winGain ?? 0) > 10) motifs.add("sacrifice");
        else if ((ctx.winGain ?? 0) >= 15) motifs.add("quiet_move");
      }
      // Defensive resource: we were facing a mate threat and the best move removes it
      if (threatsBefore.some((t) => t.kind === "mate") && !hasMateInOne(chess)) motifs.add("defensive_resource");
    }
  }
  if (materialSwing >= 2 && !motifs.has("mate")) motifs.add("material_gain");
  if (ctx.mateIn !== undefined && ctx.mateIn > 0) motifs.add("mate");
  return [...motifs];
}

function hasMateInOne(chess: Chess): boolean {
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return true;
  }
  return false;
}

/** Detect a zwischenzug: previous move was a capture, a recapture exists, but the best move is something else that is forcing. */
export function isIntermezzo(fenBefore: string, prevMoveWasCaptureOn: Square | null, bestUci: string): boolean {
  if (!prevMoveWasCaptureOn) return false;
  const c = new Chess(fenBefore);
  const recaptures = c.moves({ verbose: true }).filter((m) => m.to === prevMoveWasCaptureOn);
  if (!recaptures.length) return false;
  if (bestUci.slice(2, 4) === prevMoveWasCaptureOn) return false;
  const mv = c.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] });
  return c.inCheck() || !!mv.captured;
}
