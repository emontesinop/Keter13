import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { parsePgn } from "@gm/core";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { Board, EvalBar } from "../chess/Board";
import { GameTree } from "../chess/tree";
import { MoveTree } from "../components/MoveTree";
import { LineChart } from "../components/LineChart";
import { useEngine } from "../chess/useEngine";
import { EngineLines, arrowsFromLines } from "../components/EngineLines";

export function Games() {
  const tr = useT();
  const [offset, setOffset] = useState(0);
  const list = useData<any>(`/games?limit=30&offset=${offset}`, [offset]);
  const [pgn, setPgn] = useState("");
  const [color, setColor] = useState<"" | "w" | "b">("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const busy = list.data?.games?.some((g: any) => g.job_status === "queued" || g.job_status === "running");
    if (!busy) return;
    const t = setInterval(() => list.reload(), 3000);
    return () => clearInterval(t);
  }, [list.data]);
  const upload = async (text: string) => {
    setMsg(null);
    try {
      const r = await api("/games/upload", { body: { pgn: text, userColor: color || undefined, analyze: true } });
      setMsg(tr(`Importadas ${r.imported}, duplicadas ${r.duplicates}${r.errors.length ? `, errores ${r.errors.length}` : ""}. Las primeras se están analizando.`, `Imported ${r.imported}, duplicates ${r.duplicates}${r.errors.length ? `, errors ${r.errors.length}` : ""}. The first ones are being analysed.`));
      setPgn(""); list.reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  const analyse = async (id: string) => { await api(`/games/${id}/analyze`, { body: {} }); list.reload(); };
  const setCol = async (id: string, c: "w" | "b") => { await api(`/games/${id}`, { method: "PATCH", body: { userColor: c } }); list.reload(); };
  return (
    <div>
      <div className="row between"><h1>{tr("Análisis de partidas", "Game analysis")}</h1><Link className="btn sm" to="/board">⊞ {tr("Tablero libre", "Free board")}</Link></div>
      <details className="card">
        <summary style={{ cursor: "pointer" }}><b>{tr("Subir PGN", "Upload PGN")}</b></summary>
        <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="[Event ...]\n\n1. e4 c6 2. d4 d5 ..." />
        <div className="row" style={{ marginTop: 8 }}>
          <select value={color} onChange={(e) => setColor(e.target.value as any)} style={{ width: "auto" }}>
            <option value="">{tr("Detectar mi color (por usuario)", "Detect my colour (by username)")}</option>
            <option value="w">{tr("Yo jugué con blancas", "I played White")}</option>
            <option value="b">{tr("Yo jugué con negras", "I played Black")}</option>
          </select>
          <button className="btn primary sm" disabled={!pgn.trim()} onClick={() => void upload(pgn)}>{tr("Importar", "Import")}</button>
          <label className="btn sm" style={{ margin: 0 }}>{tr("Archivo .pgn", ".pgn file")}<input type="file" accept=".pgn,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await upload(await f.text()); }} /></label>
        </div>
        {msg && <p className="ok">{msg}</p>}
      </details>
      {list.error && <p className="error">{list.error}</p>}
      <div className="card">
        <ul className="list">
          {(list.data?.games ?? []).map((g: any) => (
            <li key={g.id}>
              <div className="row between" style={{ flexWrap: "nowrap" }}>
                <Link to={`/games/${g.id}`} style={{ color: "var(--text)", minWidth: 0 }}>
                  <b>{g.white ?? "?"}</b> {g.white_elo ? `(${g.white_elo})` : ""} – <b>{g.black ?? "?"}</b> {g.black_elo ? `(${g.black_elo})` : ""}
                  <div className="muted" style={{ fontSize: ".78rem" }}>{g.played_at ? new Date(g.played_at).toLocaleDateString() : ""} · {g.platform} · {g.time_class ?? ""} · {g.opening ?? g.eco ?? ""}</div>
                </Link>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  {g.user_result && <span className={`badge ${g.user_result === "win" ? "good" : g.user_result === "loss" ? "bad" : ""}`}>{g.user_result === "win" ? tr("V", "W") : g.user_result === "loss" ? tr("D", "L") : "½"}</span>}
                  {g.accuracy !== null && g.accuracy !== undefined ? <span className="badge info">{Math.round(g.accuracy)}%</span>
                    : g.job_status === "queued" || g.job_status === "running" ? <span className="badge warn">{Math.round((g.job_progress ?? 0) * 100)}%</span>
                    : !g.user_color ? (<><button className="btn sm" onClick={() => void setCol(g.id, "w")}>♔</button><button className="btn sm" onClick={() => void setCol(g.id, "b")}>♚</button></>)
                    : <button className="btn sm" onClick={() => void analyse(g.id)}>{tr("Analizar", "Analyse")}</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {!list.data?.games?.length && <p>{tr("No hay partidas. Conecta tus cuentas en Ajustes o sube un PGN.", "No games. Connect accounts in Settings or upload a PGN.")}</p>}
        <div className="row between" style={{ marginTop: 8 }}>
          <button className="btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>◀</button>
          <span className="muted">{offset + 1}–{Math.min(offset + 30, list.data?.total ?? 0)} / {list.data?.total ?? 0}</span>
          <button className="btn sm" disabled={offset + 30 >= (list.data?.total ?? 0)} onClick={() => setOffset(offset + 30)}>▶</button>
        </div>
      </div>
    </div>
  );
}

const CLS_SYMBOL: Record<string, string> = { blunder: "??", mistake: "?", inaccuracy: "?!", best: "★", excellent: "!", book: "📖", forced: "□" };

export function GameView() {
  const { id } = useParams();
  const tr = useT();
  const { lang } = useApp();
  const nav = useNavigate();
  const g = useData<any>(`/games/${id}`);
  const [cur, setCur] = useState(0);
  const [live, setLive] = useState(false);
  const report = g.data?.analysis?.report;
  const parsed = useMemo(() => (g.data ? parsePgn(g.data.game.pgn) : null), [g.data]);
  const tree = useMemo(() => (parsed ? GameTree.fromPgnMoves(parsed.moves.map((m) => m.san), parsed.startFen) : null), [parsed]);
  const [, force] = useState(0);
  useEffect(() => { if (tree) setCur(tree.root); }, [tree]);
  useEffect(() => {
    const busy = g.data?.job && ["queued", "running"].includes(g.data.job.status);
    if (!busy) return;
    const t = setInterval(() => g.reload(), 2500);
    return () => clearInterval(t);
  }, [g.data]);
  const node = tree?.get(cur);
  const { lines, depth } = useEngine(node?.fen ?? "", live && !!node, 3, 20);
  if (!g.data || !tree || !node) return <p className="muted">{g.error ?? "…"}</p>;
  const game = g.data.game;
  const ml = tree.mainline();
  const ply = tree.plyOf(cur);
  const onMain = ml[ply] === cur;
  const am = onMain && report ? report.moves[ply - 1] : null;
  const nextAm = onMain && report ? report.moves[ply] : null;
  const classes: Record<number, string> = {};
  if (report) report.moves.forEach((m: any, i: number) => { if (m.isUserMove && ["blunder", "mistake", "inaccuracy"].includes(m.classification)) classes[ml[i + 1]] = `cls-${m.classification}`; });
  const go = (i: number) => setCur(i);
  const evalNow = live && lines[0] ? (node.fen.split(" ")[1] === "w" ? lines[0].score : lines[0].score.mate !== undefined ? { mate: -lines[0].score.mate } : { cp: -(lines[0].score.cp ?? 0) })
    : am ? { cp: Math.max(-1000, Math.min(1000, am.evalAfter)) } : nextAm ? { cp: nextAm.evalBefore } : { cp: 0 };
  const arrows = live ? arrowsFromLines(lines) : nextAm && nextAm.isUserMove && nextAm.bestUci && nextAm.bestUci !== nextAm.uci && ["mistake", "blunder", "inaccuracy"].includes(nextAm.classification) ? [{ from: nextAm.bestUci.slice(0, 2), to: nextAm.bestUci.slice(2, 4), color: "#15781B" }] : [];
  const evalSeries = report ? report.moves.map((m: any) => ({ x: m.ply, y: Math.max(-800, Math.min(800, m.evalAfter)) / 100, label: `${m.moveNumber}${m.color === "w" ? "." : "…"}${m.san} ${(m.evalAfter / 100).toFixed(1)}` })) : [];
  const orientation = game.user_color ?? "w";
  return (
    <div>
      <button className="btn sm ghost" onClick={() => nav("/games")}>← {tr("Partidas", "Games")}</button>
      <h2 style={{ marginTop: 6 }}>{game.white} – {game.black} <span className="muted">{game.result}</span></h2>
      <div className="split">
        <div>
          <div className="board-row board-wrap">
            <EvalBar cp={evalNow.cp} mate={(evalNow as any).mate} orientation={orientation} />
            <Board fen={node.fen} orientation={orientation} movable="both" arrows={arrows as any}
              lastMove={node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : null}
              onMove={(m) => { const n = tree.play(cur, m); if (n === null) return false; setCur(n); force((x) => x + 1); }} />
          </div>
          <div className="navbtns">
            <button className="btn" onClick={() => go(tree.root)}>⏮</button>
            <button className="btn" onClick={() => node.parent !== null && go(node.parent)}>◀</button>
            <button className="btn" onClick={() => node.children[0] !== undefined && go(node.children[0])}>▶</button>
            <button className="btn" onClick={() => go(ml[ml.length - 1])}>⏭</button>
            <button className={`btn ${live ? "primary" : ""}`} onClick={() => setLive(!live)} title="Stockfish">SF</button>
          </div>
          {live && <div className="card" style={{ marginTop: 8 }}><EngineLines fen={node.fen} lines={lines} depth={depth} onPlay={(u) => { const n = tree.play(cur, { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); if (n !== null) { setCur(n); force((x) => x + 1); } }} /></div>}
          <div className="card" style={{ marginTop: 8 }}><MoveTree tree={tree} current={cur} onSelect={go} classes={classes} /></div>
          <div className="row">
            <Link className="btn sm" to={`/coach?fen=${encodeURIComponent(node.fen)}`}>♛ {tr("Preguntar al coach", "Ask the coach")}</Link>
            <Link className="btn sm" to={`/play?mode=self&fen=${encodeURIComponent(node.fen)}&side=${orientation}`}>{tr("Jugar desde aquí", "Play from here")}</Link>
          </div>
        </div>
        <div>
          {!report && (
            <div className="card">
              {g.data.job && ["queued", "running"].includes(g.data.job.status) ? (<><p>{tr("Analizando con Stockfish…", "Analysing with Stockfish…")}</p><div className="progress"><div style={{ width: `${(g.data.job.progress ?? 0) * 100}%` }} /></div></>)
                : <><p>{g.data.job?.error ?? tr("Partida sin analizar.", "Game not analysed yet.")}</p><button className="btn primary" disabled={!game.user_color} onClick={async () => { await api(`/games/${id}/analyze`, { body: {} }); g.reload(); }}>{tr("Analizar con Stockfish", "Analyse with Stockfish")}</button></>}
            </div>
          )}
          {am && am.explanation && (
            <div className="card gold">
              <b className={`cls-${am.classification}`}>{am.moveNumber}{am.color === "w" ? "." : "…"}{am.san} {CLS_SYMBOL[am.classification] ?? ""}</b>
              <p style={{ color: "var(--text)" }}>{am.explanation.headline}</p>
              {am.explanation.points.map((p: any, i: number) => <p key={i}>• {p.text}</p>)}
            </div>
          )}
          {am && !am.explanation && <div className="card"><b>{am.moveNumber}{am.color === "w" ? "." : "…"}{am.san}</b> <span className={`badge cls-${am.classification}`}>{am.classification}</span> <small className="muted">Δ {(am.winBefore - am.winAfter).toFixed(1)}%</small></div>}
          {report && (
            <>
              <div className="card">
                <h3>{tr("Valoración general", "Overall assessment")}</h3>
                <p style={{ color: "var(--text)" }}>{report.assessment}</p>
                <div className="grid stats">
                  <div className="stat"><div className="k">{tr("Precisión", "Accuracy")}</div><div className="v">{report.accuracy.user ?? "—"}%</div><div className="s">{tr("rival", "opp.")} {report.accuracy.opponent ?? "—"}%</div></div>
                  <div className="stat"><div className="k">ACPL</div><div className="v">{report.acpl.user ?? "—"}</div><div className="s">{tr("rival", "opp.")} {report.acpl.opponent ?? "—"}</div></div>
                  <div className="stat"><div className="k">?? / ? / ?!</div><div className="v">{report.counts.blunders}/{report.counts.mistakes}/{report.counts.inaccuracies}</div></div>
                  <div className="stat"><div className="k">{tr("Táctica / estrategia", "Tactical / strategic")}</div><div className="v" style={{ fontSize: "1.1rem" }}>{report.tacticalAccuracy ?? "—"}% / {report.strategicAccuracy ?? "—"}%</div></div>
                </div>
                <div style={{ marginTop: 10 }}><LineChart points={evalSeries} height={120} baseline={0} ariaLabel={tr("Evaluación por jugada", "Evaluation per move")} xFormat={(v) => `${Math.ceil(v / 2)}`} yFormat={(v) => v.toFixed(1)} /></div>
                <small className="muted">{report.disclaimer}</small>
              </div>
              <div className="card">
                <h3>{tr("Fases", "Phases")}</h3>
                <table><thead><tr><th></th><th>{tr("Jug.", "Moves")}</th><th>{tr("Prec.", "Acc.")}</th><th>ACPL</th><th>?? ? ?!</th></tr></thead><tbody>
                  {(["opening", "middlegame", "endgame"] as const).map((ph) => <tr key={ph}><td>{lang === "es" ? { opening: "Apertura", middlegame: "Medio juego", endgame: "Final" }[ph] : ph}</td><td>{report.phases[ph].moves}</td><td>{report.phases[ph].accuracy ?? "—"}</td><td>{report.phases[ph].acpl ?? "—"}</td><td>{report.phases[ph].blunders} {report.phases[ph].mistakes} {report.phases[ph].inaccuracies}</td></tr>)}
                </tbody></table>
                {report.repertoire && <p style={{ fontSize: ".85rem" }}>{tr("Repertorio", "Repertoire")}: {report.repertoire.lineName ?? "—"}{report.repertoire.deviation ? ` · ${tr("desviación en la jugada", "deviation at ply")} ${report.repertoire.deviation.ply} (${report.repertoire.deviation.by === "user" ? tr("tú", "you") : tr("rival", "opponent")}: ${report.repertoire.deviation.played}; ${tr("esperado", "expected")} ${report.repertoire.deviation.expected.join("/")})` : ""}</p>}
              </div>
              <div className="card">
                <h3>{tr("Los 3 errores más importantes", "Three most important mistakes")}</h3>
                {report.topMistakes.map((m: any) => (
                  <div key={m.ply} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => go(ml[m.ply - 1])}>
                    <b className={`cls-${m.classification}`}>{m.moveNumber}{m.color === "w" ? "." : "…"}{m.san}{CLS_SYMBOL[m.classification]}</b> → {m.bestSan ?? "?"} <small className="muted">({m.errorType === "tactical" ? tr("táctico", "tactical") : tr("estratégico", "strategic")})</small>
                    {m.explanation?.points.slice(0, 2).map((p: any, i: number) => <p key={i} style={{ margin: "2px 0" }}>• {p.text}</p>)}
                  </div>
                ))}
                {!report.topMistakes.length && <p>{tr("Sin errores destacables.", "No notable mistakes.")}</p>}
              </div>
              <div className="card">
                <h3>{tr("Momentos críticos", "Critical moments")}</h3>
                <ul className="list">{report.criticalMoments.map((c: any) => <li key={c.ply} style={{ cursor: "pointer" }} onClick={() => go(ml[c.ply - 1])}>{c.description}</li>)}</ul>
                {report.missedOpportunities.length > 0 && <p>{tr("Oportunidades perdidas", "Missed opportunities")}: {report.missedOpportunities.map((m: any) => `${m.moveNumber}${m.color === "w" ? "." : "…"}${m.san}`).join(", ")}</p>}
                {report.missedDefenses.length > 0 && <p>{tr("Recursos defensivos no vistos", "Missed defensive resources")}: {report.missedDefenses.map((m: any) => `${m.moveNumber}${m.color === "w" ? "." : "…"}${m.san}`).join(", ")}</p>}
              </div>
              <div className="card">
                <h3>{tr("Gestión del tiempo", "Time management")}</h3>
                <p>{report.time.assessment}</p>
                {report.time.available && <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Media", "Average")} {report.time.avgTimePerMove}s · {tr("apuros", "time trouble")} {report.time.timeTroubleMoves} · {tr("errores rápidos", "fast errors")} {report.time.fastErrors}</p>}
              </div>
              <div className="card gold">
                <h3>{tr("Lecciones", "Lessons")}</h3>
                {report.lessons.map((l: string, i: number) => <p key={i} style={{ color: "var(--text)" }}>• {l}</p>)}
                <Link className="btn sm primary" to="/tactics?mode=review">{tr(`Entrenar ${report.exercises.length} ejercicios de esta partida`, `Train ${report.exercises.length} exercises from this game`)}</Link>
              </div>
              <small className="muted">{g.data.analysis.engine} · depth {g.data.analysis.depth}</small>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
