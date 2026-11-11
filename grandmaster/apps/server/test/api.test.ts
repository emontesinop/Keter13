import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createDb, migrate, type Db } from "../src/db";
import { buildApp } from "../src/app";
import { UciEngine } from "../src/engine/uci";
import { startAnalysisWorker } from "../src/services/analysis";
import { seedGlobalContent } from "../src/services/training";
import { PoliteClient } from "../src/integrations/http";
import type { LlmProvider, LlmRequest } from "../src/llm/provider";
import type { Ctx } from "../src/services/context";

// ---- Fake external services (no network in tests; shapes follow the public API docs) ----
const calls: string[] = [];
const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json", ...(init.headers ?? {}) }, ...init });
const CC_PGN = (n: number, white: string, black: string, result: string) => `[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.10.0${n}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[WhiteElo "1650"]\n[BlackElo "1700"]\n[TimeControl "600"]\n[UTCDate "2026.10.0${n}"]\n[UTCTime "10:00:0${n}"]\n\n1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 c5 ${result}`;
let currentMonthEtagHits = 0;
const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push(url);
  const h = (init?.headers ?? {}) as Record<string, string>;
  if (url.endsWith("/pub/player/tester")) return json({ username: "Tester", player_id: 1 });
  if (url.endsWith("/pub/player/tester/stats")) return json({ chess_rapid: { last: { rating: 1655, date: 1760000000 } }, chess_blitz: { last: { rating: 1580, date: 1760000000 } } });
  if (url.endsWith("/pub/player/tester/games/archives")) return json({ archives: ["https://api.chess.com/pub/player/tester/games/2026/09", "https://api.chess.com/pub/player/tester/games/2026/11"] });
  if (url.endsWith("/games/2026/09")) return json({ games: [
    { url: "https://www.chess.com/game/live/1", uuid: "u1", pgn: CC_PGN(1, "Opp1", "Tester", "0-1"), time_class: "rapid", rules: "chess", rated: true, end_time: 1758000000, white: { username: "Opp1", rating: 1700 }, black: { username: "Tester", rating: 1660 } },
    { url: "https://www.chess.com/game/live/2", uuid: "u2", pgn: "", time_class: "rapid", rules: "chess960", end_time: 1758000100, white: {}, black: {} },
  ] });
  if (url.endsWith("/games/2026/11")) {
    if (h["If-None-Match"] === '"e1"') { currentMonthEtagHits++; return new Response(null, { status: 304 }); }
    return json({ games: [{ url: "https://www.chess.com/game/live/3", uuid: "u3", pgn: CC_PGN(2, "Tester", "Opp2", "1-0"), time_class: "blitz", rules: "chess", rated: true, end_time: 1762800000, white: { username: "Tester", rating: 1590 }, black: { username: "Opp2", rating: 1600 } }] }, { headers: { etag: '"e1"' } });
  }
  if (url.toLowerCase().includes("lichess.org/api/user/litester/rating-history")) return json([{ name: "Blitz", points: [[2026, 9, 1, 1800], [2026, 9, 20, 1825]] }, { name: "Puzzles", points: [[2026, 9, 1, 2100]] }]);
  if (url.toLowerCase().includes("lichess.org/api/user/litester")) return json({ id: "litester", username: "LiTester", perfs: { blitz: { rating: 1825, games: 50 }, rapid: { rating: 1900, games: 3 } } });
  if (url.includes("lichess.org/api/games/user/LiTester")) {
    const since = Number(new URL(url).searchParams.get("since"));
    if (since > 1760000000000) return new Response("", { status: 200 });
    const g = { id: "abcdefgh", rated: true, variant: "standard", speed: "blitz", createdAt: 1760000000000, lastMoveAt: 1760000300000, players: { white: { user: { name: "LiTester" }, rating: 1820 }, black: { user: { name: "X" }, rating: 1810 } }, pgn: `[Event "Rated blitz"]\n[White "LiTester"]\n[Black "X"]\n[Result "1-0"]\n[UTCDate "2026.10.09"]\n[UTCTime "08:53:20"]\n[TimeControl "180+2"]\n\n1. d4 d5 2. Bf4 Nf6 3. e3 e6 1-0` };
    return new Response(JSON.stringify(g) + "\n", { status: 200 });
  }
  if (url.includes("lichess.org/api/token")) return json({ access_token: "lio_SECRET_TOKEN", expires_in: 3600 });
  if (url.includes("lichess.org/api/account")) return json({ username: "LiTester" });
  return new Response("not found", { status: 404 });
};

