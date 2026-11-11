import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chess, type Square } from "chess.js";
import { parsePgn } from "@gm/core";
import { useT } from "../state";
import { Board, EvalBar } from "../chess/Board";
import { GameTree } from "../chess/tree";
import { MoveTree } from "../components/MoveTree";
import { useEngine } from "../chess/useEngine";
import { EngineLines, arrowsFromLines } from "../components/EngineLines";
import { api } from "../api";

export function AnalysisBoard() {
  const tr = useT();
  const [params] = useSearchParams();
  const [tree, setTree] = useState(() => new GameTree(params.get("fen") ?? undefined));
  const [cur, setCur] = useState(tree.root);
  const [, force] = useState(0);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [live, setLive] = useState(true);
  const [multipv, setMultipv] = useState(3);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [deep, setDeep] = useState<any | null>(null);
  const node = tree.get(cur);
  const { lines, depth } = useEngine(node.fen, live && !edit, multipv, 22);
  const load = () => {
    setErr(null);
    const t = input.trim();
    try {
      if (/^\s*([rnbqkpRNBQKP1-8]+\/){7}/.test(t)) { new Chess(t); const nt = new GameTree(t); setTree(nt); setCur(nt.root); }
      else { const g = parsePgn(t); const nt = GameTree.fromPgnMoves(g.moves.map((m) => m.san), g.startFen); setTree(nt); setCur(nt.mainline().at(-1)!); }
    } catch (e) { setErr(tr("No se pudo leer FEN/PGN: ", "Could not read FEN/PGN: ") + (e as Error).message); }
  };
  const play = (m: any) => { const n = tree.play(cur, m); if (n === null) return false; setCur(n); force((x) => x + 1); };
  const stm = node.fen.split(" ")[1];
  const evalW = lines[0] ? (stm === "w" ? lines[0].score : lines[0].score.mate !== undefined ? { mate: -lines[0].score.mate } : { cp: -(lines[0].score.cp ?? 0) }) : undefined;
  const serverDeep = async () => { setDeep({ loading: true }); try { setDeep(await api("/analysis/position", { body: { fen: node.fen, depth: 22, multipv: 3 } })); } catch (e) { setDeep({ error: (e as Error).message }); } };
  if (edit) return <Editor fen={node.fen} onDone={(f) => { if (f) { const nt = new GameTree(f); setTree(nt); setCur(nt.root); } setEdit(false); }} />;
  return (
    <div>
      <h1>{tr("Tablero de análisis", "Analysis board")}</h1>
      <div className="split">
        <div>
          <div className="board-row board-wrap">
            <EvalBar cp={evalW?.cp} mate={(evalW as any)?.mate} orientation={orientation} />
            <Board fen={node.fen} orientation={orientation} movable="both" onMove={play} arrows={live ? arrowsFromLines(lines) : []} lastMove={node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : null} />
          </div>
          <div className="navbtns">
            <button className="btn" onClick={() => setCur(tree.root)}>⏮</button>
            <button className="btn" onClick={() => node.parent !== null && setCur(node.parent)}>◀</button>
            <button className="btn" onClick={() => node.children[0] !== undefined && setCur(node.children[0])}>▶</button>
            <button className="btn" onClick={() => setOrientation(orientation === "w" ? "b" : "w")}>⇅</button>
            <button className={`btn ${live ? "primary" : ""}`} onClick={() => setLive(!live)}>SF</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => { tree.promote(cur); force((x) => x + 1); }}>{tr("Promover variante", "Promote line")}</button>
            <button className="btn sm" onClick={() => { const p = node.parent; if (p !== null) { tree.remove(cur); setCur(p); } }}>{tr("Borrar desde aquí", "Delete from here")}</button>
            <button className="btn sm" onClick={() => setEdit(true)}>✎ {tr("Editar posición", "Edit position")}</button>
            <Link className="btn sm" to={`/coach?fen=${encodeURIComponent(node.fen)}`}>♛ Coach</Link>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="row between"><h3>Stockfish 18 (WASM)</h3>
              <select value={multipv} onChange={(e) => setMultipv(Number(e.target.value))} style={{ width: "auto" }}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>MultiPV {n}</option>)}</select></div>
            {live ? <EngineLines fen={node.fen} lines={lines} depth={depth} onPlay={(u) => play({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })} /> : <p className="muted">{tr("Motor apagado (útil para autoanálisis antes de consultar el motor).", "Engine off (useful for self-analysis before consulting the engine).")}</p>}
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => void serverDeep()}>{tr("Análisis profundo en servidor", "Deep server analysis")}</button>
            {deep?.loading && <p className="muted">…</p>}
            {deep?.error && <p className="error">{deep.error}</p>}
            {deep?.lines && deep.lines.map((l: any) => <p key={l.multipv} style={{ fontSize: ".85rem", margin: "2px 0" }}><span className="badge">{l.score.mate !== undefined ? `#${l.score.mate}` : (l.score.cp / 100).toFixed(2)}</span> {l.san.join(" ")} <small className="muted">d{l.depth}</small></p>)}
          </div>
          <div className="card"><MoveTree tree={tree} current={cur} onSelect={setCur} /></div>
          <div className="card">
            <label>FEN</label>
            <input readOnly value={node.fen} onFocus={(e) => e.target.select()} />
            <label>{tr("Cargar FEN o PGN", "Load FEN or PGN")}</label>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={load}>{tr("Cargar", "Load")}</button>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(pgnOf(tree, cur))}>{tr("Copiar PGN", "Copy PGN")}</button>
            </div>
            {err && <p className="error">{err}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function pgnOf(tree: GameTree, id: number) {
  const c = new Chess(tree.get(tree.root).fen);
  for (const s of tree.sans(id)) c.move(s);
  return c.pgn();
}

const PALETTE = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
function Editor({ fen, onDone }: { fen: string; onDone: (fen: string | null) => void }) {
  const tr = useT();
  const [board, setBoard] = useState(() => { const c = new Chess(fen); const m: Record<string, string> = {}; c.board().flat().forEach((p) => { if (p) m[p.square] = p.color + p.type.toUpperCase(); }); return m; });
  const [brush, setBrush] = useState<string>("wP");
  const [turn, setTurn] = useState<"w" | "b">(fen.split(" ")[1] as "w" | "b");
  const [castle, setCastle] = useState(fen.split(" ")[2]);
  const result = useMemo(() => {
    const c = new Chess(); c.clear();
    for (const [sq, p] of Object.entries(board)) c.put({ color: p[0] as any, type: p[1].toLowerCase() as any }, sq as Square);
    const parts = c.fen().split(" "); parts[1] = turn; parts[2] = castle || "-"; parts[3] = "-";
    const f = parts.join(" ");
    try { new Chess(f); return { fen: f, ok: true }; } catch (e) { return { fen: f, ok: false, err: (e as Error).message }; }
  }, [board, turn, castle]);
  const FILES = "abcdefgh";
  return (
    <div>
      <h1>{tr("Editor de posición", "Position editor")}</h1>
      <div className="split">
        <div className="board-wrap">
          <div className="board" onPointerDown={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = Math.floor(((e.clientX - r.left) / r.width) * 8), y = Math.floor(((e.clientY - r.top) / r.height) * 8);
            const sq = FILES[x] + (8 - y);
            setBoard((b) => { const n = { ...b }; if (brush === "x" || n[sq] === brush) delete n[sq]; else n[sq] = brush; return n; });
          }}>
            {Array.from({ length: 64 }, (_, i) => { const x = i % 8, y = Math.floor(i / 8); const sq = FILES[x] + (8 - y); return (
              <div key={sq} className={`sq ${(x + y) % 2 ? "dark" : "light"}`} style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%` }}>
                {board[sq] && <img src={`/pieces/${board[sq]}.svg`} alt={board[sq]} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />}
              </div>); })}
          </div>
        </div>
        <div className="card">
          <div className="row">{PALETTE.map((p) => <button key={p} className={`chip ${brush === p ? "on" : ""}`} onClick={() => setBrush(p)} style={{ padding: 2 }}><img src={`/pieces/${p}.svg`} alt={p} width={30} height={30} /></button>)}
            <button className={`chip ${brush === "x" ? "on" : ""}`} onClick={() => setBrush("x")}>✕ {tr("borrar", "erase")}</button></div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className={`chip ${turn === "w" ? "on" : ""}`} onClick={() => setTurn("w")}>{tr("Juegan blancas", "White to move")}</button>
            <button className={`chip ${turn === "b" ? "on" : ""}`} onClick={() => setTurn("b")}>{tr("Juegan negras", "Black to move")}</button>
          </div>
          <label>{tr("Enroques (KQkq o -)", "Castling (KQkq or -)")}</label>
          <input value={castle} onChange={(e) => setCastle(e.target.value.replace(/[^KQkq-]/g, ""))} />
          <p style={{ fontSize: ".8rem", wordBreak: "break-all" }}>{result.fen}</p>
          {!result.ok && <p className="error">{result.err}</p>}
          <div className="row">
            <button className="btn sm" onClick={() => setBoard({})}>{tr("Vaciar", "Clear")}</button>
            <button className="btn sm" onClick={() => onDone(null)}>{tr("Cancelar", "Cancel")}</button>
            <button className="btn primary sm" disabled={!result.ok} onClick={() => onDone(result.fen)}>{tr("Usar posición", "Use position")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
