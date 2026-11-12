// Partitive colour unmixing into real thread colours (port of desktop color.py).
// pixel = bg + sum_k a_k (c_k - bg), a_k >= 0, sum a_k <= Cmax  -> per-pixel projected gradient (FISTA).
import { hexRgb, s2l } from "./imageproc";

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
