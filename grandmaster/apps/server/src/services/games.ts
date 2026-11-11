import { parsePgn, type RatingPool } from "@gm/core";
import type { Db } from "../db";

export interface StoreGameInput {
  platform: "chesscom" | "lichess" | "upload" | "study";
  sourceId?: string | null;
  pgn: string;
  playedAt?: string | null;
  url?: string | null;
  timeClass?: string | null;
  rated?: boolean | null;
  /** usernames that identify the user (case-insensitive) */
  usernames?: string[];
  userColor?: "w" | "b" | null;
}

export async function storeGame(db: Db, userId: string, g: StoreGameInput): Promise<{ inserted: boolean; id?: string; error?: string }> {
  let parsed;
  try { parsed = parsePgn(g.pgn); } catch (e) { return { inserted: false, error: "Invalid PGN: " + (e as Error).message }; }
  if (!parsed.moves.length) return { inserted: false, error: "PGN has no moves" };
  const h = parsed.headers;
  const names = (g.usernames ?? []).map((u) => u.toLowerCase());
  let color = g.userColor ?? null;
  if (!color && names.length) {
    if (names.includes((h.White ?? "").toLowerCase())) color = "w";
    else if (names.includes((h.Black ?? "").toLowerCase())) color = "b";
  }
  const userResult = !color || parsed.result === "*" ? null : parsed.result === "1/2-1/2" ? "draw" : (parsed.result === "1-0") === (color === "w") ? "win" : "loss";
  const playedAt = g.playedAt ?? headerDate(h);
  const rows = await db.query<{ id: string }>(
    `INSERT INTO games (user_id, platform, source_id, fingerprint, pgn, white, black, white_elo, black_elo, user_color, result, user_result, time_class, time_control, rated, eco, opening, played_at, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId, g.platform, g.sourceId ?? null, parsed.fingerprint, g.pgn, h.White ?? null, h.Black ?? null, num(h.WhiteElo), num(h.BlackElo), color, parsed.result, userResult,
      g.timeClass ?? timeClassFromTc(parsed.timeControl), h.TimeControl ?? null, g.rated ?? null, h.ECO ?? null, h.Opening ?? openingFromEcoUrl(h.ECOUrl) ?? null, playedAt, g.url ?? h.Link ?? (h.Site?.startsWith("http") ? h.Site : null)],
  );
  return rows.length ? { inserted: true, id: rows[0].id } : { inserted: false };
}

const num = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : null);

function headerDate(h: Record<string, string>): string | null {
  const d = (h.UTCDate ?? h.Date ?? "").replace(/\./g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T${h.UTCTime ?? "12:00:00"}Z`).toISOString();
}

function openingFromEcoUrl(u?: string) {
  if (!u) return null;
  const m = u.match(/openings\/(.+)$/);
  return m ? decodeURIComponent(m[1]).replace(/-/g, " ").replace(/\.\.\..*$/, "").trim() : null;
}

/** Same thresholds as Lichess speed classes (estimated duration = base + 40 × increment). */
export function timeClassFromTc(tc?: { base: number; increment: number }): string | null {
  if (!tc) return null;
  const est = tc.base + 40 * tc.increment;
  return est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical";
}

export async function addRatingPoint(db: Db, userId: string, pool: RatingPool, rating: number, at: string, source: string) {
  await db.query(`INSERT INTO rating_points (user_id, pool, rating, at, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [userId, pool, rating, at, source]);
}
