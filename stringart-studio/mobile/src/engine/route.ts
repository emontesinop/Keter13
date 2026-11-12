// Route validation and thread-length estimation.
import type { Settings } from "./types";

/** Checks that a path is a trail: consecutive steps, no repeated undirected connection. */
export function validatePath(path: number[], n: number): { ok: boolean; duplicates: number } {
  const seen = new Set<number>();
  let dup = 0;
  for (let i = 1; i < path.length; i++) {
    const a = Math.min(path[i - 1], path[i]), b = Math.max(path[i - 1], path[i]);
    if (a === b || a < 0 || b >= n) return { ok: false, duplicates: dup };
    const key = a * n + b;
    if (seen.has(key)) dup++;
    seen.add(key);
  }
  return { ok: dup === 0, duplicates: dup };
}

/** Thread length (mm): chords + wraps around nails + knots + slack, then waste. */
export function threadLengthMm(path: number[], xy: Float64Array | number[], nailD: number, threadD: number, m: Settings["materials"]): number {
  let straight = 0, wraps = 0;
  const r = (nailD + threadD) / 2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    straight += Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1]);
    if (i < path.length - 1) {
      const c = path[i + 1];
      const ux = xy[2 * a] - xy[2 * b], uy = xy[2 * a + 1] - xy[2 * b + 1];
      const vx = xy[2 * c] - xy[2 * b], vy = xy[2 * c + 1] - xy[2 * b + 1];
      const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
      if (nu > 0 && nv > 0) {
        const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv)));
        wraps += r * (Math.PI - Math.acos(cos));
      }
    }
  }
  if (path.length < 2) return 0;
  return ((straight + wraps) * (1 + m.slackPct / 100) + 2 * m.knotMm) * (1 + m.wastePct / 100);
}

// ---------------------------------------------------------------------------------------------
// Edge sets that are not one continuous trail (multi-colour mode).
//
// A connected component with 2k odd-degree nails needs exactly max(1, k) trails.  Odd nails are
// paired with virtual edges, Hierholzer's algorithm finds an Euler circuit of the augmented graph,
// and the circuit is cut at the virtual edges -> the minimum number of trails.
// Trails are then chained with "rim moves": the thread runs around the OUTSIDE of the nail ring to
// the start of the next trail, so each colour can still be one piece of thread.

const circ = (a: number, b: number, n: number) => { const d = Math.abs(a - b); return Math.min(d, n - d); };

export function eulerTrails(edges: [number, number][], n: number): number[][] {
  if (!edges.length) return [];
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x)! !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const deg = new Map<number, number>();
  for (const [a, b] of edges) {
    for (const v of [a, b]) { if (!parent.has(v)) parent.set(v, v); deg.set(v, (deg.get(v) ?? 0) + 1); }
    const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb);
  }
  const comps = new Map<number, number[]>();
  for (const v of parent.keys()) { const r = find(v); if (!comps.has(r)) comps.set(r, []); comps.get(r)!.push(v); }
  const trails: number[][] = [];
  for (const comp of comps.values()) {
    const set = new Set(comp);
    const ce = edges.filter(([a]) => set.has(a));
    const odd = comp.filter((v) => (deg.get(v)! % 2) === 1).sort((x, y) => x - y);
    // pair odd nails with their neighbour along the ring (short virtual hops -> short rim moves)
    const all: [number, number, boolean][] = ce.map(([a, b]) => [a, b, false]);
    for (let i = 0; i + 1 < odd.length; i += 2) all.push([odd[i], odd[i + 1], true]);
    const adj = new Map<number, [number, number][]>();
    all.forEach(([a, b], id) => {
      if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
      adj.get(a)!.push([b, id]); adj.get(b)!.push([a, id]);
    });
    const usedE = new Uint8Array(all.length);
    const ptr = new Map<number, number>();
    const start = odd.length ? odd[0] : ce[0][0];
    const stack: [number, number][] = [[start, -1]];
    const circuit: [number, number][] = [];
    while (stack.length) {
      const [v] = stack[stack.length - 1];
      const lst = adj.get(v)!;
      let p = ptr.get(v) ?? 0;
      while (p < lst.length && usedE[lst[p][1]]) p++;
      ptr.set(v, p);
      if (p === lst.length) circuit.push(stack.pop()!);
      else { const [u, id] = lst[p]; usedE[id] = 1; stack.push([u, id]); }
    }
    circuit.reverse();
    if (!odd.length) { trails.push(circuit.map(([v]) => v)); continue; }
    const k = circuit.findIndex(([, id]) => id >= 0 && all[id][2]);
    const seq = circuit.slice(k).concat(circuit.slice(1, k + 1));
    let cur = [seq[0][0]];
    for (const [v, id] of seq.slice(1)) {
      if (all[id][2]) { if (cur.length > 1) trails.push(cur); cur = [v]; }
      else cur.push(v);
    }
    if (cur.length > 1) trails.push(cur);
  }
  return trails;
}

/** Order (and orient) trails so each starts as close as possible, along the rim, to where the previous ended. */
export function chainTrails(trails: number[][], n: number, startNail = 0): number[][] {
  const rest = trails.map((t) => t.slice());
  const out: number[][] = [];
  let pos = startNail;
  while (rest.length) {
    let best = Infinity, bi = 0, flip = false;
    rest.forEach((t, i) => {
      const d0 = circ(pos, t[0], n), d1 = circ(pos, t[t.length - 1], n);
      if (d0 < best) { best = d0; bi = i; flip = false; }
      if (d1 < best) { best = d1; bi = i; flip = true; }
    });
    const t = rest.splice(bi, 1)[0];
    const o = flip ? t.reverse() : t;
    out.push(o);
    pos = o[o.length - 1];
  }
  return out;
}

/** Validates a colour's sections: every section is a trail and no connection repeats. */
export function validateSections(sections: number[][], n: number): { ok: boolean; duplicates: number } {
  const seen = new Set<number>();
  let dup = 0;
  for (const s of sections) {
    if (s.length < 2) return { ok: false, duplicates: dup };
    for (let i = 1; i < s.length; i++) {
      const a = Math.min(s[i - 1], s[i]), b = Math.max(s[i - 1], s[i]);
      if (a === b || a < 0 || b >= n) return { ok: false, duplicates: dup };
      const key = a * n + b;
      if (seen.has(key)) dup++;
      seen.add(key);
    }
  }
  return { ok: dup === 0, duplicates: dup };
}

/** Rim travel (mm) between consecutive sections: arc along the nail ring, outside the nails. */
export function rimTravelMm(sections: number[][], xy: Float64Array | number[]): number {
  const n = xy.length / 2;
  let total = 0;
  const r = Math.hypot(xy[0], xy[1]);
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1][sections[i - 1].length - 1], b = sections[i][0];
    total += (2 * Math.PI * r * circ(a, b, n)) / n + 10;   // + allowance to pass around the end nails
  }
  return total;
}
