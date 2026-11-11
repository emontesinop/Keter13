import { summarizeRatings, performanceRating, openingStats, type RatingPoint, type RatingPool, RATING_POOL_LABEL } from "@gm/core";
import type { Db } from "../db";
import { getProfile } from "./context";
import { userWeaknesses, streak } from "./training";

export const WINDOWS: Record<string, number | undefined> = { "7d": 7, "30d": 30, "90d": 90, "6m": 182, "1y": 365, all: undefined };

export async function ratingAnalytics(db: Db, userId: string, window = "90d") {
  const days = WINDOWS[window];
  const pts = (await db.query<{ pool: RatingPool; rating: number; at: Date | string; source: string }>("SELECT pool, rating, at, source FROM rating_points WHERE user_id=$1 ORDER BY at", [userId]))
    .map((r) => ({ pool: r.pool, rating: r.rating, at: new Date(r.at).toISOString(), source: r.source })) as RatingPoint[];
  const pools = [...new Set(pts.map((p) => p.pool))];
  const summaries = pools.map((pool) => ({ ...summarizeRatings(pts, pool, days), label: RATING_POOL_LABEL[pool] }));
  const from = days ? Date.now() - days * 86400000 : 0;
  // Estimated strength per pool: performance rating over the last 50 rated games in that pool (never mixed across pools)
  const games = await db.query<any>("SELECT platform, time_class, user_color, white_elo, black_elo, user_result FROM games WHERE user_id=$1 AND rated IS DISTINCT FROM false AND user_result IS NOT NULL ORDER BY played_at DESC LIMIT 500", [userId]);
  const byPool = new Map<string, { opponentRating: number; score: 0 | 0.5 | 1 }[]>();
  for (const g of games) {
    const pool = `${g.platform}_${g.time_class}`;
    const opp = g.user_color === "w" ? g.black_elo : g.white_elo;
    if (!opp) continue;
    const arr = byPool.get(pool) ?? [];
    if (arr.length < 50) arr.push({ opponentRating: opp, score: g.user_result === "win" ? 1 : g.user_result === "draw" ? 0.5 : 0 });
    byPool.set(pool, arr);
  }
  const estimates = [...byPool.entries()].map(([pool, arr]) => ({ pool, label: RATING_POOL_LABEL[pool as RatingPool] ?? pool, performance: performanceRating(arr) })).filter((e) => e.performance);
  const p = await getProfile(db, userId);
  return {
    window, summaries, estimates,
    points: pts.filter((x) => new Date(x.at).getTime() >= from),
    fide: p.fide_id ? { fideId: p.fide_id } : null,
    disclaimer: p.language === "es"
      ? "Cada sistema de rating (Chess.com, Lichess, FIDE) y cada ritmo se muestran por separado. La 'fuerza estimada' es un rendimiento estadístico con intervalo de confianza dentro de un mismo grupo, no un rating oficial."
      : "Each rating system (Chess.com, Lichess, FIDE) and time control is shown separately. 'Estimated strength' is a statistical performance with a confidence interval within one pool, not an official rating.",
  };
}

export async function performanceAnalytics(db: Db, userId: string, window = "90d") {
  const days = WINDOWS[window];
  const cond = days ? `AND g.played_at > now() - interval '${days} days'` : "";
  const res = await db.query<any>(`SELECT g.user_result AS r, g.time_class AS tc, count(*)::int AS n FROM games g WHERE g.user_id=$1 AND g.user_result IS NOT NULL ${cond} GROUP BY 1,2`, [userId]);
  const total = res.reduce((s, r) => s + r.n, 0);
  const sum = (k: string) => res.filter((r) => r.r === k).reduce((s, r) => s + r.n, 0);
  const an = await db.query<any>(`SELECT a.accuracy, a.acpl, a.blunders, a.mistakes, a.inaccuracies, g.played_at, a.report->'phases' AS phases, a.report->'time' AS time, g.opening, g.user_color, g.user_result, a.report->'repertoire' AS rep FROM analyses a JOIN games g ON g.id=a.game_id WHERE a.user_id=$1 ${cond} ORDER BY g.played_at`, [userId]);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const phase = (k: string) => avg(an.map((a) => a.phases?.[k]?.accuracy).filter((x: any) => typeof x === "number"));
  const attempts = await db.query<any>(`SELECT domain, avg(CASE WHEN correct THEN 100 ELSE 0 END)::float AS pct, count(*)::int AS n FROM training_attempts WHERE user_id=$1 ${days ? `AND created_at > now() - interval '${days} days'` : ""} GROUP BY domain`, [userId]);
  const st = await streak(db, userId);
  const openings = openingStats(an.filter((a) => a.user_result).map((a) => ({
    opening: `${a.user_color === "w" ? "♔" : "♚"} ${a.rep?.lineName ?? a.opening ?? "?"}`, result: a.user_result,
    deviationBy: a.rep?.deviation?.by, deviationSan: a.rep?.deviation?.played,
  })));
  return {
    window,
    results: { games: total, winPct: total ? Math.round((sum("win") / total) * 1000) / 10 : null, drawPct: total ? Math.round((sum("draw") / total) * 1000) / 10 : null, lossPct: total ? Math.round((sum("loss") / total) * 1000) / 10 : null, byTimeClass: res },
    analysed: an.length,
    accuracy: { avg: avg(an.map((a) => a.accuracy).filter((x) => x !== null)), series: an.map((a) => ({ at: a.played_at, accuracy: a.accuracy, acpl: a.acpl })) },
    perGame: { blunders: avg(an.map((a) => a.blunders)), mistakes: avg(an.map((a) => a.mistakes)), inaccuracies: avg(an.map((a) => a.inaccuracies)), acpl: avg(an.map((a) => a.acpl).filter((x) => x !== null)) },
    phases: { opening: phase("opening"), middlegame: phase("middlegame"), endgame: phase("endgame") },
    time: { fastErrorsPerGame: avg(an.map((a) => a.time?.fastErrors).filter((x: any) => typeof x === "number")), timeTroubleErrorsPerGame: avg(an.map((a) => a.time?.errorsInTimeTrouble).filter((x: any) => typeof x === "number")) },
    training: { byDomain: attempts, streak: st.streak, activeDays30: st.activeDays30 },
    openings,
  };
}

