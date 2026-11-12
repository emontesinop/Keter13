// Joint multi-colour optimiser (lines need not form one continuous thread).
//
// State per pixel: optical density per colour A_k (kept as the total density and the
// colour-weighted sum).  The visible colour uses the partitive mixing model
//     C = 1 - exp(-sum A),  mix = sum A_k c_k / sum A,  P = (1 - C) bg + C mix      (linear RGB)
// and the error is measured on sqrt(linear RGB) (close to perceptual lightness):
//     E = sum_p w_p * || sqrt(P_p) - sqrt(T_p) ||^2
//
// Selection: greedy over ALL (colour, connection) pairs on the whole board - not just from the
// current nail - using lazy evaluation: candidates sit in a max-heap with their last known
// gain; the top one is re-evaluated exactly and accepted if it still beats the next best.
// All gains are recomputed periodically because mixing makes gains non-monotone.
// The colours compete for every pixel, so they complement each other (e.g. black adds shadow
// where skin-coloured thread alone cannot reach the darkness).
import type { LineCache } from "./optimizer";

export type ColorOptParams = { maxLines: number; threadPx: number; opacity: number; refreshEvery: number };
export type ColorOptResult = { edges: [number, number][][]; errorReduction: number; stopReason: string };

class MaxHeap {
  key: Float64Array; id: Int32Array; n = 0;
  constructor(cap: number) { this.key = new Float64Array(cap); this.id = new Int32Array(cap); }
  push(k: number, v: number) {
    let i = this.n++;
    this.key[i] = k; this.id[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key[p] >= this.key[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): [number, number] {
    const k = this.key[0], v = this.id[0];
    this.n--;
    if (this.n > 0) {
      this.key[0] = this.key[this.n]; this.id[0] = this.id[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.n && this.key[l] > this.key[m]) m = l;
        if (r < this.n && this.key[r] > this.key[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return [k, v];
  }
  peek() { return this.n ? this.key[0] : -Infinity; }
  private swap(a: number, b: number) {
    const k = this.key[a]; this.key[a] = this.key[b]; this.key[b] = k;
    const v = this.id[a]; this.id[a] = this.id[b]; this.id[b] = v;
  }
}

export function optimizeColorJoint(c: LineCache, targetLin: Float32Array, w: Float32Array, colorsLin: number[][],
  bgLin: number[], p: ColorOptParams, onProgress?: (lines: number, edges: [number, number][][], errRed: number) => void): ColorOptResult {
  const K = colorsLin.length, N = c.res * c.res;
  // flatten the undirected lines (a < b) from the per-nail star layout
  const la: number[] = [], ls: number[] = [], lb: number[] = [];
  for (let a = 0; a < c.n; a++) {
    const ps = c.partners[a];
    for (let s = 0; s < ps.length; s++) if (ps[s] > a) { la.push(a); ls.push(s); lb.push(ps[s]); }
  }
  const L = la.length;
  const alpha = p.opacity * p.threadPx;
  const dl = new Float32Array(L);
  for (let i = 0; i < L; i++) dl[i] = -Math.log1p(-Math.min(0.999, Math.max(1e-4, alpha * c.wf[la[i]][ls[i]])));

  const tq = new Float32Array(3 * N);
  for (let i = 0; i < 3 * N; i++) tq[i] = Math.sqrt(Math.max(0, targetLin[i]));
  const tot = new Float32Array(N), mR = new Float32Array(N), mG = new Float32Array(N), mB = new Float32Array(N);
  const err = new Float32Array(N);
  const [bR, bG, bB] = bgLin;
  const pixErr = (i: number, t: number, r: number, g: number, b: number) => {
    const C = 1 - Math.exp(-t);
    const inv = t > 1e-9 ? C / t : 0;
    const pr = (1 - C) * bR + inv * r, pg = (1 - C) * bG + inv * g, pb = (1 - C) * bB + inv * b;
    const er = Math.sqrt(pr) - tq[3 * i], eg = Math.sqrt(pg) - tq[3 * i + 1], eb = Math.sqrt(pb) - tq[3 * i + 2];
    return w[i] * (er * er + eg * eg + eb * eb);
  };
  let E0 = 0;
  for (let i = 0; i < N; i++) { if (w[i] > 0) { err[i] = pixErr(i, 0, 0, 0, 0); E0 += err[i]; } }

  const gain = (k: number, l: number) => {
    const a = la[l], s = ls[l], off = c.offsets[a], px = c.pix[a], d = dl[l];
    const col = colorsLin[k], dr = d * col[0], dg = d * col[1], db = d * col[2];
    let g = 0;
    for (let q = off[s], e = off[s + 1]; q < e; q++) {
      const i = px[q];
      if (w[i] <= 0) continue;
      g += err[i] - pixErr(i, tot[i] + d, mR[i] + dr, mG[i] + dg, mB[i] + db);
    }
    return g;
  };
  const apply = (k: number, l: number) => {
    const a = la[l], s = ls[l], off = c.offsets[a], px = c.pix[a], d = dl[l];
    const col = colorsLin[k];
    for (let q = off[s], e = off[s + 1]; q < e; q++) {
      const i = px[q];
      tot[i] += d; mR[i] += d * col[0]; mG[i] += d * col[1]; mB[i] += d * col[2];
      if (w[i] > 0) err[i] = pixErr(i, tot[i], mR[i], mG[i], mB[i]);
    }
  };

  const used = new Uint8Array(K * L);
  const heap = new MaxHeap(K * L);
  const rebuild = () => {
    heap.n = 0;
    for (let k = 0; k < K; k++) for (let l = 0; l < L; l++) {
      if (used[k * L + l]) continue;
      const g = gain(k, l);
      if (g > 0) heap.push(g, k * L + l);
    }
  };
  rebuild();
  const firstGain = Math.max(heap.peek(), 1e-12);
  const eps = firstGain * 1e-4;
  const edges: [number, number][][] = colorsLin.map(() => []);
  let count = 0, E = E0, stop = "max_lines", sinceRefresh = 0, last = Date.now();
  while (count < p.maxLines) {
    if (heap.n === 0) {
      if (sinceRefresh > 0) { rebuild(); sinceRefresh = 0; if (heap.n) continue; }
      stop = "no_improving_line"; break;
    }
    const [, id] = heap.pop();
    if (used[id]) continue;
    const k = Math.floor(id / L), l = id - k * L;
    const g = gain(k, l);
    if (g <= eps) {
      if (heap.peek() <= eps) {
        if (sinceRefresh > 0) { rebuild(); sinceRefresh = 0; continue; }
        stop = "no_improving_line"; break;
      }
      continue;                                   // stale entry that is no longer useful
    }
    if (g < heap.peek()) { heap.push(g, id); continue; }   // lazy: re-queue with its true gain
    apply(k, l);
    used[id] = 1;
    edges[k].push([la[l], lb[l]]);
    count++; sinceRefresh++; E -= g;
    if (sinceRefresh >= p.refreshEvery) { rebuild(); sinceRefresh = 0; }
    if (onProgress && Date.now() - last > 150) { last = Date.now(); onProgress(count, edges, E0 > 0 ? 1 - E / E0 : 0); }
  }
  let Ef = 0;
  for (let i = 0; i < N; i++) Ef += err[i];
  return { edges, errorReduction: E0 > 0 ? 1 - Ef / E0 : 0, stopReason: stop };
}
