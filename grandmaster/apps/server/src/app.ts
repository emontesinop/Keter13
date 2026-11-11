import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fstatic from "@fastify/static";
import fs from "node:fs";
import { z } from "zod";
import { Chess } from "chess.js";
import {
  REPERTOIRES, MASTER_GAMES, STAGES, GM_ROADMAP, CONCEPTS, searchConcepts, splitPgn, explainMove, gradeCalculation, gradeCandidates,
  gradeThreatAnswer, worstPieces, linePositions, uciLineToSan, MILESTONES, stageFor, milestoneDiagnostic, type RatingPool, type CoachMode, type TrainingDomain,
} from "@gm/core";
import { config } from "./config";
import { hashPassword, verifyPassword, signJwt, verifyJwt, decrypt } from "./security";
import type { Ctx } from "./services/context";
import { getProfile } from "./services/context";
import { storeGame, addRatingPoint } from "./services/games";
import { analysePosition, enqueueAnalysis } from "./services/analysis";
import { coachChat, welcome, remember } from "./services/coach";
import { todaysPlan, weeklyPlan, nextExercises, recordAttempt, completeBlock, diagnostics, userWeaknesses, endgameDrills } from "./services/training";
import { ratingAnalytics, performanceAnalytics, weeklyReport } from "./services/analytics";
import { ChessComClient, syncChessCom } from "./integrations/chesscom";
import { startLichessOAuth, finishLichessOAuth, syncLichess, lichessClientFor, LichessClient } from "./integrations/lichess";
import { ApiError } from "./integrations/http";

declare module "fastify" { interface FastifyRequest { userId?: string } }

const COOKIE = "gm_session";

