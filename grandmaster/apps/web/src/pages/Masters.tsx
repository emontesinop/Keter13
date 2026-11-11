import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { Board } from "../chess/Board";
import { useEngine } from "../chess/useEngine";
import { EngineLines } from "../components/EngineLines";

export function Masters() {
  const tr = useT();
  const { lang } = useApp();
  const games = useData<any[]>("/training/masters");
  const [sel, setSel] = useState<any | null>(null);
  if (sel) return <MasterStudy game={sel} onBack={() => setSel(null)} />;
  return (
    <div>
      <h1>{tr("Partidas magistrales", "Master games")}</h1>
      <p>{tr("Estudio interactivo: la partida se detiene en los momentos críticos y te pregunta qué jugarías.", "Interactive study: the game stops at critical moments and asks what you would play.")}</p>
      {(games.data ?? []).map((g) => (
        <div className="card" key={g.id} onClick={() => setSel(g)} style={{ cursor: "pointer" }}>
          <div className="row between"><b>{g.white} – {g.black}</b><span className="muted">{g.year}</span></div>
          <p>{g.event} · {g.opening} · {tr("dificultad", "difficulty")} {g.difficulty}/5</p>
          <p style={{ color: "var(--text)" }}>{g.objective[lang]}</p>
          <div className="row">{g.themes.map((t: string) => <span key={t} className="badge">{t}</span>)}</div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Partidas del siglo XIX (dominio público) con anotaciones originales. Puedes importar más colecciones PGN con licencia desde Partidas → Subir PGN.", "19th-century games (public domain) with original annotations. Import more licensed PGN collections via Games → Upload PGN.")}</p>
    </div>
  );
}

function MasterStudy({ game, onBack }: { game: any; onBack: () => void }) {
  const tr = useT();
  const { lang } = useApp();
  const moves = useMemo(() => { const c = new Chess(); c.loadPgn(game.pgnMoves); return c.history({ verbose: true }); }, [game]);
  const [ply, setPly] = useState(0);
  const [guess, setGuess] = useState<{ san: string; ok: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const stop = game.stops.find((s: any) => s.ply === ply + 1);
  const fen = ply === 0 ? new Chess().fen() : moves[ply - 1].after;
  const awaiting = !!stop && !guess;
  const { lines, depth } = useEngine(fen, !!guess && !!stop, 2, 18);
  const userColor = stop ? (stop.ply % 2 === 1 ? "w" : "b") : "w";
  const onMove = (m: { from: string; to: string; promotion?: string }) => {
    if (!awaiting) return false;
    const c = new Chess(fen);
    let mv; try { mv = c.move(m); } catch { return false; }
    const ok = mv.san === moves[ply].san;
    setGuess({ san: mv.san, ok });
    void api("/training/attempt", { body: { itemType: "master_stop", itemId: `${game.id}:${stop.ply}`, domain: "positional", correct: ok, details: { reason }, summary: `${game.white}–${game.black}: ${tr("parada en", "stop at")} ${stop.ply} (${ok ? "✓" : mv.san})` } }).catch(() => undefined);
    return true;
  };
  const next = () => { setGuess(null); setReason(""); setPly(Math.min(moves.length, ply + 1)); };
  return (
    <div>
      <button className="btn sm ghost" onClick={onBack}>← {tr("Volver", "Back")}</button>
      <h2 style={{ marginTop: 8 }}>{game.white} – {game.black}, {game.year}</h2>
      <div className="split">
        <div className="board-wrap"><Board fen={fen} orientation={userColor} movable={awaiting ? userColor : "none"} onMove={onMove} lastMove={ply ? [moves[ply - 1].from, moves[ply - 1].to] : null} /></div>
        <div className="card">
          <p className="muted">{tr("Jugada", "Move")} {Math.ceil(ply / 2)} · {ply ? moves[ply - 1].san : tr("inicio", "start")}</p>
          {awaiting ? (
            <div>
              <p style={{ color: "var(--gold-2)" }}><b>{tr("¿Qué jugarías aquí?", "What would you play here?")}</b></p>
              <p style={{ color: "var(--text)" }}>{stop.question[lang]}</p>
              <label>{tr("Tu razonamiento (antes de mover)", "Your reasoning (before moving)")}</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Después juega tu movimiento en el tablero.", "Then play your move on the board.")}</p>
            </div>
          ) : guess && stop ? (
            <div>
              <p>{tr("Tu jugada", "Your move")}: <b>{guess.san}</b> · {tr("Maestro", "Master")}: <b>{moves[ply].san}</b> <span className={`badge ${guess.ok ? "good" : "warn"}`}>{guess.ok ? "✓" : "≠"}</span></p>
              <p style={{ color: "var(--text)" }}>{stop.lesson[lang]}</p>
              <EngineLines fen={fen} lines={lines} depth={depth} />
              <button className="btn primary sm" style={{ marginTop: 8 }} onClick={next}>{tr("Continuar", "Continue")}</button>
            </div>
          ) : (
            <div className="row">
              <button className="btn" onClick={() => setPly(Math.max(0, ply - 1))}>◀</button>
              <button className="btn primary" onClick={next} disabled={ply >= moves.length}>▶</button>
              <span className="muted">{ply}/{moves.length}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
