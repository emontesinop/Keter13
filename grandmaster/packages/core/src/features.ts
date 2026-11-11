import { Chess, SQUARES, type Square, type PieceSymbol, type Color } from "chess.js";
import type { GamePhase } from "./types";

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PIECE_NAME_ES: Record<PieceSymbol, string> = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
export const PIECE_NAME_EN: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export const other = (c: Color): Color => (c === "w" ? "b" : "w");
export const fileOf = (sq: Square) => sq.charCodeAt(0) - 97; // 0..7
export const rankOf = (sq: Square) => Number(sq[1]) - 1; // 0..7
export const toSquare = (f: number, r: number): Square | null =>
  f >= 0 && f < 8 && r >= 0 && r < 8 ? ((String.fromCharCode(97 + f) + (r + 1)) as Square) : null;

export function pieces(chess: Chess, color?: Color) {
  const out: { square: Square; type: PieceSymbol; color: Color }[] = [];
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push(p);
  return out;
}

export interface Material { w: number; b: number; diff: number; nonPawn: { w: number; b: number }; }
export function material(fen: string): Material {
  const c = new Chess(fen);
  const m = { w: 0, b: 0 }, np = { w: 0, b: 0 };
  for (const p of pieces(c)) {
    m[p.color] += PIECE_VALUE[p.type];
    if (p.type !== "p" && p.type !== "k") np[p.color] += PIECE_VALUE[p.type];
  }
  return { w: m.w, b: m.b, diff: m.w - m.b, nonPawn: np };
}

/** Heuristic phase detection. Opening = first 12 full moves unless material already reduced. */
export function gamePhase(fen: string, ply?: number): GamePhase {
  const m = material(fen);
  const c = new Chess(fen);
  const queens = pieces(c).filter((p) => p.type === "q").length;
  const np = m.nonPawn.w + m.nonPawn.b;
  if (np <= 26 && (queens === 0 || np <= 20)) return "endgame";
  const moveNo = ply !== undefined ? Math.ceil(ply / 2) : Number(fen.split(" ")[5] ?? 1);
  if (moveNo <= 12 && np >= 50) return "opening";
  return "middlegame";
}

/** Returns a FEN with the side to move flipped (null if that would be illegal: side to move in check). */
export function flipTurn(fen: string): string | null {
  const c = new Chess(fen);
  if (c.inCheck()) return null;
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  const f = parts.join(" ");
  try {
    const t = new Chess(f);
    return t.fen();
  } catch {
    return null;
  }
}

/** Static exchange estimate on a square: value gained by `attacker` side capturing first (simplified SEE). */
export function staticExchange(fen: string, target: Square, attackerColor: Color): number {
  const c = new Chess(fen, { skipValidation: true });
  const victim = c.get(target);
  if (!victim || victim.color === attackerColor) return 0;
  const att = c.attackers(target, attackerColor).map((s) => PIECE_VALUE[c.get(s)!.type] || 100).sort((a, b) => a - b);
  const def = c.attackers(target, victim.color).map((s) => PIECE_VALUE[c.get(s)!.type] || 100).sort((a, b) => a - b);
  if (!att.length) return 0;
  // alternate captures
  const gains: number[] = [];
  let side = 0; // 0 attacker, 1 defender
  const lists = [att.slice(), def.slice()];
  let d = 0;
  gains[d] = PIECE_VALUE[victim.type];
  let capturer = lists[0].shift()!;
  while (true) {
    side ^= 1;
    const next = lists[side].shift();
    if (next === undefined) break;
    d++;
    gains[d] = capturer - gains[d - 1];
    capturer = next;
  }
  while (d > 0) {
    gains[d - 1] = -Math.max(-gains[d - 1], gains[d]);
    d--;
  }
  return gains[0];
}

export interface HangingPiece { square: Square; type: PieceSymbol; color: Color; see: number; }

/** Pieces of `color` that the opponent could win material against (SEE > 0). Kings excluded. */
export function hangingPieces(fen: string, color: Color): HangingPiece[] {
  const c = new Chess(fen, { skipValidation: true });
  const out: HangingPiece[] = [];
  for (const p of pieces(c, color)) {
    if (p.type === "k") continue;
    const see = staticExchange(fen, p.square, other(color));
    if (see > 0) out.push({ ...p, see });
  }
  return out.sort((a, b) => b.see - a.see);
}

