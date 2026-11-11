import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Chess } from "chess.js";
import { api } from "../api";
import { useApp, useT } from "../state";
import { Board } from "../chess/Board";

const MODES = [
  ["grandmaster", "GM", "GM"], ["tactical", "Táctico", "Tactical"], ["positional", "Posicional", "Positional"], ["opening", "Aperturas", "Openings"],
  ["endgame", "Finales", "Endgames"], ["tournament", "Torneo", "Tournament"], ["performance", "Rendimiento", "Performance"],
] as const;

export function Coach() {
  const tr = useT();
  const { lang } = useApp();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<string>("grandmaster");
  const [thread] = useState(() => "t" + Date.now().toString(36));
  const [msgs, setMsgs] = useState<{ role: string; content: string; meta?: any }[]>([]);
  const [text, setText] = useState("");
  const [fen, setFen] = useState(params.get("fen") ?? "");
  const [showBoard, setShowBoard] = useState(!!params.get("fen"));
  const [busy, setBusy] = useState(false);
  const [socratic, setSocratic] = useState(params.get("socratic") === "1");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const validFen = useMemo(() => { try { return fen ? new Chess(fen).fen() : null; } catch { return null; } }, [fen]);

  const send = async (message = text) => {
    if (!message.trim()) return;
    setMsgs((m) => [...m, { role: "user", content: message }]); setText(""); setBusy(true);
    try {
      const r = await api("/coach/chat", { body: { threadId: thread, mode, message, fen: showBoard && validFen ? validFen : undefined } });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer, meta: r }]);
    } catch (e) { setMsgs((m) => [...m, { role: "assistant", content: "⚠️ " + (e as Error).message }]); }
    setBusy(false);
  };

  return (
    <div>
      <h1>{tr("Coach Gran Maestro", "Grandmaster Coach")}</h1>
      <div className="chips" style={{ marginBottom: 10 }}>
        {MODES.map(([id, es, en]) => <button key={id} className={`chip ${mode === id ? "on" : ""}`} onClick={() => setMode(id)}>{lang === "es" ? es : en}</button>)}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`chip ${showBoard ? "on" : ""}`} onClick={() => setShowBoard(!showBoard)}>⊞ {tr("Posición", "Position")}</button>
        <button className={`chip ${socratic ? "on" : ""}`} onClick={() => setSocratic(!socratic)}>? {tr("Análisis guiado (socrático)", "Guided analysis (Socratic)")}</button>
      </div>
      {socratic && <Socratic fen={validFen} setFen={(f) => { setFen(f); setShowBoard(true); }} />}
      {showBoard && !socratic && (
        <div className="card">
          <label>FEN</label>
          <input value={fen} onChange={(e) => setFen(e.target.value)} placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" />
          {fen && !validFen && <p className="error">{tr("FEN no válida", "Invalid FEN")}</p>}
          {validFen && <div className="board-wrap" style={{ maxWidth: 320, marginTop: 10 }}><Board fen={validFen} movable="both" onMove={(m) => { const c = new Chess(validFen); try { c.move(m); setFen(c.fen()); } catch { return false; } }} /></div>}
        </div>
      )}
      {!socratic && (
        <>
          <div className="chat card" style={{ minHeight: 200 }}>
            {!msgs.length && (
              <div className="stack">
                <p>{tr("Pregunta sobre una posición, una partida o tu plan. Las variantes y evaluaciones se verifican con Stockfish.", "Ask about a position, a game or your plan. Variations and evaluations are verified with Stockfish.")}</p>
                <div className="chips" style={{ flexWrap: "wrap" }}>
                  {[tr("¿Qué amenaza mi rival?", "What is my opponent threatening?"), tr("¿Cuál es el plan correcto aquí?", "What's the right plan here?"), tr("¿Qué debo calcular antes de mover?", "What should I calculate before moving?"), tr("¿Cómo convierto esta ventaja?", "How do I convert this advantage?")].map((q) => <button key={q} className="chip" onClick={() => void send(q)}>{q}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
                {m.meta && <div className="meta">{m.meta.provider}{m.meta.lines?.[0] ? ` · SF: ${m.meta.lines[0].san.slice(0, 4).join(" ")}` : ""}{m.meta.unverified?.length ? ` · ⚠ ${m.meta.unverified.join(", ")}` : ""}</div>}
              </div>
            ))}
            {busy && <div className="msg assistant muted">{tr("Analizando…", "Analysing…")}</div>}
            <div ref={end} />
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ flexWrap: "nowrap" }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Escribe tu pregunta…", "Type your question…")} style={{ minHeight: 44, height: 44 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <button className="btn primary" disabled={busy}>{tr("Enviar", "Send")}</button>
          </form>
        </>
      )}
    </div>
  );
}

