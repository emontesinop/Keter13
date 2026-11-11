import { buildGameReport, errorsFromReport, matchRepertoire, parsePgn, LONDON, CARO_KANN, newSrsState, type PositionAnalysis } from "@gm/core";
import type { Ctx } from "./context";
import { getProfile } from "./context";

const fenKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Engine analysis with a persistent cache (same position + depth + multipv is never recomputed). */
export async function analysePosition(ctx: Ctx, fen: string, depth: number, multipv = 1): Promise<PositionAnalysis> {
  const key = `${depth}:${multipv}:${fenKey(fen)}`;
  const hit = await ctx.db.one<{ result: PositionAnalysis }>("SELECT result FROM engine_cache WHERE key=$1", [key]);
  if (hit) return { ...hit.result, fen };
  const r = await ctx.engine.analyse(fen, { depth, multipv });
  await ctx.db.query("INSERT INTO engine_cache(key, result) VALUES ($1,$2) ON CONFLICT DO NOTHING", [key, JSON.stringify(r)]);
  return r;
}

export async function enqueueAnalysis(ctx: Ctx, userId: string, gameId: string, depth?: number) {
  const existing = await ctx.db.one("SELECT id, status FROM analysis_jobs WHERE game_id=$1 AND status IN ('queued','running')", [gameId]);
  if (existing) return existing;
  const p = await getProfile(ctx.db, userId);
  return ctx.db.one("INSERT INTO analysis_jobs(user_id, game_id, depth) VALUES ($1,$2,$3) RETURNING id, status", [userId, gameId, depth ?? p.engine_depth]);
}

export async function analyseGame(ctx: Ctx, userId: string, gameId: string, depth: number, onProgress?: (p: number) => Promise<void> | void) {
  const game = await ctx.db.one<any>("SELECT * FROM games WHERE id=$1 AND user_id=$2", [gameId, userId]);
  if (!game) throw new Error("Game not found");
  if (!game.user_color) throw new Error("Unknown user colour for this game — set it before analysing");
  const profile = await getProfile(ctx.db, userId);
  const parsed = parsePgn(game.pgn);
  const fens = [...parsed.moves.map((m) => m.fenBefore), parsed.moves.at(-1)!.fenAfter];
  const analyses: PositionAnalysis[] = [];
  for (let i = 0; i < fens.length; i++) {
    analyses.push(await analysePosition(ctx, fens[i], depth, 1));
    if (onProgress && i % 4 === 0) await onProgress(i / fens.length);
  }
  const sans = parsed.moves.map((m) => m.san);
  const rep = game.user_color === "w" ? LONDON : CARO_KANN;
  const match = matchRepertoire(rep, sans, game.user_color);
  const report = buildGameReport(parsed, analyses, {
    userColor: game.user_color, thresholds: profile.thresholds, lang: profile.language,
    bookPlies: Math.min(match.matchedPlies, 16),
    openingDeviation: match.deviation ? { ply: match.deviation.ply, san: match.deviation.played, expected: match.deviation.expected.join(" / ") } : undefined,
  });
  const engineName = analyses.find((a) => a.engine)?.engine ?? ctx.engine.label ?? "Stockfish";
  await ctx.db.query(
    `INSERT INTO analyses(game_id, user_id, depth, engine, report, accuracy, acpl, blunders, mistakes, inaccuracies) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (game_id) DO UPDATE SET depth=EXCLUDED.depth, engine=EXCLUDED.engine, report=EXCLUDED.report, accuracy=EXCLUDED.accuracy, acpl=EXCLUDED.acpl, blunders=EXCLUDED.blunders, mistakes=EXCLUDED.mistakes, inaccuracies=EXCLUDED.inaccuracies, created_at=now()`,
    [gameId, userId, depth, engineName, JSON.stringify({ ...report, repertoire: { id: rep.id, ...match } }), report.accuracy.user, report.acpl.user, report.counts.blunders, report.counts.mistakes, report.counts.inaccuracies],
  );
  await ctx.db.query("DELETE FROM error_records WHERE game_id=$1", [gameId]);
  for (const e of errorsFromReport(gameId, game.played_at ?? new Date().toISOString(), report, game.opening ?? match.lineName ?? rep.name.en)) {
    await ctx.db.query("INSERT INTO error_records(user_id, game_id, played_at, data) VALUES ($1,$2,$3,$4)", [userId, gameId, game.played_at, JSON.stringify(e)]);
  }
  // Exercises from the student's own mistakes → spaced repetition (error-based learning)
  for (const ex of report.exercises) {
    const ref = `${gameId}:${ex.sourcePly}:${ex.kind}`;
    const domain = ex.kind === "find_threat" ? "threat_awareness" : "tactics";
    const row = await ctx.db.one<{ id: string }>(
      `INSERT INTO exercises(user_id, kind, domain, fen, solution, motifs, prompt, source, source_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,'user_game',$8)
       ON CONFLICT (user_id, source, source_ref) DO UPDATE SET solution=EXCLUDED.solution RETURNING id`,
      [userId, ex.kind, domain, ex.fen, JSON.stringify(ex.solutionUci), JSON.stringify(ex.motifs), ex.prompt, ref],
    );
    if (row) await ctx.db.query(`INSERT INTO srs_cards(user_id, item_type, item_id, state, due) VALUES ($1,'exercise',$2,$3,now()) ON CONFLICT DO NOTHING`, [userId, row.id, JSON.stringify(newSrsState())]);
  }
  return report;
}

/** Background worker: processes queued analysis jobs one at a time; survives restarts (running → re-queued). */
export function startAnalysisWorker(ctx: Ctx, intervalMs = 1500) {
  let stopped = false;
  let busy = false;
  void ctx.db.query("UPDATE analysis_jobs SET status='queued' WHERE status='running'");
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const job = await ctx.db.one<any>("UPDATE analysis_jobs SET status='running', started_at=now(), attempts=attempts+1 WHERE id = (SELECT id FROM analysis_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) RETURNING *");
      if (job) {
        try {
          await analyseGame(ctx, job.user_id, job.game_id, job.depth, (p) => ctx.db.query("UPDATE analysis_jobs SET progress=$2 WHERE id=$1", [job.id, p]).then(() => undefined));
          await ctx.db.query("UPDATE analysis_jobs SET status='done', progress=1, finished_at=now(), error=NULL WHERE id=$1", [job.id]);
        } catch (e) {
          await ctx.db.query("UPDATE analysis_jobs SET status=$2, error=$3, finished_at=now() WHERE id=$1", [job.id, job.attempts >= 3 ? "error" : "queued", (e as Error).message]);
        }
      }
    } finally { busy = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  return { stop: () => { stopped = true; clearInterval(timer); }, tick };
}
