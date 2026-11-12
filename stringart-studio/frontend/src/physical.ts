// Physically based preview (same light-mixing model as the optimiser; see backend render.py).
//   per pass coverage c = opacity * thread_width_px * slope_factor,   density A = sum -ln(1 - c)
//   C = 1 - exp(-sum A),  mix = sum A_k c_k / sum A,  pixel = (1 - C) bg + C mix   (linear RGB)
// Canvas line drawing blends in sRGB and lets the last colour cover the others, which made dense
// artworks look far darker and dirtier than the computed result.

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLin = (h: string) => [1, 3, 5].map((i) => s2l(parseInt(h.slice(i, i + 2), 16) / 255));
const L2S = (() => {
  const t = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i++) { const c = i / 4095; t[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }
  return t;
})();

export type PhysParams = {
  nails: { x_mm: number; y_mm: number }[]; width_mm: number; height_mm: number; shape: string;
  background: string; colors: string[]; thread_mm: number; opacity: number;
};

export class PhysicalBitmap {
  readonly R: number; readonly scale: number;        // px per mm
  drawn = 0;
  readonly canvas: HTMLCanvasElement;
  private tot: Float32Array; private mr: Float32Array; private mg: Float32Array; private mb: Float32Array;
  private inside: Uint8Array; private img: ImageData;
  private cols: number[][]; private bg: number[]; private alpha: number;

  constructor(private p: PhysParams, R: number) {
    this.R = R = Math.max(16, Math.round(R));
    const N = R * R;
    this.tot = new Float32Array(N); this.mr = new Float32Array(N); this.mg = new Float32Array(N); this.mb = new Float32Array(N);
    this.scale = (R / Math.max(p.width_mm, p.height_mm)) * 0.98;
    this.alpha = p.opacity * p.thread_mm * this.scale;
    this.cols = p.colors.map(hexLin);
    this.bg = hexLin(p.background);
    this.inside = new Uint8Array(N);
    const o = R / 2, rad = (p.width_mm / 2) * this.scale, hw = (p.width_mm / 2) * this.scale, hh = (p.height_mm / 2) * this.scale;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const dx = x + 0.5 - o, dy = y + 0.5 - o;
      this.inside[y * R + x] = p.shape === "circle" ? (dx * dx + dy * dy <= rad * rad ? 1 : 0) : (Math.abs(dx) <= hw && Math.abs(dy) <= hh ? 1 : 0);
    }
    this.img = new ImageData(R, R);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = R;
  }

  /** Accumulate steps [drawn, upto); steps are [layer, fromNail0, toNail0] with from < 0 = no line. */
  advance(steps: [number, number, number][], upto: number, hidden?: Set<number>) {
    const { R, scale: s } = this, o = R / 2, nails = this.p.nails;
    for (let k = this.drawn; k < upto; k++) {
      const [L, a, b] = steps[k];
      if (a < 0 || hidden?.has(L)) continue;
      const x0 = o + nails[a].x_mm * s, y0 = o + nails[a].y_mm * s;
      const dx = o + nails[b].x_mm * s - x0, dy = o + nails[b].y_mm * s - y0;
      const major = Math.max(Math.abs(dx), Math.abs(dy)), n = Math.max(1, Math.ceil(major));
      const wf = major > 0 ? Math.hypot(dx, dy) / major : 1;
      const d = -Math.log1p(-Math.min(0.999, Math.max(1e-5, this.alpha * wf)));
      const col = this.cols[L] ?? [1, 1, 1], cr = d * col[0], cg = d * col[1], cb = d * col[2];
      let prev = -1;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
        if (x < 0 || y < 0 || x >= R || y >= R) continue;
        const idx = y * R + x;
        if (idx === prev) continue;
        prev = idx;
        this.tot[idx] += d; this.mr[idx] += cr; this.mg[idx] += cg; this.mb[idx] += cb;
      }
    }
    this.drawn = Math.max(this.drawn, upto);
  }

  /** Composite into this.canvas (outside the board stays transparent). */
  render(): HTMLCanvasElement {
    const { tot, mr, mg, mb, inside, bg } = this, px = this.img.data;
    for (let i = 0; i < tot.length; i++) {
      const j = 4 * i;
      if (!inside[i]) { px[j + 3] = 0; continue; }
      const t = tot[i];
      let r = bg[0], g = bg[1], b = bg[2];
      if (t > 1e-7) { const C = 1 - Math.exp(-t), k = C / t; r = (1 - C) * r + k * mr[i]; g = (1 - C) * g + k * mg[i]; b = (1 - C) * b + k * mb[i]; }
      px[j] = L2S[Math.min(4095, (r * 4095) | 0)]; px[j + 1] = L2S[Math.min(4095, (g * 4095) | 0)]; px[j + 2] = L2S[Math.min(4095, (b * 4095) | 0)];
      px[j + 3] = 255;
    }
    this.canvas.getContext("2d")!.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}
