import type { Db } from "../db";
import { config } from "../config";
import { addRatingPoint, storeGame } from "../services/games";
import { ApiError, PoliteClient, type FetchLike } from "./http";
import type { RatingPool } from "@gm/core";

const BASE = "https://api.chess.com/pub";

/** Official Chess.com Published-Data API (read-only, public data). https://www.chess.com/news/view/published-data-api */
export class ChessComClient {
  private http: PoliteClient;
  constructor(fetchImpl?: FetchLike, backoffMs?: number) {
    this.http = new PoliteClient(fetchImpl, { "User-Agent": config.chesscom.userAgent, Accept: "application/json" }, backoffMs);
  }
  private async json(url: string, headers: Record<string, string> = {}) {
    const res = await this.http.request(url, { headers });
    if (res.status === 304) return { notModified: true as const, etag: headers["If-None-Match"] };
    if (res.status === 404) throw new ApiError(404, "Chess.com user or resource not found");
    if (!res.ok) throw new ApiError(res.status, `Chess.com API error ${res.status}`);
    return { data: await res.json(), etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined };
  }
  profile(u: string) { return this.json(`${BASE}/player/${encodeURIComponent(u.toLowerCase())}`); }
  stats(u: string) { return this.json(`${BASE}/player/${encodeURIComponent(u.toLowerCase())}/stats`); }
  archives(u: string) { return this.json(`${BASE}/player/${encodeURIComponent(u.toLowerCase())}/games/archives`); }
  archive(url: string, etag?: string) { return this.json(url, etag ? { "If-None-Match": etag } : {}); }
}

const POOL: Record<string, RatingPool> = { rapid: "chesscom_rapid", blitz: "chesscom_blitz", bullet: "chesscom_bullet", daily: "chesscom_daily" };

export interface SyncResult { imported: number; skipped: number; archivesChecked: number; ratingPoints: number; errors: string[]; }

/**
 * Incremental sync: completed months are fetched once; the current month is re-fetched with ETag.
 * Games are deduplicated by Chess.com game UUID/URL and by normalised PGN fingerprint.
 */
export async function syncChessCom(db: Db, userId: string, username: string, client = new ChessComClient(), now = new Date(), opts: { maxArchives?: number } = {}): Promise<SyncResult> {
  const acc = await db.one<{ sync_cursor: any }>("SELECT sync_cursor FROM accounts WHERE user_id=$1 AND platform='chesscom'", [userId]);
  const cursor = { done: [] as string[], etags: {} as Record<string, string>, ...(acc?.sync_cursor ?? {}) };
  const res: SyncResult = { imported: 0, skipped: 0, archivesChecked: 0, ratingPoints: 0, errors: [] };

  // Current ratings (stats endpoint)
  try {
    const st: any = await client.stats(username);
    for (const [k, pool] of Object.entries(POOL)) {
      const last = st.data?.[`chess_${k}`]?.last;
      if (last?.rating) { await addRatingPoint(db, userId, pool, last.rating, new Date((last.date ?? now.getTime() / 1000) * 1000).toISOString(), "chesscom_stats"); res.ratingPoints++; }
    }
  } catch (e) { res.errors.push("stats: " + (e as Error).message); }

  const arch: any = await client.archives(username);
  const urls: string[] = (arch.data?.archives ?? []).slice().sort();
  const curKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const todo = urls.filter((u) => !cursor.done.includes(u.slice(-7))).slice(-(opts.maxArchives ?? 1000));
  for (const url of todo) {
    const key = url.slice(-7);
    res.archivesChecked++;
    let r: any;
    try { r = await client.archive(url, cursor.etags[key]); } catch (e) { res.errors.push(`${key}: ${(e as Error).message}`); continue; }
    if (r.notModified) continue;
    for (const g of r.data?.games ?? []) {
      if (g.rules && g.rules !== "chess") { res.skipped++; continue; }
      if (!g.pgn) { res.skipped++; continue; }
      const out = await storeGame(db, userId, {
        platform: "chesscom", sourceId: g.uuid ?? g.url, pgn: g.pgn, url: g.url, timeClass: g.time_class, rated: g.rated,
        playedAt: g.end_time ? new Date(g.end_time * 1000).toISOString() : null, usernames: [username],
      });
      if (out.inserted) {
        res.imported++;
        const me = g.white?.username?.toLowerCase() === username.toLowerCase() ? g.white : g.black;
        const pool = POOL[g.time_class];
        if (pool && me?.rating && g.rated !== false) { await addRatingPoint(db, userId, pool, me.rating, new Date(g.end_time * 1000).toISOString(), "chesscom_game"); res.ratingPoints++; }
      } else res.skipped++;
    }
    if (r.etag) cursor.etags[key] = r.etag;
    if (key < curKey) cursor.done.push(key); // past months are immutable
  }
  await db.query(`UPDATE accounts SET sync_cursor=$2, last_sync_at=now(), last_error=$3, games_imported=games_imported+$4, status='connected' WHERE user_id=$1 AND platform='chesscom'`,
    [userId, JSON.stringify(cursor), res.errors.length ? res.errors.join("; ").slice(0, 500) : null, res.imported]);
  return res;
}
