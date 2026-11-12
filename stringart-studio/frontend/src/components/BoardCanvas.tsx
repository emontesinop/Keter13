import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type CompactStep = [layer: number, from: number, to: number]; // 0-based nails

type Props = {
  nails: { x_mm: number; y_mm: number }[];
  width_mm: number;
  height_mm: number;
  shape: string;
  background: string;
  colors: string[];
  steps: CompactStep[];
  upto?: number;
  thread_mm: number;
  opacity: number;
  numbers?: "auto" | "all" | "none";
  current?: { from: number; to: number; next?: number | null } | null;
  hiddenLayers?: Set<number>;
  searchNail?: number | null;
  image?: string | null;          // optional background image (for overlays)
  imageOpacity?: number;
};

/** Board renderer: physically scaled thread lines, nails, numbers, zoom & pan. */
export default function BoardCanvas(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drawn = useRef({ upto: 0, key: "" });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const imgEl = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(0);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!p.image) { imgEl.current = null; setImgReady((v) => v + 1); return; }
    const im = new Image();
    im.onload = () => { imgEl.current = im; setImgReady((v) => v + 1); };
    im.src = p.image;
  }, [p.image]);

  const dpr = window.devicePixelRatio || 1;
  // board->device transform
  const tf = useCallback(() => {
    const W = size.w * dpr, Hh = size.h * dpr;
    const fit = Math.min(W / p.width_mm, Hh / p.height_mm) * 0.94;
    const s = fit * view.zoom;
    const ox = W / 2 + view.x * dpr, oy = Hh / 2 + view.y * dpr;
    return { s, ox, oy, W, H: Hh };
  }, [size, dpr, p.width_mm, p.height_mm, view]);

  const pt = (i: number, t: ReturnType<typeof tf>) => [t.ox + p.nails[i].x_mm * t.s, t.oy + p.nails[i].y_mm * t.s];

  // ---- art layer (incremental when only `upto` grows)
  useEffect(() => {
    const c = art.current;
    if (!c) return;
    const t = tf();
    const upto = Math.min(p.upto ?? p.steps.length, p.steps.length);
    const key = [t.W, t.H, t.s, t.ox, t.oy, p.background, p.colors.join(), p.thread_mm, p.opacity,
      p.steps.length, p.steps[0]?.join(), [...(p.hiddenLayers ?? [])].join(), imgReady, p.imageOpacity, p.nails.length].join("|");
    const ctx = c.getContext("2d")!;
    let start = drawn.current.upto;
    if (c.width !== t.W || c.height !== t.H) { c.width = t.W; c.height = t.H; }
    if (key !== drawn.current.key || upto < start) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, t.W, t.H);
      // board surface
      ctx.fillStyle = p.background;
      ctx.beginPath();
      if (p.shape === "circle") ctx.arc(t.ox, t.oy, (p.width_mm / 2) * t.s, 0, Math.PI * 2);
      else ctx.rect(t.ox - (p.width_mm / 2) * t.s, t.oy - (p.height_mm / 2) * t.s, p.width_mm * t.s, p.height_mm * t.s);
      ctx.fill();
      if (imgEl.current && (p.imageOpacity ?? 0) > 0) {
        ctx.save(); ctx.clip(); ctx.globalAlpha = p.imageOpacity!;
        ctx.drawImage(imgEl.current, t.ox - (p.width_mm / 2) * t.s, t.oy - (p.height_mm / 2) * t.s, p.width_mm * t.s, p.height_mm * t.s);
        ctx.restore();
      }
      start = 0;
    }
    // physical thread: coverage per pass = opacity * width_in_px
    const wpx = p.thread_mm * t.s;
    const lw = Math.max(1, wpx);
    const alpha = wpx >= 1 ? p.opacity : p.opacity * wpx;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    const baseAlpha = Math.min(1, alpha);
    let lastLayer = -1;
    for (let k = start; k < upto; k++) {
      const [L, a, b] = p.steps[k];
      if (a < 0 || p.hiddenLayers?.has(L)) continue;     // a < 0: move around the outside (no visible line)
      if (L !== lastLayer) {
        ctx.strokeStyle = p.colors[L] ?? "#fff";
        ctx.globalAlpha = canvasAlpha(baseAlpha, p.colors[L] ?? "#ffffff", p.background);
        lastLayer = L;
      }
      const [x1, y1] = pt(a, t), [x2, y2] = pt(b, t);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawn.current = { upto, key };
  }, [p.steps, p.upto, p.colors, p.background, p.thread_mm, p.opacity, p.hiddenLayers, tf, imgReady, p.imageOpacity]);

  // ---- overlay: nails, numbers, highlights
  useEffect(() => {
    const c = over.current;
    if (!c) return;
    const t = tf();
    if (c.width !== t.W || c.height !== t.H) { c.width = t.W; c.height = t.H; }
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, t.W, t.H);
    const n = p.nails.length;
    const spacingPx = n > 1 ? Math.hypot(p.nails[1].x_mm - p.nails[0].x_mm, p.nails[1].y_mm - p.nails[0].y_mm) * t.s : 10;
    const r = Math.max(1.2 * dpr, Math.min(spacingPx * 0.28, 4 * dpr));
    ctx.fillStyle = "#c9a45c";
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, t);
      if (x < -20 || y < -20 || x > t.W + 20 || y > t.H + 20) continue;
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? r * 1.8 : r, 0, Math.PI * 2); ctx.fill();
    }
    if (p.numbers !== "none") {
      const fontPx = Math.max(9 * dpr, Math.min(13 * dpr, spacingPx * 0.75));
      const needed = fontPx * 1.25;
      let every = p.numbers === "all" ? 1 : Math.max(1, Math.ceil(needed / Math.max(spacingPx, 0.01)));
      if (every > 1) every = [2, 5, 10, 20, 25, 50, 100].find((v) => v >= every) ?? every;
      ctx.font = `${fontPx}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const cx = t.ox, cy = t.oy;
      for (let i = 0; i < n; i++) {
        if (i % every !== 0 && !(p.searchNail === i)) continue;
        const [x, y] = pt(i, t);
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
        const tx = x + (dx / d) * fontPx * 1.3, ty = y + (dy / d) * fontPx * 1.0;
        if (tx < -30 || ty < -30 || tx > t.W + 30 || ty > t.H + 30) continue;
        ctx.fillStyle = i === 0 ? "#f0c060" : "#9aa0a8";
        ctx.fillText(String(i + 1), tx, ty);
      }
    }
    const ring = (i: number, color: string, label?: string) => {
      const [x, y] = pt(i, t);
      ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.stroke();
      if (label) {
        ctx.font = `bold ${12 * dpr}px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = color;
        const dx = x - t.ox, dy = y - t.oy, d = Math.hypot(dx, dy) || 1;
        ctx.fillText(label, x - (dx / d) * 26 * dpr, y - (dy / d) * 18 * dpr);
      }
    };
    if (p.current) {
      const [x1, y1] = pt(p.current.from, t), [x2, y2] = pt(p.current.to, t);
      ctx.strokeStyle = "#ff5a4f"; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ring(p.current.from, "#5ab8ff", String(p.current.from + 1));
      ring(p.current.to, "#ff5a4f", String(p.current.to + 1));
      if (p.current.next != null) ring(p.current.next, "#7be08a", String(p.current.next + 1));
    }
    if (p.searchNail != null && p.searchNail >= 0 && p.searchNail < n) ring(p.searchNail, "#f0c060");
  }, [p.nails, p.numbers, p.current, p.searchNail, tf, dpr]);

  // ---- interaction
  const onWheel = (e: React.WheelEvent) => {
    const rect = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left - size.w / 2, my = e.clientY - rect.top - size.h / 2;
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const zoom = Math.min(40, Math.max(0.5, v.zoom * f));
      const k = zoom / v.zoom;
      return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  };
  return (
    <div className="board-wrap" ref={wrap} onWheel={onWheel}
      onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
      onMouseMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }}
      onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}
      onDoubleClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
      <canvas ref={art} style={{ width: size.w, height: size.h }} />
      <canvas ref={over} style={{ width: size.w, height: size.h }} />
      <div className="zoom-hint">{view.zoom.toFixed(1)}× · scroll to zoom · drag to pan · double-click to reset</div>
    </div>
  );
}

/** Canvas blends in sRGB, real light mixes linearly. For thread darker than the board, drawing each
 *  line with alpha 1-(1-a)^(1/2.2) makes n overlapping lines match the linear physical model exactly
 *  (sRGB value of (1-a)^n). Lighter threads keep the plain alpha. */
export function canvasAlpha(a: number, threadHex: string, boardHex: string): number {
  const lum = (h: string) => { const v = h.replace("#", ""); return [0, 2, 4].reduce((s, i, k) => s + parseInt(v.slice(i, i + 2), 16) * [0.2126, 0.7152, 0.0722][k], 0); };
  a = Math.min(0.999, Math.max(0, a));
  return lum(threadHex) < lum(boardHex) ? 1 - Math.pow(1 - a, 1 / 2.2) : a;
}
