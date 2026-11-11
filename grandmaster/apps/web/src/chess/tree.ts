import { Chess } from "chess.js";

export interface TreeNode { id: number; fen: string; san?: string; uci?: string; parent: number | null; children: number[]; comment?: string; }

/** Variation tree with undo/redo semantics (back = parent, forward = first child). */
export class GameTree {
  nodes = new Map<number, TreeNode>();
  private seq = 0;
  root: number;
  constructor(startFen = new Chess().fen()) { this.root = this.add({ fen: startFen, parent: null }); }
  private add(n: Omit<TreeNode, "id" | "children">) { const id = this.seq++; this.nodes.set(id, { ...n, id, children: [] }); return id; }
  get(id: number) { return this.nodes.get(id)!; }
  play(from: number, move: string | { from: string; to: string; promotion?: string }): number | null {
    const node = this.get(from);
    const c = new Chess(node.fen);
    let m;
    try { m = c.move(move as any); } catch { return null; }
    const uci = m.from + m.to + (m.promotion ?? "");
    const existing = node.children.find((k) => this.get(k).uci === uci);
    if (existing !== undefined) return existing;
    const id = this.add({ fen: c.fen(), san: m.san, uci, parent: from });
    node.children.push(id);
    return id;
  }
  static fromPgnMoves(sans: string[], startFen?: string) {
    const t = new GameTree(startFen);
    let cur = t.root;
    for (const s of sans) { const n = t.play(cur, s); if (n === null) break; cur = n; }
    return t;
  }
  path(id: number): number[] { const out: number[] = []; let c: number | null = id; while (c !== null) { out.unshift(c); c = this.get(c).parent; } return out; }
  mainline(from = this.root): number[] { const out = [from]; let c = this.get(from); while (c.children.length) { c = this.get(c.children[0]); out.push(c.id); } return out; }
  sans(id: number) { return this.path(id).slice(1).map((k) => this.get(k).san!); }
  promote(id: number) { const n = this.get(id); if (n.parent === null) return; const p = this.get(n.parent); p.children = [id, ...p.children.filter((k) => k !== id)]; }
  remove(id: number) { const n = this.get(id); if (n.parent === null) return; const p = this.get(n.parent); p.children = p.children.filter((k) => k !== id); }
  plyOf(id: number) { return this.path(id).length - 1; }
}
