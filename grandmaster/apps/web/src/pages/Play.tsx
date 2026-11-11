import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Chess } from "chess.js";
import { api } from "../api";
import { useApp, useT } from "../state";
import { Board } from "../chess/Board";
import { BrowserEngine } from "../chess/engine";

const SURPRISE_OPENINGS = [["e4", "e5", "f4"], ["d4", "Nf6", "Bg5"], ["e4", "c6", "f3"], ["b4"], ["d4", "d5", "e4"], ["e4", "c6", "d4", "d5", "Nc3", "g6"], ["Nf3", "d5", "g3"], ["d4", "e5"]];

export function Play() {
  const tr = useT();
  const { me } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const mode = params.get("mode") ?? "tournament";
  const [setup, setSetup] = useState(true);
  const [side, setSide] = useState<"w" | "b">((params.get("side") as "w" | "b") ?? "w");
  const [elo, setElo] = useState(Math.max(1320, (me?.profile?.rating_estimate ?? 1650) + 100));
  const [tc, setTc] = useState("15+10");
  const [threatCheck, setThreatCheck] = useState(false);
  const startFen = params.get("fen") ?? undefined;
  if (setup) return (
    <div>
      <h1>{mode === "self" ? tr("Juega contra ti mismo", "Play against yourself") : mode === "opening" ? tr("Supervivencia en la apertura", "Opening survival") : tr("Simulación de torneo", "Tournament simulation")}</h1>
      <div className="card">
        <p>{mode === "self" ? tr("Continúa desde una posición de tus partidas e intenta mejorar tu decisión original.", "Continue from a position in your games and try to improve your original decision.") : mode === "opening" ? tr("El motor elegirá aperturas poco habituales para que aprendas a orientarte con principios.", "The engine will pick unusual openings so you learn to navigate by principles.") : tr("Partida con reloj realista. Al terminar se analiza automáticamente.", "Game with a realistic clock. It's analysed automatically afterwards.")}</p>
        <label>{tr("Tu color", "Your colour")}</label>
        <div className="row"><button className={`chip ${side === "w" ? "on" : ""}`} onClick={() => setSide("w")}>♔ {tr("Blancas", "White")}</button><button className={`chip ${side === "b" ? "on" : ""}`} onClick={() => setSide("b")}>♚ {tr("Negras", "Black")}</button></div>
        <label>{tr("Fuerza del motor (UCI_Elo, escala del motor — no equivale a Elo FIDE/online)", "Engine strength (UCI_Elo, engine scale — not equal to FIDE/online Elo)")}: {elo}</label>
        <input type="range" min={1320} max={3000} step={20} value={elo} onChange={(e) => setElo(Number(e.target.value))} />
        <label>{tr("Ritmo", "Time control")}</label>
        <select value={tc} onChange={(e) => setTc(e.target.value)}>{["10+0", "15+10", "30+0", "45+15", "90+30", "none"].map((t) => <option key={t} value={t}>{t === "none" ? tr("Sin reloj", "No clock") : t}</option>)}</select>
        <label className="row" style={{ marginTop: 10 }}><input type="checkbox" checked={threatCheck} onChange={(e) => setThreatCheck(e.target.checked)} style={{ width: "auto" }} /> {tr("Prevención de errores: antes de cada jugada, escribe la amenaza del rival", "Blunder prevention: before each move, write the opponent's threat")}</label>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setSetup(false)}>{tr("Empezar", "Start")}</button>
      </div>
    </div>
  );
  return <Game side={side} elo={elo} tc={tc} startFen={startFen} surprise={mode === "opening"} threatCheck={threatCheck} onFinish={(id) => nav(id ? `/games/${id}` : "/games")} />;
}

