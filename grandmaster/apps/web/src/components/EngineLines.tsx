import { formatLine, formatScore, toWhitePov, uciLineToSan, type PvLine } from "@gm/core";

export function EngineLines({ fen, lines, depth, onPlay }: { fen: string; lines: PvLine[]; depth?: number; onPlay?: (uci: string) => void }) {
  const stm = fen.split(" ")[1] as "w" | "b";
  if (!lines.length) return <p className="muted" style={{ fontSize: ".82rem" }}>Stockfish…</p>;
  return (
    <div style={{ fontSize: ".85rem" }}>
      {lines.map((l) => (
        <div key={l.multipv} className="row" style={{ flexWrap: "nowrap", padding: "3px 0", cursor: onPlay ? "pointer" : undefined }} onClick={() => onPlay?.(l.pv[0])}>
          <span className="badge" style={{ minWidth: 52, textAlign: "center" }}>{formatScore(toWhitePov(l.score, stm))}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatLine(fen, uciLineToSan(fen, l.pv.slice(0, 10)))}</span>
        </div>
      ))}
      {depth !== undefined && <small className="muted">Stockfish 18 · depth {depth}</small>}
    </div>
  );
}

export const arrowsFromLines = (lines: PvLine[]) => lines.slice(0, 3).map((l, i) => ({ from: l.pv[0]?.slice(0, 2), to: l.pv[0]?.slice(2, 4), color: i === 0 ? "#15781B" : "#3987e5" })).filter((a) => a.from && a.to);
