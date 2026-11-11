import {
  SEED_PUZZLES, ENDGAME_DRILLS, buildDailyPlan, buildWeeklyThemes, detectWeaknesses, evaluateDiagnostic, milestoneDiagnostic,
  MILESTONES, newSrsState, qualityFromResult, review, stageFor, type ErrorRecord, type TrainingDomain, type SrsState,
} from "@gm/core";
import type { Db } from "../db";
import { getProfile } from "./context";

export async function seedGlobalContent(db: Db) {
  for (const p of SEED_PUZZLES) {
    const exists = await db.one("SELECT 1 FROM exercises WHERE user_id IS NULL AND source=$1 AND source_ref=$2", [p.source, p.id]);
    if (!exists) await db.query("INSERT INTO exercises(user_id, kind, domain, fen, solution, motifs, rating, source, source_ref) VALUES (NULL,'puzzle','tactics',$1,$2,$3,$4,$5,$6)",
      [p.fen, JSON.stringify(p.solution), JSON.stringify(p.motifs), p.rating, p.source, p.id]);
  }
}

export async function userWeaknesses(db: Db, userId: string, days = 90) {
  const rows = await db.query<{ data: ErrorRecord }>("SELECT data FROM error_records WHERE user_id=$1 AND (played_at IS NULL OR played_at > now() - ($2 || ' days')::interval)", [userId, String(days)]);
  const games = await db.one<{ n: string }>("SELECT count(*)::text AS n FROM analyses a JOIN games g ON g.id=a.game_id WHERE a.user_id=$1 AND (g.played_at IS NULL OR g.played_at > now() - ($2 || ' days')::interval)", [userId, String(days)]);
  return { weaknesses: detectWeaknesses(rows.map((r) => r.data), Number(games?.n ?? 0)), gamesAnalysed: Number(games?.n ?? 0), errors: rows.length };
}

export async function dueCount(db: Db, userId: string) {
  return Number((await db.one<{ n: string }>("SELECT count(*)::text AS n FROM srs_cards WHERE user_id=$1 AND due <= now()", [userId]))?.n ?? 0);
}

