import React, { useEffect, useRef } from "react";

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="slider">
      <div className="slider-top"><span>{label}</span><b>{fmt ? fmt(value) : value.toFixed(step >= 1 ? 0 : 2)}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  );
}

export function NumberRow({ label, value, onChange, unit, step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number;
}) {
  return (
    <label className="num-row">
      <span>{label}</span>
      <span><input type="number" inputMode="decimal" value={value} step={step} min={min} max={max}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }} />{unit && <em>{unit}</em>}</span>
    </label>
  );
}

export function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="num-row">
      <span>{label}</span>
      <span className="color-pick"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /><code>{value}</code></span>
    </label>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head"><b>{title}</b><button className="link" onClick={onClose}>Done</button></div>
        {children}
      </div>
    </div>
  );
}

/** Two-finger pinch + one-finger pan on an element (pointer events). */
export function useGestures(ref: React.RefObject<HTMLElement>, on: {
  pan?: (dx: number, dy: number) => void; pinch?: (ratio: number, cx: number, cy: number) => void; tap?: (x: number, y: number) => void; end?: () => void;
}) {
  const h = useRef(on);
  h.current = on;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let lastDist = 0, moved = 0, downAt = 0;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = 0; downAt = Date.now(); }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) h.current.pan?.(dx, dy);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = el.getBoundingClientRect();
        if (lastDist > 0) h.current.pinch?.(d / lastDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        lastDist = d;
        h.current.pan?.(dx / 2, dy / 2);
      }
    };
    const up = (e: PointerEvent) => {
      if (pts.size === 1 && moved < 8 && Date.now() - downAt < 400) {
        const r = el.getBoundingClientRect();
        h.current.tap?.(e.clientX - r.left, e.clientY - r.top);
      }
      pts.delete(e.pointerId);
      if (pts.size < 2) lastDist = 0;
      if (pts.size === 0) h.current.end?.();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      h.current.pinch?.(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      h.current.end?.();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}

export const fmt = (x: number, d = 1) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
