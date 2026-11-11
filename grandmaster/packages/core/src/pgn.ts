import { Chess, type Move } from "chess.js";

export interface ParsedMove {
  ply: number; // 1-based
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** remaining clock in seconds after the move, if [%clk] present */
  clock?: number;
  /** seconds spent on this move, if derivable */
  timeSpent?: number;
  comment?: string;
}

export interface ParsedGame {
  headers: Record<string, string>;
  moves: ParsedMove[];
  startFen: string;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  /** initial time & increment in seconds when TimeControl header is parseable */
  timeControl?: { base: number; increment: number };
  fingerprint: string;
}

/** Fast non-cryptographic 64-bit hash (cyrb53 variant) → 16 hex chars. Deterministic in browser & Node. */
export function hash64(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** Split a multi-game PGN file into individual game strings. */
export function splitPgn(text: string): string[] {
  const norm = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const parts = norm.split(/\n(?=\[Event\s)/g);
  return parts.map((p) => p.trim()).filter((p) => /\d\.|\[/.test(p) && p.length > 0);
}

export function parseClock(comment: string | undefined): number | undefined {
  if (!comment) return undefined;
  const m = comment.match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function parseTimeControl(tc: string | undefined): { base: number; increment: number } | undefined {
  if (!tc || tc === "-" || tc === "?") return undefined;
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return undefined;
  return { base: Number(m[1]), increment: Number(m[2] ?? 0) };
}

export function moveToUci(m: Pick<Move, "from" | "to" | "promotion">): string {
  return m.from + m.to + (m.promotion ?? "");
}

export function gameFingerprint(headers: Record<string, string>, uciMoves: string[]): string {
  const norm = [
    (headers.White ?? "").toLowerCase().trim(),
    (headers.Black ?? "").toLowerCase().trim(),
    (headers.UTCDate ?? headers.Date ?? "").trim(),
    (headers.UTCTime ?? "").trim(),
    uciMoves.join(" "),
  ].join("|");
  return hash64(norm);
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });
  const headers = chess.getHeaders();
  const comments = new Map<string, string>();
  for (const c of chess.getComments()) comments.set(c.fen, c.comment);
  const history = chess.history({ verbose: true });
  const startFen = history.length ? history[0].before : chess.fen();
  const tc = parseTimeControl(headers.TimeControl);
  const moves: ParsedMove[] = [];
  const lastClock: Record<"w" | "b", number | undefined> = { w: tc?.base, b: tc?.base };
  const startTurn = startFen.split(" ")[1] as "w" | "b";
  const startMoveNo = Number(startFen.split(" ")[5] ?? 1);
  history.forEach((m, i) => {
    const comment = comments.get(m.after);
    const clock = parseClock(comment);
    let timeSpent: number | undefined;
    const prev = lastClock[m.color];
    if (clock !== undefined && prev !== undefined) {
      timeSpent = Math.max(0, Math.round((prev - clock + (tc?.increment ?? 0)) * 10) / 10);
    }
    if (clock !== undefined) lastClock[m.color] = clock;
    const plyOffset = startTurn === "b" ? 1 : 0;
    const absolutePly = i + plyOffset;
    moves.push({
      ply: i + 1,
      moveNumber: startMoveNo + Math.floor(absolutePly / 2),
      color: m.color,
      san: m.san,
      uci: moveToUci(m),
      fenBefore: m.before,
      fenAfter: m.after,
      clock,
      timeSpent: i < 2 && tc ? undefined : timeSpent,
      comment: comment?.replace(/\[%[^\]]*\]/g, "").trim() || undefined,
    });
  });
  const rawResult = headers.Result ?? "*";
  const result = (["1-0", "0-1", "1/2-1/2"].includes(rawResult) ? rawResult : "*") as ParsedGame["result"];
  return {
    headers,
    moves,
    startFen,
    result,
    timeControl: tc,
    fingerprint: gameFingerprint(headers, moves.map((m) => m.uci)),
  };
}

/** Apply a list of UCI moves to a FEN and return SAN list (stops at first illegal move). */
export function uciLineToSan(fen: string, uci: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of uci) {
    try {
      const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(mv.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Format a SAN line with move numbers starting from the given FEN. */
export function formatLine(fen: string, sans: string[]): string {
  const parts = fen.split(" ");
  let moveNo = Number(parts[5] ?? 1);
  let turn = parts[1] as "w" | "b";
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (turn === "w") out.push(`${moveNo}.${san}`);
    else out.push(i === 0 ? `${moveNo}...${san}` : san);
    if (turn === "b") moveNo++;
    turn = turn === "w" ? "b" : "w";
  });
  return out.join(" ");
}

export function sanToUci(fen: string, san: string): string | null {
  try {
    const c = new Chess(fen);
    const m = c.move(san.trim());
    return moveToUci(m);
  } catch {
    return null;
  }
}
