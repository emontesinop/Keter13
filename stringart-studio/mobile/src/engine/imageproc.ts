// Image processing on a framed square RGBA raster (port of the desktop imaging module).
import type { Settings } from "./types";

export const s2l = (c: number) => { c = Math.min(1, Math.max(0, c)); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const l2s = (c: number) => { c = Math.min(1, Math.max(0, c)); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };

export function hexRgb(h: string): [number, number, number] {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}
export const luminance = (rgb: [number, number, number]) => 0.2126 * s2l(rgb[0]) + 0.7152 * s2l(rgb[1]) + 0.0722 * s2l(rgb[2]);

/** Approximate Gaussian blur: three separable box passes (in place copy). */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {          // horizontal
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {          // vertical
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

function percentile(vals: Float32Array, mask: Uint8Array, q: number[]): number[] {
  const arr: number[] = [];
  for (let i = 0; i < vals.length; i++) if (mask[i]) arr.push(vals[i]);
  arr.sort((x, y) => x - y);
  return q.map((p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
}

export type Processed = {
  res: number;
  tone: Float32Array;       // 1 = white
  color: Float32Array;      // processed RGB (interleaved), sRGB 0..1
  importance: Float32Array; // mean 1 inside board
  edges: Float32Array;
  mask: Uint8Array;
};

export function processImage(rgba: Uint8ClampedArray, res: number, t: Settings["tone"], mask: Uint8Array): Processed {
  const N = res * res;
  let gray = new Float32Array(N);
  let color = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    const r = rgba[4 * i] / 255, g = rgba[4 * i + 1] / 255, b = rgba[4 * i + 2] / 255;
    color[3 * i] = r; color[3 * i + 1] = g; color[3 * i + 2] = b;
    gray[i] = l2s(0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b));
  }
  if (t.autoLevels) {
    const [lo, hi] = percentile(gray, mask, [1, 99]);
    if (hi - lo > 0.05) {
      for (let i = 0; i < N; i++) gray[i] = Math.min(1, Math.max(0, (gray[i] - lo) / (hi - lo)));
      for (let i = 0; i < 3 * N; i++) color[i] = Math.min(1, Math.max(0, (color[i] - lo) / (hi - lo)));
    }
  }
  if (t.localContrast > 0) {                     // large-radius unsharp mask = local contrast
    const bl = blur(gray, res, res, res / 16);
    for (let i = 0; i < N; i++) {
      const ng = Math.min(1, Math.max(0, gray[i] + t.localContrast * (gray[i] - bl[i])));
      const ratio = (ng + 0.02) / (gray[i] + 0.02);
      gray[i] = ng;
      for (let c = 0; c < 3; c++) color[3 * i + c] = Math.min(1, color[3 * i + c] * ratio);
    }
  }
  const tone = (v: number) => {
    if (t.exposure) v = l2s(s2l(v) * Math.pow(2, t.exposure));
    v = (v - 0.5) * t.contrast + 0.5 + t.brightness * 0.5;
    v = Math.min(1, Math.max(0, v));
    if (t.gamma !== 1) v = Math.pow(v, 1 / t.gamma);
    return v;
  };
  for (let i = 0; i < N; i++) gray[i] = tone(gray[i]);
  for (let i = 0; i < 3 * N; i++) color[i] = tone(color[i]);
  if (t.sharpness > 0) {
    const bl = blur(gray, res, res, Math.max(0.6, res / 400));
    for (let i = 0; i < N; i++) gray[i] = Math.min(1, Math.max(0, gray[i] + t.sharpness * (gray[i] - bl[i])));
  }
  if (t.invert) {
    for (let i = 0; i < N; i++) gray[i] = 1 - gray[i];
    for (let i = 0; i < 3 * N; i++) color[i] = 1 - color[i];
  }
  // edges: Sobel on a lightly blurred copy, normalised by the 98th percentile
  const gb = blur(gray, res, res, Math.max(0.6, res / 300));
  const edges = new Float32Array(N);
  for (let y = 1; y < res - 1; y++) for (let x = 1; x < res - 1; x++) {
    const i = y * res + x;
    const gx = -gb[i - res - 1] - 2 * gb[i - 1] - gb[i + res - 1] + gb[i - res + 1] + 2 * gb[i + 1] + gb[i + res + 1];
    const gy = -gb[i - res - 1] - 2 * gb[i - res] - gb[i - res + 1] + gb[i + res - 1] + 2 * gb[i + res] + gb[i + res + 1];
    edges[i] = Math.hypot(gx, gy);
  }
  const [p98] = percentile(edges, mask, [98]);
  for (let i = 0; i < N; i++) edges[i] = Math.min(1, edges[i] / (p98 + 1e-6));
  const eb = blur(edges, res, res, Math.max(1, res / 250));
  const imp = new Float32Array(N);
  let sum = 0, cnt = 0;
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const i = y * res + x;
    if (!mask[i]) continue;
    const dx = (x - res / 2) / (res / 2), dy = (y - res / 2) / (res / 2);
    const centre = 1 + t.centerFocus * Math.max(0, 1 - Math.hypot(dx, dy) * 1.2);
    imp[i] = (1 + t.edgeEmphasis * eb[i]) * centre;
    sum += imp[i]; cnt++;
  }
  const mean = cnt ? sum / cnt : 1;
  for (let i = 0; i < N; i++) imp[i] /= mean;
  return { res, tone: gray, color, importance: imp, edges, mask };
}

/** Required thread coverage per pixel (see desktop docs: not a naive inversion). */
export function targetCoverage(tone: Float32Array, threadHex: string, bgHex: string, maxCov: number, physics: number, mask: Uint8Array): Float32Array {
  const Lt = luminance(hexRgb(threadHex)), Lb = luminance(hexRgb(bgHex));
  const vt = l2s(Lt), vb = l2s(Lb);
  if (Math.abs(vt - vb) < 0.05) throw new Error("Thread and background are too similar in brightness.");
  const out = new Float32Array(tone.length);
  for (let i = 0; i < tone.length; i++) {
    if (!mask[i]) continue;
    const t = Math.min(1, Math.max(0, (tone[i] - vb) / (vt - vb)));
    const cPhys = (s2l(vb + (vt - vb) * t) - Lb) / (Lt - Lb);
    out[i] = Math.min(maxCov, Math.max(0, physics * cPhys + (1 - physics) * t));
  }
  return out;
}

/** Render the intended appearance (what the optimiser aims for) as RGBA. */
export function intendedRGBA(densities: Float32Array[], colors: string[], bgHex: string, mask: Uint8Array): Uint8ClampedArray {
  const N = mask.length;
  const out = new Uint8ClampedArray(4 * N);
  const bg = hexRgb(bgHex).map(s2l);
  const cols = colors.map((c) => hexRgb(c).map(s2l));
  for (let i = 0; i < N; i++) {
    let tot = 0; const mix = [0, 0, 0];
    densities.forEach((D, k) => { tot += D[i]; for (let c = 0; c < 3; c++) mix[c] += D[i] * cols[k][c]; });
    const C = 1 - Math.exp(-tot);
    for (let c = 0; c < 3; c++) {
      const m = tot > 1e-9 ? mix[c] / tot : 0;
      out[4 * i + c] = Math.round(l2s((1 - C) * bg[c] + C * m) * 255);
    }
    out[4 * i + 3] = mask[i] ? 255 : 0;
  }
  return out;
}