export async function buildApp(ctx: Ctx, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 20 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(cors, { origin: config.corsOrigin.split(","), credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "Invalid input", details: err.issues });
    const status = err instanceof ApiError ? err.status : err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ error: err.message ?? "Internal error" });
  });

  app.addHook("onRequest", async (req) => {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
    const tok = bearer ?? req.cookies[COOKIE];
    if (tok) { const p = verifyJwt<{ sub: string }>(tok); if (p?.sub) req.userId = p.sub; }
  });
  const uid = (req: FastifyRequest) => { if (!req.userId) throw new ApiError(401, "Not authenticated"); return req.userId; };
  const db = ctx.db;

  // ---------- Auth ----------
  const Creds = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });
  const setSession = (reply: any, userId: string) => {
    const token = signJwt({ sub: userId });
    reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.publicUrl.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 30 });
    return token;
  };
  app.post("/api/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, password } = Creds.parse(req.body);
    const exists = await db.one("SELECT 1 FROM users WHERE email=$1", [email.toLowerCase()]);
    if (exists) throw new ApiError(409, "Email already registered");
    const u = await db.one<{ id: string }>("INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id", [email.toLowerCase(), hashPassword(password)]);
    await db.query("INSERT INTO profiles(user_id) VALUES ($1)", [u!.id]);
    return { token: setSession(reply, u!.id), userId: u!.id };
  });
  app.post("/api/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, password } = Creds.parse(req.body);
    const u = await db.one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email=$1", [email.toLowerCase()]);
    if (!u || !verifyPassword(password, u.password_hash)) throw new ApiError(401, "Invalid email or password");
    return { token: setSession(reply, u.id), userId: u.id };
  });
  app.post("/api/auth/logout", async (_req, reply) => { reply.clearCookie(COOKIE, { path: "/" }); return { ok: true }; });
  app.get("/api/auth/me", async (req) => {
    const id = uid(req);
    const u = await db.one("SELECT id, email, created_at FROM users WHERE id=$1", [id]);
    if (!u) throw new ApiError(401, "Not authenticated");
    return { user: u, profile: await getProfile(db, id), llm: ctx.llm.available ? ctx.llm.name : null, engine: ctx.engine.label ?? "Stockfish" };
  });

  // ---------- Profile ----------
  const ProfileIn = z.object({
    display_name: z.string().max(80).nullable(), rating_estimate: z.number().int().min(100).max(3500), goal_rating: z.number().int().min(100).max(3500),
    long_term_goal: z.number().int().min(100).max(3500), minutes_per_day: z.number().int().min(10).max(600), primary_platform: z.enum(["chesscom", "lichess"]),
    secondary_platform: z.enum(["chesscom", "lichess", "none"]), white_repertoire: z.string().max(40), black_repertoire: z.string().max(40),
    language: z.enum(["es", "en"]), secondary_language: z.enum(["es", "en"]), learning_preference: z.string().max(40), training_style: z.string().max(40),
    thresholds: z.object({ inaccuracy: z.number().min(1).max(50), mistake: z.number().min(2).max(60), blunder: z.number().min(3).max(80) }),
    engine_depth: z.number().int().min(8).max(30), sync_frequency: z.enum(["manual", "hourly", "daily"]), fide_id: z.string().max(20).nullable(),
  }).partial();
  app.get("/api/profile", async (req) => getProfile(db, uid(req)));
  app.put("/api/profile", async (req) => {
    const id = uid(req);
    const body = ProfileIn.parse(req.body);
    const keys = Object.keys(body) as (keyof typeof body)[];
    if (keys.length) {
      const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
      await db.query(`UPDATE profiles SET ${sets}, updated_at=now() WHERE user_id=$1`, [id, ...keys.map((k) => (k === "thresholds" ? JSON.stringify(body[k]) : body[k]))]);
    }
    return getProfile(db, id);
  });

  // ---------- Ratings ----------
  app.post("/api/ratings/manual", async (req) => {
    const id = uid(req);
    const b = z.object({ pool: z.enum(["fide_standard", "fide_rapid", "fide_blitz"]), rating: z.number().int().min(1000).max(3000), at: z.string() }).parse(req.body);
    await addRatingPoint(db, id, b.pool as RatingPool, b.rating, new Date(b.at).toISOString(), "manual");
    return { ok: true };
  });
  app.get("/api/analytics/ratings", async (req) => ratingAnalytics(db, uid(req), (req.query as any).window ?? "90d"));
  app.get("/api/analytics/performance", async (req) => performanceAnalytics(db, uid(req), (req.query as any).window ?? "90d"));
  app.get("/api/analytics/weekly-report", async (req) => weeklyReport(db, uid(req)));

  // ---------- Games ----------
  app.get("/api/games", async (req) => {
    const id = uid(req);
    const q = req.query as any;
    const limit = Math.min(200, Number(q.limit ?? 50)), offset = Number(q.offset ?? 0);
    const rows = await db.query(`SELECT g.id, g.platform, g.white, g.black, g.white_elo, g.black_elo, g.user_color, g.result, g.user_result, g.time_class, g.opening, g.eco, g.played_at, g.url,
      a.accuracy, a.blunders, a.mistakes, a.inaccuracies, j.status AS job_status, j.progress AS job_progress
      FROM games g LEFT JOIN analyses a ON a.game_id=g.id
      LEFT JOIN LATERAL (SELECT status, progress FROM analysis_jobs WHERE game_id=g.id ORDER BY created_at DESC LIMIT 1) j ON true
      WHERE g.user_id=$1 ORDER BY g.played_at DESC NULLS LAST, g.created_at DESC LIMIT $2 OFFSET $3`, [id, limit, offset]);
    const total = await db.one<{ n: string }>("SELECT count(*)::text AS n FROM games WHERE user_id=$1", [id]);
    return { games: rows, total: Number(total?.n ?? 0) };
  });
  app.get("/api/games/:id", async (req) => {
    const id = uid(req);
    const gid = (req.params as any).id;
    const g = await db.one("SELECT * FROM games WHERE id=$1 AND user_id=$2", [gid, id]);
    if (!g) throw new ApiError(404, "Game not found");
    const a = await db.one("SELECT depth, engine, report, created_at FROM analyses WHERE game_id=$1", [gid]);
    const job = await db.one("SELECT status, progress, error FROM analysis_jobs WHERE game_id=$1 ORDER BY created_at DESC LIMIT 1", [gid]);
    return { game: g, analysis: a, job };
  });
  app.post("/api/games/upload", async (req) => {
    const id = uid(req);
    const b = z.object({ pgn: z.string().min(10).max(15_000_000), userColor: z.enum(["w", "b"]).optional(), analyze: z.boolean().optional() }).parse(req.body);
    const accts = await db.query<{ username: string }>("SELECT username FROM accounts WHERE user_id=$1", [id]);
    const p = await getProfile(db, id);
    const names = [...accts.map((a) => a.username), ...(p.display_name ? [p.display_name] : [])];
    const out = { imported: 0, duplicates: 0, errors: [] as string[], ids: [] as string[], unknownColor: 0 };
    for (const part of splitPgn(b.pgn).slice(0, 5000)) {
      const r = await storeGame(db, id, { platform: "upload", pgn: part, usernames: names, userColor: b.userColor ?? null });
      if (r.error) out.errors.push(r.error);
      else if (r.inserted) { out.imported++; out.ids.push(r.id!); }
      else out.duplicates++;
    }
    out.unknownColor = Number((await db.one<{ n: string }>("SELECT count(*)::text AS n FROM games WHERE user_id=$1 AND user_color IS NULL", [id]))?.n ?? 0);
    if (b.analyze) for (const gid of out.ids.slice(0, 20)) await enqueueAnalysis(ctx, id, gid);
    return out;
  });
  app.patch("/api/games/:id", async (req) => {
    const id = uid(req);
    const b = z.object({ userColor: z.enum(["w", "b"]) }).parse(req.body);
    const g = await db.one<any>("SELECT result FROM games WHERE id=$1 AND user_id=$2", [(req.params as any).id, id]);
    if (!g) throw new ApiError(404, "Game not found");
    const ur = g.result === "1/2-1/2" ? "draw" : g.result === "*" ? null : (g.result === "1-0") === (b.userColor === "w") ? "win" : "loss";
    await db.query("UPDATE games SET user_color=$3, user_result=$4 WHERE id=$1 AND user_id=$2", [(req.params as any).id, id, b.userColor, ur]);
    return { ok: true };
  });
  app.delete("/api/games/:id", async (req) => { await db.query("DELETE FROM games WHERE id=$1 AND user_id=$2", [(req.params as any).id, uid(req)]); return { ok: true }; });
  app.post("/api/games/:id/analyze", async (req) => {
    const id = uid(req);
    const g = await db.one("SELECT id FROM games WHERE id=$1 AND user_id=$2", [(req.params as any).id, id]);
    if (!g) throw new ApiError(404, "Game not found");
    const b = z.object({ depth: z.number().int().min(8).max(30).optional() }).parse(req.body ?? {});
    return enqueueAnalysis(ctx, id, (req.params as any).id, b.depth);
  });
  app.post("/api/games/analyze-recent", async (req) => {
    const id = uid(req);
    const n = Math.min(50, Number((req.body as any)?.n ?? 10));
    const rows = await db.query<{ id: string }>("SELECT g.id FROM games g LEFT JOIN analyses a ON a.game_id=g.id WHERE g.user_id=$1 AND a.game_id IS NULL AND g.user_color IS NOT NULL ORDER BY g.played_at DESC NULLS LAST LIMIT $2", [id, n]);
    for (const r of rows) await enqueueAnalysis(ctx, id, r.id);
    return { queued: rows.length };
  });
  app.get("/api/jobs", async (req) => db.query("SELECT id, game_id, status, progress, error, created_at FROM analysis_jobs WHERE user_id=$1 AND (status IN ('queued','running') OR finished_at > now() - interval '1 hour') ORDER BY created_at DESC LIMIT 50", [uid(req)]));

  // ---------- Engine (server-side, deeper than the in-browser WASM) ----------
  const Fen = z.string().refine((f) => { try { new Chess(f); return true; } catch { return false; } }, "Invalid FEN");
  app.post("/api/analysis/position", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    uid(req);
    const b = z.object({ fen: Fen, depth: z.number().int().min(6).max(28).default(18), multipv: z.number().int().min(1).max(5).default(3) }).parse(req.body);
    const r = await analysePosition(ctx, b.fen, b.depth, b.multipv);
    return { ...r, lines: r.lines.map((l) => ({ ...l, san: uciLineToSan(b.fen, l.pv.slice(0, 12)) })) };
  });
  app.post("/api/analysis/explain", async (req) => {
    const id = uid(req);
    const p = await getProfile(db, id);
    const b = z.object({ fen: Fen, playedUci: z.string().min(4).max(5) }).parse(req.body);
    const before = await analysePosition(ctx, b.fen, p.engine_depth, 1);
    const c = new Chess(b.fen);
    c.move({ from: b.playedUci.slice(0, 2), to: b.playedUci.slice(2, 4), promotion: b.playedUci[4] });
    const after = await analysePosition(ctx, c.fen(), p.engine_depth, 1);
    const { winPercentFromScore, negate } = await import("@gm/core");
    const wb = before.lines[0] ? winPercentFromScore(before.lines[0].score) : 50;
    const wa = after.lines[0] ? winPercentFromScore(negate(after.lines[0].score)) : c.isCheckmate() ? 100 : 50;
    return explainMove({ fenBefore: b.fen, playedUci: b.playedUci, bestLine: before.lines[0], afterLine: after.lines[0], winBefore: wb, winAfter: wa, lang: p.language });
  });

  // ---------- Coach ----------
  app.get("/api/coach/welcome", async (req) => welcome(ctx, uid(req)));
  app.post("/api/coach/chat", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const id = uid(req);
    const b = z.object({ threadId: z.string().min(1).max(64), mode: z.enum(["grandmaster", "tactical", "positional", "opening", "endgame", "tournament", "performance"]), message: z.string().min(1).max(4000), fen: z.string().optional(), history: z.array(z.string()).max(400).optional(), socratic: z.boolean().optional() }).parse(req.body);
    return coachChat(ctx, id, { ...b, mode: b.mode as CoachMode });
  });
  app.get("/api/coach/threads/:id", async (req) => db.query("SELECT role, content, meta, created_at FROM coach_messages WHERE user_id=$1 AND thread_id=$2 ORDER BY id", [uid(req), (req.params as any).id]));
  app.post("/api/coach/socratic/threat", async (req) => {
    const id = uid(req); const p = await getProfile(db, id);
    const b = z.object({ fen: Fen, answer: z.string().max(20) }).parse(req.body);
    const r = gradeThreatAnswer(b.fen, b.answer, p.language);
    return { ...r, worstPieces: worstPieces(b.fen) };
  });
  app.post("/api/coach/socratic/candidates", async (req) => {
    const id = uid(req); const p = await getProfile(db, id);
    const b = z.object({ fen: Fen, candidates: z.array(z.string().max(10)).min(1).max(6) }).parse(req.body);
    const a = await analysePosition(ctx, b.fen, Math.min(p.engine_depth, 18), 4);
    return gradeCandidates(b.fen, b.candidates, a.lines, p.language);
  });
  app.post("/api/coach/calculation", async (req) => {
    const id = uid(req); const p = await getProfile(db, id);
    const b = z.object({ fen: Fen, line: z.array(z.string().max(10)).min(1).max(16), itemId: z.string().optional() }).parse(req.body);
    const { fens } = linePositions(b.fen, b.line);
    const analyses = [];
    for (const f of fens) analyses.push(await analysePosition(ctx, f, Math.min(p.engine_depth, 18), 1));
    const grade = gradeCalculation(b.fen, b.line, analyses, p.language);
    await recordAttempt(db, id, { itemType: "calc", itemId: b.itemId ?? b.fen, domain: "calculation", correct: grade.correctDepth >= Math.min(3, b.line.length), score: grade.score, details: { correctDepth: grade.correctDepth, line: b.line } });
    await remember(ctx, id, "calculation", `${p.language === "es" ? "Cálculo sin mover" : "Blind calculation"}: ${grade.summary}`);
    return grade;
  });
  app.get("/api/knowledge", async (req) => { const q = (req.query as any).q as string | undefined; return q ? searchConcepts(q, 8) : CONCEPTS; });

  // ---------- Training ----------
  app.get("/api/training/plan", async (req) => todaysPlan(db, uid(req), (req.query as any).day));
  app.post("/api/training/plan/block", async (req) => { const b = z.object({ day: z.string(), index: z.number().int(), minutes: z.number().int().min(0).max(300) }).parse(req.body); return completeBlock(db, uid(req), b.day, b.index, b.minutes); });
  app.get("/api/training/weekly", async (req) => weeklyPlan(db, uid(req)));
  app.get("/api/training/weaknesses", async (req) => userWeaknesses(db, uid(req), Number((req.query as any).days ?? 90)));
  app.get("/api/training/exercises", async (req) => { const q = req.query as any; return nextExercises(db, uid(req), { domain: q.domain as TrainingDomain | undefined, motif: q.motif, n: q.n ? Number(q.n) : undefined }); });
  app.post("/api/training/attempt", async (req) => {
    const id = uid(req);
    const b = z.object({ itemType: z.string().max(30), itemId: z.string().max(200), domain: z.enum(["tactics", "calculation", "threat_awareness", "openings", "positional", "endgames", "review", "time_management"]), correct: z.boolean(), seconds: z.number().optional(), hintsUsed: z.number().int().optional(), firstTry: z.boolean().optional(), score: z.number().optional(), details: z.any().optional(), summary: z.string().max(300).optional() }).parse(req.body);
    const r = await recordAttempt(db, id, b);
    if (b.summary) await remember(ctx, id, b.domain, b.summary);
    return r;
  });
  app.get("/api/training/history", async (req) => {
    const id = uid(req);
    return {
      sessions: await db.query("SELECT day, plan, completed_blocks, minutes FROM training_sessions WHERE user_id=$1 ORDER BY day DESC LIMIT 60", [id]),
      attempts: await db.query("SELECT item_type, item_id, domain, correct, score, seconds, created_at FROM training_attempts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200", [id]),
      byDay: await db.query("SELECT to_char(created_at,'YYYY-MM-DD') AS day, count(*)::int AS n, avg(CASE WHEN correct THEN 100 ELSE 0 END)::float AS pct FROM training_attempts WHERE user_id=$1 GROUP BY 1 ORDER BY 1 DESC LIMIT 120", [id]),
    };
  });
  app.get("/api/training/endgames", async () => endgameDrills());
  app.get("/api/training/masters", async () => MASTER_GAMES);
  app.get("/api/training/openings", async () => REPERTOIRES);
  app.get("/api/training/diagnostics", async (req) => diagnostics(db, uid(req)));
  app.get("/api/training/curriculum", async (req) => {
    const p = await getProfile(db, uid(req));
    return { stages: STAGES, current: stageFor(p.rating_estimate), milestones: MILESTONES.map((m) => ({ milestone: m, reached: p.rating_estimate >= m, diagnostic: milestoneDiagnostic(m) })), roadmap: GM_ROADMAP[p.language] };
  });

  // ---------- Integrations ----------
  app.get("/api/integrations", async (req) => {
    const id = uid(req);
    const accts = await db.query("SELECT platform, username, status, last_sync_at, last_error, games_imported, scopes, (access_token_enc IS NOT NULL) AS has_token FROM accounts WHERE user_id=$1", [id]);
    const p = await getProfile(db, id);
    return { accounts: accts, syncFrequency: p.sync_frequency };
  });
  app.post("/api/integrations/chesscom", async (req) => {
    const id = uid(req);
    const b = z.object({ username: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/) }).parse(req.body);
    const prof: any = await new ChessComClient(ctx.fetchImpl, ctx.httpBackoffMs).profile(b.username);
    const username = prof.data?.username ?? b.username;
    await db.query(`INSERT INTO accounts(user_id, platform, username) VALUES ($1,'chesscom',$2) ON CONFLICT (user_id, platform) DO UPDATE SET username=EXCLUDED.username, status='connected', sync_cursor='{}'`, [id, username]);
    return { ok: true, username, profile: prof.data };
  });
  app.post("/api/integrations/chesscom/sync", async (req) => {
    const id = uid(req);
    const acc = await db.one<{ username: string }>("SELECT username FROM accounts WHERE user_id=$1 AND platform='chesscom'", [id]);
    if (!acc) throw new ApiError(400, "Chess.com account not connected");
    await db.query("UPDATE accounts SET status='syncing' WHERE user_id=$1 AND platform='chesscom'", [id]);
    const b = (req.body ?? {}) as any;
    try { return await syncChessCom(db, id, acc.username, new ChessComClient(ctx.fetchImpl, ctx.httpBackoffMs), new Date(), { maxArchives: b.maxArchives }); }
    catch (e) { await db.query("UPDATE accounts SET status='error', last_error=$2 WHERE user_id=$1 AND platform='chesscom'", [id, (e as Error).message]); throw e; }
  });
  app.post("/api/integrations/lichess", async (req) => {
    const id = uid(req);
    const b = z.object({ username: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/) }).parse(req.body);
    const u = await new LichessClient(undefined, ctx.fetchImpl, ctx.httpBackoffMs).user(b.username);
    await db.query(`INSERT INTO accounts(user_id, platform, username) VALUES ($1,'lichess',$2) ON CONFLICT (user_id, platform) DO UPDATE SET username=EXCLUDED.username, status='connected'`, [id, u.username]);
    return { ok: true, username: u.username };
  });
  const redirectUri = () => `${config.publicUrl}/api/integrations/lichess/oauth/callback`;
  app.get("/api/integrations/lichess/oauth/start", async (req) => ({ url: await startLichessOAuth(db, uid(req), redirectUri()) }));
  app.get("/api/integrations/lichess/oauth/callback", async (req, reply) => {
    const q = req.query as any;
    if (q.error) return reply.redirect(`/settings?lichess=denied`);
    await finishLichessOAuth(db, String(q.state), String(q.code), redirectUri(), ctx.fetchImpl);
    return reply.redirect(`/settings?lichess=connected`);
  });
  app.post("/api/integrations/lichess/sync", async (req) => {
    const id = uid(req);
    try { return await syncLichess(db, id, ctx.fetchImpl, ctx.httpBackoffMs); }
    catch (e) { await db.query("UPDATE accounts SET status='error', last_error=$2 WHERE user_id=$1 AND platform='lichess'", [id, (e as Error).message]); throw e; }
  });
  app.post("/api/integrations/lichess/study", async (req) => {
    const id = uid(req);
    const b = z.object({ studyId: z.string().regex(/^[A-Za-z0-9]{8}$/) }).parse(req.body);
    const { client } = await lichessClientFor(db, id, ctx.fetchImpl, ctx.httpBackoffMs);
    const pgn = await client.studyPgn(b.studyId);
    let imported = 0;
    for (const part of splitPgn(pgn)) { const r = await storeGame(db, id, { platform: "study", pgn: part, sourceId: null }); if (r.inserted) imported++; }
    return { imported };
  });
  app.delete("/api/integrations/:platform", async (req) => {
    const platform = (req.params as any).platform;
    await db.query("DELETE FROM accounts WHERE user_id=$1 AND platform=$2", [uid(req), platform]);
    return { ok: true, note: "Imported games are kept. Delete them from Game Analysis or with account deletion." };
  });

  // ---------- Proxies to public Lichess services (cached by the browser) ----------
  app.get("/api/explorer", async (req) => {
    const id = uid(req);
    const q = req.query as any;
    const fen = Fen.parse(q.fen);
    const dbName = q.db === "masters" ? "masters" : "lichess";
    const params = new URLSearchParams({ fen, ...(dbName === "lichess" ? { speeds: "blitz,rapid,classical", ratings: "1800,2000,2200,2500" } : {}) });
    let token: string | undefined;
    const acc = await db.one<{ access_token_enc: string | null }>("SELECT access_token_enc FROM accounts WHERE user_id=$1 AND platform='lichess'", [id]);
    if (acc?.access_token_enc) { try { token = decrypt(acc.access_token_enc); } catch { /* token unreadable → anonymous request */ } }
    const res = await (ctx.fetchImpl ?? fetch)(`${config.lichess.explorerHost}/${dbName}?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status === 401 ? 401 : 502, res.status === 401 ? "The Lichess opening explorer requires a connected Lichess account (OAuth)." : `Opening explorer unavailable (${res.status})`);
    return res.json();
  });
  app.get("/api/tablebase", async (req) => {
    uid(req);
    const fen = Fen.parse((req.query as any).fen);
    const pieces = fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").length;
    if (pieces > 7) throw new ApiError(400, "Tablebases cover positions with at most 7 pieces");
    const res = await (ctx.fetchImpl ?? fetch)(`${config.lichess.tablebaseHost}/standard?fen=${encodeURIComponent(fen)}`);
    if (!res.ok) throw new ApiError(502, `Tablebase unavailable (${res.status})`);
    return res.json();
  });

  // ---------- Data rights ----------
  app.get("/api/export", async (req, reply) => {
    const id = uid(req);
    const tables = ["profiles", "accounts", "games", "analyses", "rating_points", "exercises", "srs_cards", "training_attempts", "training_sessions", "coach_messages", "coach_memory", "error_records"];
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
    for (const t of tables) {
      const rows = await db.query(`SELECT * FROM ${t} WHERE user_id=$1`, [id]);
      out[t] = t === "accounts" ? rows.map((r: any) => ({ ...r, access_token_enc: r.access_token_enc ? "[redacted]" : null })) : rows;
    }
    reply.header("Content-Disposition", "attachment; filename=grandmaster-ai-export.json");
    return out;
  });
  app.delete("/api/account", async (req, reply) => {
    const id = uid(req);
    const b = z.object({ confirm: z.literal("DELETE") }).parse(req.body);
    void b;
    await db.query("DELETE FROM users WHERE id=$1", [id]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/health", async () => ({ ok: true, engine: ctx.engine.label ?? "Stockfish", llm: ctx.llm.available ? ctx.llm.name : null, db: db.kind }));

  // ---------- Static web app (production) ----------
  if (fs.existsSync(config.webDist)) {
    await app.register(fstatic, { root: config.webDist, wildcard: true });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
