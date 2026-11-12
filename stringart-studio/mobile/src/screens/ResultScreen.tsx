import React, { useState } from "react";
import BoardView from "../components/BoardView";
import { fmt, Sheet } from "../components/ui";
import { artworkPNG, nailsCSV, sequenceCSV, sequenceJSON, shareFile, templateSVG } from "../engine/exporters";
import { Project } from "../store";

export default function ResultScreen({ project, onBack, onEdit, onBuild }: {
  project: Project; onBack: () => void; onEdit: () => void; onBuild: () => void;
}) {
  const r = project.result!;
  const [sheet, setSheet] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const base = project.name.replace(/[^\w\- ]+/g, "_").trim() || "stringart";
  const total = r.stats.connections;
  const share = async (what: string, fn: () => Promise<void>) => { setBusy(what); try { await fn(); } finally { setBusy(null); } };
  return (
    <div className="screen result">
      <header className="bar">
        <button className="link" onClick={onBack}>‹ Projects</button>
        <b className="title">{project.name}</b>
        <button className="link" onClick={onEdit}>Edit</button>
      </header>
      <div className="stage"><BoardView result={r} numbers={numbers} /></div>
      <div className="panel">
        <div className="stats">
          <div><span>Connections</span><b>{total.toLocaleString()}</b></div>
          <div><span>Thread</span><b>{fmt(r.stats.threadM, 0)} m</b></div>
          <div><span>Sections</span><b>{r.stats.sections}</b></div>
          <div><span>Build time</span><b>≈ {fmt(r.stats.buildHours, 1)} h</b></div>
          <div><span>Nails</span><b>{r.nailsMm.length / 2}</b></div>
          <div><span>Image error removed</span><b>{r.layers.every((L) => L.stopReason === "imported") ? "—" : `${fmt(r.stats.errorReduction * 100, 0)}%`}</b></div>
        </div>
        {r.layers.some((L) => L.budget && L.path.length - 1 < L.budget * 0.97 && L.stopReason !== "imported") && (
          <p className="hint">The image was complete at {total.toLocaleString()} of the allowed {r.layers.reduce((a, L) => a + (L.budget ?? 0), 0).toLocaleString()} connections:
            more lines would only darken it. For more lines and finer detail use thinner thread, more nails or a bigger board.</p>)}
        <div className={`check ${r.stats.validated ? "ok" : "bad"}`}>
          {r.stats.validated ? "✓ Route verified: continuous thread per colour, no repeated connection" : `⚠ Route check failed (${r.stats.duplicates} duplicates)`}
        </div>
        {r.layers.length > 1 && <div className="layer-list">{r.layers.map((L, i) => (
          <span key={i}><i style={{ background: L.color }} />{L.name}: {(L.path.length - 1).toLocaleString()}</span>))}</div>}
        <label className="toggle-row"><span>Show nail numbers</span><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /><i /></label>
        <button className="primary big" onClick={onBuild}>{project.buildStep > 0 ? `Continue building (step ${project.buildStep + 1})` : "Start building"}</button>
        <button className="big" onClick={() => setSheet(true)}>Export & share…</button>
        <p className="hint">Generated in {fmt(r.stats.seconds, 1)} s on this device from {r.stats.candidates.toLocaleString()} candidate connections.</p>
      </div>
      {sheet && <Sheet title="Export & share" onClose={() => setSheet(false)}>
        <div className="list">
          <button onClick={() => share("csv", () => shareFile(sequenceCSV(r), `${base}_sequence.csv`, "text/csv"))}>
            <b>Connection sequence</b><span>CSV · opens in Numbers / Excel</span></button>
          <button onClick={() => share("svg", () => shareFile(templateSVG(r), `${base}_nail_template.svg`, "image/svg+xml"))}>
            <b>Nail template, full scale</b><span>SVG in millimetres · print at 100 %</span></button>
          <button onClick={() => share("png", async () => shareFile(await artworkPNG(r), `${base}.png`, "image/png"))}>
            <b>Artwork image</b><span>PNG 2048 px</span></button>
          <button onClick={() => share("nails", () => shareFile(nailsCSV(r), `${base}_nails.csv`, "text/csv"))}>
            <b>Nail coordinates</b><span>CSV · mm and angles</span></button>
          <button onClick={() => share("json", () => shareFile(sequenceJSON(r), `${base}.stringart.json`, "application/json"))}>
            <b>Sequence file</b><span>JSON · re-import here or open in the desktop app</span></button>
        </div>
        {busy && <p className="hint">Preparing {busy}…</p>}
      </Sheet>}
    </div>
  );
}
