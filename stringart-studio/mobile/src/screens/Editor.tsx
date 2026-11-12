import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { boardGeometry, nailSpacingMm } from "../engine/geometry";
import { backgroundOf, layersOf, Progress, targets } from "../engine/generate";
import { intendedRGBA } from "../engine/imageproc";
import { drawArt } from "../engine/exporters";
import { migrateSettings, PALETTE_PRESETS, QUALITY, Result, Settings, THREAD_PRESETS } from "../engine/types";
import { drawFramed, framedPixels, loadPhoto, panFrame, Source, thumbnail } from "../framing";
import { Project, saveProject } from "../store";
import { ColorRow, NumberRow, Segmented, Slider, Toggle, fmt, useGestures } from "../components/ui";

type Tab = "frame" | "tone" | "board" | "thread" | "create";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "frame", label: "Frame", icon: "⤢" }, { id: "tone", label: "Tone", icon: "☀" },
  { id: "board", label: "Board", icon: "◎" }, { id: "thread", label: "Thread", icon: "〰" }, { id: "create", label: "Create", icon: "✦" },
];

export default function Editor({ project, onBack, onResult }: { project: Project; onBack: () => void; onResult: (p: Project) => void }) {
  const [s, setS] = useState<Settings>(() => migrateSettings(project.settings));
  const [src, setSrc] = useState<Source | null>(null);
  const [tab, setTab] = useState<Tab>(project.result ? "create" : "frame");
  const [size, setSize] = useState(320);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const intended = useRef<HTMLCanvasElement | null>(null);
  const [intendedTick, setIntendedTick] = useState(0);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const running = progress !== null && progress.stage !== "Done";

  useEffect(() => { if (project.image) loadPhoto(project.image).then(setSrc).catch((e) => setError(String(e))); }, [project.id]);

  useLayoutEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setSize(Math.floor(Math.min(el.clientWidth, el.clientHeight, 520))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // autosave settings
  useEffect(() => {
    const t = setTimeout(() => saveProject({ ...project, settings: s }).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [s]);

  const upd = <G extends Exclude<keyof Settings, "version">>(g: G, patch: Partial<Settings[G]>) =>
    setS((v) => ({ ...v, [g]: { ...(v[g] as object), ...patch } }));

  // ---- gestures on the preview: pan / pinch the photo (frame tab or any time before generating)
  useGestures(stage, {
    pan: (dx, dy) => { if (src && !running) setS((v) => ({ ...v, frame: panFrame(v.frame, src, size, dx, dy) })); },
    pinch: (r) => { if (!running) setS((v) => ({ ...v, frame: { ...v.frame, zoom: Math.min(8, Math.max(0.3, v.frame.zoom * r)) } })); },
  });

  // ---- thread preview (intended appearance), debounced
  const toneKey = JSON.stringify([s.frame, s.tone, s.thread, s.board.shape, s.board.margin, s.board.diameter]);
  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => {
      try {
        const res = s.thread.mode === "color" ? 150 : 200;
        const rgba = framedPixels(src, res, s.frame);
        const { dens, layers, bg, mask } = targets(rgba, res, s);
        const out = intendedRGBA(dens, layers.map((l) => l.color), bg, mask);
        const c = intended.current ?? document.createElement("canvas");
        c.width = c.height = res;
        c.getContext("2d")!.putImageData(new ImageData(out, res, res), 0, 0);
        intended.current = c;
        setIntendedTick((v) => v + 1);
        setError(null);
      } catch (e: any) { setError(e.message); }
    }, tab === "frame" ? 250 : 120);
    return () => clearTimeout(t);
  }, [toneKey, src]);

  // ---- draw preview
  useEffect(() => {
    const c = canvas.current;
    if (!c || !src) return;
    const S = size * dpr;
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0d0e10";
    ctx.fillRect(0, 0, S, S);
    const live = progress?.path && running;
    if (live) {
      const L = layersOf(s);
      const g = boardGeometry(s.board);
      const layers: Result["layers"] = L.map((l, i) => ({ name: l.name, color: l.color, stopReason: "", errorReduction: 0,
        path: i === progress!.layer ? progress!.path! : [] }));
      drawArt(ctx, { version: 1, created: 0, board: s.board, nailsMm: Array.from(g.xy), widthMm: g.widthMm, heightMm: g.heightMm,
        background: backgroundOf(s), thicknessMm: s.thread.thickness, opacity: s.thread.opacity, layers, stats: {} as any }, S);
    } else if (tab === "frame" || !intended.current) {
      drawFramed(ctx, src, S, s.frame);
    } else {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(intended.current, 0, 0, S, S);
    }
    // board outline + dim outside
    ctx.save();
    ctx.fillStyle = "rgba(10,11,13,0.72)";
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    if (s.board.shape === "circle") ctx.arc(S / 2, S / 2, S * 0.49, 0, Math.PI * 2, true);
    else ctx.rect(S * 0.01, S * 0.01, S * 0.98, S * 0.98);
    ctx.fill("evenodd");
    ctx.restore();
    if (!live) {
      const g = boardGeometry(s.board), sc = (S / g.widthMm) * 0.98;
      ctx.fillStyle = "#c9a45c";
      const step = Math.max(1, Math.round(g.n / 120));
      for (let i = 0; i < g.n; i += step) { ctx.beginPath(); ctx.arc(S / 2 + g.xy[2 * i] * sc, S / 2 + g.xy[2 * i + 1] * sc, 1.2 * dpr, 0, 7); ctx.fill(); }
    }
  }, [src, size, s, tab, intendedTick, progress, dpr]);

  // ---- generation
  const generate = useCallback(() => {
    if (!src) return;
    setError(null);
    const q = QUALITY[s.gen.quality];
    const rgba = framedPixels(src, q.resolution, s.frame);
    const w = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    setProgress({ stage: "Starting", fraction: 0 });
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "progress") setProgress(m.progress);
      else if (m.type === "error") { setError(m.message); setProgress(null); w.terminate(); }
      else if (m.type === "done") {
        w.terminate();
        const result: Result = m.result;
        const thumb = await thumbnail((ctx, sz) => { ctx.fillStyle = "#111214"; ctx.fillRect(0, 0, sz, sz); drawArt(ctx, result, sz); });
        const p: Project = { ...project, settings: s, result, thumb, buildStep: 0 };
        await saveProject(p);
        setProgress(null);
        onResult(p);
      }
    };
    w.onerror = (e) => { setError(e.message || "Generation failed"); setProgress(null); };
    w.postMessage({ rgba, res: q.resolution, settings: { ...s, gen: { ...s.gen, maxLines: s.gen.maxLines } } });
  }, [src, s, project]);

  const cancel = () => { worker.current?.terminate(); setProgress(null); };
  useEffect(() => () => worker.current?.terminate(), []);

  const geom = boardGeometry(s.board);
  return (
    <div className="screen editor">
      <header className="bar">
        <button className="link" onClick={onBack}>‹ Projects</button>
        <b className="title">{project.name}</b>
        {project.result ? <button className="link" onClick={() => onResult({ ...project, settings: s })}>Result ›</button> : <span className="link-spacer" />}
      </header>
      <div className="stage" ref={stage}>
        <canvas ref={canvas} style={{ width: size, height: size }} />
        {!src && <div className="stage-msg">Loading photo…</div>}
        <div className="stage-tag">{running ? "Generating…" : tab === "frame" ? "Drag · pinch to frame" : "Thread preview"}</div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="panel">
        {tab === "frame" && <>
          <Slider label="Zoom" value={s.frame.zoom} min={0.3} max={6} onChange={(v) => upd("frame", { zoom: v })} fmt={(v) => v.toFixed(2) + "×"} />
          <Slider label="Rotation" value={s.frame.rotation} min={-180} max={180} step={1} onChange={(v) => upd("frame", { rotation: v })} fmt={(v) => v + "°"} />
          <div className="row-buttons">
            <button onClick={() => upd("frame", { rotation: ((s.frame.rotation - 90 + 540) % 360) - 180 })}>⟲ 90°</button>
            <button onClick={() => upd("frame", { rotation: ((s.frame.rotation + 90 + 540) % 360) - 180 })}>⟳ 90°</button>
            <button onClick={() => upd("frame", { zoom: 1, x: 0, y: 0, rotation: 0 })}>Reset</button>
          </div>
          <p className="hint">Tip: for portraits, zoom in until the face fills about half of the circle.</p>
        </>}
        {tab === "tone" && <>
          <Toggle label="Auto levels" value={s.tone.autoLevels} onChange={(v) => upd("tone", { autoLevels: v })} />
          <Slider label="Exposure" value={s.tone.exposure} min={-2} max={2} step={0.05} onChange={(v) => upd("tone", { exposure: v })} />
          <Slider label="Brightness" value={s.tone.brightness} min={-1} max={1} onChange={(v) => upd("tone", { brightness: v })} />
          <Slider label="Contrast" value={s.tone.contrast} min={0.3} max={3} onChange={(v) => upd("tone", { contrast: v })} />
          <Slider label="Gamma" value={s.tone.gamma} min={0.3} max={3} onChange={(v) => upd("tone", { gamma: v })} />
          <Slider label="Local contrast" value={s.tone.localContrast} min={0} max={3} onChange={(v) => upd("tone", { localContrast: v })} />
          <Slider label="Sharpness" value={s.tone.sharpness} min={0} max={3} onChange={(v) => upd("tone", { sharpness: v })} />
          <Slider label="Edge priority" value={s.tone.edgeEmphasis} min={0} max={3} onChange={(v) => upd("tone", { edgeEmphasis: v })} />
          <Slider label="Centre priority" value={s.tone.centerFocus} min={0} max={2} onChange={(v) => upd("tone", { centerFocus: v })} />
          <Toggle label="Invert" value={s.tone.invert} onChange={(v) => upd("tone", { invert: v })} />
        </>}
        {tab === "board" && <>
          <Segmented value={s.board.shape} onChange={(v) => upd("board", { shape: v })} options={[{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }]} />
          <NumberRow label={s.board.shape === "circle" ? "Diameter" : "Side"} value={s.board.diameter} unit="mm" min={100} max={2000} onChange={(v) => upd("board", { diameter: v })} />
          <Slider label="Nails" value={s.board.nails} min={100} max={500} step={1} onChange={(v) => upd("board", { nails: v })} />
          <NumberRow label="Edge margin" value={s.board.margin} unit="mm" step={0.5} onChange={(v) => upd("board", { margin: v })} />
          <NumberRow label="Nail diameter" value={s.board.nailDiameter} unit="mm" step={0.1} onChange={(v) => upd("board", { nailDiameter: v })} />
          <Segmented value={s.board.numbering} onChange={(v) => upd("board", { numbering: v })}
            options={[{ value: "clockwise", label: "Clockwise" }, { value: "counterclockwise", label: "Counter-clockwise" }]} />
          <Slider label="Nail 1 position" value={s.board.startAngle} min={-180} max={180} step={1} onChange={(v) => upd("board", { startAngle: v })} fmt={(v) => v + "°"} />
          <p className="hint">Spacing {fmt(nailSpacingMm(geom), 2)} mm between nails{nailSpacingMm(geom) < s.board.nailDiameter * 2.2 ? " — very tight, consider fewer nails" : ""}.</p>
        </>}
        {tab === "thread" && <>
          <Segmented value={s.thread.mode} onChange={(v) => upd("thread", { mode: v })} options={[{ value: "mono", label: "One colour" }, { value: "color", label: "Multi-colour" }]} />
          {s.thread.mode === "mono" ? <>
            <div className="chips">
              {Object.entries(THREAD_PRESETS).map(([k, p]) => (
                <button key={k} className={`chip ${s.thread.preset === k ? "on" : ""}`} onClick={() => upd("thread", { preset: k, threadColor: p.thread, background: p.background })}>
                  <i style={{ background: p.background, boxShadow: `inset 0 0 0 4px ${p.background}, inset 0 0 0 7px ${p.thread}` }} />{p.label}
                </button>))}
            </div>
            <ColorRow label="Thread" value={s.thread.threadColor} onChange={(v) => upd("thread", { threadColor: v, preset: "custom" })} />
            <ColorRow label="Board" value={s.thread.background} onChange={(v) => upd("thread", { background: v, preset: "custom" })} />
          </> : <>
            <div className="chips">
              {Object.entries(PALETTE_PRESETS).map(([k, p]) => (
                <button key={k} className="chip" onClick={() => upd("thread", { paletteBackground: p.background, palette: p.colors.map(([name, hex]) => ({ name, hex, enabled: true })) })}>
                  {p.colors.map(([, h]) => <i key={h} className="dot" style={{ background: h }} />)}{p.label}
                </button>))}
            </div>
            <ColorRow label="Board" value={s.thread.paletteBackground} onChange={(v) => upd("thread", { paletteBackground: v })} />
            {s.thread.palette.map((c, i) => (
              <div className="pal" key={i}>
                <input type="checkbox" checked={c.enabled} onChange={(e) => { const p = [...s.thread.palette]; p[i] = { ...c, enabled: e.target.checked }; upd("thread", { palette: p }); }} />
                <input type="color" value={c.hex} onChange={(e) => { const p = [...s.thread.palette]; p[i] = { ...c, hex: e.target.value }; upd("thread", { palette: p }); }} />
                <input className="name" value={c.name} onChange={(e) => { const p = [...s.thread.palette]; p[i] = { ...c, name: e.target.value }; upd("thread", { palette: p }); }} />
                <button className="link" onClick={() => upd("thread", { palette: s.thread.palette.filter((_, k) => k !== i) })}>✕</button>
              </div>))}
            {s.thread.palette.length < 12 && <button className="ghost" onClick={() => upd("thread", { palette: [...s.thread.palette, { name: "Thread", hex: "#888888", enabled: true }] })}>+ Add colour</button>}
          </>}
          <NumberRow label="Thread thickness" value={s.thread.thickness} unit="mm" step={0.01} onChange={(v) => upd("thread", { thickness: v })} />
          <Slider label="Thread opacity" value={s.thread.opacity} min={0.1} max={1} onChange={(v) => upd("thread", { opacity: v })} />
          <Toggle label="Automatic tone mapping" value={s.thread.autoTone !== false} onChange={(v) => upd("thread", { autoTone: v })} />
          {s.thread.autoTone === false && <>
            <Slider label="Tone physics" value={s.thread.tonePhysics} min={0} max={1} onChange={(v) => upd("thread", { tonePhysics: v })} />
            <Slider label="Max coverage" value={s.thread.maxCoverage} min={0.5} max={0.99} onChange={(v) => upd("thread", { maxCoverage: v })} />
          </>}
          <p className="hint">Dark thread on a light board gives the most faithful results. Thinner thread allows more lines and finer detail.</p>
        </>}
        {tab === "create" && <>
          <Segmented value={s.gen.quality} onChange={(v) => upd("gen", { quality: v, maxLines: QUALITY[v].maxLines })}
            options={[{ value: "fast", label: "Fast" }, { value: "balanced", label: "Balanced" }, { value: "detailed", label: "Detailed" }]} />
          <Slider label="Max connections" value={s.gen.maxLines} min={500} max={12000} step={100} onChange={(v) => upd("gen", { maxLines: v })} fmt={(v) => v.toLocaleString()} />
          <Slider label="Overshoot penalty" value={s.gen.overshoot} min={0.3} max={4} step={0.1} onChange={(v) => upd("gen", { overshoot: v })} />
          {running ? (
            <div className="progress">
              <div className="progress-top"><span>{progress?.stage}</span><b>{Math.round((progress?.fraction ?? 0) * 100)}%</b></div>
              <div className="bar-track"><div style={{ width: `${(progress?.fraction ?? 0) * 100}%` }} /></div>
              {progress?.lines !== undefined && <div className="hint">{progress.lines.toLocaleString()} connections · error −{fmt((progress.errorReduction ?? 0) * 100, 0)}%</div>}
              <button className="danger big" onClick={cancel}>Cancel</button>
            </div>
          ) : (
            <button className="primary big" disabled={!src} onClick={generate}>{project.result ? "Generate again" : "Generate string art"}</button>
          )}
          <p className="hint">Runs entirely on this iPhone. One continuous thread per colour; no connection is ever repeated.</p>
        </>}
      </div>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} disabled={running && t.id !== "create"}>
            <span className="ico">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