/** Socratic guided analysis: threats → worst piece → candidates → blind calculation → decision. */
function Socratic({ fen, setFen }: { fen: string | null; setFen: (f: string) => void }) {
  const tr = useT();
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState("");
  const [log, setLog] = useState<{ q: string; a: string; fb: string; ok?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [worst, setWorst] = useState<string[]>([]);
  const [load, setLoad] = useState("");
  useEffect(() => { setStep(0); setLog([]); }, [fen]);
  const questions = [
    tr("1) ¿Qué amenaza tu rival? Escribe la jugada que haría si pudiera mover ahora (o 'nada').", "1) What does your opponent threaten? Write the move they'd play if they could move now (or 'nothing')."),
    tr("2) ¿Cuál es tu pieza peor situada? Tócala en el tablero.", "2) Which is your worst-placed piece? Tap it on the board."),
    tr("3) Escribe 2–4 jugadas candidatas separadas por espacios.", "3) Write 2–4 candidate moves separated by spaces."),
    tr("4) Calcula sin mover: escribe la variante de tu mejor candidata (p. ej. Qg8+ Rxg8 Nf7#).", "4) Calculate without moving: write the line of your best candidate (e.g. Qg8+ Rxg8 Nf7#)."),
  ];
  if (!fen) return (
    <div className="card">
      <p>{tr("Pega una FEN (o abre una posición desde una partida/tablero) para empezar el análisis guiado.", "Paste a FEN (or open a position from a game/board) to start the guided analysis.")}</p>
      <input value={load} onChange={(e) => setLoad(e.target.value)} placeholder="FEN" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setFen(load)}>{tr("Usar FEN", "Use FEN")}</button>
        <button className="btn sm" onClick={() => setFen("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5")}>{tr("Posición de ejemplo", "Example position")}</button>
      </div>
    </div>
  );
  const submit = async () => {
    setBusy(true);
    try {
      if (step === 0) {
        const r = await api("/coach/socratic/threat", { body: { fen, answer: ans || "nada" } });
        setWorst(r.worstPieces);
        setLog((l) => [...l, { q: questions[0], a: ans || "—", fb: r.feedback, ok: r.correct }]);
      } else if (step === 1) {
        const ok = !!pick && worst.includes(pick);
        setLog((l) => [...l, { q: questions[1], a: pick ?? "—", fb: ok ? tr("Coincide con el análisis de movilidad.", "Matches the mobility analysis.") : tr(`Según la movilidad, tus piezas más pasivas son: ${worst.join(", ")}. ¿Puedes mejorarlas?`, `By mobility, your most passive pieces are: ${worst.join(", ")}. Can you improve them?`), ok }]);
      } else if (step === 2) {
        const r = await api("/coach/socratic/candidates", { body: { fen, candidates: ans.split(/[\s,]+/).filter(Boolean).slice(0, 6) } });
        setLog((l) => [...l, { q: questions[2], a: ans, fb: r.feedback, ok: r.foundBest }]);
      } else if (step === 3) {
        const r = await api("/coach/calculation", { body: { fen, line: ans.split(/\s+/).filter(Boolean).slice(0, 16) } });
        setLog((l) => [...l, { q: questions[3], a: ans, fb: `${r.summary}\n${r.verdicts.map((v: any) => `${v.san}: ${v.note}`).join("\n")}`, ok: r.correctDepth >= 2 }]);
      }
      setStep(step + 1); setAns("");
    } catch (e) { setLog((l) => [...l, { q: questions[step], a: ans, fb: (e as Error).message, ok: false }]); }
    setBusy(false);
  };
  return (
    <div className="split">
      <div className="board-wrap"><Board fen={fen} movable="none" highlights={pick ? { [pick]: "rgba(201,164,92,.45)" } : {}} /></div>
      <div className="card" onClickCapture={() => void 0}>
        {log.map((l, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <small className="muted">{l.q}</small>
            <div>→ <b>{l.a}</b> {l.ok !== undefined && <span className={`badge ${l.ok ? "good" : "warn"}`}>{l.ok ? "✓" : "…"}</span>}</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{l.fb}</p>
          </div>
        ))}
        {step < 4 ? (
          <div>
            <p style={{ color: "var(--text)" }}>{questions[step]}</p>
            {step === 1 ? (
              <div className="row">
                {squaresOfSideToMove(fen).map((s) => <button key={s} className={`chip ${pick === s ? "on" : ""}`} onClick={() => setPick(s)}>{s}</button>)}
              </div>
            ) : <input value={ans} onChange={(e) => setAns(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />}
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void submit()}>{tr("Responder", "Answer")}</button>
          </div>
        ) : (
          <div>
            <p style={{ color: "var(--text)" }}>{tr("5) Ahora decide y compara: pregunta al coach o mira el motor en el tablero de análisis.", "5) Now decide and compare: ask the coach or check the engine on the analysis board.")}</p>
            <a className="btn sm" href={`/board?fen=${encodeURIComponent(fen)}`}>{tr("Abrir en el tablero", "Open on board")}</a>
            <button className="btn sm ghost" onClick={() => { setStep(0); setLog([]); setPick(null); }}>{tr("Repetir", "Restart")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function squaresOfSideToMove(fen: string) {
  const c = new Chess(fen);
  return c.board().flat().filter((p) => p && p.color === c.turn() && p.type !== "k" && p.type !== "p").map((p) => p!.square);
}
