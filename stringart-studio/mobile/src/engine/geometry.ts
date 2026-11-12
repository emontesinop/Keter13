// Nail geometry - same conventions as the desktop engine:
// millimetres, origin at board centre, +y down, angle 0 = 12 o'clock, clockwise positive.
import type { Settings } from "./types";

export type Geometry = { n: number; xy: Float64Array; sides: Int32Array; widthMm: number; heightMm: number };

export function boardGeometry(b: Settings["board"]): Geometry {
  const n = Math.round(b.nails);
  const xy = new Float64Array(2 * n);
  const sides = new Int32Array(n);
  const dir = b.numbering === "clockwise" ? 1 : -1;
  if (b.shape === "circle") {
    const r = b.diameter / 2 - b.margin;
    for (let k = 0; k < n; k++) {
      const th = ((b.startAngle + dir * k * 360 / n) * Math.PI) / 180;
      xy[2 * k] = r * Math.sin(th);
      xy[2 * k + 1] = -r * Math.cos(th);
    }
  } else {
    const w = b.diameter - 2 * b.margin, h = w, hw = w / 2, hh = h / 2, per = 2 * (w + h);
    const shift = (((b.startAngle % 360) + 360) % 360) / 360 * per;
    for (let k = 0; k < n; k++) {
      const d = (((shift + dir * k * per / n) % per) + per) % per;
      let x: number, y: number, s: number;
      if (d < hw) { x = d; y = -hh; s = 1; }
      else if (d < hw + h) { x = hw; y = -hh + (d - hw); s = 2; }
      else if (d < hw + h + w) { x = hw - (d - hw - h); y = hh; s = 4; }
      else if (d < hw + 2 * h + w) { x = -hw; y = hh - (d - hw - h - w); s = 8; }
      else { x = -hw + (d - hw - 2 * h - w); y = -hh; s = 1; }
      if (Math.abs(Math.abs(x) - hw) < 1e-9 && Math.abs(Math.abs(y) - hh) < 1e-9) s = (y < 0 ? 1 : 4) | (x > 0 ? 2 : 8);
      xy[2 * k] = x; xy[2 * k + 1] = y; sides[k] = s;
    }
  }
  return { n, xy, sides, widthMm: b.diameter, heightMm: b.diameter };
}

export function nailSpacingMm(g: Geometry): number {
  let s = 0;
  for (let i = 0; i < g.n; i++) {
    const j = (i + 1) % g.n;
    s += Math.hypot(g.xy[2 * i] - g.xy[2 * j], g.xy[2 * i + 1] - g.xy[2 * j + 1]);
  }
  return s / g.n;
}

/** Nail positions in pixels for a square raster of `res` px spanning the board. */
export function nailsPx(g: Geometry, res: number): Float64Array {
  const s = res / g.widthMm;
  const out = new Float64Array(2 * g.n);
  for (let i = 0; i < g.n; i++) {
    out[2 * i] = Math.min(res - 1, Math.max(0, (g.xy[2 * i] + g.widthMm / 2) * s));
    out[2 * i + 1] = Math.min(res - 1, Math.max(0, (g.xy[2 * i + 1] + g.heightMm / 2) * s));
  }
  return out;
}

export function boardMask(b: Settings["board"], res: number): Uint8Array {
  const m = new Uint8Array(res * res);
  const s = res / b.diameter;
  if (b.shape === "circle") {
    const r = (b.diameter / 2 - b.margin) * s;
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      const dx = x - res / 2 + 0.5, dy = y - res / 2 + 0.5;
      if (dx * dx + dy * dy <= r * r) m[y * res + x] = 1;
    }
  } else {
    const mm = b.margin * s;
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++)
      if (x >= mm && x < res - mm && y >= mm && y < res - mm) m[y * res + x] = 1;
  }
  return m;
}

/** "Clock" position of a nail, e.g. 7:30, to help find it on the board. */
export function clockPosition(g: Geometry, i: number): string {
  const ang = ((Math.atan2(g.xy[2 * i], -g.xy[2 * i + 1]) * 180) / Math.PI + 360) % 360;
  const totalMin = Math.round((ang / 360) * 12 * 60);
  let h = Math.floor(totalMin / 60) % 12, m = totalMin % 60;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")}`;
}