export interface Threat { kind: "mate" | "capture" | "check"; uci: string; san: string; gain: number; target?: Square; }

/**
 * What would the side NOT to move do if it could move now? (null-move threat analysis)
 * Used to teach "what does my opponent threaten?" — the #1 habit for club players.
 */
export function opponentThreats(fen: string): Threat[] {
  const flipped = flipTurn(fen);
  if (!flipped) return [];
  const c = new Chess(flipped);
  const threats: Threat[] = [];
  for (const m of c.moves({ verbose: true })) {
    c.move(m);
    const mate = c.isCheckmate();
    c.undo();
    if (mate) { threats.push({ kind: "mate", uci: m.from + m.to + (m.promotion ?? ""), san: m.san, gain: 100 }); continue; }
    if (m.captured) {
      const see = staticExchange(flipped, m.to, m.color);
      // value of capturing via this specific move ≈ victim - (attacker if recaptured)
      const defended = c.attackers(m.to, other(m.color)).length > 0;
      const gain = defended ? PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece] : PIECE_VALUE[m.captured];
      const best = Math.max(gain, Math.min(see, PIECE_VALUE[m.captured]));
      if (best > 0) threats.push({ kind: "capture", uci: m.from + m.to + (m.promotion ?? ""), san: m.san, gain: best, target: m.to });
    }
  }
  const seen = new Set<string>();
  return threats
    .sort((a, b) => b.gain - a.gain)
    .filter((t) => (seen.has(t.san) ? false : (seen.add(t.san), true)))
    .slice(0, 5);
}

export interface PawnStructure {
  isolated: Square[];
  doubled: Square[];
  passed: Square[];
  backward: Square[];
  islands: number;
}

export function pawnStructure(fen: string, color: Color): PawnStructure {
  const c = new Chess(fen, { skipValidation: true });
  const own = pieces(c, color).filter((p) => p.type === "p").map((p) => p.square);
  const opp = pieces(c, other(color)).filter((p) => p.type === "p").map((p) => p.square);
  const files = new Map<number, Square[]>();
  for (const s of own) files.set(fileOf(s), [...(files.get(fileOf(s)) ?? []), s]);
  const dir = color === "w" ? 1 : -1;
  const isolated: Square[] = [], doubled: Square[] = [], passed: Square[] = [], backward: Square[] = [];
  for (const s of own) {
    const f = fileOf(s), r = rankOf(s);
    const hasNeighbour = files.has(f - 1) || files.has(f + 1);
    if (!hasNeighbour) isolated.push(s);
    if ((files.get(f)?.length ?? 0) > 1) doubled.push(s);
    const blocked = opp.some((o) => Math.abs(fileOf(o) - f) <= 1 && (rankOf(o) - r) * dir > 0);
    if (!blocked) passed.push(s);
    // backward: no friendly pawn on adjacent files level or behind, and the stop square is controlled by an enemy pawn
    if (hasNeighbour) {
      const support = own.some((o) => Math.abs(fileOf(o) - f) === 1 && (r - rankOf(o)) * dir >= 0);
      const stop = toSquare(f, r + dir);
      const stopAttackedByPawn = stop
        ? opp.some((o) => Math.abs(fileOf(o) - f) === 1 && rankOf(o) === r + 2 * dir)
        : false;
      if (!support && stopAttackedByPawn) backward.push(s);
    }
  }
  let islands = 0, prev = false;
  for (let f = 0; f < 8; f++) { const has = files.has(f); if (has && !prev) islands++; prev = has; }
  return { isolated, doubled, passed, backward, islands };
}

export interface KingSafety { square: Square; shield: number; openFilesNear: number; attackersNear: number; castled: boolean; }

