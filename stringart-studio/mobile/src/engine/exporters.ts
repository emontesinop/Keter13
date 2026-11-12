// Export helpers: CSV / JSON / SVG template / PNG, shared via the iOS share sheet when possible.
import { boardGeometry } from "./geometry";
import { buildSteps, layerSections, Result } from "./types";

export function sequenceCSV(r: Result): string {
  const rows = ["Step,From nail,To nail,Thread color,Color hex,Distance (mm),Section,Action"];
  for (const s of buildSteps(r)) rows.push(`${s.step},${s.from},${s.to},${s.colorName},${s.color},${s.distMm.toFixed(2)},${s.section},${s.kind === "rim" ? "around the outside of the board (no line)" : "line"}`);
  return "﻿" + rows.join("\n") + "\n";
}

export function nailsCSV(r: Result): string {
  const rows = ["Nail,X from centre (mm),Y from centre (mm; down),Angle (deg; clockwise from 12 o'clock)"];
  for (let i = 0; i < r.nailsMm.length / 2; i++) {
    const x = r.nailsMm[2 * i], y = r.nailsMm[2 * i + 1];
    const a = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    rows.push(`${i + 1},${x.toFixed(3)},${y.toFixed(3)},${a.toFixed(4)}`);
  }
  return "﻿" + rows.join("\n") + "\n";
}

/** Desktop-compatible sequence JSON (format stringart-studio/sequence). */
export function sequenceJSON(r: Result): string {
  return JSON.stringify({
    format: "stringart-studio/sequence", version: 1, units: "mm", source: "mobile",
    board: { shape: r.board.shape, width_mm: r.widthMm, height_mm: r.heightMm, nail_count: r.nailsMm.length / 2, numbering: r.board.numbering },
    background: r.background, thread_mm: r.thicknessMm, opacity: r.opacity, board_settings: r.board,
    nails: Array.from({ length: r.nailsMm.length / 2 }, (_, i) => ({ number: i + 1, x_mm: r.nailsMm[2 * i], y_mm: r.nailsMm[2 * i + 1] })),
    layers: r.layers.map((L) => ({ name: L.name, color: L.color, sections: layerSections(L).map((sec) => sec.map((v) => v + 1)) })),
    steps: buildSteps(r).map((s) => ({ step: s.step, kind: s.kind, layer: s.layer, color_name: s.colorName, color: s.color, section: s.section, from: s.from, to: s.to, distance_mm: +s.distMm.toFixed(2) })),
    stats: r.stats,
  });
}

/** Import a sequence JSON exported by this app or by the desktop StringArt Studio. */
export function importSequenceJSON(text: string): Result {
  const j = JSON.parse(text);
  if (j.format !== "stringart-studio/sequence") throw new Error("Not a StringArt Studio sequence file.");
  const nailsMm: number[] = [];
  for (const n of j.nails) nailsMm.push(n.x_mm, n.y_mm);
  const layers: Result["layers"] = [];
  for (const L of j.layers) {
    const secs: number[][] = L.sections.map((sec: number[]) => sec.map((v: number) => v - 1)).filter((x: number[]) => x.length > 1);
    if (secs.length) layers.push({ name: L.name, color: L.color, path: secs[0], sections: secs, stopReason: "imported", errorReduction: 0 });
  }
  const conns = layers.reduce((a, L) => a + layerSections(L).reduce((b, x) => b + x.length - 1, 0), 0);
  const n = nailsMm.length / 2;
  const w = j.board?.width_mm ?? 300;
  return {
    version: 1, created: Date.now(),
    board: j.board_settings ?? { shape: j.board?.shape === "circle" ? "circle" : "square", diameter: w, nails: n, margin: 0, nailDiameter: 1.6, numbering: j.board?.numbering ?? "clockwise", startAngle: 0 },
    nailsMm, widthMm: w, heightMm: j.board?.height_mm ?? w, background: j.background ?? "#0b0b0c",
    thicknessMm: j.thread_mm ?? 0.15, opacity: j.opacity ?? 0.85, layers,
    stats: { connections: conns, sections: layers.length, threadM: j.materials?.total_thread_m ?? 0, buildHours: (conns * 7) / 3600,
      seconds: 0, errorReduction: 0, candidates: 0, validated: true, duplicates: 0 },
  };
}