export async function streak(db: Db, userId: string, today = new Date()) {
  const rows = await db.query<{ day: string }>("SELECT DISTINCT to_char(created_at, 'YYYY-MM-DD') AS day FROM training_attempts WHERE user_id=$1 AND created_at > now() - interval '60 days'", [userId]);
  const set = new Set(rows.map((r) => r.day));
  let n = 0;
  const d = new Date(today); d.setUTCDate(d.getUTCDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return { streak: n, trainedToday: set.has(today.toISOString().slice(0, 10)), activeDays30: [...set].filter((x) => x >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length };
}

export async function todaysPlan(db: Db, userId: string, date = new Date().toISOString().slice(0, 10)) {
  const existing = await db.one<any>("SELECT * FROM training_sessions WHERE user_id=$1 AND day=$2", [userId, date]);
  if (existing) return existing;
  const p = await getProfile(db, userId);
  const { weaknesses } = await userWeaknesses(db, userId);
  const st = await streak(db, userId);
  const recent = await db.query<{ s: number }>("SELECT avg(CASE WHEN correct THEN 100 ELSE 0 END)::float AS s FROM training_attempts WHERE user_id=$1 AND created_at > now() - interval '7 days' GROUP BY to_char(created_at,'YYYY-MM-DD') ORDER BY to_char(created_at,'YYYY-MM-DD')", [userId]);
  const plan = buildDailyPlan({ date, minutes: p.minutes_per_day, weaknesses, dueReviews: await dueCount(db, userId), streak: st.streak, recentSessionScores: recent.map((r) => Number(r.s)), lang: p.language });
  return db.one("INSERT INTO training_sessions(user_id, day, plan) VALUES ($1,$2,$3) ON CONFLICT (user_id, day) DO UPDATE SET plan=training_sessions.plan RETURNING *", [userId, date, JSON.stringify(plan)]);
}

export async function weeklyPlan(db: Db, userId: string) {
  const p = await getProfile(db, userId);
  const { weaknesses } = await userWeaknesses(db, userId);
  return { stage: stageFor(p.rating_estimate), themes: buildWeeklyThemes(weaknesses, p.language) };
}

/** Exercises for a session: due reviews first, then own-game positions, then curated puzzles near the user's level. */
export async function nextExercises(db: Db, userId: string, opts: { domain?: TrainingDomain; motif?: string; n?: number } = {}) {
  const n = opts.n ?? 10;
  const p = await getProfile(db, userId);
  const due = await db.query<any>(
    `SELECT e.*, true AS is_review FROM srs_cards c JOIN exercises e ON e.id::text = c.item_id
     WHERE c.user_id=$1 AND c.item_type='exercise' AND c.due <= now() ${opts.domain ? "AND e.domain=$3" : ""} ORDER BY c.due LIMIT $2`,
    opts.domain ? [userId, n, opts.domain] : [userId, n]);
  const seen = new Set(due.map((d) => d.id));
  const fresh = await db.query<any>(
    `SELECT e.*, false AS is_review FROM exercises e
     WHERE (e.user_id=$1 OR e.user_id IS NULL) ${opts.domain ? "AND e.domain=$4" : ""}
       AND NOT EXISTS (SELECT 1 FROM srs_cards c WHERE c.user_id=$1 AND c.item_type='exercise' AND c.item_id=e.id::text AND c.due > now())
     ORDER BY (e.user_id IS NULL), abs(coalesce(e.rating, $3) - $3), random() LIMIT $2`,
    opts.domain ? [userId, n * 2, p.rating_estimate, opts.domain] : [userId, n * 2, p.rating_estimate]);
  let list = [...due, ...fresh.filter((f) => !seen.has(f.id))];
  if (opts.motif) list = list.filter((e) => (e.motifs ?? []).includes(opts.motif));
  return list.slice(0, n);
}

export interface AttemptInput { itemType: string; itemId: string; domain: TrainingDomain; correct: boolean; seconds?: number; hintsUsed?: number; firstTry?: boolean; score?: number; details?: unknown; }

export async function recordAttempt(db: Db, userId: string, a: AttemptInput) {
  await db.query("INSERT INTO training_attempts(user_id, item_type, item_id, domain, correct, score, seconds, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [userId, a.itemType, a.itemId, a.domain, a.correct, a.score ?? (a.correct ? 100 : 0), a.seconds ?? null, JSON.stringify(a.details ?? {})]);
  const card = await db.one<{ state: SrsState }>("SELECT state FROM srs_cards WHERE user_id=$1 AND item_type=$2 AND item_id=$3", [userId, a.itemType, a.itemId]);
  const q = qualityFromResult({ correct: a.correct, hintsUsed: a.hintsUsed, seconds: a.seconds, targetSeconds: 120, firstTry: a.firstTry });
  const next = review(card?.state ?? newSrsState(), q);
  await db.query(`INSERT INTO srs_cards(user_id, item_type, item_id, state, due) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET state=EXCLUDED.state, due=EXCLUDED.due`,
    [userId, a.itemType, a.itemId, JSON.stringify(next), next.due]);
  return { srs: next, quality: q };
}

export async function completeBlock(db: Db, userId: string, day: string, blockIndex: number, minutes: number) {
  const s = await db.one<any>("SELECT * FROM training_sessions WHERE user_id=$1 AND day=$2", [userId, day]);
  if (!s) throw new Error("No session for that day");
  const done: number[] = Array.from(new Set([...(s.completed_blocks ?? []), blockIndex]));
  return db.one("UPDATE training_sessions SET completed_blocks=$3, minutes=minutes+$4 WHERE user_id=$1 AND day=$2 RETURNING *", [userId, day, JSON.stringify(done), minutes]);
}

/** Domain scores over the last 60 days, used for milestone diagnostics. */
export async function diagnostics(db: Db, userId: string) {
  const p = await getProfile(db, userId);
  const rows = await db.query<{ domain: string; pct: number; n: string; avg_score: number }>(
    "SELECT domain, avg(CASE WHEN correct THEN 100 ELSE 0 END)::float AS pct, avg(score)::float AS avg_score, count(*)::text AS n FROM training_attempts WHERE user_id=$1 AND created_at > now() - interval '60 days' GROUP BY domain", [userId]);
  const res: Partial<Record<TrainingDomain, number>> = {};
  const samples: Record<string, number> = {};
  for (const r of rows) { samples[r.domain] = Number(r.n); if (Number(r.n) >= 5) res[r.domain as TrainingDomain] = Math.round(r.pct); }
  const calc = await db.one<{ d: number }>("SELECT avg((details->>'correctDepth')::float) AS d FROM training_attempts WHERE user_id=$1 AND domain='calculation' AND created_at > now() - interval '60 days'", [userId]);
  if (calc?.d !== null && calc?.d !== undefined && (samples.calculation ?? 0) >= 5) res.calculation = Math.round(calc.d * 10) / 10;
  const eg = await db.one<{ n: string }>("SELECT count(DISTINCT item_id)::text AS n FROM training_attempts WHERE user_id=$1 AND domain='endgames' AND correct", [userId]);
  res.endgames = Number(eg?.n ?? 0);
  const next = MILESTONES.find((m) => m > p.rating_estimate) ?? MILESTONES[MILESTONES.length - 1];
  return { ...evaluateDiagnostic(milestoneDiagnostic(next), res), samples, minSamplesPerDomain: 5, note: p.language === "es" ? "Se requieren al menos 5 intentos por dominio en los últimos 60 días para evaluarlo." : "At least 5 attempts per domain in the last 60 days are required to score it." };
}

export const endgameDrills = () => ENDGAME_DRILLS;