export function kingSafety(fen: string, color: Color): KingSafety | null {
  const c = new Chess(fen, { skipValidation: true });
  const k = pieces(c, color).find((p) => p.type === "k");
  if (!k) return null;
  const f = fileOf(k.square), r = rankOf(k.square), dir = color === "w" ? 1 : -1;
  let shield = 0, openFilesNear = 0, attackersNear = 0;
  for (let df = -1; df <= 1; df++) {
    for (const dr of [1, 2]) {
      const s = toSquare(f + df, r + dr * dir);
      const p = s && c.get(s);
      if (p && p.type === "p" && p.color === color) { shield++; break; }
    }
    const ff = f + df;
    if (ff >= 0 && ff < 8) {
      let ownPawn = false;
      for (let rr = 0; rr < 8; rr++) { const p = c.get(toSquare(ff, rr)!); if (p && p.type === "p" && p.color === color) ownPawn = true; }
      if (!ownPawn) openFilesNear++;
    }
    for (let dr = -1; dr <= 1; dr++) {
      const s = toSquare(f + df, r + dr);
      if (s) attackersNear += c.attackers(s, other(color)).length;
    }
  }
  const castled = color === "w" ? ["g1", "h1", "c1", "b1"].includes(k.square) : ["g8", "h8", "c8", "b8"].includes(k.square);
  return { square: k.square, shield, openFilesNear, attackersNear, castled };
}

export function mobility(fen: string, color: Color): number {
  let f: string | null = fen;
  if (fen.split(" ")[1] !== color) f = flipTurn(fen);
  if (!f) return 0;
  try { return new Chess(f).moves().length; } catch { return 0; }
}

/** Knights/bishops on an outpost: in enemy half, protected by own pawn, cannot be chased by enemy pawns. */
export function outposts(fen: string, color: Color): Square[] {
  const c = new Chess(fen, { skipValidation: true });
  const dir = color === "w" ? 1 : -1;
  const oppPawns = pieces(c, other(color)).filter((p) => p.type === "p").map((p) => p.square);
  return pieces(c, color)
    .filter((p) => p.type === "n" || p.type === "b")
    .filter((p) => {
      const r = rankOf(p.square), f = fileOf(p.square);
      const inEnemyHalf = color === "w" ? r >= 3 : r <= 4;
      if (!inEnemyHalf) return false;
      const protectedByPawn = c.attackers(p.square, color).some((s) => c.get(s)?.type === "p");
      const chasable = oppPawns.some((o) => Math.abs(fileOf(o) - f) === 1 && (rankOf(o) - r) * dir > 0);
      return protectedByPawn && !chasable;
    })
    .map((p) => p.square);
}

export function openFiles(fen: string): { open: number[]; semiOpen: Record<Color, number[]> } {
  const c = new Chess(fen, { skipValidation: true });
  const has: Record<Color, Set<number>> = { w: new Set(), b: new Set() };
  for (const p of pieces(c)) if (p.type === "p") has[p.color].add(fileOf(p.square));
  const open: number[] = [], semiOpen: Record<Color, number[]> = { w: [], b: [] };
  for (let f = 0; f < 8; f++) {
    if (!has.w.has(f) && !has.b.has(f)) open.push(f);
    else if (!has.w.has(f)) semiOpen.w.push(f);
    else if (!has.b.has(f)) semiOpen.b.push(f);
  }
  return { open, semiOpen };
}

export interface PositionFeatures {
  fen: string;
  sideToMove: Color;
  phase: GamePhase;
  material: Material;
  inCheck: boolean;
  hanging: Record<Color, HangingPiece[]>;
  threatsAgainstSideToMove: Threat[];
  pawns: Record<Color, PawnStructure>;
  king: Record<Color, KingSafety | null>;
  mobility: Record<Color, number>;
  outposts: Record<Color, Square[]>;
  files: ReturnType<typeof openFiles>;
}

export function extractFeatures(fen: string): PositionFeatures {
  const c = new Chess(fen);
  const stm = c.turn();
  return {
    fen,
    sideToMove: stm,
    phase: gamePhase(fen),
    material: material(fen),
    inCheck: c.inCheck(),
    hanging: { w: hangingPieces(fen, "w"), b: hangingPieces(fen, "b") },
    threatsAgainstSideToMove: opponentThreats(fen),
    pawns: { w: pawnStructure(fen, "w"), b: pawnStructure(fen, "b") },
    king: { w: kingSafety(fen, "w"), b: kingSafety(fen, "b") },
    mobility: { w: mobility(fen, "w"), b: mobility(fen, "b") },
    outposts: { w: outposts(fen, "w"), b: outposts(fen, "b") },
    files: openFiles(fen),
  };
}

export const FILES = "abcdefgh";
export function allSquares(): Square[] { return SQUARES.slice(); }
