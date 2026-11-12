// Partitive colour unmixing into real thread colours (port of desktop color.py).
// pixel = bg + sum_k a_k (c_k - bg), a_k >= 0, sum a_k <= Cmax  -> per-pixel projected gradient (FISTA).
import { hexRgb, luminance, s2l } from "./imageproc";

function unmixPixel(y: number[], M: number[][], MtM: number[][], step: number, cmax: number, K: number, iters: number): number[] {
  const Mty = new Array(K).fill(0);
  for (let k = 0; k < K; k++) for (let c = 0; c < 3; c++) Mty[k] += M[c][k] * y[c];
  let a = new Array(K).fill(0), z = a.slice(), t = 1;
  for (let it = 0; it < iters; it++) {
    const an = new Array(K);
    let s = 0;
    for (let k = 0; k < K; k++) {
      let g = -Mty[k];
      for (let j = 0; j < K; j++) g += MtM[k][j] * z[j];
      an[k] = Math.max(0, z[k] - step * g);
      s += an[k];
    }
    if (s > cmax) for (let k = 0; k < K; k++) an[k] *= cmax / s;
    const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    for (let k = 0; k < K; k++) z[k] = an[k] + ((t - 1) / tn) * (an[k] - a[k]);
    a = an; t = tn;
  }
  return a;
}

function setup(cols: number[][], bg: number[]) {
  const K = cols.length;
  const M = [0, 1, 2].map((c) => cols.map((col) => col[c] - bg[c]));
  const MtM = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => M[0][i] * M[0][j] + M[1][i] * M[1][j] + M[2][i] * M[2][j] + (i === j ? 1e-4 : 0)));
  // Gershgorin bound on the largest eigenvalue -> safe step
  let L = 0;
  for (let i = 0; i < K; i++) L = Math.max(L, MtM[i].reduce((s, v) => s + Math.abs(v), 0));
  return { M, MtM, step: 1 / L };
}

/** Returns per-colour target densities for the masked pixels. */
export function decompose(color: Float32Array, palette: string[], bgHex: string, cmax: number, physics: number, mask: Uint8Array): Float32Array[] {
  const N = mask.length, K = palette.length;
  const colsS = palette.map((h) => hexRgb(h) as number[]);
  const bgS = hexRgb(bgHex) as number[];
  const colsL = colsS.map((c) => c.map(s2l));
  const bgL = bgS.map(s2l);
  const lin = setup(colsL, bgL), per = setup(colsS, bgS);
  const out = palette.map(() => new Float32Array(N));
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    const pS = [color[3 * i], color[3 * i + 1], color[3 * i + 2]];
    const pL = pS.map(s2l);
    const aL = unmixPixel(pL.map((v, c) => v - bgL[c]), lin.M, lin.MtM, lin.step, cmax, K, 120);
    const aP = unmixPixel(pS.map((v, c) => v - bgS[c]), per.M, per.MtM, per.step, cmax, K, 120);
    let C = 0;
    const a = aL.map((v, k) => physics * v + (1 - physics) * aP[k]);
    for (const v of a) C += v;
    C = Math.min(C, cmax);
    if (C <= 1e-6) continue;
    const totalA = -Math.log1p(-C);
    for (let k = 0; k < K; k++) out[k][i] = (a[k] / C) * totalA;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Thread catalogue (common embroidery / string-art thread shades) and automatic palette choice.
export const THREAD_CATALOG: [string, string][] = [
  ["Black", "#111111"], ["Charcoal", "#3b3b3b"], ["Grey", "#8a8a8a"], ["White", "#f4f4f0"],
  ["Dark brown", "#3e2418"], ["Brown", "#6e4026"], ["Chestnut", "#8e5634"], ["Tan", "#b9875c"],
  ["Caramel", "#c98f5a"], ["Skin medium", "#d29a77"], ["Skin light", "#eab99b"], ["Peach", "#f4cbb0"],
  ["Cream", "#efe2c4"], ["Dark red", "#7a1420"], ["Red", "#c41e26"], ["Coral", "#e26d5a"],
  ["Orange", "#e2711d"], ["Ochre", "#c9952b"], ["Yellow", "#f2cf1d"], ["Olive", "#66652a"],
  ["Dark green", "#1d5c33"], ["Green", "#3d9a4f"], ["Teal", "#127f86"], ["Sky blue", "#7fb2e5"],
  ["Blue", "#2a5bd6"], ["Navy", "#1f2f5c"], ["Purple", "#5f3d8a"], ["Pink", "#e48aa8"],
  ["Magenta", "#c62a7a"], ["Cyan", "#14a3d6"],
];

/**
 * Pick k thread colours from the catalogue that best reproduce the photo on the given board:
 * greedy forward selection, each step adding the colour whose inclusion most reduces the
 * partitive-mixing reconstruction error (sqrt-linear RGB, importance weighted) on a pixel sample.
 */
function labLin(lin: number[]): [number, number, number] {
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047);
  const y = f(0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2]);
  const z = f((0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2]) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function autoPalette(color: Float32Array, mask: Uint8Array, weight: Float32Array, bgHex: string, k: number,
  cmax = 0.95): [string, string][] {
  const idx: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const step = Math.max(1, Math.floor(idx.length / 1200));
  const sample = idx.filter((_, j) => j % step === 0);
  const bgL = (hexRgb(bgHex) as number[]).map(s2l);
  const targets = sample.map((i) => [color[3 * i], color[3 * i + 1], color[3 * i + 2]].map(s2l));
  const wts = sample.map((i) => 0.5 + 0.5 * Math.min(2, weight[i]));
  const tLab = targets.map(labLin);
  const chosen: number[] = [];
  const err = (pal: number[]) => {
    const cols = pal.map((ci) => (hexRgb(THREAD_CATALOG[ci][1]) as number[]).map(s2l));
    const { M, MtM, step: st } = setup(cols, bgL);
    let e = 0;
    for (let j = 0; j < targets.length; j++) {
      const t = targets[j];
      const a = unmixPixel(t.map((v, c) => v - bgL[c]), M, MtM, st, cmax, cols.length, 60);
      const pr = [0, 1, 2].map((c) => { let p = bgL[c]; for (let q = 0; q < a.length; q++) p += a[q] * (cols[q][c] - bgL[c]); return Math.max(0, p); });
      const l1 = labLin(pr), l2 = tLab[j];
      e += wts[j] * Math.hypot(l1[0] - l2[0], l1[1] - l2[1], l1[2] - l2[2]);   // perceptual (CIE76) error
    }
    return e;
  };
  const bgLum = luminance(hexRgb(bgHex));
  for (let round = 0; round < k; round++) {
    let best = Infinity, bi = -1;
    THREAD_CATALOG.forEach(([, hex], ci) => {
      if (chosen.includes(ci)) return;
      if (Math.abs(luminance(hexRgb(hex)) - bgLum) < 0.03) return;      // invisible on this board
      const e = err([...chosen, ci]);
      if (e < best) { best = e; bi = ci; }
    });
    if (bi < 0) break;
    chosen.push(bi);
  }
  return chosen.map((ci) => THREAD_CATALOG[ci]);
}
