import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { PAWN_STRUCTURES, OPENING_PRINCIPLES, buildIdeaQuestion, lineFen, type OpeningNode, type Repertoire, type StructureCard } from "@gm/core";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { Board } from "../chess/Board";

type Tab = "understand" | "tree" | "structures" | "drill";
const GROUPS: [Repertoire["group"], string, string][] = [["white", "Blancas", "White"], ["black_e4", "Negras vs 1.e4", "Black vs 1.e4"], ["black_d4", "Negras vs 1.d4 / 1.c4", "Black vs 1.d4 / 1.c4"]];

export function Openings() {
  const tr = useT();
  const { lang, me, refresh } = useApp();
  const reps = useData<Repertoire[]>("/training/openings");
  const perf = useData<any>("/analytics/performance?window=all");
  const mine: string[] = me?.profile?.repertoire_ids ?? ["london", "caro-kann"];
  const [repId, setRepId] = useState(mine[0] ?? "london");
  const [tab, setTab] = useState<Tab>("understand");
  const rep = reps.data?.find((r) => r.id === repId);
  const toggleMine = async () => {
    const next = mine.includes(repId) ? mine.filter((x) => x !== repId) : [...mine, repId];
    await api("/profile", { method: "PUT", body: { repertoire_ids: next } });
    await refresh();
  };
  if (!reps.data || !rep) return <p className="muted">…</p>;
  const myStats = (perf.data?.openings ?? []).filter((o: any) => o.opening.startsWith(rep.side === "w" ? "♔" : "♚"));
  return (
    <div>
      <h1>{tr("Laboratorio de aperturas", "Opening laboratory")}</h1>
      <p>{tr("Entender antes que memorizar: cada jugada tiene una idea, cada apertura lleva a una estructura, y cada estructura tiene planes y rupturas. Si sabes eso, sabes qué hacer cuando el rival se sale de la teoría.", "Understand before memorising: every move has an idea, every opening leads to a structure, and every structure has plans and breaks. Know that, and you know what to do when your opponent leaves theory.")}</p>
      {GROUPS.map(([g, es, en]) => (
        <div key={g} style={{ marginBottom: 6 }}>
          <small className="muted">{lang === "es" ? es : en}</small>
          <div className="chips">
            {reps.data!.filter((r) => r.group === g).map((r) => (
              <button key={r.id} className={`chip ${repId === r.id ? "on" : ""}`} onClick={() => setRepId(r.id)}>
                {mine.includes(r.id) ? "★ " : ""}{r.name[lang].replace(/\s*\(.*\)$/, "")}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="card gold" style={{ marginTop: 8 }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{rep.name[lang]}</h2>
          <button className={`btn sm ${mine.includes(rep.id) ? "" : "primary"}`} onClick={() => void toggleMine()}>{mine.includes(rep.id) ? tr("★ En mi repertorio — quitar", "★ In my repertoire — remove") : tr("☆ Añadir a mi repertorio", "☆ Add to my repertoire")}</button>
        </div>
        <p style={{ color: "var(--text)" }}>{rep.summary[lang]}</p>
        <div className="row"><span className="badge">{rep.style[lang]}</span><span className={`badge ${rep.theoryLoad === 1 ? "good" : rep.theoryLoad === 2 ? "info" : "warn"}`}>{tr("Carga teórica", "Theory load")}: {["", tr("baja", "low"), tr("media", "medium"), tr("alta", "high")][rep.theoryLoad]}</span></div>
      </div>
      <div className="chips" style={{ margin: "8px 0 12px" }}>
        {([["understand", tr("Entender", "Understand")], ["tree", tr("Árbol", "Tree")], ["structures", tr("Estructuras", "Structures")], ["drill", tr("Practicar", "Practise")]] as [Tab, string][]).map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "understand" && <Understand rep={rep} reps={reps.data} />}
      {tab === "tree" && <TreeView rep={rep} drill={false} />}
      {tab === "drill" && <TreeView rep={rep} drill />}
      {tab === "structures" && <Structures ids={rep.structureIds} />}
      <details className="card">
        <summary style={{ cursor: "pointer" }}><b>{tr("Principios universales de apertura", "Universal opening principles")}</b></summary>
        <ul className="list">{OPENING_PRINCIPLES.map((p, i) => <li key={i}><b>{p.title[lang]}</b><p style={{ margin: "2px 0 0" }}>{p.why[lang]}</p></li>)}</ul>
      </details>
      <div className="card">
        <h3>{tr("Tu rendimiento real", "Your real performance")} ({rep.side === "w" ? tr("blancas", "White") : tr("negras", "Black")})</h3>
        {myStats.length ? <table><thead><tr><th>{tr("Línea", "Line")}</th><th>N</th><th>V/T/D %</th><th>{tr("Tus desviaciones", "Your deviations")}</th></tr></thead><tbody>
          {myStats.map((o: any) => <tr key={o.opening}><td>{o.opening.slice(2)}</td><td>{o.games}</td><td>{o.winPct}/{o.drawPct}/{o.lossPct}</td><td>{Object.entries(o.userDeviations).map(([k, v]) => `${k}×${v}`).join(", ") || "—"}</td></tr>)}
        </tbody></table> : <p>{tr("Analiza partidas para ver estadísticas por línea.", "Analyse games to see per-line statistics.")}</p>}
      </div>
    </div>
  );
}

/** Ideas, plans, mistakes + "why this move?" quiz. */
function Understand({ rep, reps }: { rep: Repertoire; reps: Repertoire[] }) {
  const tr = useT();
  const { lang } = useApp();
  const [q, setQ] = useState(() => buildIdeaQuestion(reps, rep.id));
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  useEffect(() => { setQ(buildIdeaQuestion(reps, rep.id)); setPicked(null); setScore({ ok: 0, n: 0 }); }, [rep.id]);
  const arrow = useMemo(() => { if (!q) return []; const m = new Chess(q.fen).move(q.san); return [{ from: m.from, to: m.to, color: "#c9a45c" }]; }, [q]);
  const answer = (i: number) => {
    if (!q || picked !== null) return;
    setPicked(i);
    const ok = i === q.answerIndex;
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
    void api("/training/attempt", { body: { itemType: "opening_idea", itemId: `${rep.id}:${q.path.join(" ")}`, domain: "openings", correct: ok, summary: `${tr("Aperturas", "Openings")} (${rep.name[lang]}): ${tr("idea de", "idea of")} ${q.san} ${ok ? "✓" : "✗"}` } }).catch(() => undefined);
  };
  return (
    <div className="split">
      <div>
        {q && <div className="board-wrap"><Board fen={q.fen} orientation={rep.side} movable="none" arrows={arrow} /></div>}
      </div>
      <div>
        {q ? (
          <div className="card">
            <h3>{tr("¿Por qué esta jugada?", "Why this move?")} <small className="muted">{score.ok}/{score.n}</small></h3>
            <p className="muted" style={{ fontSize: ".8rem" }}>{q.path.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(" ")}</p>
            <p style={{ color: "var(--text)" }}>{tr("¿Cuál es la idea de", "What's the idea of")} <b>{q.san}</b>?</p>
            <div className="stack">
              {q.options.map((o, i) => (
                <button key={i} className="btn" style={{ width: "100%", height: "auto", padding: 10, justifyContent: "flex-start", textAlign: "left", borderColor: picked === null ? undefined : i === q.answerIndex ? "var(--good)" : i === picked ? "var(--bad)" : undefined }} onClick={() => answer(i)}>{o[lang]}</button>
              ))}
            </div>
            {picked !== null && <button className="btn primary" style={{ marginTop: 10 }} onClick={() => { setQ(buildIdeaQuestion(reps, rep.id)); setPicked(null); }}>{tr("Siguiente", "Next")}</button>}
          </div>
        ) : null}
        <div className="card">
          <h3>{tr("Principios de esta apertura", "Principles of this opening")}</h3><ul>{rep.principles.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
          <h3>{tr("Planes", "Plans")}</h3><ul>{rep.plans.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
          <h3>{tr("Errores típicos", "Typical mistakes")}</h3><ul>{rep.typicalMistakes.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function Structures({ ids }: { ids: string[] }) {
  const cards = PAWN_STRUCTURES.filter((s) => ids.includes(s.id));
  return <div>{cards.map((s) => <StructureView key={s.id} s={s} />)}</div>;
}

function StructureView({ s }: { s: StructureCard }) {
  const tr = useT();
  const { lang } = useApp();
  const quizFen = s.quiz ? lineFen(s.quiz.line) : null;
  const fen = quizFen ?? (s.exampleLine ? lineFen(s.exampleLine) : null);
  const [fb, setFb] = useState<{ ok: boolean; san: string } | null>(null);
  const side = fen ? (fen.split(" ")[1] as "w" | "b") : "w";
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    if (!s.quiz || fb) return false;
    let san: string; try { san = new Chess(quizFen!).move(m).san; } catch { return false; }
    const ok = s.quiz.answers.includes(san.replace(/[+#]/g, ""));
    setFb({ ok, san });
    void api("/training/attempt", { body: { itemType: "structure_quiz", itemId: s.id, domain: "openings", correct: ok, summary: `${tr("Estructura", "Structure")}: ${s.name[lang]} ${ok ? "✓" : "✗"}` } }).catch(() => undefined);
    return false;
  };
  return (
    <div className="card">
      <h2>{s.name[lang]}</h2>
      <p style={{ color: "var(--text)" }}>{s.description[lang]}</p>
      <div className="split">
        {fen && (
          <div>
            <div className="board-wrap" style={{ maxWidth: 380 }}><Board fen={fen} orientation={side} movable={s.quiz && !fb ? side : "none"} onMove={onMove} /></div>
            {s.quiz && (
              <div style={{ marginTop: 8 }}>
                <p style={{ color: "var(--gold-2)" }}><b>{s.quiz.prompt[lang]}</b></p>
                {fb && <p className={fb.ok ? "ok" : "error"}>{fb.ok ? "✓" : `✗ ${fb.san} — `}{s.quiz.explanation[lang]}</p>}
                {fb && <button className="btn sm" onClick={() => setFb(null)}>{tr("Repetir", "Retry")}</button>}
              </div>
            )}
          </div>
        )}
        <div>
          <h3>{tr("Plan de las blancas", "White's plan")}</h3><ul>{s.plans.white.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
          <h3>{tr("Plan de las negras", "Black's plan")}</h3><ul>{s.plans.black.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
          <h3>{tr("Piezas", "Pieces")}</h3><p>{s.pieces[lang]}</p>
          <h3>{tr("Final", "Endgame")}</h3><p>{s.endgame[lang]}</p>
          <h3>{tr("Errores típicos", "Typical mistakes")}</h3><ul>{s.mistakes.map((p, i) => <li key={i}>{p[lang]}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

/** Tree explorer, or drill mode (you play your side, the app answers with book moves). */
function TreeView({ rep, drill }: { rep: Repertoire; drill: boolean }) {
  const tr = useT();
  const { lang } = useApp();
  const [path, setPath] = useState<string[]>([]);
  const [fb, setFb] = useState<{ ok: boolean; text: string } | null>(null);
  const [explorer, setExplorer] = useState<any>(null);
  const reset = () => {
    setFb(null); setExplorer(null);
    if (drill && rep.side === "b") { const first = rep.tree[Math.floor(Math.random() * rep.tree.length)]; setPath([first.san]); } else setPath([]);
  };
  useEffect(reset, [rep.id, drill]);
  const { node, children, fen, last } = useMemo(() => {
    const c = new Chess();
    let nodes: OpeningNode[] = rep.tree, node: OpeningNode | null = null, last: [string, string] | null = null;
    for (const s of path) { node = nodes.find((n) => n.san === s) ?? null; if (!node) break; const m = c.move(s); last = [m.from, m.to]; nodes = node.children ?? []; }
    return { node, children: nodes, fen: c.fen(), last };
  }, [rep, path]);
  const userTurn = (path.length % 2 === 0 ? "w" : "b") === rep.side;
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    let mv; try { mv = new Chess(fen).move(m); } catch { return false; }
    const hit = children.find((n) => n.san === mv.san);
    if (drill && userTurn) {
      void api("/training/attempt", { body: { itemType: "opening_line", itemId: `${rep.id}:${path.join(" ")}`, domain: "openings", correct: !!hit, details: { played: mv.san, expected: children.map((n) => n.san) } } }).catch(() => undefined);
      if (!hit) { setFb({ ok: false, text: tr(`Esa no es la jugada del repertorio. Esperado: ${children.map((n) => n.san).join(" / ")}.${children[0]?.idea ? " Idea: " + children[0].idea[lang] : ""}`, `Not the repertoire move. Expected: ${children.map((n) => n.san).join(" / ")}.${children[0]?.idea ? " Idea: " + children[0].idea[lang] : ""}`) }); return false; }
      setFb({ ok: true, text: hit.idea ? hit.idea[lang] : "✓" });
      const next = [...path, mv.san];
      const replies = hit.children ?? [];
      setPath(next);
      if (replies.length) setTimeout(() => setPath([...next, replies[Math.floor(Math.random() * replies.length)].san]), 450);
      else setFb({ ok: true, text: tr("Fin de la línea preparada. Ahora piensa: ¿cuál es tu plan en esta estructura?", "End of the prepared line. Now think: what's your plan in this structure?") });
      return true;
    }
    if (hit) { setPath([...path, mv.san]); setFb(null); return true; }
    setFb({ ok: false, text: tr("No está en el árbol. Aplica los principios o explórala en el tablero de análisis.", "Not in the tree. Apply the principles or explore it on the analysis board.") });
    return false;
  };
  const loadExplorer = async () => { setExplorer({ loading: true }); try { setExplorer(await api(`/explorer?fen=${encodeURIComponent(fen)}`)); } catch (e) { setExplorer({ error: (e as Error).message }); } };
  return (
    <div className="split">
      <div>
        <div className="board-wrap"><Board fen={fen} orientation={rep.side} movable={drill ? (userTurn ? rep.side : "none") : "both"} onMove={onMove} lastMove={last}
          arrows={!drill ? children.slice(0, 4).map((n) => { const m = new Chess(fen).move(n.san); return { from: m.from, to: m.to, color: "#c9a45c" }; }) : []} /></div>
        <div className="row" style={{ marginTop: 8 }}>
          {!drill && <button className="btn sm" onClick={() => { setPath(path.slice(0, -1)); setFb(null); }} disabled={!path.length}>◀</button>}
          <button className="btn sm" onClick={reset}>⏮ {drill ? tr("Nueva línea", "New line") : ""}</button>
          {!drill && <button className="btn sm" onClick={() => void loadExplorer()}>{tr("Explorador Lichess", "Lichess explorer")}</button>}
        </div>
      </div>
      <div>
        <div className="card gold">
          <p className="muted" style={{ fontSize: ".8rem" }}>{path.length ? path.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(" ") : tr("Posición inicial", "Starting position")}</p>
          {node?.name && <b>{node.name}</b>}
          {!drill && node?.idea && <p style={{ color: "var(--text)" }}>{node.idea[lang]}</p>}
          {drill && <p className="muted">{userTurn ? tr("Tu turno: juega la jugada de tu repertorio y piensa en su idea.", "Your turn: play your repertoire move and think about its idea.") : "…"}</p>}
          {fb && <p className={fb.ok ? "ok" : "error"}>{fb.text}</p>}
          {!drill && children.length > 0 && (
            <div className="stack">
              {children.map((n) => <button key={n.san} className="btn sm" style={{ justifyContent: "flex-start", width: "100%", height: "auto", padding: 8, textAlign: "left", display: "block" }} onClick={() => setPath([...path, n.san])}><b>{n.san}</b> {n.name ? <small className="muted">{n.name}</small> : null}{n.idea ? <small style={{ display: "block", color: "var(--text-2)" }}>{n.idea[lang]}</small> : null}</button>)}
            </div>
          )}
          {!drill && !children.length && <p className="muted">{tr("Fin de la línea: ahora mandan los planes de la estructura (pestaña Estructuras).", "End of line: now the structure's plans take over (Structures tab).")}</p>}
        </div>
        {explorer && (
          <div className="card">
            <h3>{tr("Explorador (Lichess)", "Explorer (Lichess)")}</h3>
            {explorer.loading && <p className="muted">…</p>}
            {explorer.error && <p className="error">{explorer.error}</p>}
            {explorer.moves && <table><thead><tr><th>{tr("Jugada", "Move")}</th><th>{tr("Partidas", "Games")}</th><th>W/D/L %</th></tr></thead><tbody>{explorer.moves.slice(0, 8).map((m: any) => { const t = m.white + m.draws + m.black || 1; return <tr key={m.uci}><td>{m.san}</td><td>{t}</td><td>{Math.round((m.white / t) * 100)}/{Math.round((m.draws / t) * 100)}/{Math.round((m.black / t) * 100)}</td></tr>; })}</tbody></table>}
          </div>
        )}
      </div>
    </div>
  );
}