class FakeLlm implements LlmProvider {
  name = "fake"; available = true; requests: LlmRequest[] = [];
  async complete(req: LlmRequest) {
    this.requests.push(req);
    // first answer hallucinates an illegal/unverified move, second answer complies
    const text = this.requests.length % 2 === 1 ? "Play Qxh7# immediately." : "Rd8# is mate: the king is boxed in by its own pawns.";
    return { text, model: "fake-1", provider: "fake" };
  }
}

let db: Db, app: FastifyInstance, engine: UciEngine, worker: ReturnType<typeof startAnalysisWorker>, ctx: Ctx, token = "";
const llm = new FakeLlm();
const auth = () => ({ authorization: `Bearer ${token}` });
const req = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as any, url, payload: payload as any, headers: auth() });
  return { status: r.statusCode, body: r.body ? (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() : null };
};

beforeAll(async () => {
  db = await createDb({ dataDir: null });
  await migrate(db);
  await seedGlobalContent(db);
  engine = new UciEngine();
  ctx = { db, engine, llm: { name: "none", available: false, complete: async () => { throw new Error("x"); } }, fetchImpl: fakeFetch, httpBackoffMs: 0 };
  app = await buildApp(ctx);
  worker = startAnalysisWorker(ctx, 60_000); // manual ticks in tests
}, 60000);
afterAll(async () => { worker.stop(); await app.close(); await engine.quit(); await db.close(); });

describe("auth & profile", () => {
  it("registers, rejects anonymous calls, logs in", async () => {
    const r = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "me@example.com", password: "supersecret" } });
    expect(r.statusCode).toBe(200);
    token = r.json().token;
    expect((await app.inject({ method: "GET", url: "/api/profile" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "me@example.com", password: "wrongpass" } })).statusCode).toBe(401);
    const me = await req("GET", "/api/auth/me");
    expect(me.body.profile).toMatchObject({ rating_estimate: 1650, goal_rating: 2000, minutes_per_day: 60, white_repertoire: "london", black_repertoire: "caro-kann", language: "es" });
  });
  it("updates and validates the profile", async () => {
    expect((await req("PUT", "/api/profile", { minutes_per_day: 75, display_name: "Tester" })).body.minutes_per_day).toBe(75);
    expect((await req("PUT", "/api/profile", { minutes_per_day: 2 })).status).toBe(400);
    expect((await req("PUT", "/api/profile", { repertoire_ids: ["london", "queens-gambit", "caro-kann", "nimzo-indian"] })).body.repertoire_ids).toEqual(["london", "queens-gambit", "caro-kann", "nimzo-indian"]);
    expect((await req("PUT", "/api/profile", { repertoire_ids: ["made-up"] })).status).toBe(400);
    const st = await req("GET", "/api/training/structures");
    expect(st.body.structures.length).toBeGreaterThan(8);
  });
});