export function templateSVG(r: Result, marginMm = 15): string {
  const b = r.board, g = boardGeometry(b);
  const W = r.widthMm + 2 * marginMm, H = r.heightMm + 2 * marginMm, ox = W / 2, oy = H / 2;
  const rr = b.nailDiameter / 2;
  let spacing = 0;
  for (let i = 0; i < g.n; i++) { const j = (i + 1) % g.n; spacing += Math.hypot(g.xy[2 * i] - g.xy[2 * j], g.xy[2 * i + 1] - g.xy[2 * j + 1]); }
  const fs = Math.min(4, Math.max(1.2, (spacing / g.n) * 0.55));
  const p: string[] = [`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="white"/>`];
  p.push(b.shape === "circle"
    ? `<circle cx="${ox}" cy="${oy}" r="${r.widthMm / 2}" fill="none" stroke="#000" stroke-width="0.3"/>`
    : `<rect x="${marginMm}" y="${marginMm}" width="${r.widthMm}" height="${r.heightMm}" fill="none" stroke="#000" stroke-width="0.3"/>`);
  p.push(`<g stroke="#000" stroke-width="0.2"><line x1="${ox - 10}" y1="${oy}" x2="${ox + 10}" y2="${oy}"/><line x1="${ox}" y1="${oy - 10}" x2="${ox}" y2="${oy + 10}"/><circle cx="${ox}" cy="${oy}" r="3" fill="none"/></g>`);
  const cy = H - marginMm / 2;
  p.push(`<g stroke="#000" stroke-width="0.3"><line x1="${marginMm}" y1="${cy}" x2="${marginMm + 100}" y2="${cy}"/>`);
  for (let k = 0; k <= 100; k += 10) p.push(`<line x1="${marginMm + k}" y1="${cy - (k % 50 ? 2 : 3.5)}" x2="${marginMm + k}" y2="${cy}"/>`);
  p.push(`</g><text x="${marginMm + 102}" y="${cy}" font-size="3">100 mm - check after printing at 100 %</text>`);
  for (let i = 0; i < g.n; i++) {
    const x = g.xy[2 * i], y = g.xy[2 * i + 1], X = x + ox, Y = y + oy;
    p.push(`<circle cx="${X.toFixed(3)}" cy="${Y.toFixed(3)}" r="${rr}" fill="none" stroke="#000" stroke-width="0.12"/>`);
    const nn = Math.hypot(x, y) || 1;
    const tx = X - (x / nn) * (rr + fs * 1.6), ty = Y - (y / nn) * (rr + fs * 1.6);
    let ang = (Math.atan2(y, x) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    p.push(`<text x="${tx.toFixed(3)}" y="${ty.toFixed(3)}" font-size="${fs.toFixed(2)}" text-anchor="middle" dominant-baseline="central" transform="rotate(${ang.toFixed(2)} ${tx.toFixed(3)} ${ty.toFixed(3)})">${i + 1}</text>`);
  }
  p.push(`<text x="${marginMm}" y="${marginMm * 0.6}" font-size="3.5">StringArt Studio nail template - ${b.shape} ${r.widthMm} mm, ${g.n} nails (${b.numbering}) - print at 100 % scale</text></svg>`);
  return p.join("\n");
}

/** Draw the artwork (physically scaled thread) onto a canvas. */
export function drawArt(ctx: CanvasRenderingContext2D, r: Result, size: number, upto = Infinity, hidden?: Set<number>) {
  const s = (size / r.widthMm) * 0.98, o = size / 2;
  ctx.save();
  ctx.fillStyle = r.background;
  ctx.beginPath();
  if (r.board.shape === "circle") ctx.arc(o, o, (r.widthMm / 2) * s, 0, Math.PI * 2);
  else ctx.rect(o - (r.widthMm / 2) * s, o - (r.heightMm / 2) * s, r.widthMm * s, r.heightMm * s);
  ctx.fill();
  const wpx = r.thicknessMm * s;
  ctx.lineWidth = Math.max(1, wpx);
  const baseAlpha = Math.min(1, wpx >= 1 ? r.opacity : r.opacity * wpx);
  ctx.lineCap = "round";
  const steps = buildSteps(r);
  for (let k = 0; k < steps.length && k < upto; k++) {
    const st = steps[k];
    if (st.kind !== "line" || hidden?.has(st.layer)) continue;
    const a = st.from - 1, b = st.to - 1;
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = canvasAlpha(baseAlpha, st.color, r.background);
    ctx.beginPath();
    ctx.moveTo(o + r.nailsMm[2 * a] * s, o + r.nailsMm[2 * a + 1] * s);
    ctx.lineTo(o + r.nailsMm[2 * b] * s, o + r.nailsMm[2 * b + 1] * s);
    ctx.stroke();
  }
  ctx.restore();
}

export async function artworkPNG(r: Result, size = 2048): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#111214";
  ctx.fillRect(0, 0, size, size);
  drawArt(ctx, r, size);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

/** Share through the iOS share sheet (Save to Files, AirDrop, Mail...) or fall back to a download. */
export async function shareFile(data: Blob | string, filename: string, mime: string) {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Canvas blends in sRGB, real light mixes linearly. For thread darker than the board, drawing each
 *  line with alpha 1-(1-a)^(1/2.2) makes n overlapping lines match the linear physical model exactly
 *  (sRGB value of (1-a)^n). Lighter threads keep the plain alpha. */
export function canvasAlpha(a: number, threadHex: string, boardHex: string): number {
  const lum = (h: string) => { const v = h.replace("#", ""); return [0, 2, 4].reduce((s, i, k) => s + parseInt(v.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][k], 0); };
  a = Math.min(0.999, Math.max(0, a));
  return lum(threadHex) < lum(boardHex) ? 1 - Math.pow(1 - a, 1 / 2.2) : a;
}
