import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { Board } from "../chess/Board";
import { BrowserEngine } from "../chess/engine";

export function Endgames() {
  const tr = useT();
  const { lang } = useApp();
  const drills = useData<any[]>("/training/endgames");
  const [sel, setSel] = useState<any | null>(null);
  const [custom, setCustom] = useState("");
  if (sel) return <EndgamePlay drill={sel} onBack={() => setSel(null)} />;
  const cats: Record<string, [string, string]> = { basic_mates: ["Mates básicos", "Basic mates"], king_pawn: ["Rey y peón", "King & pawn"], rook: ["Torres", "Rook endings"], minor: ["Piezas menores", "Minor pieces"], queen: ["Dama", "Queen"], defense: ["Defensa / tablas", "Defence / draws"] };
  return (
    <div>
      <h1>{tr("Laboratorio de finales", "Endgame laboratory")}</h1>
      <p>{tr("Juega contra Stockfish desde posiciones teóricas. Con ≤7 piezas, cada jugada se compara con las tablas Syzygy (vía API de Lichess).", "Play Stockfish from theoretical positions. With ≤7 pieces, each move is compared with Syzygy tablebases (via the Lichess API).")}</p>
      {Object.entries(cats).map(([k, l]) => {
        const items = (drills.data ?? []).filter((d) => d.category === k);
        if (!items.length) return null;
        return (
          <div className="card" key={k}>
            <h3>{l[lang === "es" ? 0 : 1]}</h3>
            <ul className="list">{items.map((d) => <li key={d.id} className="row between" style={{ cursor: "pointer" }} onClick={() => setSel(d)}><span><b>{d.title[lang]}</b> <small className="muted">· {d.goal === "win" ? tr("ganar", "win") : tr("hacer tablas", "draw")} · {"★".repeat(d.difficulty)}</small></span><span className="btn sm">▶</span></li>)}</ul>
          </div>
        );
      })}
      <div className="card">
        <h3>{tr("Posición propia", "Custom position")}</h3>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="FEN" />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn sm" onClick={() => { try { const c = new Chess(custom); setSel({ id: "custom", title: { es: "Posición propia", en: "Custom position" }, fen: c.fen(), side: c.turn(), goal: "win", technique: { es: "", en: "" } }); } catch { /* invalid */ } }}>{tr("Jugar (ganar)", "Play (win)")}</button>
          <button className="btn sm" onClick={() => { try { const c = new Chess(custom); setSel({ id: "custom", title: { es: "Posición propia", en: "Custom position" }, fen: c.fen(), side: c.turn(), goal: "draw", technique: { es: "", en: "" } }); } catch { /* invalid */ } }}>{tr("Jugar (defender)", "Play (defend)")}</button>
        </div>
      </div>
    </div>
  );
}

