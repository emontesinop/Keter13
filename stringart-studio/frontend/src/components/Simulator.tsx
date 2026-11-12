import React, { useEffect, useMemo, useRef, useState } from "react";
import { Result, Step } from "../api";
import BoardCanvas, { CompactStep } from "./BoardCanvas";

export default function Simulator({ result, steps, pos, setPos, numbers }: {
  result: Result; steps: Step[]; pos: number; setPos: (n: number | ((p: number) => number)) => void;
  numbers: "auto" | "all" | "none";
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2.0); // log10 steps / second
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [jump, setJump] = useState("");
  const raf = useRef<number>();
  const acc = useRef(0);
  const n = steps.length;
  const compact = useMemo<CompactStep[]>(() => steps.map((s) => [s.layer, s.from - 1, s.to - 1]), [steps]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      acc.current += dt * Math.pow(10, speed);
      const k = Math.floor(acc.current);
      if (k > 0) {
        acc.current -= k;
        setPos((p) => { const q = Math.min(n, p + k); if (q >= n) setPlaying(false); return q; });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current!);
  }, [playing, speed, n, setPos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") { e.preventDefault(); setPlaying((v) => !v); }
      if (e.key === "ArrowRight") setPos((p) => Math.min(n, p + 1));
      if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, setPos]);

  const cur = pos > 0 ? steps[pos - 1] : null;
  const nxt = pos < n ? steps[pos] : null;
  const current = cur ? { from: cur.from - 1, to: cur.to - 1, next: nxt && nxt.from === cur.to ? nxt.to - 1 : null } : null;
  const sps = Math.pow(10, speed);
  return (
    <div className="sim">
      <div className="sim-board">
        <BoardCanvas nails={result.nails} width_mm={result.board.width_mm} height_mm={result.board.height_mm}
          shape={result.board.shape} background={result.background} colors={result.layers.map((l) => l.color)}
          steps={compact} upto={pos} thread_mm={result.thread_mm} opacity={result.opacity} numbers={numbers}
          current={current} hiddenLayers={hidden} />
        <div className="sim-hud">
          {cur ? (
            <>
              <div className="hud-step">Step <b>{pos.toLocaleString()}</b> / {n.toLocaleString()}</div>
              <div className="hud-move">
                <span className="nail from">{cur.from}</span><span className="arrow">→</span>
                <span className="nail to">{cur.to}</span>
                {nxt && <><span className="arrow dim">→</span><span className="nail next">{nxt.to}</span></>}
              </div>
              <div className="hud-meta"><i style={{ background: cur.color }} /> {cur.color_name} · section {cur.section}
                {cur.bridge && <span className="tag">bridge</span>}</div>
              {nxt && nxt.from !== cur.to && <div className="hud-warn">Next: cut & start new section at nail {nxt.from}</div>}
            </>
          ) : <div className="hud-step">Empty board · press play or →</div>}
        </div>
      </div>
      <div className="sim-controls">
        <div className="btn-row">
          <button title="Restart" onClick={() => { setPos(0); setPlaying(true); }}>⟲</button>
          <button title="Step back (←)" onClick={() => setPos((p) => Math.max(0, p - 1))}>◂</button>
          <button className="primary play" title="Play / pause (space)" onClick={() => { if (pos >= n) setPos(0); setPlaying(!playing); }}>
            {playing ? "❚❚ Pause" : "▶ Play"}</button>
          <button title="Step forward (→)" onClick={() => setPos((p) => Math.min(n, p + 1))}>▸</button>
          <button title="Stop" onClick={() => { setPlaying(false); setPos(0); }}>■</button>
          <button title="Show final" onClick={() => { setPlaying(false); setPos(n); }}>⏭</button>
          <div className="speed">
            <span>Speed</span>
            <input type="range" min={-0.3} max={3.5} step={0.05} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
            <span className="mono">{sps < 10 ? sps.toFixed(1) : Math.round(sps)} steps/s</span>
          </div>
          <form className="jump" onSubmit={(e) => { e.preventDefault(); const v = parseInt(jump); if (!isNaN(v)) setPos(Math.max(0, Math.min(n, v))); }}>
            <input placeholder="Go to step" value={jump} onChange={(e) => setJump(e.target.value)} />
          </form>
        </div>
        <input className="timeline" type="range" min={0} max={n} value={pos} onChange={(e) => { setPlaying(false); setPos(parseInt(e.target.value)); }} />
        <div className="sim-counters">
          <span>Completed <b>{pos.toLocaleString()}</b></span>
          <span>Remaining <b>{(n - pos).toLocaleString()}</b></span>
          <span>Progress <b>{n ? ((100 * pos) / n).toFixed(1) : 0}%</b></span>
          {result.layers.length > 1 && (
            <span className="layers">
              {result.layers.map((L, i) => (
                <label key={i} className="layer-chip">
                  <input type="checkbox" checked={!hidden.has(i)} onChange={() => {
                    const h = new Set(hidden); h.has(i) ? h.delete(i) : h.add(i); setHidden(h);
                  }} />
                  <i style={{ background: L.color }} />{L.name}
                </label>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
