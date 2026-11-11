import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";

export interface Arrow { from: string; to: string; color?: string; }
export interface BoardProps {
  fen: string;
  orientation?: "w" | "b";
  /** which side may move: a colour, "both" (analysis), or "none" */
  movable?: "w" | "b" | "both" | "none";
  onMove?: (m: { from: string; to: string; promotion?: string }) => boolean | void;
  arrows?: Arrow[];
  lastMove?: [string, string] | null;
  highlights?: Record<string, string>;
  coords?: boolean;
}

const FILES = "abcdefgh";
const pieceSrc = (color: string, type: string) => `/pieces/${color}${type.toUpperCase()}.svg`;

export function Board({ fen, orientation = "w", movable = "both", onMove, arrows = [], lastMove, highlights = {}, coords = true }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chess = useMemo(() => { try { return new Chess(fen); } catch { return null; } }, [fen]);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; src: string; size: number } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string; color: string } | null>(null);
  useEffect(() => { setSel(null); setPromo(null); }, [fen]);

  const turn = chess?.turn();
  const canMove = movable !== "none" && !!chess && (movable === "both" || movable === turn);
  const targets = useMemo(() => {
    if (!sel || !chess || !canMove) return new Set<string>();
    return new Set(chess.moves({ square: sel as Square, verbose: true }).map((m) => m.to));
  }, [sel, chess, canMove]);

  const sqPos = (sq: string) => {
    const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
    const x = orientation === "w" ? f : 7 - f, y = orientation === "w" ? 7 - r : r;
    return { x, y };
  };
  const squareAt = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8), y = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const f = orientation === "w" ? x : 7 - x, r = orientation === "w" ? 7 - y : y;
    return FILES[f] + (r + 1);
  };

  const tryMove = (from: string, to: string) => {
    if (!chess || from === to) return false;
    const legal = chess.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion)) { setPromo({ from, to, color: legal[0].color }); return true; }
    const ok = onMove?.({ from, to });
    setSel(null);
    return ok !== false;
  };

  const ownPiece = (sq: string) => { const p = chess?.get(sq as Square); return !!p && canMove && p.color === turn; };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!chess || promo) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (sel && targets.has(sq)) { tryMove(sel, sq); return; }
    if (ownPiece(sq)) {
      const p = chess.get(sq as Square)!;
      setSel(sq);
      const size = ref.current!.getBoundingClientRect().width / 8;
      setDrag({ from: sq, x: e.clientX, y: e.clientY, src: pieceSrc(p.color, p.type), size });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else setSel(null);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY }); };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const sq = squareAt(e.clientX, e.clientY);
    const from = drag.from;
    setDrag(null);
    if (sq && sq !== from) tryMove(from, sq);
  };

  const board = chess?.board() ?? [];
  const checkSq = chess?.inCheck() ? board.flat().find((p) => p && p.type === "k" && p.color === turn)?.square : null;
  const squares = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = FILES[f] + (r + 1);
    const { x, y } = sqPos(sq);
    const light = (f + r) % 2 === 1;
    const piece = chess?.get(sq as Square);
    squares.push(
      <div key={sq} className={`sq ${light ? "light" : "dark"} ${lastMove && (lastMove[0] === sq || lastMove[1] === sq) ? "last" : ""} ${sel === sq ? "sel" : ""} ${checkSq === sq ? "check" : ""}`}
        style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%`, ...(highlights[sq] ? { boxShadow: `inset 0 0 0 100px ${highlights[sq]}` } : {}) }}>
        {targets.has(sq) && (piece ? <div className="ring" /> : <div className="dot" />)}
        {coords && y === 7 && <span className="coord f">{sq[0]}</span>}
        {coords && x === 0 && <span className="coord r">{sq[1]}</span>}
      </div>,
    );
  }
  const pieces = board.flat().filter(Boolean).map((p) => {
    const { x, y } = sqPos(p!.square);
    return (
      <div key={p!.square + p!.color + p!.type} className={`piece ${drag?.from === p!.square ? "dragging" : ""}`} style={{ left: `${x * 12.5}%`, top: `${y * 12.5}%` }}>
        <img src={pieceSrc(p!.color, p!.type)} alt={`${p!.color}${p!.type}`} draggable={false} />
      </div>
    );
  });

  return (
    <div className="board" ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)} role="grid" aria-label="Chessboard">
      {squares}
      {pieces}
      <svg className="arrows" viewBox="0 0 8 8">
        <defs>
          {["#15781B", "#3987e5", "#e06262", "#c9a45c"].map((c) => (
            <marker key={c} id={`ah${c.slice(1)}`} markerWidth="4" markerHeight="4" refX="2.05" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill={c} /></marker>
          ))}
        </defs>
        {arrows.map((a, i) => {
          const s = sqPos(a.from), t = sqPos(a.to);
          const c = a.color ?? "#15781B";
          const x1 = s.x + 0.5, y1 = s.y + 0.5, x2 = t.x + 0.5, y2 = t.y + 0.5;
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const sx = x2 - ((x2 - x1) / len) * 0.35, sy = y2 - ((y2 - y1) / len) * 0.35;
          return <line key={i} x1={x1} y1={y1} x2={sx} y2={sy} stroke={c} strokeWidth={0.16} strokeLinecap="round" opacity={0.82} markerEnd={`url(#ah${c.slice(1)})`} />;
        })}
      </svg>
      {promo && (
        <div className="promo" onPointerDown={(e) => e.stopPropagation()}>
          {["q", "r", "b", "n"].map((pp) => (
            <button key={pp} onClick={() => { const ok = onMove?.({ from: promo.from, to: promo.to, promotion: pp }); void ok; setPromo(null); setSel(null); }}>
              <img src={pieceSrc(promo.color, pp)} alt={pp} width="100%" />
            </button>
          ))}
        </div>
      )}
      {drag && <img className="drag-ghost" src={drag.src} style={{ left: drag.x, top: drag.y, width: drag.size * 1.1, height: drag.size * 1.1 }} alt="" />}
    </div>
  );
}

export function EvalBar({ cp, mate, orientation = "w" }: { cp?: number; mate?: number; orientation?: "w" | "b" }) {
  // White-POV score → white share of the bar (logistic, same model as win%)
  let w = 50;
  if (mate !== undefined) w = mate > 0 ? 100 : 0;
  else if (cp !== undefined) w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
  const label = mate !== undefined ? `M${Math.abs(mate)}` : cp !== undefined ? (Math.abs(cp) / 100).toFixed(1) : "";
  const flipped = orientation === "b";
  return (
    <div className="evalbar" style={flipped ? { transform: "rotate(180deg)" } : undefined} aria-label={`Evaluation ${label}`}>
      <div className="w" style={{ height: `${w}%` }} />
      <div className="lbl" style={{ [w >= 50 ? "bottom" : "top"]: 2, color: w >= 50 ? "#111" : "#eee", transform: flipped ? "rotate(180deg)" : undefined } as any}>{label}</div>
    </div>
  );
}
