// Physically based preview: the same light-mixing model the optimiser uses, so what you see on screen
// is what was optimised (no canvas sRGB blending, no "last colour drawn on top" bias).
//   per pass coverage c = opacity * thread_width_px * slope_factor,   density A = sum -ln(1 - c)
//   C = 1 - exp(-sum A),  mix = sum A_k c_k / sum A,  pixel = (1 - C) bg + C mix   (linear RGB)
import { hexRgb, s2l } from "./imageproc";
import { buildSteps, Result, Step } from "./types";

const L2S = (() => {
  const t = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i++) {
    const c = i / 4095;
    t[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  }
  return t;
})();

export class PhysicalCanvas {
  readonly size: number;
  private tot: Float32Array;
  private mr: Float32Array; private mg: Float32Array; private mb: Float32Array;
  private img: ImageData;
  private inside: Uint8Array;
  private s: number; private o: number;
  private cols: number[][]; private bg: number[];
  private alpha: number;
  drawn = 0;                               // number of steps already accumulated

  constructor(private r: Result, size: number, private steps: Step[] = buildSteps(r)) {
    this.size = size = Math.max(16, Math.round(size));
    const N = size * size;
    this.tot = new Float32Array(N); this.mr = new Float32Array(N); this.mg = new Float32Array(N); this.mb = new Float32Array(N);
    this.img = new ImageData(size, size);
    this.s = (size / r.widthMm) * 0.98;
    this.o = size / 2;
    this.alpha = r.opacity * r.thicknessMm * this.s;
    this.bg = hexRgb(r.background).map(s2l);
    this.cols = r.layers.map((L) => hexRgb(L.color).map(s2l));
    this.inside = new Uint8Array(N);
    const rad = (r.widthMm / 2) * this.s, half = (r.widthMm / 2) * this.s;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - this.o, dy = y + 0.5 - this.o;
      this.inside[y * size + x] = r.board.shape === "circle" ? (dx * dx + dy * dy <= rad * rad ? 1 : 0)
        : (Math.abs(dx) <= half && Math.abs(dy) <= half ? 1 : 0);
    }
  }

  /** Accumulate steps [drawn, upto). Returns false if a rebuild is needed (upto < drawn). */
  advance(upto: number, hidden?: Set<number>): boolean {
    upto = Math.min(upto, this.steps.length);
    if (upto < this.drawn) return false;
    const { size, s, o, r } = this;
    for (let k = this.drawn; k < upto; k++) {
      const st = this.steps[k];
      if (st.kind !== "line" || hidden?.has(st.layer)) continue;
      const a = st.from - 1, b = st.to - 1;
      const x0 = o + r.nailsMm[2 * a] * s, y0 = o + r.nailsMm[2 * a + 1] * s;
      const dx = o + r.nailsMm[2 * b] * s - x0, dy = o + r.nailsMm[2 * b + 1] * s - y0;
      const major = Math.max(Math.abs(dx), Math.abs(dy));
      const n = Math.max(1, Math.ceil(major));
      const wf = major > 0 ? Math.hypot(dx, dy) / major : 1;
      const d = -Math.log1p(-Math.min(0.999, Math.max(1e-5, this.alpha * wf)));
      const col = this.cols[st.layer];
      const cr = d * col[0], cg = d * col[1], cb = d * col[2];
      let prev = -1;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const idx = y * size + x;
        if (idx === prev) continue;
        prev = idx;
        this.tot[idx] += d; this.mr[idx] += cr; this.mg[idx] += cg; this.mb[idx] += cb;
      }
    }
    this.drawn = upto;
    return true;
  }

  /** Composite to RGBA (board outside transparent). */
  image(): ImageData {
    const { tot, mr, mg, mb, inside, bg } = this, px = this.img.data;
    for (let i = 0; i < tot.length; i++) {
      const j = 4 * i;
      if (!inside[i]) { px[j + 3] = 0; continue; }
      const t = tot[i];
      let r = bg[0], g = bg[1], b = bg[2];
      if (t > 1e-7) {
        const C = 1 - Math.exp(-t), k = C / t;
        r = (1 - C) * r + k * mr[i]; g = (1 - C) * g + k * mg[i]; b = (1 - C) * b + k * mb[i];
      }
      px[j] = L2S[Math.min(4095, (r * 4095) | 0)];
      px[j + 1] = L2S[Math.min(4095, (g * 4095) | 0)];
      px[j + 2] = L2S[Math.min(4095, (b * 4095) | 0)];
      px[j + 3] = 255;
    }
    return this.img;
  }

  toCanvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = this.size;
    c.getContext("2d")!.putImageData(this.image(), 0, 0);
    return c;
  }
}

/** One-shot physical render of the whole result (or the first `upto` steps). */
export function renderPhysical(r: Result, size: number, upto = Infinity): HTMLCanvasElement {
  const pc = new PhysicalCanvas(r, size);
  pc.advance(Math.min(upto, Number.MAX_SAFE_INTEGER));
  return pc.toCanvas();
}
