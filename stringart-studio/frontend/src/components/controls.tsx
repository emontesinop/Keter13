import React, { useState } from "react";

export function Section({ title, children, open: initial = true, badge }: {
  title: string; children: React.ReactNode; open?: boolean; badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={`section ${open ? "open" : ""}`}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {badge && <span className="badge">{badge}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 0.01, onChange, unit = "", digits, hint }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  unit?: string; digits?: number; hint?: string;
}) {
  const d = digits ?? (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
  return (
    <label className="ctl" title={hint}>
      <div className="ctl-row">
        <span>{label}</span>
        <input className="num" type="number" value={Number(value.toFixed(d))} step={step} min={min} max={max}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }} />
        {unit && <span className="unit">{unit}</span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
  unit?: string; hint?: string;
}) {
  return (
    <label className="ctl ctl-inline" title={hint}>
      <span>{label}</span>
      <span className="field">
        <input className="num wide" type="number" value={value} step={step} min={min} max={max}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }} />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string;
}) {
  return (
    <label className="ctl ctl-inline" title={hint}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="ctl ctl-inline toggle" title={hint}>
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ctl ctl-inline">
      <span>{label}</span>
      <span className="field">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input className="hex" value={value} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export const fmt = (x: number | undefined | null, d = 1) =>
  x === undefined || x === null || !isFinite(x) ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
