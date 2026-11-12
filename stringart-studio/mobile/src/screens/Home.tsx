import React, { useEffect, useRef, useState } from "react";
import { defaultSettings } from "../engine/types";
import { importSequenceJSON } from "../engine/exporters";
import { loadPhoto, thumbnail, toBlob, toStored } from "../framing";
import { deleteProject, listProjects, newId, Project, saveProject } from "../store";

export default function Home({ onOpen }: { onOpen: (p: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const seq = useRef<HTMLInputElement>(null);
  const refresh = () => listProjects().then(setProjects).catch((e) => setError(String(e)));
  useEffect(() => { refresh(); }, []);

  const fromPhoto = async (f: File) => {
    setBusy(true); setError(null);
    try {
      const c = await loadPhoto(f, 1600);
      const blob = await toStored(await toBlob(c));
      const thumb = await thumbnail((ctx, s) => { const k = Math.min(c.width, c.height); ctx.drawImage(c, (c.width - k) / 2, (c.height - k) / 2, k, k, 0, 0, s, s); });
      const name = (f.name || "Photo").replace(/\.[^.]+$/, "").replace(/^IMG_/, "Photo ");
      const p: Project = { id: newId(), name, created: Date.now(), updated: Date.now(), settings: defaultSettings(), image: blob, thumb, result: null, buildStep: 0 };
      await saveProject(p);
      onOpen(p);
    } catch (e: any) { setError("Could not open that photo: " + (e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const fromSequence = async (f: File) => {
    try {
      const r = importSequenceJSON(await f.text());
      const s = defaultSettings();
      s.board = { ...s.board, ...r.board };
      const p: Project = { id: newId(), name: f.name.replace(/\.(stringart\.)?json$/, ""), created: Date.now(), updated: Date.now(),
        settings: s, image: null, thumb: "", result: r, buildStep: 0 };
      await saveProject(p);
      onOpen(p);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="screen home">
      <header className="home-head">
        <svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16 2 L27 23 L5 23 Z M3 12 L29 12 M8 27 L24 5" stroke="currentColor" strokeWidth="0.8" fill="none" /></svg>
        <div><h1>StringArt <span>Studio</span></h1><p>Photo → nails, thread & step-by-step build</p></div>
      </header>
      <button className="primary big new" disabled={busy} onClick={() => photo.current?.click()}>{busy ? "Opening…" : "＋ New from photo"}</button>
      <input ref={photo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); }} />
      {error && <div className="error">{error}</div>}
      <div className="projects">
        {projects.length === 0 && <div className="empty">
          <p>Your projects stay on this iPhone.</p>
          <ol><li>Pick a photo and frame it</li><li>Choose board, nails and thread</li><li>Generate (on-device)</li><li>Build step by step with big numbers and voice</li></ol>
        </div>}
        {projects.map((p) => (
          <div key={p.id} className="card" onClick={() => onOpen(p)}>
            {p.thumb ? <img src={p.thumb} /> : <div className="noimg">◎</div>}
            <div className="card-body">
              <b>{p.name}</b>
              <span>{p.result ? `${p.result.stats.connections.toLocaleString()} connections · ${p.settings.board.nails} nails` : "Not generated yet"}</span>
              {p.result && <div className="mini-progress"><div style={{ width: `${(100 * p.buildStep) / Math.max(1, p.result.stats.connections)}%` }} /></div>}
              {p.result && <span className="dim">{p.buildStep ? `Built ${p.buildStep.toLocaleString()} / ${p.result.stats.connections.toLocaleString()}` : "Not started"}</span>}
            </div>
            <button className="link danger" onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete “${p.name}”?`)) { await deleteProject(p.id); refresh(); } }}>✕</button>
          </div>
        ))}
      </div>
      <button className="link import" onClick={() => seq.current?.click()}>Import a sequence file (.json) from the desktop app</button>
      <input ref={seq} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromSequence(f); }} />
    </div>
  );
}
