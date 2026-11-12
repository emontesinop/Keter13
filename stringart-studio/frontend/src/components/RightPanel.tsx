import React, { useMemo, useState } from "react";
import { api, Job, ProjectMeta, Result, Settings, Step } from "../api";
import { NumberField, Section, Select, Slider, Stat, Toggle, fmt } from "./controls";

const MODES: { id: string; label: string; desc: string }[] = [
  { id: "quality", label: "Max quality", desc: "Most detail; allows a few extra thread sections" },
  { id: "balanced", label: "Balanced", desc: "Quality vs. lines vs. thread, one continuous thread" },
  { id: "min_strokes", label: "Min strokes", desc: "Fewest lines that reach the quality target" },
  { id: "contrast", label: "Max contrast", desc: "Emphasises faces, silhouettes and contours" },
  { id: "fast", label: "Fast", desc: "Quick preliminary result" },
  { id: "custom", label: "Custom", desc: "Use every parameter below as set" },
];

export function Sparkline({ data, w = 260, h = 46 }: { data: number[]; w?: number; h?: number }) {
  if (!data?.length) return null;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (1 - v) * h * 0.95}`).join(" ");
  return (
    <svg className="spark" width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function GeneratePanel({ s, set, job, onGenerate, onCancel, result, hasImage }: {
  s: Settings; set: (g: keyof Settings, k: string, v: any) => void; job: Job | null; onGenerate: () => void;
  onCancel: () => void; result: Result | null; hasImage: boolean;
}) {
  const g = s.generation;
  const G = (k: string) => (v: any) => { set("generation", k, v); if (k !== "mode" && g.mode !== "custom") set("generation", "mode", "custom"); };
  const running = job && (job.status === "running" || job.status === "queued");
  const pr = job?.progress;
  return (
    <div>
      <div className="modes">
        {MODES.map((m) => (
          <button key={m.id} className={`mode ${g.mode === m.id ? "on" : ""}`} onClick={() => set("generation", "mode", m.id)} title={m.desc}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{MODES.find((m) => m.id === g.mode)?.desc}. Presets override the advanced values; editing any of them switches to Custom.</p>
      {running ? (
        <div className="progress-box">
          <div className="progress-head">
            <span>{pr?.stage === "optimise" ? `Optimising ${pr.layer ?? ""}` : pr?.stage}</span>
            <span className="mono">{Math.round((pr?.fraction ?? 0) * 100)}%</span>
          </div>
          <div className="bar"><div style={{ width: `${(pr?.fraction ?? 0) * 100}%` }} /></div>
          {pr?.lines !== undefined && <div className="hint mono">{pr.lines} lines · error −{fmt((pr.error_reduction ?? 0) * 100, 1)}%</div>}
          <button className="danger wide" onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <button className="primary wide big" disabled={!hasImage} onClick={onGenerate}>Generate string art</button>
      )}
      {job?.status === "error" && <div className="error">{job.error}</div>}
      {job?.status === "cancelled" && <div className="hint">Generation cancelled.</div>}

      <Section title="Advanced parameters" open={false}>
        <Slider label="Max connections" value={g.max_lines} min={200} max={12000} step={50} onChange={G("max_lines")} />
        <Slider label="Min improvement" value={g.min_improvement} min={0} max={0.02} step={0.0001} digits={4} onChange={G("min_improvement")}
          hint="Stop when the best line improves the error less than this fraction of the first line's gain" />
        <Slider label="Target quality" value={g.target_quality} min={0} max={0.98} step={0.01} onChange={G("target_quality")}
          hint="Stop once this fraction of the image error is removed (0 = off)" />
        <Slider label="Comparison resolution" value={g.resolution} min={120} max={600} step={10} onChange={G("resolution")} unit="px"
          hint="Raster used to compare simulation and image. ~200-300 px mimics viewing distance; higher = finer but noisier" />
        <Slider label="Min nail skip" value={g.min_skip} min={0} max={60} step={1} onChange={G("min_skip")} hint="0 = automatic (nails/25). Forbids very short connections" />
        <Slider label="Overshoot penalty" value={g.overshoot_penalty} min={0} max={6} step={0.1} onChange={G("overshoot_penalty")}
          hint="How strongly over-darkening is punished (limits thread pile-up in dark areas)" />
        <Slider label="Patience" value={g.patience} min={0} max={200} step={1} onChange={G("patience")} hint="Weak 'transit' moves allowed before stopping" />
        <Select label="Strategy" value={g.strategy} onChange={G("strategy")}
          options={[{ value: "continuous", label: "Continuous (1 thread)" }, { value: "hybrid", label: "Hybrid (allow cuts)" }]} />
        {g.strategy === "hybrid" && <>
          <Slider label="Max thread sections" value={g.max_sections} min={1} max={50} step={1} onChange={G("max_sections")} />
          <Slider label="Continuity preference" value={g.continuity_preference} min={0} max={1} onChange={G("continuity_preference")}
            hint="Cut and restart only when the local best line is weaker than this fraction of the global best" />
        </>}
        <NumberField label="Start nail" value={g.start_nail} onChange={G("start_nail")} min={1} />
        {s.thread.color_mode === "color" && <Slider label="Colour line balance" value={g.color_balance} min={0.2} max={3} onChange={G("color_balance")} />}
        <Select label="Route mode" value={s.route.mode} onChange={(v) => set("route", "mode", v)}
          options={[{ value: "strict", label: "Strict (no added lines)" }, { value: "practical", label: "Practical (propose bridges)" }]} />
        {s.route.mode === "practical" && <Slider label="Max bridges" value={s.route.max_bridges} min={0} max={100} step={1} onChange={(v) => set("route", "max_bridges", v)} />}
      </Section>

      {result && <ResultStats r={result} />}
    </div>
  );
}

function ResultStats({ r }: { r: Result }) {
  const mat = r.materials, m = r.metrics ?? {};
  return (
    <>
      <Section title="Statistics">
        <div className="stats">
          <Stat label="Connections" value={r.totals.connections.toLocaleString()} sub={`${r.totals.unique_connections.toLocaleString()} unique`} />
          <Stat label="Thread sections" value={r.totals.sections} sub={`${mat.cuts} cuts · ${mat.knots} knots`} />
          <Stat label="Thread length" value={`${fmt(mat.total_thread_m, 0)} m`} sub="incl. allowances" />
          <Stat label="Build time" value={`${fmt(mat.construction_time_h.total, 1)} h`} sub={`${fmt(mat.construction_time_h.threading, 1)} h threading`} />
          <Stat label="Cost" value={`${fmt(mat.costs.total, 2)} ${mat.costs.currency}`} />
          <Stat label="Generation" value={`${fmt(r.timings.total_s, 1)} s`} sub={`${r.candidate_lines.toLocaleString()} candidates`} />
        </div>
      </Section>
      <Section title="Quality indicators" badge="approx.">
        <div className="stats">
          <Stat label="SSIM" value={fmt(m.ssim, 3)} />
          <Stat label="PSNR" value={`${fmt(m.psnr_db, 1)} dB`} />
          <Stat label="MAE" value={fmt(m.mae, 3)} />
          <Stat label="ΔE 2000" value={fmt(m.delta_e2000, 2)} />
          <Stat label="Error removed" value={`${fmt((m.error_reduction ?? 0) * 100, 1)}%`} />
        </div>
        <p className="hint">Simulated artwork vs. intended appearance at {r.comparison_resolution} px. Indicators compare variations; they do not guarantee physical fidelity.</p>
        {r.layers.map((L, i) => (
          <div key={i} className="layer-stat">
            <div className="layer-head"><i style={{ background: L.color }} />{L.name}
              <span className="mono dim">{L.stats.lines} lines · {L.stats.stop_reason.replace(/_/g, " ")}</span></div>
            <Sparkline data={L.stats.error_curve} />
          </div>
        ))}
      </Section>
      <Section title="Materials" open={false}>
        <table className="tbl">
          <thead><tr><th>Colour</th><th>Conn.</th><th>Sect.</th><th>Length</th><th>Spool</th></tr></thead>
          <tbody>{mat.layers.map((L: any, i: number) => (
            <tr key={i}><td><i className="sw" style={{ background: L.color }} />{L.name}</td><td>{L.connections}</td><td>{L.sections}</td>
              <td>{fmt(L.total_with_waste_m, 0)} m</td><td>{L.recommended_spool_m} m</td></tr>))}</tbody>
        </table>
        <div className="kv"><span>Nails</span><b>{mat.nails.count} × Ø{mat.nails.diameter_mm} mm, spacing {fmt(mat.nails.spacing_mm, 2)} mm</b></div>
        <div className="kv"><span>Cost breakdown</span><b>nails {fmt(mat.costs.nails, 2)} · board {fmt(mat.costs.board, 2)} · thread {fmt(mat.costs.thread, 2)} · other {fmt(mat.costs.other, 2)}</b></div>
      </Section>
    </>
  );
}

export function RoutePanel({ r, onApply, busy }: { r: Result; onApply: (b: [number, number][]) => void; busy: boolean }) {
  const proposed = r.layers.flatMap((L, li) => L.bridges_proposed.map((b) => ({ ...b, layer: li })));
  const applied = new Set(r.layers.flatMap((L) => L.bridges_applied.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)));
  const [sel, setSel] = useState<Set<string>>(applied);
  const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  return (
    <div>
      {r.layers.map((L, i) => (
        <div key={i} className="route-card">
          <div className="layer-head"><i style={{ background: L.color }} />{L.name}
            <span className={`pill ${L.route.continuous ? "ok" : "warn"}`}>{L.route.continuous ? "continuous" : `${L.route.sections} sections`}</span></div>
          <div className="kv"><span>Connections</span><b>{L.route.steps.toLocaleString()}</b></div>
          <div className="kv"><span>Minimum possible sections</span><b>{L.route.min_sections_without_bridges} (Euler bound)</b></div>
          <div className="kv"><span>Graph</span><b>{L.route.components} component(s), {L.route.odd_vertices} odd-degree nails</b></div>
          <div className="kv"><span>Validation</span><b className="ok">✓ every connection used exactly once</b></div>
          {L.route.reordered && <div className="hint">Route re-decomposed by Euler trails to reach the minimum number of sections.</div>}
        </div>
      ))}
      <Section title={`Bridge proposals (${proposed.length})`} open={proposed.length > 0}>
        {proposed.length === 0 ? <p className="hint">No proposals. Set Route mode to “Practical” before generating to get suggestions
          for extra connections that would join thread sections. Bridges are never added without your approval.</p> : (<>
          <p className="hint">Each approved bridge adds one real connection and removes one thread section (one cut + two knots).
            Visual cost &gt; 0 means it slightly darkens areas that did not need it.</p>
          <table className="tbl">
            <thead><tr><th></th><th>Layer</th><th>Nails</th><th>Length</th><th>Visual cost</th></tr></thead>
            <tbody>{proposed.map((p, i) => (
              <tr key={i}><td><input type="checkbox" checked={sel.has(key(p.from, p.to))} onChange={() => {
                const s2 = new Set(sel); const k = key(p.from, p.to); s2.has(k) ? s2.delete(k) : s2.add(k); setSel(s2);
              }} /></td><td>{r.layers[p.layer].name}</td><td className="mono">{p.from}–{p.to}</td><td>{fmt(p.length_mm, 0)} mm</td>
                <td className={p.visual_cost > 0 ? "warn" : "ok"}>{fmt(p.visual_cost, 3)}</td></tr>))}</tbody>
          </table>
          <button className="primary wide" disabled={busy} onClick={() => onApply([...sel].map((k) => k.split("-").map(Number) as [number, number]))}>
            Apply {sel.size} approved bridge(s) & re-plan</button>
        </>)}
      </Section>
    </div>
  );
}

export function SequencePanel({ steps, onJump, searchNail, setSearchNail }: {
  steps: Step[]; onJump: (step: number) => void; searchNail: number | null; setSearchNail: (n: number | null) => void;
}) {
  const [page, setPage] = useState(0);
  const per = 150;
  const rows = useMemo(() => searchNail ? steps.filter((s) => s.from === searchNail || s.to === searchNail) : steps, [steps, searchNail]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(page, pages - 1);
  return (
    <div className="seq">
      <div className="seq-tools">
        <input type="number" placeholder="Find nail #" value={searchNail ?? ""} onChange={(e) => { setPage(0); setSearchNail(e.target.value ? parseInt(e.target.value) : null); }} />
        <span className="dim">{searchNail ? `${rows.length} steps touch nail ${searchNail}` : `${steps.length.toLocaleString()} steps`}</span>
      </div>
      <table className="tbl seq-tbl">
        <thead><tr><th>Step</th><th>From</th><th>To</th><th>Colour</th><th>Dist.</th><th>Sect.</th></tr></thead>
        <tbody>
          {rows.slice(p * per, (p + 1) * per).map((s) => (
            <tr key={s.step} onClick={() => onJump(s.step)} className={s.bridge ? "bridge" : ""}>
              <td className="mono">{s.step}</td>
              <td className={`mono ${s.from === searchNail ? "hl" : ""}`}>{s.from}</td>
              <td className={`mono ${s.to === searchNail ? "hl" : ""}`}>{s.to}</td>
              <td><i className="sw" style={{ background: s.color }} />{s.color_name}</td>
              <td className="mono">{s.distance_mm.toFixed(0)}</td>
              <td>{s.section}{s.bridge ? " B" : ""}</td>
            </tr>))}
        </tbody>
      </table>
      <div className="pager">
        <button disabled={p === 0} onClick={() => setPage(p - 1)}>‹</button>
        <span>{p + 1} / {pages}</span>
        <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>›</button>
      </div>
      <p className="hint">Click a row to show that step in the simulator.</p>
    </div>
  );
}

export function VersionsPanel({ project, current, onSelect, onDelete, onRename, compareWith, setCompareWith }: {
  project: ProjectMeta; current: string | null; onSelect: (vid: string) => void; onDelete: (vid: string) => void;
  onRename: (vid: string, label: string) => void; compareWith: string | null; setCompareWith: (v: string | null) => void;
}) {
  const vs = [...project.versions].reverse();
  if (!vs.length) return <p className="hint">No versions yet. Each generation is saved as a version you can compare and export.</p>;
  return (
    <div className="versions">
      {vs.map((v) => (
        <div key={v.id} className={`version ${v.id === current ? "on" : ""}`}>
          <img src={api.previewUrl(project.id, v.id)} onClick={() => onSelect(v.id)} />
          <div className="v-body">
            <input className="v-label" defaultValue={v.label} onBlur={(e) => e.target.value !== v.label && onRename(v.id, e.target.value)} />
            <div className="dim small">{v.mode} · {v.color_mode} · {v.nails} nails</div>
            <div className="small mono">{v.connections.toLocaleString()} conn · {v.sections} sect · {fmt(v.thread_m, 0)} m</div>
            <div className="small mono">SSIM {fmt(v.metrics?.ssim, 3)} · ΔE {fmt(v.metrics?.delta_e2000, 1)}</div>
            <div className="v-actions">
              <button className="small" onClick={() => onSelect(v.id)}>Open</button>
              <button className={`small ${compareWith === v.id ? "on" : ""}`} onClick={() => setCompareWith(compareWith === v.id ? null : v.id)}>Compare</button>
              <button className="small danger" onClick={() => confirm("Delete this version?") && onDelete(v.id)}>Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExportPanel({ pid, r, vid }: { pid: string; r: Result | null; vid: string | null }) {
  const [gifMode, setGifMode] = useState("timelapse");
  const [nails, setNails] = useState(false);
  if (!r || !vid) return <p className="hint">Generate an artwork first. The nail template can be exported from the Board view at any time.</p>;
  const L = (kind: string, label: string, sub: string, q = "") => (
    <a className="export" href={api.exportUrl(pid, vid, kind, q)} download>
      <b>{label}</b><span>{sub}</span>
    </a>
  );
  return (
    <div className="exports">
      <h4>Construction</h4>
      {L("manual.pdf", "Construction manual", "PDF · specs, instructions, diagram, coordinates, sequence")}
      {L("sequence.csv", "Connection sequence", "CSV · Excel compatible")}
      {L("sequence.json", "Sequence + geometry", "JSON · machine readable")}
      <h4>Nail template (1:1)</h4>
      {L("template.pdf", "Full-scale template", "PDF · single page, calibration marks")}
      {L("template.a4.pdf", "Tiled template", "PDF · A4 pages with alignment grid")}
      {L("template.svg", "Template", "SVG · millimetre units")}
      {L("template.dxf", "Drilling template", "DXF R12 · CAD / CNC")}
      {L("template.nc", "Drilling program", "G-code · G81 cycle (verify before use)")}
      {L("nails.csv", "Nail coordinates", "CSV · mm, angle, distances")}
      <h4>Artwork</h4>
      <Toggle label="Show nails on images" value={nails} onChange={setNails} />
      {L("artwork.png", "Artwork image", "PNG · 2400 px", nails ? "?nails=true" : "")}
      {L("artwork.jpg", "Artwork image", "JPG · 2400 px", nails ? "?nails=true" : "")}
      {L("artwork.svg", "Vector artwork", "SVG · physical scale")}
      <h4>Simulation</h4>
      <Select label="Animation" value={gifMode} onChange={setGifMode} options={[
        { value: "timelapse", label: "Timelapse" }, { value: "instructional", label: "Slow instructional" },
        { value: "full", label: "Full speed (every step)" }, { value: "final", label: "Final artwork only" }]} />
      {L("simulation.gif", "Animated GIF", "real nail-to-nail sequence", `?mode=${gifMode}`)}
      {L("simulation.mp4", "Video", "MP4 · when supported", `?mode=${gifMode}`)}
      {L("steps.zip", "Step image sequence", "ZIP of PNG snapshots")}
      <h4>Project</h4>
      <a className="export" href={api.projectFileUrl(pid)} download><b>Portable project</b><span>.saproj · image, settings, all versions</span></a>
    </div>
  );
}
