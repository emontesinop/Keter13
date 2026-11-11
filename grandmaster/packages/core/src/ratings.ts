import type { RatingPool } from "./types";

export interface RatingPoint { pool: RatingPool; rating: number; at: string; /** ISO */ source?: string; }

export interface RatingSummary {
  pool: RatingPool;
  current: number | null;
  peak: number | null;
  samples: number;
  smoothed: number | null; // EWMA
  volatility: number | null; // std-dev of game-to-game change
  monthly: { month: string; avg: number; n: number }[];
  trend: { slopePer30d: number; stderr: number; significant: boolean; n: number } | null;
}

/** Exponentially weighted moving average — dampens single-game noise. */
export function ewma(values: number[], alpha = 0.15): number[] {
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]));
  return out;
}

/** Ordinary least squares on (days, rating) with standard error; "significant" if |slope| > 2·SE and n ≥ 15. */
export function linearTrend(points: { t: number; y: number }[]) {
  const n = points.length;
  if (n < 5) return null;
  const mx = points.reduce((s, p) => s + p.t, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of points) { sxx += (p.t - mx) ** 2; sxy += (p.t - mx) * (p.y - my); }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const resid = points.reduce((s, p) => s + (p.y - (my + slope * (p.t - mx))) ** 2, 0);
  const se = Math.sqrt(resid / Math.max(1, n - 2) / sxx);
  return { slope, se, n };
}

export function summarizeRatings(points: RatingPoint[], pool: RatingPool, windowDays?: number, now = new Date()): RatingSummary {
  let pts = points.filter((p) => p.pool === pool).sort((a, b) => a.at.localeCompare(b.at));
  const all = pts;
  if (windowDays) {
    const from = now.getTime() - windowDays * 86400000;
    pts = pts.filter((p) => new Date(p.at).getTime() >= from);
  }
  const vals = pts.map((p) => p.rating);
  const changes = vals.slice(1).map((v, i) => v - vals[i]);
  const meanC = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  const vol = changes.length >= 3 ? Math.sqrt(changes.reduce((s, c) => s + (c - meanC) ** 2, 0) / (changes.length - 1)) : null;
  const months = new Map<string, number[]>();
  for (const p of pts) { const k = p.at.slice(0, 7); months.set(k, [...(months.get(k) ?? []), p.rating]); }
  const t0 = pts.length ? new Date(pts[0].at).getTime() : 0;
  const tr = linearTrend(pts.map((p) => ({ t: (new Date(p.at).getTime() - t0) / 86400000, y: p.rating })));
  const sm = ewma(vals);
  return {
    pool,
    current: vals.length ? vals[vals.length - 1] : all.length ? all[all.length - 1].rating : null,
    peak: all.length ? Math.max(...all.map((p) => p.rating)) : null,
    samples: pts.length,
    smoothed: sm.length ? Math.round(sm[sm.length - 1]) : null,
    volatility: vol === null ? null : Math.round(vol * 10) / 10,
    monthly: [...months.entries()].map(([month, v]) => ({ month, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length })),
    trend: tr ? { slopePer30d: Math.round(tr.slope * 30 * 10) / 10, stderr: Math.round(tr.se * 30 * 10) / 10, n: tr.n, significant: tr.n >= 15 && Math.abs(tr.slope) > 2 * tr.se } : null,
  };
}

/**
 * Performance rating within ONE pool (never mixed): average opponent rating + 400·(W−L)/N,
 * with linear interpolation clipped to ±800. Returns a 95% interval from binomial uncertainty.
 * This is an ESTIMATE of playing strength in that pool, not an official rating.
 */
export function performanceRating(games: { opponentRating: number; score: 0 | 0.5 | 1 }[]) {
  const n = games.length;
  if (n < 10) return null;
  const avgOpp = games.reduce((s, g) => s + g.opponentRating, 0) / n;
  const p = games.reduce((s, g) => s + g.score, 0) / n;
  const clamp = (x: number) => Math.min(0.99, Math.max(0.01, x));
  const dp = (pp: number) => -400 * Math.log10(1 / clamp(pp) - 1); // logistic Elo difference
  const se = Math.sqrt((p * (1 - p)) / n);
  return {
    estimate: Math.round(avgOpp + dp(p)),
    low: Math.round(avgOpp + dp(p - 1.96 * se)),
    high: Math.round(avgOpp + dp(p + 1.96 * se)),
    n, avgOpponent: Math.round(avgOpp), score: Math.round(p * 1000) / 10,
  };
}

export const MILESTONES = [1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500];
