import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Job, Nail, Preview, ProjectMeta, Result, Settings, Step } from "./api";
import BoardCanvas, { CompactStep } from "./components/BoardCanvas";
import { fmt, Stat } from "./components/controls";
import { ExportPanel, GeneratePanel, RoutePanel, SequencePanel, VersionsPanel } from "./components/RightPanel";
import SettingsPanel from "./components/SettingsPanel";
import Simulator from "./components/Simulator";

type View = "image" | "board" | "artwork" | "compare" | "simulate";
type RTab = "generate" | "route" | "sequence" | "versions" | "export";
type ImgKind = "original" | "framed" | "processed" | "edges" | "importance" | "subject" | "intended";

const WORKFLOW: { id: string; label: string; view: View; tab?: RTab }[] = [
  { id: "import", label: "Import", view: "image" },
  { id: "analysis", label: "Analysis", view: "image" },
  { id: "board", label: "Board & nails", view: "board" },
  { id: "thread", label: "Thread", view: "image" },
  { id: "generate", label: "Generate", view: "artwork", tab: "generate" },
  { id: "route", label: "Route", view: "artwork", tab: "route" },
  { id: "simulate", label: "Simulate", view: "simulate", tab: "sequence" },
  { id: "instructions", label: "Instructions", view: "simulate", tab: "sequence" },
  { id: "export", label: "Export", view: "artwork", tab: "export" },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

async function downloadPost(url: string, body: any, filename: string) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { alert("Export failed"); return; }
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function App() {
  const [defaults, setDefaults] = useState<any>(null);
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [geom, setGeom] = useState<{ summary: any; nails: Nail[] } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [view, setView] = useState<View>("image");
  const [rtab, setRtab] = useState<RTab>("generate");
  const [imgKind, setImgKind] = useState<ImgKind>("intended");
  const [simPos, setSimPos] = useState(0);
  const [numbers, setNumbers] = useState<"auto" | "all" | "none">("auto");
  const [searchNail, setSearchNail] = useState<number | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<Result | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("import");
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.defaults().then(setDefaults); refreshProjects(); }, []);
  const refreshProjects = () => api.projects().then(setProjects).catch(() => {});

  // ------------------------------------------------ project lifecycle
  const openProject = useCallback(async (id: string) => {
    const p = await api.project(id);
    setProject(p); setSettings(p.settings); setResult(null); setSteps([]); setJob(null); setPreview(null);
    setCompareWith(null); setShowProjects(false);
    if (p.current_version) await loadVersion(p.id, p.current_version);
    else { setView("image"); setStep("analysis"); }
    localStorage.setItem("sa:last", id);
  }, []);

  useEffect(() => {
    const last = localStorage.getItem("sa:last");
    if (last) openProject(last).catch(() => localStorage.removeItem("sa:last"));
  }, [openProject]);

  const loadVersion = async (pid: string, vid: string) => {
    const [r, st] = await Promise.all([api.version(pid, vid), api.steps(pid, vid)]);
    setResult(r); setSteps(st); setSimPos(st.length);
  };

  const onImport = async (f: File) => {
    setError(null);
    try {
      const p = f.name.endsWith(".saproj") ? await api.importProject(f) : await api.create(f);
      await openProject(p.id); refreshProjects(); setImgKind("intended"); setView("image");
    } catch (e: any) { setError(e.message); }
  };

  // ------------------------------------------------ settings edit, save, preview
  const set = useCallback((group: keyof Settings, key: string, value: any) => {
    setSettings((s) => (s ? { ...s, [group]: { ...(s as any)[group], [key]: value } } : s));
  }, []);
  const replacePalette = (bg: string, cols: any[]) => setSettings((s) => s ? {
    ...s, thread: { ...s.thread, palette_background: bg, palette: cols.map((c) => ({ ...c, enabled: true })) } } : s);

  const dSettings = useDebounced(settings, 500);
  useEffect(() => {
    if (!project || !dSettings) return;
    api.patch(project.id, { settings: dSettings }).then((p) => setProject((old) => old && { ...old, updated: p.updated })).catch((e) => setError(e.message));
  }, [dSettings]);

  const previewKey = settings ? JSON.stringify([settings.image, settings.board, settings.thread]) : "";
  const dPreviewKey = useDebounced(previewKey, 300);
  useEffect(() => {
    if (!project || !settings) return;
    let alive = true;
    setPreviewBusy(true);
    api.preview(project.id, settings, 380).then((p) => alive && setPreview(p)).catch((e) => alive && setError(e.message))
      .finally(() => alive && setPreviewBusy(false));
    return () => { alive = false; };
  }, [dPreviewKey, project?.id]);

  const boardKey = settings ? JSON.stringify(settings.board) : "";
  const dBoardKey = useDebounced(boardKey, 250);
  useEffect(() => { if (settings) api.geometry(settings.board).then(setGeom).catch(() => {}); }, [dBoardKey]);

  // ------------------------------------------------ generation job
  const onGenerate = async () => {
    if (!project || !settings) return;
    setError(null);
    const { job_id } = await api.generate(project.id, settings);
    setJob({ id: job_id, status: "queued", progress: { stage: "queued", fraction: 0 }, result: null, error: null });
    setView("artwork"); setStep("generate");
  };
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const t = setTimeout(async () => {
      try {
        const j = await api.job(job.id);
        setJob(j);
        if (j.status === "done" && project) {
          const p = await api.project(project.id);
          setProject(p);
          await loadVersion(p.id, j.result.version.id);
          setStep("route");
        }
      } catch (e: any) { setError(e.message); }
    }, 350);
    return () => clearTimeout(t);
  }, [job]);

  const onCancel = async () => { if (job) await api.cancel(job.id); };

  useEffect(() => {
    if (project && compareWith) api.version(project.id, compareWith).then(setCompareResult);
    else setCompareResult(null);
  }, [compareWith, project?.id]);

  // ------------------------------------------------ derived
  const compact = useMemo<CompactStep[]>(() => steps.map((s) => [s.layer, s.kind === "rim" ? -1 : s.from - 1, s.kind === "rim" ? -1 : s.to - 1]), [steps]);
  const liveCompact = useMemo<CompactStep[] | null>(() => {
    const pr = job?.progress as any;
    if (!(job?.status === "running") || !(pr?.partial || pr?.partial_layers)) return null;
    const out: CompactStep[] = [];
    if (pr.partial_layers) pr.partial_layers.forEach((edges: number[][], li: number) => edges.forEach(([a, b]) => out.push([li, a, b])));
    else for (const sec of pr.partial) for (let i = 1; i < sec.length; i++) out.push([pr.layer_index ?? 0, sec[i - 1], sec[i]]);
    return out;
  }, [job]);

  const board = settings?.board;
  const s = settings;
  const curLayerColors = s ? (s.thread.color_mode === "mono" ? [s.thread.thread_color] : s.thread.palette.filter((c) => c.enabled).map((c) => c.hex)) : [];
  const bgColor = s ? (s.thread.color_mode === "mono" ? s.thread.background_color : s.thread.palette_background) : "#000";

  const imgSrc = (k: ImgKind) => !project ? "" : k === "original" ? api.sourceUrl(project.id) : (preview?.images as any)?.[k] ?? "";

  // ------------------------------------------------ render
  if (!project || !settings) {
    return (
      <div className="app">
        <TopBar onProjects={() => { refreshProjects(); setShowProjects(true); }} onNew={() => fileRef.current?.click()} />
        <Welcome projects={projects} onFile={onImport} onOpen={openProject} error={error} />
        <input ref={fileRef} type="file" hidden accept="image/*,.tif,.tiff,.saproj" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        {showProjects && <ProjectsModal projects={projects} onClose={() => setShowProjects(false)} onOpen={openProject}
          refresh={refreshProjects} onImport={() => importRef.current?.click()} />}
        <input ref={importRef} type="file" hidden accept=".saproj" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </div>
    );
  }

  const done: Record<string, boolean> = {
    import: true, analysis: !!preview, board: true, thread: true, generate: !!result, route: !!result,
    simulate: !!result && simPos > 0, instructions: !!result, export: !!result,
  };

  return (
    <div className="app">
      <TopBar project={project} onRename={async (name) => setProject(await api.patch(project.id, { name }))}
        onProjects={() => { refreshProjects(); setShowProjects(true); }} onNew={() => fileRef.current?.click()} />
      <nav className="workflow">
        {WORKFLOW.map((w, i) => (
          <button key={w.id} className={`wf ${step === w.id ? "on" : ""} ${done[w.id] ? "done" : ""}`}
            onClick={() => { setStep(w.id); setView(w.view); if (w.tab) setRtab(w.tab); if (w.id === "analysis") setImgKind("processed"); if (w.id === "import") setImgKind("original"); if (w.id === "thread") setImgKind("intended"); }}>
            <span className="wf-n">{i + 1}</span>{w.label}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <aside className="left">
          <SettingsPanel s={settings} set={set} defaults={defaults} geometry={geom?.summary} onPaletteReplace={replacePalette}
            onAutoPalette={async (count, bg) => {
              try { const p = await api.autoPalette(project.id, count, bg, settings); replacePalette(p.background, p.colors); }
              catch (e: any) { setError(e.message); }
            }} />
        </aside>
        <section className="center">
          <div className="view-tabs">
            {(["image", "board", "artwork", "compare", "simulate"] as View[]).map((v) => (
              <button key={v} className={view === v ? "on" : ""} disabled={(v === "simulate" || v === "compare") && !result} onClick={() => setView(v)}>
                {{ image: "Image", board: "Board", artwork: "String art", compare: "Compare", simulate: "Simulator" }[v]}
              </button>
            ))}
            <span className="spacer" />
            {(view === "board" || view === "simulate" || view === "artwork") && (
              <select className="mini" value={numbers} onChange={(e) => setNumbers(e.target.value as any)}>
                <option value="auto">Numbers: auto</option><option value="all">Numbers: all</option><option value="none">Numbers: off</option>
              </select>
            )}
            {previewBusy && <span className="busy">processing…</span>}
          </div>
          {error && <div className="error banner" onClick={() => setError(null)}>{error} ✕</div>}
          <div className="view">
            {view === "image" && (
              <div className="image-view">
                <div className="sub-tabs">
                  {(["original", "framed", "processed", "edges", "importance", "subject", "intended"] as ImgKind[]).map((k) => (
                    <button key={k} className={imgKind === k ? "on" : ""} onClick={() => setImgKind(k)}>
                      {{ original: "Original", framed: "Framed", processed: "Processed", edges: "Edges", importance: "Priority map", subject: "Subject mask", intended: "Thread preview" }[k]}
                    </button>
                  ))}
                </div>
                <div className="image-stage">
                  {imgSrc(imgKind) && <div className={`img-frame ${board?.shape === "circle" && imgKind !== "original" ? "round" : ""}`}>
                    <img src={imgSrc(imgKind)} />
                    {imgKind !== "original" && imgKind !== "intended" && preview?.faces_px.map((f, i) => (
                      <div key={i} className="face-box" style={{ left: `${(f[0] / preview.size[0]) * 100}%`, top: `${(f[1] / preview.size[1]) * 100}%`, width: `${(f[2] / preview.size[0]) * 100}%`, height: `${(f[3] / preview.size[1]) * 100}%` }} />
                    ))}
                  </div>}
                </div>
                {preview && <Analysis a={preview.analysis} />}
              </div>
            )}
            {view === "board" && geom && board && (
              <div className="board-view">
                <BoardCanvas nails={geom.nails} width_mm={geom.summary.width_mm} height_mm={geom.summary.height_mm} shape={board.shape}
                  background={bgColor} colors={[]} steps={[]} thread_mm={0.2} opacity={1} numbers={numbers === "auto" ? "auto" : numbers}
                  searchNail={searchNail ? searchNail - 1 : null} image={preview?.images.intended} imageOpacity={0.25} />
                <div className="overlay-panel">
                  <div className="stats compact">
                    <Stat label="Nails" value={geom.summary.nail_count} />
                    <Stat label="Spacing" value={`${fmt(geom.summary.nail_spacing_mm, 2)} mm`} />
                    {geom.summary.angular_step_deg && <Stat label="Angle step" value={`${fmt(geom.summary.angular_step_deg, 3)}°`} />}
                  </div>
                  <div className="btn-col">
                    <button onClick={() => downloadPost("/api/template/pdf", board, "template_fullscale.pdf")}>Template PDF (1:1)</button>
                    <button onClick={() => downloadPost("/api/template/a4.pdf", board, "template_A4.pdf")}>Template PDF (A4 tiles)</button>
                    <button onClick={() => downloadPost("/api/template/svg", board, "template.svg")}>Template SVG</button>
                    <button onClick={() => downloadPost("/api/template/dxf", board, "template.dxf")}>Drilling DXF</button>
                  </div>
                </div>
              </div>
            )}
            {view === "artwork" && geom && (
              liveCompact || result ? (
                <BoardCanvas nails={result && !liveCompact ? result.nails : geom.nails}
                  width_mm={geom.summary.width_mm} height_mm={geom.summary.height_mm} shape={board!.shape}
                  background={result && !liveCompact ? result.background : bgColor}
                  colors={result && !liveCompact ? result.layers.map((l) => l.color) : curLayerColors}
                  steps={liveCompact ?? compact} thread_mm={result && !liveCompact ? result.thread_mm : settings.thread.thickness_mm}
                  opacity={result && !liveCompact ? result.opacity : settings.thread.opacity} numbers={numbers === "auto" ? "none" : numbers} />
              ) : <div className="empty">Press <b>Generate string art</b> to compute the thread sequence.</div>
            )}
            {view === "compare" && result && (
              <div className="compare">
                <figure><img className={board?.shape === "circle" ? "round" : ""} src={imgSrc("framed")} /><figcaption>Original (framed)</figcaption></figure>
                <figure><img className={board?.shape === "circle" ? "round" : ""} src={imgSrc("intended")} /><figcaption>Processed · thread preview</figcaption></figure>
                <figure><img src={api.previewUrl(project.id, result.id)} /><figcaption>Simulated string art · {result.totals.connections} lines</figcaption></figure>
                {compareResult && <figure><img src={api.previewUrl(project.id, compareResult.id)} />
                  <figcaption>Compare: {project.versions.find((v) => v.id === compareResult.id)?.label} · {compareResult.totals.connections} lines · SSIM {fmt(compareResult.metrics?.ssim, 3)}</figcaption></figure>}
                {!compareResult && <p className="hint">Tip: choose “Compare” on another version (Versions tab) to place it here.</p>}
              </div>
            )}
            {view === "simulate" && result && steps.length > 0 && (
              <Simulator result={result} steps={steps} pos={simPos} setPos={setSimPos} numbers={numbers} />
            )}
          </div>
        </section>
        <aside className="right">
          <div className="right-tabs">
            {(["generate", "route", "sequence", "versions", "export"] as RTab[]).map((t) => (
              <button key={t} className={rtab === t ? "on" : ""} onClick={() => setRtab(t)}>
                {{ generate: "Generate", route: "Route", sequence: "Sequence", versions: `Versions${project.versions.length ? ` (${project.versions.length})` : ""}`, export: "Export" }[t]}
              </button>
            ))}
          </div>
          <div className="panel-scroll">
            {rtab === "generate" && <GeneratePanel s={settings} set={set} job={job} onGenerate={onGenerate} onCancel={onCancel} result={result} hasImage />}
            {rtab === "route" && (result ? <RoutePanel key={result.id + result.totals.bridges} r={result} busy={routeBusy} onApply={async (b) => {
              setRouteBusy(true);
              try { const r = await api.reroute(project.id, result.id, b); setResult(r); const st = await api.steps(project.id, r.id); setSteps(st); setSimPos(st.length); setProject(await api.project(project.id)); }
              catch (e: any) { setError(e.message); } finally { setRouteBusy(false); }
            }} /> : <p className="hint">Generate first.</p>)}
            {rtab === "sequence" && (result ? <SequencePanel steps={steps} searchNail={searchNail} setSearchNail={setSearchNail}
              onJump={(k) => { setSimPos(k); setView("simulate"); }} /> : <p className="hint">Generate first.</p>)}
            {rtab === "versions" && <VersionsPanel project={project} current={result?.id ?? null} compareWith={compareWith}
              setCompareWith={(v) => { setCompareWith(v); if (v) setView("compare"); }}
              onSelect={(vid) => loadVersion(project.id, vid)}
              onDelete={async (vid) => { await api.deleteVersion(project.id, vid); const p = await api.project(project.id); setProject(p);
                if (result?.id === vid) { if (p.current_version) loadVersion(p.id, p.current_version); else { setResult(null); setSteps([]); } } }}
              onRename={async (vid, label) => { await api.renameVersion(project.id, vid, label); setProject(await api.project(project.id)); }} />}
            {rtab === "export" && <ExportPanel pid={project.id} r={result} vid={result?.id ?? null} />}
          </div>
        </aside>
      </main>
      <input ref={fileRef} type="file" hidden accept="image/*,.tif,.tiff,.saproj" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      <input ref={importRef} type="file" hidden accept=".saproj" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      {showProjects && <ProjectsModal projects={projects} onClose={() => setShowProjects(false)} onOpen={openProject}
        refresh={refreshProjects} onImport={() => importRef.current?.click()} currentId={project.id} />}
    </div>
  );
}

function TopBar({ project, onRename, onProjects, onNew }: { project?: ProjectMeta; onRename?: (n: string) => void; onProjects: () => void; onNew: () => void }) {
  return (
    <header className="topbar">
      <div className="brand"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 2 L27 23 L5 23 Z M3 12 L29 12 M8 27 L24 5" stroke="currentColor" strokeWidth="0.8" fill="none" /></svg>
        StringArt <span>Studio</span></div>
      {project && <input className="project-name" defaultValue={project.name} key={project.id} onBlur={(e) => e.target.value !== project.name && onRename?.(e.target.value)} />}
      <span className="spacer" />
      <button onClick={onNew}>New project</button>
      <button onClick={onProjects}>Saved projects</button>
    </header>
  );
}

function Welcome({ projects, onFile, onOpen, error }: { projects: any[]; onFile: (f: File) => void; onOpen: (id: string) => void; error: string | null }) {
  const [over, setOver] = useState(false);
  return (
    <div className="welcome">
      <div className={`drop ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
        <h1>Turn a photograph into a buildable string-art plan</h1>
        <p>Drop an image (JPG, PNG, WEBP, TIFF, BMP) or a <code>.saproj</code> project here.</p>
        <label className="primary big file-btn">Choose image…<input type="file" hidden accept="image/*,.tif,.tiff,.saproj" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
        {error && <div className="error">{error}</div>}
        <ol className="how">
          <li>Analyse & adjust the image</li><li>Configure board, nails & thread</li><li>Generate optimised connections</li>
          <li>Plan & validate the physical route</li><li>Simulate step by step</li><li>Export manual, template & sequence</li>
        </ol>
      </div>
      {projects.length > 0 && <div className="recent">
        <h3>Recent projects</h3>
        {projects.slice(0, 8).map((p) => (
          <button key={p.id} className="recent-item" onClick={() => onOpen(p.id)}>
            <img src={`/api/projects/${p.id}/source`} /><span>{p.name}</span><small>{p.versions} versions</small>
          </button>
        ))}
      </div>}
    </div>
  );
}

function ProjectsModal({ projects, onClose, onOpen, refresh, onImport, currentId }: {
  projects: any[]; onClose: () => void; onOpen: (id: string) => void; refresh: () => void; onImport: () => void; currentId?: string;
}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Saved projects</h3><span className="spacer" />
          <button onClick={onImport}>Import .saproj…</button><button onClick={onClose}>✕</button></div>
        <div className="proj-grid">
          {projects.length === 0 && <p className="hint">No projects yet.</p>}
          {projects.map((p) => (
            <div key={p.id} className={`proj ${p.id === currentId ? "on" : ""}`}>
              <img src={`/api/projects/${p.id}/source`} onClick={() => onOpen(p.id)} />
              <div className="proj-body">
                <b>{p.name}</b>
                <small>{new Date(p.updated * 1000).toLocaleString()} · {p.versions} version(s)</small>
                <div className="v-actions">
                  <button className="small" onClick={() => onOpen(p.id)}>Open</button>
                  <button className="small" onClick={async () => { await api.duplicate(p.id); refresh(); }}>Duplicate</button>
                  <a className="small btn" href={api.projectFileUrl(p.id)} download>Export</a>
                  <button className="small danger" onClick={async () => { if (confirm(`Delete “${p.name}”?`)) { await api.remove(p.id); if (p.id === localStorage.getItem("sa:last")) localStorage.removeItem("sa:last"); refresh(); } }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Analysis({ a }: { a: any }) {
  const max = Math.max(...a.histogram, 1);
  return (
    <div className="analysis">
      <div className="hist">{a.histogram.map((v: number, i: number) => <i key={i} style={{ height: `${(v / max) * 100}%`, background: `hsl(0 0% ${(i / 63) * 85 + 8}%)` }} />)}</div>
      <div className="stats compact">
        <Stat label="Brightness" value={fmt(a.mean_brightness, 2)} />
        <Stat label="Contrast σ" value={fmt(a.contrast_std, 2)} />
        <Stat label="Range" value={fmt(a.dynamic_range, 2)} />
        <Stat label="Dark/Mid/Light" value={`${Math.round(a.dark_fraction * 100)}/${Math.round(a.mid_fraction * 100)}/${Math.round(a.light_fraction * 100)}%`} />
        <Stat label="Edges" value={`${fmt(a.edge_density * 100, 0)}%`} />
        <Stat label="Faces" value={a.faces.length} />
      </div>
      {a.notes?.length > 0 && <ul className="notes">{a.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