const GAME = `[Event "Club"]\n[White "Tester"]\n[Black "Rival"]\n[Result "0-1"]\n[Date "2026.11.01"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;

describe("games & analysis", () => {
  let gameId = "";
  it("uploads multi-game PGN, detects colour by display name, deduplicates", async () => {
    const r = await req("POST", "/api/games/upload", { pgn: GAME + "\n\n" + GAME.replace("Club", "Club2").replace("2026.11.01", "2026.11.02") });
    expect(r.body).toMatchObject({ imported: 2, duplicates: 0 });
    gameId = r.body.ids[0];
    expect((await req("POST", "/api/games/upload", { pgn: GAME })).body).toMatchObject({ imported: 0, duplicates: 1 });
    const list = await req("GET", "/api/games");
    expect(list.body.total).toBe(2);
    expect(list.body.games[0].user_color).toBe("w");
  });
  it("analyses a game with Stockfish through the job queue and creates exercises", async () => {
    await req("PUT", "/api/profile", { engine_depth: 10 });
    const j = await req("POST", `/api/games/${gameId}/analyze`, {});
    expect(j.body.status).toBe("queued");
    await worker.tick();
    const g = await req("GET", `/api/games/${gameId}`);
    expect(g.body.job.status).toBe("done");
    const rep = g.body.analysis.report;
    expect(rep.userResult).toBe("loss");
    expect(rep.counts.blunders + rep.counts.mistakes).toBeGreaterThan(0);
    expect(rep.topMistakes.length).toBeGreaterThan(0);
    expect(rep.topMistakes[0].explanation.points.length).toBeGreaterThan(0);
    expect(rep.repertoire.id).toBe("italian"); // 1.e4 e5 2.Nf3 Nc6 3.Bc4 is recognised even though it is not in the user's chosen modules
    expect(rep.repertoire.inUserRepertoire).toBe(false);
    expect(g.body.analysis.engine).toMatch(/Stockfish/);
    const ex = await req("GET", "/api/training/exercises?n=20");
    expect(ex.body.some((e: any) => e.source === "user_game")).toBe(true);
    const w = await req("GET", "/api/training/weaknesses");
    expect(w.body.gamesAnalysed).toBe(1);
    expect(w.body.weaknesses.length).toBeGreaterThan(0);
  }, 120000);
  it("server-side position analysis and move explanation", async () => {
    const a = await req("POST", "/api/analysis/position", { fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", depth: 10, multipv: 2 });
    expect(a.body.lines[0].san[0]).toBe("Rd8#");
    const e = await req("POST", "/api/analysis/explain", { fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", playedUci: "g1f1" });
    expect(e.body.bestSan).toBe("Rd8#");
    expect(e.body.grounded).toBe(true);
    expect((await req("POST", "/api/analysis/position", { fen: "not a fen" })).status).toBe(400);
  }, 60000);
});

describe("integrations", () => {
  it("connects Chess.com and syncs incrementally with dedupe and ETags", async () => {
    expect((await req("POST", "/api/integrations/chesscom", { username: "tester" })).body.username).toBe("Tester");
    const s1 = await req("POST", "/api/integrations/chesscom/sync", {});
    expect(s1.body).toMatchObject({ imported: 2, archivesChecked: 2 });
    expect(s1.body.skipped).toBe(1); // chess960 game skipped
    calls.length = 0;
    const s2 = await req("POST", "/api/integrations/chesscom/sync", {});
    expect(s2.body.imported).toBe(0);
    expect(calls.some((u) => u.endsWith("/2026/09"))).toBe(false); // completed month not re-downloaded
    expect(currentMonthEtagHits).toBe(1);
    const integ = await req("GET", "/api/integrations");
    expect(integ.body.accounts[0]).toMatchObject({ platform: "chesscom", username: "Tester", games_imported: 2 });
  });
  it("connects Lichess publicly, syncs games and rating history", async () => {
    expect((await req("POST", "/api/integrations/lichess", { username: "litester" })).body.username).toBe("LiTester");
    const s = await req("POST", "/api/integrations/lichess/sync", {});
    expect(s.body.imported).toBe(1);
    const s2 = await req("POST", "/api/integrations/lichess/sync", {});
    expect(s2.body.imported).toBe(0);
  });
  it("Lichess OAuth PKCE flow stores the token encrypted", async () => {
    const st = await req("GET", "/api/integrations/lichess/oauth/start");
    const u = new URL(st.body.url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const state = u.searchParams.get("state")!;
    const cb = await app.inject({ method: "GET", url: `/api/integrations/lichess/oauth/callback?state=${state}&code=abc` });
    expect(cb.statusCode).toBe(302);
    const row = await db.one<any>("SELECT access_token_enc FROM accounts WHERE platform='lichess'");
    expect(row.access_token_enc).not.toContain("SECRET");
    expect(row.access_token_enc.startsWith("v1.")).toBe(true);
    // replaying the state fails
    expect((await app.inject({ method: "GET", url: `/api/integrations/lichess/oauth/callback?state=${state}&code=abc` })).statusCode).toBe(400);
  });
  it("polite client retries once after HTTP 429", async () => {
    let n = 0;
    const c = new PoliteClient(async () => (++n === 1 ? new Response("", { status: 429 }) : new Response("ok")), {}, 0);
    expect((await c.request("x")).status).toBe(200);
    expect(n).toBe(2);
  });
});

describe("coach", () => {
  it("answers in grounded mode without an LLM", async () => {
    const r = await req("POST", "/api/coach/chat", { threadId: "t1", mode: "tactical", message: "¿Qué jugada gana aquí?", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
    expect(r.body.provider).toBe("grounded");
    expect(r.body.answer).toContain("Rd8#");
    const w = await req("GET", "/api/coach/welcome");
    expect(w.body.message).toMatch(/trabajamos|worked/);
  }, 60000);
  it("verifies LLM moves against the board and retries once", async () => {
    ctx.llm = llm;
    const r = await req("POST", "/api/coach/chat", { threadId: "t2", mode: "grandmaster", message: "Best move?", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1" });
    expect(llm.requests.length).toBe(2);
    expect(r.body.unverified).toEqual([]);
    expect(r.body.answer).toContain("Rd8#");
    expect(llm.requests[0].system).toContain("GROUNDING RULES");
    expect(llm.requests[0].messages.at(-1)!.content).toContain("ENGINE LINES");
    ctx.llm = { name: "none", available: false, complete: async () => { throw new Error("x"); } };
  }, 60000);
  it("Socratic threat check, candidates and blind calculation", async () => {
    const fen = "4r2k/6pp/7N/3Q4/8/8/6PP/6K1 w - - 0 1";
    expect((await req("POST", "/api/coach/socratic/threat", { fen, answer: "gxh6" })).body.correct).toBe(true);
    const c = await req("POST", "/api/coach/socratic/candidates", { fen, candidates: ["Qg8+", "Nf7+"] });
    expect(c.body.foundBest).toBe(true);
    const calc = await req("POST", "/api/coach/calculation", { fen, line: ["Qg8+", "Rxg8", "Nf7#"] });
    expect(calc.body.correctDepth).toBe(3);
  }, 60000);
});

describe("training, analytics, data rights", () => {
  it("builds today's plan and records SRS attempts", async () => {
    const plan = await req("GET", "/api/training/plan");
    expect(plan.body.plan.totalMinutes).toBe(75);
    const ex = (await req("GET", "/api/training/exercises?n=3")).body[0];
    const a = await req("POST", "/api/training/attempt", { itemType: "exercise", itemId: ex.id, domain: "tactics", correct: true, seconds: 20 });
    expect(a.body.srs.interval).toBe(1);
    const hist = await req("GET", "/api/training/history");
    expect(hist.body.attempts.length).toBeGreaterThan(0);
    const d = await req("GET", "/api/training/diagnostics");
    expect(d.body.milestone).toBe(1700);
    expect((await req("GET", "/api/training/curriculum")).body.current.id).toBe(1);
  });
  it("keeps rating pools separate and reports estimated strength honestly", async () => {
    await req("POST", "/api/ratings/manual", { pool: "fide_standard", rating: 1720, at: "2026-10-01" });
    const r = await req("GET", "/api/analytics/ratings?window=all");
    const pools = r.body.summaries.map((s: any) => s.pool).sort();
    expect(pools).toEqual(["chesscom_blitz", "chesscom_rapid", "fide_standard", "lichess_blitz", "lichess_rapid"]);
    expect(r.body.disclaimer).toMatch(/por separado/);
    const p = await req("GET", "/api/analytics/performance?window=all");
    expect(p.body.results.games).toBeGreaterThan(0);
    const w = await req("GET", "/api/analytics/weekly-report");
    expect(w.body.lines.join(" ")).toMatch(/insuficientes/);
  });
  it("exports and deletes all user data", async () => {
    const e = await app.inject({ method: "GET", url: "/api/export", headers: auth() });
    const data = e.json();
    expect(data.games.length).toBeGreaterThan(0);
    expect(JSON.stringify(data.accounts)).not.toContain("v1.");
    expect((await req("DELETE", "/api/account", { confirm: "DELETE" })).body.ok).toBe(true);
    expect((await db.query("SELECT * FROM games")).length).toBe(0);
  });
});
