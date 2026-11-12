// Background removal for plain backgrounds (sky, wall, studio backdrop) without ML models.
//
// 1. Convert to CIE Lab.
// 2. Sample the ring just inside the board edge; its median colour is the background reference.
// 3. Region-grow from the ring pixels that match the reference: a pixel joins if it stays close to
//    the reference (global tolerance) AND to its already-accepted neighbour (local smoothness),
//    so gradients like a sky are followed but the growth stops at skin, hair or clothing edges.
// 4. Feather the mask edge.
// Returns background probability per pixel (1 = background) and the fraction of the board removed.
import { s2l } from "./imageproc";

function toLab(r: number, g: number, b: number): [number, number, number] {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function backgroundMask(rgba: Uint8ClampedArray, res: number, mask: Uint8Array, tolerance = 20): { bg: Float32Array; fraction: number } {
  const N = res * res;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const [l, a, b] = toLab(rgba[4 * i] / 255, rgba[4 * i + 1] / 255, rgba[4 * i + 2] / 255);
    L[i] = l; A[i] = a; B[i] = b;
  }
  // rim: board pixels within ~6 % of the radius from the edge
  const c = res / 2, rMax = res / 2;
  const rim: number[] = [];
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const i = y * res + x;
    if (!mask[i]) continue;
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    const sq = Math.max(Math.abs(x + 0.5 - c), Math.abs(y + 0.5 - c));
    if (d > rMax * 0.86 || sq > rMax * 0.9) rim.push(i);
  }
  const bgOut = new Float32Array(N);
  if (rim.length < 20) return { bg: bgOut, fraction: 0 };
  const med = (arr: Float32Array) => { const v = rim.map((i) => arr[i]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
  const ref = [med(L), med(A), med(B)];
  const dRef = (i: number) => Math.hypot(L[i] - ref[0], A[i] - ref[1], B[i] - ref[2]);
  const dNb = (i: number, j: number) => Math.hypot(L[i] - L[j], A[i] - A[j], B[i] - B[j]);
  const inBg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  let seeds = 0;
  for (const i of rim) if (dRef(i) < tolerance * 1.2) { inBg[i] = 1; queue[qt++] = i; seeds++; }
  if (seeds < rim.length * 0.25) return { bg: bgOut, fraction: 0 };   // no uniform background around the subject
  const globalTol = tolerance * 1.8, localTol = tolerance * 0.45;
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % res, y = (i - x) / res;
    const nb = [x > 0 ? i - 1 : -1, x < res - 1 ? i + 1 : -1, y > 0 ? i - res : -1, y < res - 1 ? i + res : -1];
    for (const j of nb) {
      if (j < 0 || inBg[j] || !mask[j]) continue;
      if (dRef(j) < globalTol && dNb(i, j) < localTol) { inBg[j] = 1; queue[qt++] = j; }
    }
  }
  // close small holes inside the background (noise), then feather the edge
  let count = 0, total = 0;
  const tmp = new Float32Array(N);
  const rad = Math.max(1, Math.round(res / 160));
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    let s = 0, n = 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= res || yy >= res) continue;
      s += inBg[yy * res + xx]; n++;
    }
    tmp[y * res + x] = s / n;
  }
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    bgOut[i] = Math.min(1, Math.max(0, (tmp[i] - 0.15) / 0.7));
    total++; count += bgOut[i];
  }
  return { bg: bgOut, fraction: total ? count / total : 0 };
}
