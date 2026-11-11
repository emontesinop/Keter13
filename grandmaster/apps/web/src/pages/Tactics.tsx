import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chess } from "chess.js";
import { checkPuzzleMove, MOTIF_LABEL, uciLineToSan, type Motif } from "@gm/core";
import { api } from "../api";
import { useApp, useT } from "../state";
import { Board } from "../chess/Board";

type Mode = "mixed" | "review" | "weakness" | "challenge" | "threats" | "calculation";

export function Tactics() {
  const tr = useT();
  const { lang } = useApp();
  const [params, setParams] = useSearchParams();
  const mode = (params.get("mode") as Mode) ?? "mixed";
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [stats, setStats] = useState({ ok: 0, n: 0 });
  useEffect(() => {
    (async () => {
      setIdx(0); setStats({ ok: 0, n: 0 }); setInfo(null);
      let q = "n=15";
      if (mode === "review") q += "";
      if (mode === "threats") q += "&domain=threat_awareness";
      if (mode === "weakness") {
        const w = await api("/training/weaknesses");
        const top = w.weaknesses?.[0];
        if (top?.id === "threat_awareness") q += "&domain=threat_awareness";
        else if (top?.detail && top.id === "tactical_vision") { const motif = Object.entries(top.detail).sort((a: any, b: any) => b[1] - a[1])[0][0]; q += `&motif=${motif}`; }
        setInfo(top ? tr(`Debilidad objetivo: ${top.label.es}`, `Target weakness: ${top.label.en}`) : tr("Sin datos de debilidades aún: ejercicios mixtos.", "No weakness data yet: mixed exercises."));
      }
      let list = await api<any[]>(`/training/exercises?${q}`);
      if (mode === "review") list = list.filter((e) => e.is_review);
      if (mode === "challenge") list = list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      if ((mode === "threats" || mode === "weakness") && !list.length) list = await api<any[]>("/training/exercises?n=15");
      setQueue(list);
    })().catch((e) => setInfo((e as Error).message));
  }, [mode]);
  const ex = queue[idx];
  const modes: [Mode, string][] = [["mixed", tr("Mixto", "Mixed")], ["review", tr("Repaso", "Review")], ["weakness", tr("Cazador de debilidades", "Weakness hunter")], ["challenge", tr("Desafío GM", "GM challenge")], ["threats", tr("Prevención de errores", "Blunder prevention")], ["calculation", tr("Calcular sin mover", "Calculate without moving")]];
  return (
    <div>
      <h1>{tr("Laboratorio táctico", "Tactics laboratory")}</h1>
      <div className="chips" style={{ marginBottom: 10 }}>{modes.map(([m, l]) => <button key={m} className={`chip ${mode === m ? "on" : ""}`} onClick={() => setParams({ mode: m })}>{l}</button>)}</div>
      {info && <p className="muted">{info}</p>}
      <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Sesión", "Session")}: {stats.ok}/{stats.n} {tr("correctos", "correct")} · {idx + 1 > queue.length ? queue.length : idx + 1}/{queue.length}</p>
      {!ex && queue.length === 0 && <div className="card"><p>{mode === "review" ? tr("No hay repasos pendientes. ¡Al día!", "No reviews due. All caught up!") : tr("No hay ejercicios todavía.", "No exercises yet.")}</p></div>}
      {!ex && queue.length > 0 && <div className="card"><p>{tr("Sesión terminada.", "Session complete.")} {stats.ok}/{stats.n}</p><button className="btn primary" onClick={() => setParams({ mode })}>{tr("Otra sesión", "Another session")}</button></div>}
      {ex && (mode === "calculation"
        ? <CalcExercise key={ex.id} ex={ex} onDone={(ok) => { setStats((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 })); setIdx(idx + 1); }} />
        : <Exercise key={ex.id} ex={ex} lang={lang} threatMode={mode === "threats"} onDone={(ok) => { setStats((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 })); setIdx(idx + 1); }} />)}
    </div>
  );
}

