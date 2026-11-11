import { useRef, useState } from "react";

export interface Pt { x: number; y: number; label?: string; }

/** Single-series line chart (small-multiple friendly): 2px line, recessive grid, tap/hover tooltip. */
export function LineChart({ points, height = 140, color = "#3987e5", yFormat = (v: number) => String(Math.round(v)), xFormat = (v: number) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" }), baseline, ariaLabel }: {
  points: Pt[]; height?: number; color?: string; yFormat?: (v: number) => string; xFormat?: (v: number) => string; baseline?: number; ariaLabel: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="muted" style={{ fontSize: ".8rem" }}>{points.length ? `${yFormat(points[0].y)}` : "—"}</p>;
  const W = 600, H = height, P = { l: 38, r: 10, t: 10, b: 20 };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys, baseline ?? Infinity), y1 = Math.max(...ys, baseline ?? -Infinity);
  if (y1 - y0 < 1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const sx = (x: number) => P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const sy = (y: number) => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.x) - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const h = hover !== null ? points[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (<g key={i}><line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="#2e3036" strokeWidth={1} /><text x={P.l - 6} y={sy(t) + 3} textAnchor="end">{yFormat(t)}</text></g>))}
        {baseline !== undefined && <line x1={P.l} x2={W - P.r} y1={sy(baseline)} y2={sy(baseline)} stroke="#6b6a64" strokeDasharray="3 3" />}
        <text x={P.l} y={H - 4}>{xFormat(x0)}</text>
        <text x={W - P.r} y={H - 4} textAnchor="end">{xFormat(x1)}</text>
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {h && (<g><line x1={sx(h.x)} x2={sx(h.x)} y1={P.t} y2={H - P.b} stroke="#6b6a64" /><circle cx={sx(h.x)} cy={sy(h.y)} r={4.5} fill={color} stroke="#17181b" strokeWidth={2} /></g>)}
      </svg>
      {h && <div className="tooltip" style={{ left: `${(sx(h.x) / W) * 100}%`, top: `${(sy(h.y) / H) * 100}%` }}>{h.label ?? `${xFormat(h.x)} · ${yFormat(h.y)}`}</div>}
    </div>
  );
}

/** Horizontal bars for a handful of categories (values 0..100). Labels in text ink, single hue. */
export function Bars({ items, color = "#3987e5", suffix = "%" }: { items: { label: string; value: number | null; note?: string }[]; color?: string; suffix?: string }) {
  return (
    <div className="stack">
      {items.map((it) => (
        <div key={it.label} title={it.note}>
          <div className="row between" style={{ fontSize: ".82rem" }}><span>{it.label}</span><span className="muted">{it.value === null ? "—" : `${it.value}${suffix}`}</span></div>
          <div className="progress" style={{ height: 8 }}><div style={{ width: `${Math.max(0, Math.min(100, it.value ?? 0))}%`, background: color, borderRadius: 4 }} /></div>
        </div>
      ))}
    </div>
  );
}
