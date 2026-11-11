import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { OpeningNode, Repertoire } from "@gm/core";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { Board } from "../chess/Board";

export function Openings() {
  const tr = useT();
  const { lang } = useApp();
  const reps = useData<Repertoire[]>("/training/openings");
  const perf = useData<any>("/analytics/performance?window=all");
  const [repId, setRepId] = useState("london");
  const [path, setPath] = useState<string[]>([]);
  const [drill, setDrill] = useState(false);
  const [fb, setFb] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<any>(null);
  const rep = reps.data?.find((r) => r.id === repId);
  const { node, children, fen, last } = useMemo(() => {
    const c = new Chess();
    let nodes: OpeningNode[] = rep?.tree ?? [];
    let node: OpeningNode | null = null;
    let last: [string, string] | null = null;
    for (const s of path) { node = nodes.find((n) => n.san === s) ?? null; if (!node) break; const m = c.move(s); last = [m.from, m.to]; nodes = node.children ?? []; }
    return { node, children: nodes, fen: c.fen(), last };
  }, [rep, path]);
  if (!rep) return <p className="muted">…</p>;
  const userTurn = (path.length % 2 === 0 ? "w" : "b") === rep.side;
  const lineKey = `${rep.id}:${path.join(" ")}`;

  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    const c = new Chess(fen);
    let mv; try { mv = c.move(m); } catch { return false; }
    const hit = children.find((n) => n.san === mv.san);
    if (drill && userTurn) {
      void api("/training/attempt", { body: { itemType: "opening_line", itemId: lineKey, domain: "openings", correct: !!hit, details: { played: mv.san, expected: children.map((n) => n.san) } } }).catch(() => undefined);
      if (!hit) { setFb(tr(`No es tu repertorio. Esperado: ${children.map((n) => n.san).join(" / ")}`, `Not your repertoire. Expected: ${children.map((n) => n.san).join(" / ")}`)); return false; }
      setFb(hit.idea ? hit.idea[lang] : "✓");
      const next = [...path, mv.san];
      const nodeAfter = hit.children ?? [];
      if (nodeAfter.length) { const reply = nodeAfter[Math.floor(Math.random() * nodeAfter.length)]; setTimeout(() => setPath([...next, reply.san]), 350); setPath(next); }
      else { setPath(next); setFb(tr("Fin de la línea preparada. ¡Bien!", "End of prepared line. Well done!")); }
      return true;
    }
    if (hit) { setPath([...path, mv.san]); setFb(null); return true; }
    setFb(tr("Esa jugada no está en el repertorio (puedes explorarla en el tablero de análisis).", "That move isn't in the repertoire (explore it on the analysis board)."));
    return false;
  };
  const startDrill = () => {
    setDrill(true); setFb(null);
    if (rep.side === "b") { const first = rep.tree[Math.floor(Math.random() * rep.tree.length)]; setPath([first.san]); } else setPath([]);
  };
  const loadExplorer = async () => { setExplorer({ loading: true }); try { setExplorer(await api(`/explorer?fen=${encodeURIComponent(fen)}`)); } catch (e) { setExplorer({ error: (e as Error).message }); } };
  const myStats = (perf.data?.openings ?? []).filter((o: any) => o.opening.startsWith(rep.side === "w" ? "♔" : "♚"));

  return (
    <div>
      <h1>{tr("Laboratorio de aperturas", "Opening laboratory")}</h1>
      <div className="chips" style={{ marginBottom: 10 }}>
        {(reps.data ?? []).map((r) => <button key={r.id} className={`chip ${repId === r.id ? "on" : ""}`} onClick={() => { setRepId(r.id); setPath([]); setDrill(false); setFb(null); }}>{r.side === "w" ? "♔" : "♚"} {r.name[lang]}</button>)}
      </div>
      <div className="split">
        <div>
          <div className="board-wrap"><Board fen={fen} orientation={rep.side} movable={drill ? (userTurn ? rep.side : "none") : "both"} onMove={onMove} lastMove={last} arrows={!drill ? children.slice(0, 4).map((n) => { const c = new Chess(fen); const m = c.move(n.san); return { from: m.from, to: m.to, color: "#c9a45c" }; }) : []} /></div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { setPath(path.slice(0, -1)); setFb(null); }} disabled={!path.length}>◀</button>
            <button className="btn sm" onClick={() => { setPath([]); setFb(null); }}>⏮</button>
            <button className={`btn sm ${drill ? "primary" : ""}`} onClick={() => (drill ? setDrill(false) : startDrill())}>{drill ? tr("Salir del drill", "Exit drill") : tr("Practicar (drill)", "Practice (drill)")}</button>
            <button className="btn sm" onClick={() => void loadExplorer()}>{tr("Explorador Lichess", "Lichess explorer")}</button>
          </div>
        </div>
        <div>
          <div className="card gold">
            <p className="muted" style={{ fontSize: ".8rem" }}>{path.length ? path.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(" ") : tr("Posición inicial", "Starting position")}</p>
            {node?.name && <b>{node.name}</b>}
            {node?.idea && <p style={{ color: "var(--text)" }}>{node.idea[lang]}</p>}
            {fb && <p className={fb.startsWith("✓") || fb.includes("Bien") || fb.includes("done") ? "ok" : "error"}>{fb}</p>}
            {!drill && children.length > 0 && (
              <div className="stack">
                <small className="muted">{tr("Continuaciones del repertorio", "Repertoire continuations")}:</small>
                {children.map((n) => <button key={n.san} className="btn sm" style={{ justifyContent: "flex-start", width: "100%", height: "auto", padding: 8, textAlign: "left" }} onClick={() => setPath([...path, n.san])}><b>{n.san}</b>&nbsp;{n.name ? <small className="muted">{n.name}</small> : null}{n.idea ? <small style={{ display: "block", color: "var(--text-2)" }}>{n.idea[lang]}</small> : null}</button>)}
              </div>
            )}
            {!children.length && <p className="muted">{tr("Fin de la línea: ahora importan los planes de medio juego.", "End of line: middlegame plans matter now.")}</p>}
          </div>
          {explorer && (
            <div className="card">
              <h3>{tr("Explorador (Lichess)", "Explorer (Lichess)")}</h3>
              {explorer.loading && <p className="muted">…</p>}
              {explorer.error && <p className="error">{explorer.error}</p>}
              {explorer.moves && <table><thead><tr><th>{tr("Jugada", "Move")}</th><th>{tr("Partidas", "Games")}</th><th>W/D/L %</th></tr></thead><tbody>{explorer.moves.slice(0, 8).map((m: any) => { const t = m.white + m.draws + m.black || 1; return <tr key={m.uci}><td>{m.san}</td><td>{t}</td><td>{Math.round((m.white / t) * 100)}/{Math.round((m.draws / t) * 100)}/{Math.round((m.black / t) * 100)}</td></tr>; })}</tbody></table>}
              {explorer.opening && <small className="muted">{explorer.opening.eco} {explorer.opening.name}</small>}
            </div>
          )}
          <div className="card">
            <h3>{tr("Principios", "Principles")}</h3><ul>{rep.principles.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
            <h3>{tr("Estructuras", "Structures")}</h3><ul>{rep.structures.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
            <h3>{tr("Planes", "Plans")}</h3><ul>{rep.plans.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
            <h3>{tr("Errores típicos", "Typical mistakes")}</h3><ul>{rep.typicalMistakes.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
          </div>
          <div className="card">
            <h3>{tr("Tu rendimiento real", "Your real performance")}</h3>
            {myStats.length ? <table><thead><tr><th>{tr("Línea", "Line")}</th><th>N</th><th>W/D/L %</th><th>{tr("Tus desviaciones", "Your deviations")}</th></tr></thead><tbody>
              {myStats.map((o: any) => <tr key={o.opening}><td>{o.opening.slice(2)}</td><td>{o.games}</td><td>{o.winPct}/{o.drawPct}/{o.lossPct}</td><td>{Object.entries(o.userDeviations).map(([k, v]) => `${k}×${v}`).join(", ") || "—"}</td></tr>)}
            </tbody></table> : <p>{tr("Analiza partidas para ver estadísticas por línea.", "Analyse games to see per-line statistics.")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