function Exercise({ ex, lang, onDone, threatMode }: { ex: any; lang: "es" | "en"; onDone: (ok: boolean) => void; threatMode: boolean }) {
  const tr = useT();
  const solution: string[] = ex.solution;
  const [step, setStep] = useState(0);
  const [played, setPlayed] = useState<string[]>([]);
  const [fen, setFen] = useState(ex.fen);
  const [status, setStatus] = useState<"solving" | "wrong" | "solved" | "failed">("solving");
  const [hints, setHints] = useState(0);
  const [firstTry, setFirstTry] = useState(true);
  const [threatAns, setThreatAns] = useState("");
  const [threatFb, setThreatFb] = useState<any>(null);
  const t0 = useRef(Date.now());
  const side = new Chess(ex.fen).turn();
  const isThreatEx = ex.kind === "find_threat";
  const needThreatFirst = threatMode && !isThreatEx && !threatFb;

  const finish = async (correct: boolean) => {
    setStatus(correct ? "solved" : "failed");
    const seconds = (Date.now() - t0.current) / 1000;
    await api("/training/attempt", { body: { itemType: "exercise", itemId: ex.id, domain: ex.domain ?? "tactics", correct, seconds, hintsUsed: hints, firstTry, details: { motifs: ex.motifs } } }).catch(() => undefined);
  };
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    if (status === "solved" || status === "failed" || needThreatFirst) return false;
    const c = new Chess(fen);
    let mv; try { mv = c.move(m); } catch { return false; }
    const uci = mv.from + mv.to + (mv.promotion ?? "");
    if (isThreatEx) {
      // the position is shown with the user to move, but the question is about the opponent's threat → answered by typing
      return false;
    }
    const res = checkPuzzleMove({ id: ex.id, fen: ex.fen, solution, motifs: ex.motifs, rating: 0, source: "original" }, [...played, uci], step);
    if (!res.correct) { setStatus("wrong"); setFirstTry(false); if (!firstTry) void finish(false); return false; }
    setFen(c.fen());
    const np = [...played, uci];
    if (res.finished) { setPlayed(np); void finish(firstTry); return true; }
    const reply = res.reply!;
    setTimeout(() => { const c2 = new Chess(c.fen()); c2.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] }); setFen(c2.fen()); setPlayed([...np, reply]); setStep(step + 2); setStatus("solving"); }, 400);
    setPlayed(np);
    return true;
  };
  const checkThreat = async () => {
    const r = await api("/coach/socratic/threat", { body: { fen: ex.fen, answer: threatAns || "nada" } });
    setThreatFb(r);
    if (isThreatEx) void finish(r.correct);
    void api("/training/attempt", { body: { itemType: "threat_check", itemId: ex.id + ":threat", domain: "threat_awareness", correct: r.correct } }).catch(() => undefined);
  };
  const motifs = (ex.motifs ?? []) as Motif[];
  const hintSq = solution[step]?.slice(0, 2);
  return (
    <div className="split">
      <div className="board-wrap"><Board fen={fen} orientation={side} movable={status === "solved" || status === "failed" ? "none" : side} onMove={onMove} highlights={hints && hintSq ? { [hintSq]: "rgba(201,164,92,.5)" } : {}} /></div>
      <div className="card">
        <p style={{ color: "var(--text)" }}>{ex.prompt ?? (side === "w" ? tr("Juegan blancas. Encuentra la mejor continuación.", "White to move. Find the best continuation.") : tr("Juegan negras. Encuentra la mejor continuación.", "Black to move. Find the best continuation."))}</p>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="badge">{ex.source === "user_game" ? tr("De tus partidas", "From your games") : ex.source === "lichess_cc0" ? "Lichess (CC0)" : tr("Original verificado", "Verified original")}</span>
          {ex.rating && <span className="badge">~{ex.rating}</span>}
          {ex.is_review && <span className="badge info">{tr("repaso", "review")}</span>}
        </div>
        {(needThreatFirst || isThreatEx) && !threatFb && (
          <div>
            <p className="muted">{tr("Antes de mover: ¿qué amenaza tu rival? Escribe su jugada (o 'nada').", "Before moving: what does your opponent threaten? Type their move (or 'nothing').")}</p>
            <div className="row" style={{ flexWrap: "nowrap" }}><input value={threatAns} onChange={(e) => setThreatAns(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void checkThreat()} /><button className="btn sm primary" onClick={() => void checkThreat()}>OK</button></div>
          </div>
        )}
        {threatFb && <p className={threatFb.correct ? "ok" : "error"}>{threatFb.feedback}</p>}
        {status === "wrong" && <p className="error">{tr("No es la mejor. Piensa en jaques, capturas y amenazas.", "Not the best. Think checks, captures, threats.")}</p>}
        {(status === "solved" || status === "failed" || (isThreatEx && threatFb)) && (
          <div>
            {status === "solved" && <p className="ok">✓ {tr("Resuelto", "Solved")}</p>}
            {status === "failed" && <p className="error">{tr("Solución", "Solution")}: {uciLineToSan(ex.fen, solution).join(" ")}</p>}
            {motifs.length > 0 && <p>{tr("Motivo", "Motif")}: {motifs.map((m) => MOTIF_LABEL[m]?.[lang] ?? m).join(", ")}</p>}
            <div className="row">
              <button className="btn primary" onClick={() => onDone(status === "solved" || threatFb?.correct)}>{tr("Siguiente", "Next")}</button>
              <Link className="btn sm" to={`/board?fen=${encodeURIComponent(ex.fen)}`}>{tr("Analizar", "Analyse")}</Link>
              <Link className="btn sm" to={`/coach?fen=${encodeURIComponent(ex.fen)}`}>♛ {tr("¿Por qué?", "Why?")}</Link>
            </div>
          </div>
        )}
        {status !== "solved" && status !== "failed" && !isThreatEx && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => setHints(hints + 1)}>💡 {tr("Pista", "Hint")}</button>
            <button className="btn sm ghost" onClick={() => { setFirstTry(false); void finish(false); }}>{tr("Ver solución", "Show solution")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** CALCULATION WITHOUT MOVING: the board is frozen; the student writes the full line, then it's graded by Stockfish. */
function CalcExercise({ ex, onDone }: { ex: any; onDone: (ok: boolean) => void }) {
  const tr = useT();
  const [line, setLine] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState("");
  const side = new Chess(ex.fen).turn();
  const submit = async () => {
    setBusy(true);
    try {
      let candFb = null;
      if (cands.trim()) candFb = await api("/coach/socratic/candidates", { body: { fen: ex.fen, candidates: cands.split(/[\s,]+/).filter(Boolean).slice(0, 6) } });
      const r = await api("/coach/calculation", { body: { fen: ex.fen, line: line.split(/\s+/).filter(Boolean).map((s) => s.replace(/^\d+\.+/, "")).filter(Boolean), itemId: ex.id } });
      setRes({ ...r, candFb });
    } catch (e) { setRes({ error: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <div className="split">
      <div className="board-wrap"><Board fen={ex.fen} orientation={side} movable="none" /></div>
      <div className="card">
        <p style={{ color: "var(--text)" }}>{tr("No puedes mover piezas. 1) Lista tus candidatas. 2) Escribe la variante completa (incluye las respuestas del rival).", "You can't move pieces. 1) List your candidates. 2) Write the full line (including opponent replies).")}</p>
        <label>{tr("Candidatas", "Candidates")}</label>
        <input value={cands} onChange={(e) => setCands(e.target.value)} placeholder="Nf6+ Qxh7+ Rd8" />
        <label>{tr("Variante principal", "Main line")}</label>
        <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Qg8+ Rxg8 Nf7#" />
        <button className="btn primary" style={{ marginTop: 8 }} disabled={busy || !line.trim()} onClick={() => void submit()}>{busy ? "…" : tr("Evaluar cálculo", "Grade calculation")}</button>
        {res?.error && <p className="error">{res.error}</p>}
        {res && !res.error && (
          <div style={{ marginTop: 10 }}>
            {res.candFb && <p>{res.candFb.feedback}</p>}
            <p style={{ color: "var(--text)" }}><b>{res.summary}</b> · {tr("puntuación", "score")} {res.score}</p>
            <ul className="list">{res.verdicts.map((v: any) => <li key={v.ply}><b>{v.san}</b> <span className={`badge ${v.verdict === "best" || v.verdict === "good" ? "good" : v.verdict === "illegal" || v.verdict === "wrong" ? "bad" : "warn"}`}>{v.verdict}</span> <small>{v.note}</small></li>)}</ul>
            <button className="btn primary" onClick={() => onDone(res.correctDepth >= 2)}>{tr("Siguiente", "Next")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
