import type { Db } from "../db";
import { config } from "../config";
import { addRatingPoint, storeGame } from "../services/games";
import { ApiError, PoliteClient, type FetchLike } from "./http";
import { decrypt, encrypt, pkcePair, randomId } from "../security";
import type { RatingPool } from "@gm/core";

/** Scopes requested: none are needed for public games; study:read allows importing private studies. */
export const LICHESS_SCOPES = ["study:read", "preference:read"];

const POOL: Record<string, RatingPool> = { rapid: "lichess_rapid", blitz: "lichess_blitz", bullet: "lichess_bullet", classical: "lichess_classical", correspondence: "lichess_correspondence" };

export class LichessClient {
  private http: PoliteClient;
  constructor(private token?: string, fetchImpl?: FetchLike, backoffMs?: number) {
    this.http = new PoliteClient(fetchImpl, token ? { Authorization: `Bearer ${token}` } : {}, backoffMs);
  }
  private async get(path: string, accept = "application/json") {
    const res = await this.http.request(`${config.lichess.host}${path}`, { headers: { Accept: accept } });
    if (res.status === 404) throw new ApiError(404, "Lichess user or resource not found");
    if (res.status === 401) throw new ApiError(401, "Lichess token invalid or expired — reconnect your account");
    if (!res.ok) throw new ApiError(res.status, `Lichess API error ${res.status}`);
    return res;
  }
  async user(u: string) { return (await this.get(`/api/user/${encodeURIComponent(u)}`)).json(); }
  async account() { return (await this.get(`/api/account`)).json(); }
  async ratingHistory(u: string) { return (await this.get(`/api/user/${encodeURIComponent(u)}/rating-history`)).json(); }
  async gamesSince(u: string, sinceMs: number, max = 300): Promise<any[]> {
    const qs = new URLSearchParams({ since: String(sinceMs), max: String(max), pgnInJson: "true", clocks: "true", opening: "true", sort: "dateAsc" });
    const text = await (await this.get(`/api/games/user/${encodeURIComponent(u)}?${qs}`, "application/x-ndjson")).text();
    return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  async studyPgn(id: string) { return (await this.get(`/api/study/${encodeURIComponent(id)}.pgn?clocks=false&comments=true`, "application/x-chess-pgn")).text(); }

  static async exchangeCode(code: string, verifier: string, redirectUri: string, fetchImpl: FetchLike = fetch) {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: config.lichess.clientId });
    const res = await fetchImpl(`${config.lichess.host}/api/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) throw new ApiError(res.status, "Lichess token exchange failed");
    return (await res.json()) as { access_token: string; expires_in?: number };
  }
}

export async function startLichessOAuth(db: Db, userId: string, redirectUri: string) {
  const { verifier, challenge } = pkcePair();
  const state = randomId();
  await db.query("INSERT INTO oauth_states(state, user_id, verifier) VALUES ($1,$2,$3)", [state, userId, verifier]);
  const qs = new URLSearchParams({ response_type: "code", client_id: config.lichess.clientId, redirect_uri: redirectUri, code_challenge_method: "S256", code_challenge: challenge, scope: LICHESS_SCOPES.join(" "), state });
  return `${config.lichess.host}/oauth?${qs}`;
}

export async function finishLichessOAuth(db: Db, state: string, code: string, redirectUri: string, fetchImpl?: FetchLike) {
  const row = await db.one<{ user_id: string; verifier: string; created_at: string }>("DELETE FROM oauth_states WHERE state=$1 RETURNING user_id, verifier, created_at", [state]);
  if (!row) throw new ApiError(400, "Invalid or expired OAuth state");
  if (Date.now() - new Date(row.created_at).getTime() > 15 * 60000) throw new ApiError(400, "OAuth state expired");
  const tok = await LichessClient.exchangeCode(code, row.verifier, redirectUri, fetchImpl);
  const acct = await new LichessClient(tok.access_token, fetchImpl).account();
  await db.query(
    `INSERT INTO accounts (user_id, platform, username, access_token_enc, scopes, status) VALUES ($1,'lichess',$2,$3,$4,'connected')
     ON CONFLICT (user_id, platform) DO UPDATE SET username=EXCLUDED.username, access_token_enc=EXCLUDED.access_token_enc, scopes=EXCLUDED.scopes, status='connected', last_error=NULL`,
    [row.user_id, acct.username, encrypt(tok.access_token), LICHESS_SCOPES.join(" ")],
  );
  return { userId: row.user_id, username: acct.username as string };
}

export async function lichessClientFor(db: Db, userId: string, fetchImpl?: FetchLike, backoffMs?: number) {
  const acc = await db.one<{ username: string; access_token_enc: string | null; sync_cursor: any }>("SELECT username, access_token_enc, sync_cursor FROM accounts WHERE user_id=$1 AND platform='lichess'", [userId]);
  if (!acc) throw new ApiError(400, "Lichess account not connected");
  const token = acc.access_token_enc ? decrypt(acc.access_token_enc) : undefined;
  return { acc, client: new LichessClient(token, fetchImpl, backoffMs) };
}

export async function syncLichess(db: Db, userId: string, fetchImpl?: FetchLike, backoffMs?: number) {
  const { acc, client } = await lichessClientFor(db, userId, fetchImpl, backoffMs);
  const cursor = { since: 0, ...(acc.sync_cursor ?? {}) };
  const res = { imported: 0, skipped: 0, ratingPoints: 0, errors: [] as string[] };
  try {
    const u = await client.user(acc.username);
    for (const [k, pool] of Object.entries(POOL)) {
      const p = u.perfs?.[k];
      if (p?.rating && p.games > 0) { await addRatingPoint(db, userId, pool, p.rating, new Date().toISOString().slice(0, 10) + "T00:00:00.000Z", "lichess_profile"); res.ratingPoints++; }
    }
    const hist: any[] = await client.ratingHistory(acc.username);
    for (const h of hist) {
      const pool = POOL[String(h.name).toLowerCase()];
      if (!pool) continue;
      for (const [y, m, d, r] of h.points ?? []) { await addRatingPoint(db, userId, pool, r, new Date(Date.UTC(y, m, d)).toISOString(), "lichess_history"); res.ratingPoints++; }
    }
  } catch (e) { res.errors.push("profile: " + (e as Error).message); }

  let since = cursor.since;
  for (let page = 0; page < 20; page++) {
    const games = await client.gamesSince(acc.username, since + 1);
    if (!games.length) break;
    for (const g of games) {
      since = Math.max(since, g.lastMoveAt ?? g.createdAt ?? since);
      if (g.variant && g.variant !== "standard") { res.skipped++; continue; }
      if (!g.pgn) { res.skipped++; continue; }
      const out = await storeGame(db, userId, { platform: "lichess", sourceId: g.id, pgn: g.pgn, url: `${config.lichess.host}/${g.id}`, timeClass: g.speed, rated: g.rated, playedAt: new Date(g.createdAt).toISOString(), usernames: [acc.username] });
      out.inserted ? res.imported++ : res.skipped++;
    }
    if (games.length < 300) break;
  }
  await db.query(`UPDATE accounts SET sync_cursor=$2, last_sync_at=now(), last_error=$3, games_imported=games_imported+$4 WHERE user_id=$1 AND platform='lichess'`,
    [userId, JSON.stringify({ since }), res.errors.length ? res.errors.join("; ") : null, res.imported]);
  return res;
}
