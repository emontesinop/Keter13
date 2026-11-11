/**
 * Spaced repetition (SM-2 family, as popularised by SuperMemo/Anki) for chess exercises and concepts.
 * quality: 0..5 (0 = total failure, 3 = correct with difficulty, 5 = perfect & fast)
 */
export interface SrsState { ease: number; interval: number; reps: number; lapses: number; due: string; /** ISO */ lastReviewed?: string; }

export const newSrsState = (now = new Date()): SrsState => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now.toISOString() });

export function review(state: SrsState, quality: number, now = new Date()): SrsState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease, interval, reps, lapses } = state;
  if (q < 3) {
    reps = 0; lapses += 1; interval = 1; // relearn tomorrow
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const due = new Date(now.getTime() + interval * 86400000);
  return { ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: due.toISOString(), lastReviewed: now.toISOString() };
}

/** Map an exercise result to SM-2 quality, rewarding correct reasoning over speed. */
export function qualityFromResult(r: { correct: boolean; hintsUsed?: number; seconds?: number; targetSeconds?: number; firstTry?: boolean }): number {
  if (!r.correct) return r.hintsUsed ? 1 : 0;
  let q = 5;
  if (r.firstTry === false) q -= 1;
  if (r.hintsUsed) q -= Math.min(2, r.hintsUsed);
  if (r.seconds && r.targetSeconds && r.seconds > r.targetSeconds * 2) q -= 1;
  return Math.max(3, q);
}

export function isDue(s: SrsState, now = new Date()) { return new Date(s.due).getTime() <= now.getTime(); }
