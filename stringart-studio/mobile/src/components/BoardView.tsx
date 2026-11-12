import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildSteps, Result } from "../engine/types";
import { canvasAlpha } from "../engine/exporters";
import { useGestures } from "./ui";

/** Zoomable artwork view: pinch / drag / double-tap reset. Draws incrementally when `upto` grows. */
export default function BoardView({ result, upto, highlight, numbers = false, hidden }: {
  result: Result; upto?: number; highlight?: { from: number; to: number } | null; numbers?: boolean; hidden?: Set<number>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(300);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const drawn = useRef({ k: 0, key: "" });
  const lastTap = useRef(0);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const steps = React.useMemo(() => buildSteps(result), [result]);
  const total = steps.length;
  const lim = Math.min(upto ?? total, total);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize(Math.max(100, Math.min(el.clientWidth, el.clientHeight || el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useGestures(wrap, {
    pan: (dx, dy) => setView((v) => (v.z > 1.01 ? { ...v, x: v.x + dx, y: v.y + dy } : v)),
    pinch: (r, cx, cy) => setView((v) => {
      const z = Math.min(12, Math.max(1, v.z * r)), k = z / v.z;
      const mx = cx - size / 2, my = cy - size / 2;
      return z === 1 ? { z: 1, x: 0, y: 0 } : { z, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    }),
    tap: () => { const now = Date.now(); if (now - lastTap.current < 300) setView({ z: 1, x: 0, y: 0 }); lastTap.current = now; },
  });

  const geom = () => {
    const S = size * dpr;
    const s = (S / result.widthMm) * 0.96 * view.z;
    return { S, s, ox: S / 2 + view.x * dpr, oy: S / 2 + view.y * dpr };
  };
  const P = (i: number, g: ReturnType<typeof geom>) => [g.ox + result.nailsMm[2 * i] * g.s, g.oy + result.nailsMm[2 * i + 1] * g.s];

  useEffect(() => {
    const c = art.current!, g = geom();
    if (c.width !== g.S) { c.width = c.height = g.S; }
    const ctx = c.getContext("2d")!;
    const key = [g.S, g.s, g.ox, g.oy, result.created, [...(hidden ?? [])].join()].join("|");
    let start = drawn.current.k;
    if (key !== drawn.current.key || lim < start) {
      ctx.clearRect(0, 0, g.S, g.S);
      ctx.fillStyle = result.background;
      ctx.beginPath();
      if (result.board.shape === "circle") ctx.arc(g.ox, g.oy, (result.widthMm / 2) * g.s, 0, Math.PI * 2);
      else ctx.rect(g.ox - (result.widthMm / 2) * g.s, g.oy - (result.heightMm / 2) * g.s, result.widthMm * g.s, result.heightMm * g.s);
      ctx.fill();
      start = 0;
    }
    const wpx = result.thicknessMm * g.s;
    ctx.lineWidth = Math.max(1, wpx);
    const baseAlpha = Math.min(1, wpx >= 1 ? result.opacity : result.opacity * wpx);
    for (let k = start; k < lim; k++) {
      const st = steps[k];
      if (st.kind !== "line" || hidden?.has(st.layer)) continue;
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = canvasAlpha(baseAlpha, st.color, result.background);
      const [x1, y1] = P(st.from - 1, g), [x2, y2] = P(st.to - 1, g);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawn.current = { k: lim, key };
  }, [result, lim, size, view, hidden]);

  useEffect(() => {
    const c = over.current!, g = geom();
    if (c.width !== g.S) { c.width = c.height = g.S; }
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, g.S, g.S);
    const n = result.nailsMm.length / 2;
    const spacing = (Math.PI * result.widthMm * g.s) / n;
    const rad = Math.max(1 * dpr, Math.min(3 * dpr, spacing * 0.25));
    ctx.fillStyle = "#c9a45c";
    for (let i = 0; i < n; i++) { const [x, y] = P(i, g); ctx.beginPath(); ctx.arc(x, y, i === 0 ? rad * 1.8 : rad, 0, 7); ctx.fill(); }
    if (numbers) {
      const fs = 10 * dpr;
      let every = Math.max(1, Math.ceil((fs * 1.3) / spacing));
      every = [1, 2, 5, 10, 20, 25, 50].find((v) => v >= every) ?? every;
      ctx.font = `${fs}px -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#9aa0a8";
      for (let i = 0; i < n; i += every) {
        const [x, y] = P(i, g), dx = x - g.ox, dy = y - g.oy, d = Math.hypot(dx, dy) || 1;
        ctx.fillText(String(i + 1), x - (dx / d) * fs * 1.4, y - (dy / d) * fs * 1.2);
      }
    }
    if (highlight) {
      const [x1, y1] = P(highlight.from, g), [x2, y2] = P(highlight.to, g);
      ctx.strokeStyle = "#ff5a4f"; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      for (const [x, y, col] of [[x1, y1, "#5ab8ff"], [x2, y2, "#ff5a4f"]] as [number, number, string][]) {
        ctx.strokeStyle = col; ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.arc(x, y, 9 * dpr, 0, 7); ctx.stroke();
      }
    }
  }, [result, size, view, highlight, numbers]);

  return (
    <div className="board" ref={wrap}>
      <canvas ref={art} style={{ width: size, height: size }} />
      <canvas ref={over} style={{ width: size, height: size }} />
    </div>
  );
}
