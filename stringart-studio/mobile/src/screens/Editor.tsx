import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { boardGeometry, nailSpacingMm } from "../engine/geometry";
import { backgroundOf, generate as generateSync, layersOf, Progress, targets } from "../engine/generate";
import { hexRgb, intendedRGBA, luminance } from "../engine/imageproc";
import { autoPalette, THREAD_CATALOG } from "../engine/color";
import { drawArt } from "../engine/exporters";
import { migrateSettings, PALETTE_PRESETS, QUALITY, Result, Settings, THREAD_PRESETS } from "../engine/types";
import { drawFramed, framedPixels, loadPhoto, panFrame, Source, thumbnail, toBlob, toStored } from "../framing";
import { Project, updateProject } from "../store";
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

  const [photoLost, setPhotoLost] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!project.image) return;
    loadPhoto(project.image).then(async (c) => {
      setSrc(c);
      // re-save old Blob-based projects as plain bytes (avoids the Safari IndexedDB Blob problem)
      if (project.image instanceof Blob) {
        try { await updateProject(project.id, { image: await toStored(await toBlob(c)) }); } catch { /* keep going */ }
      }
    }).catch(() => setPhotoLost(true));
  }, [project.id]);

  const replacePhoto = async (f: File) => {
    try {
      const c = await loadPhoto(f);
      await updateProject(project.id, { image: await toStored(await toBlob(c)) });
      setSrc(c); setPhotoLost(false); setError(null);
    } catch (e: any) { setError(e.message); }
  };

  useLayoutEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setSize(Math.floor(Math.min(el.clientWidth, el.clientHeight, 520))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // autosave settings
  useEffect(() => {
    const t = setTimeout(() => updateProject(project.id, { settings: s }).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [s]);

  // thread recommendation: line count needed ~ board size / thread thickness (measured), so the
  // thread that gives the 300 mm / 0.15 mm look scales with the board diameter
  const recThread = Math.min(0.8, Math.max(0.1, Math.round((0.15 * s.board.diameter) / 300 / 0.05) * 0.05));
  const [planN, setPlanN] = useState(3000);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const planThread = () => {
    if (!src) return;
    setPlanBusy(true); setPlanMsg(null);
    setTimeout(() => {
      try {
        // quick low-resolution run with the current thread: the number of lines needed scales
        // inversely with thread thickness, so one run tells us which thread gives planN strokes
        const res = 160;
        const probe = { ...s, gen: { ...s.gen, quality: "fast" as const, maxLines: 20000 } };
        const r = generateSync(framedPixels(src, res, s.frame), res, probe, () => {});
        const n0 = Math.max(1, r.stats.connections);
        const t = Math.min(1, Math.max(0.05, Math.round((s.thread.thickness * n0) / planN * 100) / 100));
        setS((v) => ({ ...v, thread: { ...v.thread, thickness: t }, gen: { ...v.gen, maxLines: Math.max(1000, Math.round(planN * 1.15 / 100) * 100) } }));
        setPlanMsg(`Use ≈ ${t.toFixed(2)} mm thread for about ${planN.toLocaleString()} strokes on this ${s.board.diameter} mm board. Thread thickness and the line limit were updated - tap Generate.`);
      } catch (e: any) { setError(e.message); }
      setPlanBusy(false);
    }, 50);
  };
  const [palBusy, setPalBusy] = useState(false);
  const [palCount, setPalCount] = useState(5);
  const runAutoPalette = (k = palCount, base: Settings = s) => {
    if (!src) return;
    setPalBusy(true);
    setTimeout(() => {
      try {
        const bg = base.thread.paletteBackground;
        const res = 160;
        const rgba = framedPixels(src, res, base.frame);
        const tg = targets(rgba, res, { ...base, thread: { ...base.thread, mode: "mono", threadColor: "#000000", background: bg } });
        const pal = autoPalette(tg.pi.color, tg.mask, tg.pi.importance, bg, k);
        setS((v) => ({ ...v, thread: { ...v.thread, mode: "color", palette: pal.map(([name, hex]) => ({ name, hex, enabled: true })) },
          gen: { ...v.gen, maxLines: Math.max(v.gen.maxLines, 10000) } }));
      } catch (e: any) { setError(e.message); }
      setPalBusy(false);
    }, 50);
  };
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
    const live = (progress?.path || progress?.edges) && running;
    if (live) {
      const L = layersOf(s);
      const g = boardGeometry(s.board);
      const layers: Result["layers"] = L.map((l, i) => {
        const sections = progress!.edges ? (progress!.edges[i] ?? []).map(([a, b]) => [a, b]) : (i === progress!.layer ? [progress!.path!] : []);
        return { name: l.name, color: l.color, stopReason: "", errorReduction: 0, path: sections[0] ?? [], sections };
      });
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
    const settings = { ...s, gen: { ...s.gen, maxLines: s.gen.maxLines } };
    let finished = false, heard = false;

    const finish = async (result: Result) => {
      if (finished) return;
      finished = true;
      const thumb = await thumbnail((ctx, sz) => { ctx.fillStyle = "#111214"; ctx.fillRect(0, 0, sz, sz); drawArt(ctx, result, sz); });
      const p = (await updateProject(project.id, { settings: s, result, thumb, buildStep: 0 })) ?? { ...project, settings: s, result, thumb, buildStep: 0 };
      setProgress(null);
      onResult(p);
    };
    const fail = (msg: string) => { if (finished) return; finished = true; setError(msg); setProgress(null); };

    // Fallback for iPhones where background workers cannot start: run on the main thread.
    // The screen freezes for a few seconds, but generation still works.
    const runHere = () => {
      if (finished) return;
      worker.current?.terminate();
      worker.current = null;
      setProgress({ stage: "Generating (compatibility mode, the screen may freeze for a few seconds)…", fraction: 0.1 });
      setTimeout(() => {
        try { finish(generateSync(rgba, q.resolution, settings, () => {})); }
        catch (err: any) { fail(`Generation error: ${err?.message ?? err}`); }
      }, 80);
    };

    setProgress({ stage: "Starting", fraction: 0 });
    let w: Worker;
    try {
      // classic (non-module) worker: works on every iOS version that supports workers
      w = new Worker(new URL("../engine/worker.ts", import.meta.url));
    } catch {
      runHere();
      return;
    }
    worker.current = w;
    const watchdog = setTimeout(() => { if (!heard) runHere(); }, 6000);
    w.onmessage = (e) => {
      heard = true;
      const m = e.data;
      if (m.type === "progress") setProgress(m.progress);
      else if (m.type === "error") { clearTimeout(watchdog); w.terminate(); fail(`Generation error: ${m.message}`); }
      else if (m.type === "done") { clearTimeout(watchdog); w.terminate(); finish(m.result); }
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      clearTimeout(watchdog);
      if (!heard) runHere();                     // worker could not start -> fallback
      else fail(`Generation error: ${e.message || "background task crashed (memory?)"}${e.lineno ? ` (line ${e.lineno})` : ""}`);
    };
    w.postMessage({ rgba, res: q.resolution, settings });
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
        {!src && !photoLost && <div className="stage-msg">Loading photo…</div>}
        {photoLost && <div className="stage-msg lost">
          <p>The saved photo of this project could not be read on this device.<br />Choose it again: your settings and result are kept.</p>
          <button className="primary" onClick={() => replaceInput.current?.click()}>Choose photo again</button>
        </div>}
        <input ref={replaceInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) replacePhoto(f); }} />
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
          <Segmented value={s.tone.background ?? "keep"} onChange={(v) => upd("tone", { background: v })}
            options={[{ value: "keep", label: "Keep background" }, { value: "remove", label: "Remove background" }]} />
          {s.tone.background === "remove" && <>
            <Slider label="Background tolerance" value={s.tone.bgTolerance ?? 20} min={6} max={45} step={1} onChange={(v) => upd("tone", { bgTolerance: v })} />
            <p className="hint">Works best with plain backgrounds (sky, wall). The removed area becomes bare board. Raise the tolerance if parts of the background remain; lower it if it eats into the person.</p>
          </>}
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
          {s.thread.mode === "mono" && Math.abs(s.thread.thickness - recThread) > 0.04 && <p className="tip">
            For a {s.board.diameter} mm board, <b>{recThread.toFixed(2)} mm thread</b> gives a sharp result with about 3,000–4,000 strokes
            (thinner thread needs many more strokes on a big board).
            <button className="primary" onClick={() => upd("thread", { thickness: recThread })}>Use {recThread.toFixed(2)} mm thread</button></p>}
          <p className="hint">Spacing {fmt(nailSpacingMm(geom), 2)} mm between nails{nailSpacingMm(geom) < s.board.nailDiameter * 2.2 ? " — very tight, consider fewer nails" : ""}.</p>
        </>}
        {tab === "thread" && <>
          <Segmented value={s.thread.mode} onChange={(v) => {
            if (v === "color" && s.thread.mode !== "color") {
              // first switch to colour: white board + palette chosen from the photo + room for more lines
              const base = { ...s, thread: { ...s.thread, mode: "color" as const, paletteBackground: "#ffffff" } };
              setS(base);
              runAutoPalette(palCount, base);
            } else upd("thread", { mode: v });
          }} options={[{ value: "mono", label: "One colour" }, { value: "color", label: "Multi-colour" }]} />
          {s.thread.mode === "mono" ? <>
            <div className="chips">
              {Object.entries(THREAD_PRESETS).map(([k, p]) => (
                <button key={k} className={`chip ${s.thread.preset === k ? "on" : ""}`} onClick={() => upd("thread", { preset: k, threadColor: p.thread, background: p.background })}>
                  <i style={{ background: p.background, boxShadow: `inset 0 0 0 4px ${p.background}, inset 0 0 0 7px ${p.thread}` }} />{p.label}
                </button>))}
            </div>
            {luminance(hexRgb(s.thread.threadColor)) > luminance(hexRgb(s.thread.background)) &&
              <p className="tip">Tip: <b>black thread on a white board</b> usually gives far more realistic portraits. With light thread, every line also brightens the dark board, and light skies or backgrounds get filled with thread.</p>}
            <ColorRow label="Thread" value={s.thread.threadColor} onChange={(v) => upd("thread", { threadColor: v, preset: "custom" })} />
            <ColorRow label="Board" value={s.thread.background} onChange={(v) => upd("thread", { background: v, preset: "custom" })} />
          </> : <>
            <div className="auto-pal">
              <button className="primary" disabled={!src || palBusy} onClick={() => runAutoPalette()}>
                {palBusy ? "Choosing colours…" : "✦ Choose thread colours from photo"}</button>
              <div className="row-buttons">
                {[3, 4, 5, 6].map((k) => <button key={k} className={palCount === k ? "on" : ""} onClick={() => setPalCount(k)}>{k} colours</button>)}
              </div>
              <p className="hint">Picks the best real thread colours for this photo and board from {THREAD_CATALOG.length} common shades
                (skin tones, browns, blues…). 5 colours is usually best. In multi-colour mode the lines don't need to form one continuous
                thread: each colour is planned in groups joined by running the thread around the outside of the board.</p>
            </div>
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
          {s.thread.mode === "mono" && Math.abs(s.thread.thickness - recThread) > 0.04 &&
            <p className="hint">Recommended for a {s.board.diameter} mm board: about {recThread.toFixed(2)} mm (fewer strokes, same sharpness).
              <button className="link" onClick={() => upd("thread", { thickness: recThread })}>Use it</button></p>}
          <Slider label="Thread opacity" value={s.thread.opacity} min={0.1} max={1} onChange={(v) => upd("thread", { opacity: v })} />
          <Toggle label="Automatic tone mapping" value={s.thread.autoTone !== false} onChange={(v) => upd("thread", { autoTone: v })} />
          {s.thread.autoTone === false && <>
            <Slider label="Tone physics" value={s.thread.tonePhysics} min={0} max={1} onChange={(v) => upd("thread", { tonePhysics: v })} />
            <Slider label="Max coverage" value={s.thread.maxCoverage} min={0.5} max={0.99} onChange={(v) => upd("thread", { maxCoverage: v })} />
          </>}
          <p className="hint">Dark thread on a light board gives the most faithful results. Thinner thread allows more lines and finer detail.</p>
        </>}
        {tab === "create" && <>
          {s.thread.mode === "mono" && !running && <div className="planner">
            <b>Plan by number of strokes</b>
            <Slider label="Strokes I want to make" value={planN} min={1500} max={8000} step={100} onChange={setPlanN} fmt={(v) => v.toLocaleString()} />
            <button disabled={!src || planBusy} onClick={planThread}>{planBusy ? "Calculating…" : `Calculate the thread for ${planN.toLocaleString()} strokes`}</button>
            {planMsg && <p className="tip">{planMsg}</p>}
          </div>}
          <Segmented value={s.gen.quality} onChange={(v) => upd("gen", { quality: v, maxLines: s.thread.mode === "color" ? Math.max(10000, QUALITY[v].maxLines) : QUALITY[v].maxLines })}
            options={[{ value: "fast", label: "Fast" }, { value: "balanced", label: "Balanced" }, { value: "detailed", label: "Detailed" }]} />
          <Slider label="Max connections" value={s.gen.maxLines} min={500} max={20000} step={100} onChange={(v) => upd("gen", { maxLines: v })} fmt={(v) => v.toLocaleString()} />
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
