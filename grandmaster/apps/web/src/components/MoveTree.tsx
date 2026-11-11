import type { GameTree } from "../chess/tree";

/** Mainline with inline (nested) variations, clickable. */
export function MoveTree({ tree, current, onSelect, classes = {} }: { tree: GameTree; current: number; onSelect: (id: number) => void; classes?: Record<number, string> }) {
  const rootFen = tree.get(tree.root).fen.split(" ");
  const startMove = Number(rootFen[5] ?? 1), startBlack = rootFen[1] === "b";
  const info = (ply: number) => { const abs = ply - 1 + (startBlack ? 1 : 0); return { num: startMove + Math.floor(abs / 2), white: abs % 2 === 0 }; };
  const renderLine = (startId: number): JSX.Element[] => {
    const out: JSX.Element[] = [];
    let id: number | undefined = startId;
    let needNum = true;
    while (id !== undefined) {
      const n = tree.get(id);
      const { num, white } = info(tree.plyOf(id));
      if (white || needNum) out.push(<span key={`n${id}`} className="mn">{num}{white ? "." : "…"}</span>);
      out.push(<button key={id} className={`${current === id ? "cur" : ""} ${classes[id] ?? ""}`} onClick={() => onSelect(id!)}>{n.san}</button>);
      needNum = false;
      const parent = n.parent !== null ? tree.get(n.parent) : null;
      if (parent && parent.children[0] === id && parent.children.length > 1) {
        for (const alt of parent.children.slice(1)) out.push(<span key={`v${alt}`} className="var">( {renderLine(alt)} )</span>);
        needNum = true;
      }
      id = n.children[0];
    }
    return out;
  };
  const first = tree.get(tree.root).children[0];
  return <div className="moves">{first !== undefined ? renderLine(first) : <span className="muted">—</span>}</div>;
}