/** Deterministic weekly report: compares the last 30 days with the previous 30 and only claims trends with enough data. */
export async function weeklyReport(db: Db, userId: string) {
  const p = await getProfile(db, userId);
  const es = p.language === "es";
  const q = async (from: number, to: number) => db.one<any>(
    `SELECT count(*)::int AS n, avg(a.accuracy)::float AS acc, avg(a.blunders)::float AS bl, avg(a.mistakes)::float AS mi FROM analyses a JOIN games g ON g.id=a.game_id
     WHERE a.user_id=$1 AND g.played_at <= now() - interval '${from} days' AND g.played_at > now() - interval '${to} days'`, [userId]);
  const cur = await q(0, 30), prev = await q(30, 60);
  const tac = async (from: number, to: number) => db.one<any>(`SELECT count(*)::int AS n, avg(CASE WHEN correct THEN 100 ELSE 0 END)::float AS pct FROM training_attempts WHERE user_id=$1 AND domain='tactics' AND created_at <= now() - interval '${from} days' AND created_at > now() - interval '${to} days'`, [userId]);
  const tc = await tac(0, 30), tp = await tac(30, 60);
  const { weaknesses } = await userWeaknesses(db, userId, 30);
  const lines: string[] = [];
  const MIN = 8;
  if (cur.n >= MIN && prev.n >= MIN) {
    const d = cur.acc - prev.acc;
    lines.push(es ? `Precisión media: ${cur.acc.toFixed(1)}% (${d >= 0 ? "+" : ""}${d.toFixed(1)} vs. los 30 días anteriores, ${cur.n} vs ${prev.n} partidas analizadas).` : `Average accuracy: ${cur.acc.toFixed(1)}% (${d >= 0 ? "+" : ""}${d.toFixed(1)} vs the previous 30 days, ${cur.n} vs ${prev.n} analysed games).`);
    const db_ = cur.bl - prev.bl;
    if (Math.abs(db_) >= 0.2) lines.push(es ? `Errores graves por partida: ${cur.bl.toFixed(2)} (${db_ < 0 ? "mejora" : "empeora"}).` : `Blunders per game: ${cur.bl.toFixed(2)} (${db_ < 0 ? "improving" : "worsening"}).`);
  } else lines.push(es ? `Datos insuficientes para tendencias de partidas (se necesitan ≥${MIN} partidas analizadas en cada periodo; tienes ${cur.n ?? 0} y ${prev.n ?? 0}).` : `Not enough data for game trends (need ≥${MIN} analysed games per period; you have ${cur.n ?? 0} and ${prev.n ?? 0}).`);
  if (tc.n >= 20 && tp.n >= 20) lines.push(es ? `Precisión táctica en entrenamiento: ${tc.pct.toFixed(0)}% (antes ${tp.pct.toFixed(0)}%).` : `Training tactical accuracy: ${tc.pct.toFixed(0)}% (previously ${tp.pct.toFixed(0)}%).`);
  if (weaknesses[0]) {
    const w = weaknesses[0];
    lines.push(es ? `Tus derrotas y errores siguen originándose sobre todo en: ${w.label.es} (${w.occurrences} casos en 30 días). Prioridad de entrenamiento: ${w.label.es.toLowerCase()}.` : `Your errors still mostly originate from: ${w.label.en} (${w.occurrences} cases in 30 days). Training priority: ${w.label.en.toLowerCase()}.`);
    if (weaknesses[1]) lines.push(es ? `Segunda prioridad: ${weaknesses[1].label.es}.` : `Second priority: ${weaknesses[1].label.en}.`);
  }
  return { generatedAt: new Date().toISOString(), lines, current: cur, previous: prev, weaknesses: weaknesses.slice(0, 3) };
}
