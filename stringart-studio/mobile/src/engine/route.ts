// Route validation and thread-length estimation.
import type { Settings } from "./types";

/** Checks that a path is a trail: consecutive steps, no repeated undirected connection. */
export function validatePath(path: number[], n: number): { ok: boolean; duplicates: number } {
  const seen = new Set<number>();
  let dup = 0;
  for (let i = 1; i < path.length; i++) {
    const a = Math.min(path[i - 1], path[i]), b = Math.max(path[i - 1], path[i]);
    if (a === b || a < 0 || b >= n) return { ok: false, duplicates: dup };
    const key = a * n + b;
    if (seen.has(key)) dup++;
    seen.add(key);
  }
  return { ok: dup === 0, duplicates: dup };
}

/** Thread length (mm): chords + wraps around nails + knots + slack, then waste. */
export function threadLengthMm(path: number[], xy: Float64Array | number[], nailD: number, threadD: number, m: Settings["materials"]): number {
  let straight = 0, wraps = 0;
  const r = (nailD + threadD) / 2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    straight += Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1]);
    if (i < path.length - 1) {
      const c = path[i + 1];
      const ux = xy[2 * a] - xy[2 * b], uy = xy[2 * a + 1] - xy[2 * b + 1];
      const vx = xy[2 * c] - xy[2 * b], vy = xy[2 * c + 1] - xy[2 * b + 1];
      const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
      if (nu > 0 && nv > 0) {
        const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv)));
        wraps += r * (Math.PI - Math.acos(cos));
      }
    }
  }
  if (path.length < 2) return 0;
  return ((straight + wraps) * (1 + m.slackPct / 100) + 2 * m.knotMm) * (1 + m.wastePct / 100);
}