function EndgamePlay({ drill, onBack }: { drill: any; onBack: () => void }) {
  const tr = useT();
  const { lang } = useApp();
  const [fen, setFen] = useState(drill.fen);
  const [last, setLast] = useState<[string, string] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tb, setTb] = useState<string | null>(null);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [over, setOver] = useState<null | boolean>(null);
  const [moves, setMoves] = useState(0);
  const eng = useRef(new BrowserEngine());
  useEffect(() => () => eng.current.terminate(), []);
  const userSide = drill.side as "w" | "b";
  const evaluateEnd = (c: Chess, nUser: number) => {
    if (!c.isGameOver()) {
      if (drill.goal === "draw" && nUser >= 30) { conclude(true, tr("Sobreviviste 30 jugadas: defensa lograda.", "You survived 30 moves: defence achieved.")); return true; }
      return false;
    }
    const userMated = c.isCheckmate() && c.turn() === userSide;
    const userWon = c.isCheckmate() && c.turn() !== userSide;
    const ok = drill.goal === "win" ? userWon : !userMated;
    conclude(ok, userWon ? tr("¡Mate!", "Checkmate!") : userMated ? tr("Has recibido mate.", "You got mated.") : tr("Tablas.", "Draw."));
    return true;
  };
  const conclude = (ok: boolean, text: string) => {
    setOver(ok); setMsg(`${ok ? "✓" : "✗"} ${text}`);
    void api("/training/attempt", { body: { itemType: "endgame", itemId: drill.id, domain: "endgames", correct: ok, details: { moves }, summary: `${tr("Final", "Endgame")}: ${drill.title[lang]} ${ok ? "✓" : "✗"}` } }).catch(() => undefined);
  };
  const checkTb = async (before: string, after: string) => {
    const pieces = after.split(" ")[0].replace(/[^a-zA-Z]/g, "").length;
    if (pieces > 7) return;
    try {
      const [a, b] = await Promise.all([api(`/tablebase?fen=${encodeURIComponent(before)}`), api(`/tablebase?fen=${encodeURIComponent(after)}`)]);
      const flip: Record<string, string> = { win: "loss", loss: "win", draw: "draw", "cursed-win": "blessed-loss", "blessed-loss": "cursed-win" };
      const resultAfterForUser = flip[b.category] ?? b.category;
      const kept = resultAfterForUser === a.category;
      setTb(kept ? tr(`Tablas Syzygy: jugada correcta (${a.category}).`, `Syzygy: correct move (${a.category}).`) : tr(`Tablas Syzygy: el resultado cambió de ${a.category} a ${resultAfterForUser}. Mejor: ${a.moves?.[0]?.san ?? "?"}.`, `Syzygy: result changed from ${a.category} to ${resultAfterForUser}. Better: ${a.moves?.[0]?.san ?? "?"}.`));
    } catch (e) { setTb(tr("Tablebase no disponible: ", "Tablebase unavailable: ") + (e as Error).message); }
  };
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    if (over !== null) return false;
    const c = new Chess(fen);
    try { c.move(m); } catch { return false; }
    const before = fen;
    setFen(c.fen()); setLast([m.from, m.to]); setHint(null);
    const n = moves + 1; setMoves(n);
    void checkTb(before, c.fen());
    if (evaluateEnd(c, n)) return true;
    void eng.current.analyse(c.fen(), { depth: 18 }).then(({ bestmove }) => {
      const c2 = new Chess(c.fen());
      c2.move({ from: bestmove.slice(0, 2), to: bestmove.slice(2, 4), promotion: bestmove[4] });
      setFen(c2.fen()); setLast([bestmove.slice(0, 2), bestmove.slice(2, 4)]);
      evaluateEnd(c2, n);
    });
    return true;
  };
  const getHint = async () => { const r = await eng.current.analyse(fen, { depth: 18 }); setHint({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4) }); };
  // If the engine side moves first
  useEffect(() => {
    const c = new Chess(drill.fen);
    if (c.turn() !== userSide) void eng.current.analyse(drill.fen, { depth: 18 }).then(({ bestmove }) => { c.move({ from: bestmove.slice(0, 2), to: bestmove.slice(2, 4), promotion: bestmove[4] }); setFen(c.fen()); });
  }, [drill]);
  return (
    <div>
      <button className="btn sm ghost" onClick={onBack}>← {tr("Finales", "Endgames")}</button>
      <h2 style={{ marginTop: 6 }}>{drill.title[lang]} · {drill.goal === "win" ? tr("objetivo: ganar", "goal: win") : tr("objetivo: tablas", "goal: draw")}</h2>
      <div className="split">
        <div className="board-wrap"><Board fen={fen} orientation={userSide} movable={over === null ? userSide : "none"} onMove={onMove} lastMove={last} arrows={hint ? [{ ...hint, color: "#c9a45c" }] : []} /></div>
        <div className="card">
          {drill.technique?.[lang] && <p style={{ color: "var(--text)" }}>{drill.technique[lang]}</p>}
          <p className="muted">{tr("Jugadas", "Moves")}: {moves}{drill.moveLimit ? ` / ${drill.moveLimit}` : ""}</p>
          {tb && <p style={{ fontSize: ".85rem" }}>{tb}</p>}
          {msg && <p className={over ? "ok" : "error"}>{msg}</p>}
          <div className="row">
            <button className="btn sm" onClick={() => void getHint()} disabled={over !== null}>💡 {tr("Pista", "Hint")}</button>
            <button className="btn sm" onClick={() => { setFen(drill.fen); setOver(null); setMsg(null); setMoves(0); setTb(null); setLast(null); }}>↺ {tr("Repetir", "Retry")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
