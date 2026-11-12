// Line cache + greedy optimiser (port of desktop raster.py / engine.py).
//
// Thread model: one pass covers c = opacity * width_px * slope_factor of a pixel; passes add up in
// optical density A = sum(-ln(1-c)), coverage = 1 - exp(-A).  The optimiser minimises
//   E = sum w * phi(A* - A),  phi(r) = r^2 (r>=0), lambda r^2 (r<0)
// by repeatedly taking the unused connection from the current nail with the largest exact gain,
// so the result is one continuous thread with no repeated connection.
import type { Geometry } from "./geometry";

export type LineCache = {
  n: number; res: number;
  partners: Int32Array[]; offsets: Int32Array[]; pix: (Uint16Array | Uint32Array)[]; wf: Float32Array[];
  slot: Int32Array; // slot[a*n+b] = index of b in partners[a], -1 if invalid
  lines: number;
};

export function buildCache(g: Geometry, px: Float64Array, res: number, minSkip: number): LineCache {
  const n = g.n;
  const slot = new Int32Array(n * n).fill(-1);
  const partners: Int32Array[] = [], offsets: Int32Array[] = [], pix: (Uint16Array | Uint32Array)[] = [], wf: Float32Array[] = [];
  const Arr = res * res <= 65535 ? Uint16Array : Uint32Array;
  let lines = 0;
  const tmp: number[] = [];
  for (let i = 0; i < n; i++) {
    const ps: number[] = [];
    const offs: number[] = [0];
    const wfs: number[] = [];
    tmp.length = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let d = Math.abs(i - j); d = Math.min(d, n - d);
      if (d < Math.max(1, minSkip)) continue;
      if (g.sides[i] & g.sides[j]) continue;
      const lo = Math.min(i, j), hi = Math.max(i, j);
      const x0 = px[2 * lo], y0 = px[2 * lo + 1], dx = px[2 * hi] - x0, dy = px[2 * hi + 1] - y0;
      const major = Math.max(Math.abs(dx), Math.abs(dy));
      const steps = Math.max(1, Math.ceil(major));
      let prev = -1;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = Math.min(res - 1, Math.max(0, Math.round(x0 + t * dx)));
        const y = Math.min(res - 1, Math.max(0, Math.round(y0 + t * dy)));
        const idx = y * res + x;
        if (idx !== prev) { tmp.push(idx); prev = idx; }
      }
      slot[i * n + j] = ps.length;
      ps.push(j);
      offs.push(tmp.length);
      wfs.push(major > 0 ? Math.hypot(dx, dy) / major : 1);
    }
    partners.push(Int32Array.from(ps));
    offsets.push(Int32Array.from(offs));
    pix.push(Arr.from(tmp));
    wf.push(Float32Array.from(wfs));
    lines += ps.length;
  }
  return { n, res, partners, offsets, pix, wf, slot, lines: lines / 2 };
}

export type OptParams = {
  maxLines: number; minImprovement: number; overshoot: number; patience: number;
  startNail: number; threadPx: number; opacity: number;
};

export type OptResult = { path: number[]; density: Float32Array; errorReduction: number; stopReason: string };

export function optimize(c: LineCache, target: Float32Array, w: Float32Array, p: OptParams,
  onProgress?: (lines: number, path: number[], errRed: number) => void): OptResult {
  const n = c.n;
  const resid = Float32Array.from(target);
  const A = new Float32Array(target.length);
  const lam = p.overshoot;
  const used = new Uint8Array(n * n);
  const alpha = p.opacity * p.threadPx;
  const dl = c.wf.map((wfs) => Float32Array.from(wfs, (v) => -Math.log1p(-Math.min(0.999, Math.max(1e-4, alpha * v)))));
  const phi = (r: number) => (r >= 0 ? r * r : lam * r * r);
  let E0 = 0;
  for (let i = 0; i < resid.length; i++) E0 += w[i] * phi(resid[i]);

  const bestFrom = (nail: number): [number, number] => {
    const ps = c.partners[nail], off = c.offsets[nail], px = c.pix[nail], d = dl[nail];
    let best = -Infinity, bk = -1;
    for (let k = 0; k < ps.length; k++) {
      if (used[nail * n + ps[k]]) continue;
      const dk = d[k];
      let s = 0;
      for (let q = off[k], e = off[k + 1]; q < e; q++) {
        const idx = px[q];
        const g = resid[idx];
        const g2 = g - dk;
        s += w[idx] * ((g >= 0 ? g * g : lam * g * g) - (g2 >= 0 ? g2 * g2 : lam * g2 * g2));
      }
      if (s > best) { best = s; bk = k; }
    }
    return [best, bk];
  };
  const apply = (a: number, k: number, sign: number) => {
    const off = c.offsets[a], px = c.pix[a], d = dl[a][k] * sign;
    for (let q = off[k]; q < off[k + 1]; q++) { A[px[q]] += d; resid[px[q]] -= d; }
    const b = c.partners[a][k];
    used[a * n + b] = used[b * n + a] = sign > 0 ? 1 : 0;
  };

  let firstGain = 0;
  for (let i = 0; i < n; i++) firstGain = Math.max(firstGain, bestFrom(i)[0]);
  const threshold = p.minImprovement * Math.max(firstGain, 1e-12);
  let cur = ((p.startNail % n) + n) % n;
  const path = [cur];
  let E = E0, recent = -1, stalls = 0, stop = "max_lines", last = Date.now();
  while (path.length - 1 < p.maxLines) {
    const [gain, k] = bestFrom(cur);
    if (k < 0) { stop = "no_line_left"; break; }
    let weak = gain <= threshold;
    if (weak && stalls < p.patience && recent > 3 * threshold) { stalls++; weak = false; }
    else if (!weak) stalls = 0;
    if (weak) { stop = gain <= 0 ? "no_improving_line" : "min_improvement"; break; }
    apply(cur, k, 1);
    cur = c.partners[cur][k];
    path.push(cur);
    E -= gain;
    recent = recent < 0 ? gain : 0.97 * recent + 0.03 * gain;
    if (onProgress && Date.now() - last > 120) { last = Date.now(); onProgress(path.length - 1, path, 1 - E / E0); }
  }
  // refinement: drop trailing lines whose contribution became negative (never breaks continuity)
  while (path.length > 1) {
    const a = path[path.length - 2], b = path[path.length - 1];
    const k = c.slot[a * n + b];
    const off = c.offsets[a], px = c.pix[a], d = dl[a][k];
    let contrib = 0;
    for (let q = off[k]; q < off[k + 1]; q++) { const g = resid[px[q]]; contrib += w[px[q]] * (phi(g + d) - phi(g)); }
    if (contrib >= 0) break;
    apply(a, k, -1);
    path.pop();
  }
  E = 0;
  for (let i = 0; i < resid.length; i++) E += w[i] * phi(resid[i]);
  return { path, density: A, errorReduction: E0 > 0 ? 1 - E / E0 : 0, stopReason: stop };
}
