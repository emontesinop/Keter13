import React, { useEffect, useMemo, useRef, useState } from "react";
import BoardView from "../components/BoardView";
import { boardGeometry, clockPosition } from "../engine/geometry";
import { buildSteps } from "../engine/types";
import { Project, updateProject } from "../store";
import { Sheet } from "../components/ui";

/** Hands-on building mode: big instructions, large buttons, voice, screen kept awake, progress saved. */
export default function Build({ project, onExit }: { project: Project; onExit: (p: Project) => void }) {
  const r = project.result!;
  const steps = useMemo(() => buildSteps(r), [r]);
  const n = steps.length;
  const [pos, setPos] = useState(Math.min(project.buildStep, n));   // completed steps
  const [voice, setVoice] = useState(() => localStorage.getItem("sa:voice") === "1");
  const [auto, setAuto] = useState(0);                               // seconds per step, 0 = off
  const [showBoard, setShowBoard] = useState(true);
  const [jump, setJump] = useState(false);
  const [jumpVal, setJumpVal] = useState("");
  const geom = useMemo(() => {
    // the geometry is only needed for clock positions; use stored nail coordinates
    const g = boardGeometry({ ...r.board, nails: r.nailsMm.length / 2 });
    g.xy = Float64Array.from(r.nailsMm);
    return g;
  }, [r]);
  const cur = pos < n ? steps[pos] : null;
  const nxt = pos + 1 < n ? steps[pos + 1] : null;
  const prev = pos > 0 ? steps[pos - 1] : null;
  const newSection = cur && (!prev || prev.layer !== cur.layer);

  // persist progress
  const projRef = useRef(project);
  useEffect(() => {
    const t = setTimeout(() => { projRef.current = { ...projRef.current, buildStep: pos }; updateProject(projRef.current.id, { buildStep: pos }).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [pos]);

  // keep the screen on
  useEffect(() => {
    let lock: any = null;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* not supported */ } };
    req();
    const vis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release?.(); };
  }, []);

  // voice
  const speak = (text: string) => {
    if (!voice || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  };
  useEffect(() => {
    if (!cur) { speak("Finished. Tie off the thread."); return; }
    speak(newSection ? `New thread, ${cur.colorName}. Start at ${cur.from}. Then ${cur.to}` : `${cur.to}`);
  }, [pos, voice]);

  // auto-advance
  useEffect(() => {
    if (!auto || pos >= n) return;
    const t = setTimeout(() => setPos((p) => Math.min(n, p + 1)), auto * 1000);
    return () => clearTimeout(t);
  }, [auto, pos, n]);

  const next = () => setPos((p) => Math.min(n, p + 1));
  const back = () => setPos((p) => Math.max(0, p - 1));
  const pct = n ? (100 * pos) / n : 0;

  return (
    <div className="screen build">
      <header className="bar">
        <button className="link" onClick={() => { speechSynthesis?.cancel?.(); onExit({ ...projRef.current, buildStep: pos }); }}>‹ Done</button>
        <button className="link step-count" onClick={() => setJump(true)}>Step {Math.min(pos + 1, n).toLocaleString()} / {n.toLocaleString()}</button>
        <button className="link" onClick={() => setShowBoard(!showBoard)}>{showBoard ? "Hide board" : "Board"}</button>
      </header>
      <div className="build-progress"><div style={{ width: `${pct}%` }} /></div>
      {cur ? (
        <div className="instruction">
          {newSection && <div className="banner">
            {prev ? <>Tie off and cut the {prev.colorName.toLowerCase()} thread on nail {prev.to}.<br /></> : null}
            {r.layers.length > 1
              ? <>Tie a new <i className="swatch" style={{ background: cur.color }} /><b>{cur.colorName}</b> thread on nail <b>{cur.from}</b>.</>
              : <>Tie the thread to nail <b>{cur.from}</b> with a double knot.</>}
          </div>}
          <div className="from-to">
            <div className="from"><span>from</span><b>{cur.from}</b></div>
            <div className="arrow">→</div>
            <div className="to"><span>to</span><b>{cur.to}</b></div>
          </div>
          <div className="meta">
            nail {cur.to} is at <b>{clockPosition(geom, cur.to - 1)}</b> o'clock · {Math.round(cur.distMm)} mm
            {r.layers.length > 1 && <> · <i style={{ background: cur.color }} />{cur.colorName}</>}
          </div>
          {nxt && nxt.layer === cur.layer && <div className="then">then → {nxt.to}</div>}
        </div>
      ) : (
        <div className="instruction done">
          <div className="big-done">✓</div>
          <p>All {n.toLocaleString()} connections done. Tie off the thread on nail {prev?.to} and secure the knot with a drop of glue.</p>
        </div>
      )}
      {showBoard && <div className="build-board"><BoardView result={r} upto={pos + 1} highlight={cur ? { from: cur.from - 1, to: cur.to - 1 } : null} /></div>}
      <div className="build-controls">
        <div className="build-opts">
          <button className={voice ? "on" : ""} onClick={() => { const v = !voice; setVoice(v); localStorage.setItem("sa:voice", v ? "1" : "0");
            if (v && cur) { const u = new SpeechSynthesisUtterance(String(cur.to)); speechSynthesis.speak(u); } }}>🔊 Voice {voice ? "on" : "off"}</button>
          <select value={auto} onChange={(e) => setAuto(parseInt(e.target.value))}>
            <option value={0}>Auto-advance off</option>
            {[3, 5, 8, 12, 20].map((s) => <option key={s} value={s}>Auto every {s} s</option>)}
          </select>
        </div>
        <div className="build-buttons">
          <button className="back" onClick={back} disabled={pos === 0}>‹ Back</button>
          <button className="next" onClick={next} disabled={pos >= n}>Done · Next ›</button>
        </div>
      </div>
      {jump && <Sheet title="Go to step" onClose={() => setJump(false)}>
        <form className="jump" onSubmit={(e) => { e.preventDefault(); const v = parseInt(jumpVal); if (!isNaN(v)) setPos(Math.max(0, Math.min(n, v - 1))); setJump(false); }}>
          <input autoFocus inputMode="numeric" placeholder={`1 – ${n}`} value={jumpVal} onChange={(e) => setJumpVal(e.target.value)} />
          <button className="primary" type="submit">Go</button>
        </form>
        <div className="list">
          <button onClick={() => { setPos(0); setJump(false); }}><b>Restart from step 1</b><span>keeps the plan, resets progress</span></button>
        </div>
      </Sheet>}
    </div>
  );
}
