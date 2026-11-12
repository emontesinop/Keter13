import React, { useState } from "react";
import BoardView from "../components/BoardView";
import { fmt, Sheet } from "../components/ui";
import { artworkPNG, nailsCSV, sequenceCSV, sequenceJSON, shareFile, templateSVG } from "../engine/exporters";
import { Project } from "../store";
import { hexRgb, luminance } from "../engine/imageproc";
import { layerSections } from "../engine/types";

export default function ResultScreen({ project, onBack, onEdit, onBuild, onTryBlackOnWhite }: {
  project: Project; onBack: () => void; onEdit: () => void; onBuild: () => void; onTryBlackOnWhite?: () => void;
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
          <div><span>{r.stats.rimMoves ? "Threads" : "Sections"}</span><b>{r.stats.threads ?? r.stats.sections}</b></div>
          <div><span>Build time</span><b>≈ {fmt(r.stats.buildHours, 1)} h</b></div>
          <div><span>Nails</span><b>{r.nailsMm.length / 2}</b></div>
          <div><span>Thread to use</span><b>{r.thicknessMm.toFixed(2)} mm</b></div>
          <div><span>Image error removed</span><b>{r.layers.every((L) => L.stopReason === "imported") ? "—" : `${fmt(r.stats.errorReduction * 100, 0)}%`}</b></div>
        </div>
        {r.layers.some((L) => L.stopReason === "max_lines") && (
          <p className="tip">The line limit ({r.layers[0].budget?.toLocaleString()}) was reached before the image was complete. For a fuller result raise
            <b> Max connections</b> in Create and generate again (bigger boards need more lines).</p>)}
        {r.layers.every((L) => L.stopReason !== "max_lines") && r.layers.some((L) => L.budget && layerSections(L).reduce((a, x) => a + x.length - 1, 0) < (L.budget ?? 0) * 0.97 && L.stopReason !== "imported") && r.layers.length === 1 && (
          <p className="hint">The image was complete at {total.toLocaleString()} of the allowed {r.layers.reduce((a, L) => a + (L.budget ?? 0), 0).toLocaleString()} connections:
            more lines would only darken it. For more lines and finer detail use thinner thread, more nails or a bigger board.</p>)}
        {onTryBlackOnWhite && project.image && r.layers.length === 1 && luminance(hexRgb(r.layers[0].color)) > luminance(hexRgb(r.background)) && (
          <div className="tip">
            <b>Want a more realistic result?</b> Light thread on a dark board fills light areas (sky, skin) with thread. Black thread on a white board
            reproduces faces much more faithfully.
            <button className="primary" onClick={onTryBlackOnWhite}>Try black thread on white</button>
          </div>)}
        <div className={`check ${r.stats.validated ? "ok" : "bad"}`}>
          {!r.stats.validated ? `⚠ Route check failed (${r.stats.duplicates} duplicates)`
            : r.stats.rimMoves ? `✓ Route verified: one thread per colour, no repeated connection. ${r.stats.rimMoves.toLocaleString()} moves around the outside of the board join the line groups (no cuts).`
            : "✓ Route verified: continuous thread per colour, no repeated connection"}
        </div>
        {r.layers.length > 1 && <div className="layer-list">{r.layers.map((L, i) => (
          <span key={i}><i style={{ background: L.color }} />{L.name}: {layerSections(L).reduce((a, x) => a + x.length - 1, 0).toLocaleString()}</span>))}</div>}
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