function fmt(s: number) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${String(ss).padStart(2, "0")}`; }

function Game({ side, elo, tc, startFen, surprise, threatCheck, onFinish }: { side: "w" | "b"; elo: number; tc: string; startFen?: string; surprise: boolean; threatCheck: boolean; onFinish: (id?: string) => void }) {
  const tr = useT();
  const game = useRef(new Chess(startFen));
  const [fen, setFen] = useState(game.current.fen());
  const [last, setLast] = useState<[string, string] | null>(null);
  const eng = useRef(new BrowserEngine());
  const [base, inc] = tc === "none" ? [0, 0] : tc.split("+").map(Number).map((x, i) => (i === 0 ? x * 60 : x));
  const [clock, setClock] = useState({ w: base, b: base });
  const [result, setResult] = useState<string | null>(null);
  const [threatOk, setThreatOk] = useState(!threatCheck);
  const [threatAns, setThreatAns] = useState("");
  const [threatFb, setThreatFb] = useState<string | null>(null);
  const turnStart = useRef(Date.now());
  const book = useRef(surprise ? SURPRISE_OPENINGS[Math.floor(Math.random() * SURPRISE_OPENINGS.length)] : []);
  const clocks = useRef<string[]>([]);
  useEffect(() => () => eng.current.terminate(), []);
  useEffect(() => {
    if (!base || result) return;
    const t = setInterval(() => {
      const turn = game.current.turn();
      setClock((c) => {
        const n = { ...c, [turn]: Math.max(0, c[turn] - 0.25) };
        if (n[turn] <= 0) end(turn === side ? tr("Perdiste por tiempo", "Lost on time") : tr("El motor perdió por tiempo", "Engine lost on time"), turn === "w" ? "0-1" : "1-0");
        return n;
      });
    }, 250);
    return () => clearInterval(t);
  }, [result]);
  const end = (text: string, res: string) => { if (!result) { setResult(text); game.current.setHeader("Result", res); } };
  const afterMove = () => {
    const g = game.current;
    setFen(g.fen());
    if (g.isGameOver()) end(g.isCheckmate() ? (g.turn() === side ? tr("Has recibido mate", "You were mated") : tr("¡Ganaste!", "You won!")) : tr("Tablas", "Draw"), g.isCheckmate() ? (g.turn() === "w" ? "0-1" : "1-0") : "1/2-1/2");
  };
  const engineMove = async () => {
    const g = game.current;
    if (g.isGameOver() || result) return;
    const ply = g.history().length;
    let uci: string | null = null;
    if (book.current[ply]) { try { const m = new Chess(g.fen()).move(book.current[ply]); uci = m.from + m.to; } catch { uci = null; } }
    if (!uci) {
      const remaining = clock[g.turn()];
      const movetime = base ? Math.max(200, Math.min(4000, (remaining / 40) * 1000)) : 1500;
      uci = (await eng.current.analyse(g.fen(), { movetime, skillElo: elo })).bestmove;
    }
    const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    setLast([m.from, m.to]);
    if (base) setClock((c) => ({ ...c, [m.color]: c[m.color as "w" | "b"] + inc }));
    clocks.current.push(base ? `[%clk ${fmtClk(clock[m.color as "w" | "b"])}]` : "");
    turnStart.current = Date.now();
    setThreatOk(!threatCheck); setThreatFb(null); setThreatAns("");
    afterMove();
  };
  useEffect(() => { if (game.current.turn() !== side) void engineMove(); }, []);
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    if (result || !threatOk) return false;
    try { const mv = game.current.move(m); setLast([mv.from, mv.to]); } catch { return false; }
    if (base) setClock((c) => ({ ...c, [side]: c[side] + inc }));
    clocks.current.push(base ? `[%clk ${fmtClk(clock[side])}]` : "");
    afterMove();
    setTimeout(() => void engineMove(), 150);
    return true;
  };
  const checkThreat = async () => {
    const r = await api("/coach/socratic/threat", { body: { fen: game.current.fen(), answer: threatAns || "nada" } });
    setThreatFb(r.feedback); setThreatOk(true);
    void api("/training/attempt", { body: { itemType: "threat_check", itemId: `play:${game.current.fen()}`, domain: "threat_awareness", correct: r.correct } }).catch(() => undefined);
  };
  const saveAndAnalyse = async () => {
    const g = game.current;
    g.setHeader("Event", "Grandmaster AI training game");
    g.setHeader("White", side === "w" ? "Me" : `Stockfish (UCI_Elo ${elo})`);
    g.setHeader("Black", side === "b" ? "Me" : `Stockfish (UCI_Elo ${elo})`);
    g.setHeader("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));
    if (base) g.setHeader("TimeControl", `${base}+${inc}`);
    let pgn = g.pgn();
    if (base) { const hist = g.history(); const c = new Chess(startFen); const parts: string[] = []; hist.forEach((s, i) => { const t = c.turn(); const n = c.moveNumber(); c.move(s); parts.push(`${t === "w" ? `${n}. ` : i === 0 ? `${n}... ` : ""}${s} {${clocks.current[i] ?? ""}}`); }); pgn = pgn.split("\n\n")[0] + "\n\n" + parts.join(" ") + ` ${g.getHeaders().Result ?? "*"}`; }
    const r = await api("/games/upload", { body: { pgn, userColor: side, analyze: true } });
    onFinish(r.ids?.[0]);
  };
  const resign = () => end(tr("Abandonaste", "You resigned"), side === "w" ? "0-1" : "1-0");
  const opp = side === "w" ? "b" : "w";
  return (
    <div className="split">
      <div>
        {base > 0 && <div className="row between"><span className="badge">{tr("Motor", "Engine")} {fmt(clock[opp])}</span></div>}
        <div className="board-wrap" style={{ margin: "6px auto" }}><Board fen={fen} orientation={side} movable={result || !threatOk ? "none" : side} onMove={onMove} lastMove={last} /></div>
        {base > 0 && <div className="row between"><span className={`badge ${clock[side] < 30 ? "bad" : "good"}`}>{tr("Tú", "You")} {fmt(clock[side])}</span></div>}
      </div>
      <div className="card">
        {threatCheck && !threatOk && game.current.turn() === side && !result && (
          <div>
            <p style={{ color: "var(--text)" }}>{tr("¿Qué amenaza tu rival? (su jugada o 'nada')", "What does your opponent threaten? (their move or 'nothing')")}</p>
            <div className="row" style={{ flexWrap: "nowrap" }}><input value={threatAns} onChange={(e) => setThreatAns(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void checkThreat()} /><button className="btn sm primary" onClick={() => void checkThreat()}>OK</button></div>
          </div>
        )}
        {threatFb && <p>{threatFb}</p>}
        <p className="muted">{game.current.history().length} {tr("medias jugadas", "plies")}</p>
        {result ? (
          <div><p style={{ color: "var(--text)" }}><b>{result}</b></p><button className="btn primary" onClick={() => void saveAndAnalyse()}>{tr("Guardar y analizar", "Save & analyse")}</button></div>
        ) : <button className="btn danger sm" onClick={resign}>{tr("Abandonar", "Resign")}</button>}
      </div>
    </div>
  );
}
function fmtClk(s: number) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; }
