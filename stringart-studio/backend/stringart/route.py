"""Physical thread route planning (graph theory).

Nails are vertices, selected connections are edges of an undirected simple
graph G.  A *section* is one continuous piece of thread = a trail in G
(edges may not repeat, vertices may).

Key facts used
--------------
* Every connected component with ``2k > 0`` odd-degree vertices can be
  decomposed into exactly ``k`` edge-disjoint trails, and no fewer (each trail
  has at most two odd ends).  A component with no odd vertices is a single
  closed trail (Euler circuit).  Hence the minimum number of thread sections is

      S_min = sum_components max(1, odd_c / 2).

* The decomposition is constructed by pairing odd vertices with *virtual*
  edges, running Hierholzer's algorithm for an Euler circuit on the augmented
  graph, and cutting the circuit at the virtual edges.

* Adding a real connection between two odd vertices (a "bridge", practical
  mode) lowers S_min by one when it removes two odd vertices without creating
  an all-even component that was previously a single open trail.  Bridges are
  *proposals*: they are never applied without explicit approval and are
  reported separately with their visual cost.

The optimiser already produces trails; ``plan_route`` keeps that order when it
is valid and already minimal, and otherwise re-decomposes.  For monochrome
work the simulated image is order-independent (additive density), so
re-ordering never changes the picture.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

Edge = Tuple[int, int]


def canon(a: int, b: int) -> Edge:
    return (a, b) if a < b else (b, a)


class DSU:
    def __init__(self):
        self.p: Dict[int, int] = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def degrees(edges: Sequence[Edge]) -> Dict[int, int]:
    deg: Dict[int, int] = defaultdict(int)
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    return deg


def components(edges: Sequence[Edge]) -> List[List[int]]:
    dsu = DSU()
    for a, b in edges:
        dsu.union(a, b)
    groups: Dict[int, List[int]] = defaultdict(list)
    for v in list(dsu.p):
        groups[dsu.find(v)].append(v)
    return list(groups.values())


def min_sections(edges: Sequence[Edge]) -> int:
    if not edges:
        return 0
    deg = degrees(edges)
    total = 0
    for comp in components(edges):
        odd = sum(1 for v in comp if deg[v] % 2)
        total += max(1, odd // 2)
    return total


def find_duplicates(edges: Sequence[Edge]) -> List[Edge]:
    seen, dup = set(), []
    for a, b in edges:
        e = canon(a, b)
        if e in seen:
            dup.append(e)
        seen.add(e)
    return dup


def euler_decomposition(edges: Sequence[Edge], xy: Optional[np.ndarray] = None) -> List[List[int]]:
    """Split a simple graph into the minimum number of trails (vertex lists)."""
    if not edges:
        return []
    deg = degrees(edges)
    sections: List[List[int]] = []
    adj: Dict[int, List[Tuple[int, int]]] = defaultdict(list)  # v -> [(u, edge_id)]
    real = list(edges)
    for comp in components(real):
        comp_set = set(comp)
        comp_edges = [e for e in real if e[0] in comp_set]
        odd = [v for v in comp if deg[v] % 2]
        # pair odd vertices: greedily by geometric proximity (pairing choice does not
        # change the count, only where sections begin/end)
        pairs = []
        rest = list(odd)
        if xy is not None:
            rest.sort(key=lambda v: (xy[v, 0], xy[v, 1]))
        while rest:
            a = rest.pop(0)
            if xy is not None and rest:
                d = [np.hypot(*(xy[a] - xy[b])) for b in rest]
                b = rest.pop(int(np.argmin(d)))
            else:
                b = rest.pop(0)
            pairs.append((a, b))
        all_edges = [(a, b, False) for a, b in comp_edges] + [(a, b, True) for a, b in pairs]
        adj = defaultdict(list)
        for eid, (a, b, _) in enumerate(all_edges):
            adj[a].append((b, eid))
            adj[b].append((a, eid))
        used = [False] * len(all_edges)
        ptr = defaultdict(int)
        start = odd[0] if odd else comp_edges[0][0]
        # iterative Hierholzer, recording the edge used to reach each vertex
        stack = [(start, -1)]
        circuit: List[Tuple[int, int]] = []
        while stack:
            v, via = stack[-1]
            lst = adj[v]
            while ptr[v] < len(lst) and used[lst[ptr[v]][1]]:
                ptr[v] += 1
            if ptr[v] == len(lst):
                circuit.append(stack.pop())
            else:
                u, eid = lst[ptr[v]]
                used[eid] = True
                stack.append((u, eid))
        circuit.reverse()  # [(v0,-1), (v1,e1), ...]
        if not pairs:
            sections.append([v for v, _ in circuit])
            continue
        # rotate so the circuit starts right after a virtual edge, then cut at virtual edges
        k = next(i for i, (_, e) in enumerate(circuit) if e >= 0 and all_edges[e][2])
        seq = circuit[k:] + circuit[1:k + 1]  # closed walk starting at the head of a virtual edge
        cur = [seq[0][0]]
        for v, e in seq[1:]:
            if all_edges[e][2]:
                if len(cur) > 1:
                    sections.append(cur)
                cur = [v]
            else:
                cur.append(v)
        if len(cur) > 1:
            sections.append(cur)
    return sections


# ---------------------------------------------------------------- bridges
@dataclass
class Bridge:
    a: int
    b: int
    visual_cost: float      # error increase if added (negative = it helps)
    length_mm: float

    def to_dict(self):
        return {"from": self.a + 1, "to": self.b + 1, "visual_cost": self.visual_cost,
                "length_mm": self.length_mm}


def propose_bridges(edges: Sequence[Edge], max_bridges: int, cost_fn, valid_fn, length_fn,
                    max_candidates: int = 4000) -> List[Bridge]:
    """Greedy cheapest bridges that each reduce the minimum section count by one."""
    if max_bridges <= 0 or not edges:
        return []
    cur = [canon(*e) for e in edges]
    used = set(cur)
    deg = degrees(cur)
    odd = sorted(v for v, d in deg.items() if d % 2)
    cands = []
    for i, a in enumerate(odd):
        for b in odd[i + 1:]:
            if canon(a, b) in used or not valid_fn(a, b):
                continue
            cands.append((a, b))
    if len(cands) > max_candidates:
        # evaluate the geometrically shortest candidates first
        cands.sort(key=lambda e: length_fn(*e))
        cands = cands[:max_candidates]
    scored = sorted(((cost_fn(a, b), a, b) for a, b in cands), key=lambda t: t[0])
    out: List[Bridge] = []
    base = min_sections(cur)
    for cost, a, b in scored:
        if len(out) >= max_bridges or base <= 1:
            break
        if deg[a] % 2 == 0 or deg[b] % 2 == 0:
            continue
        trial = cur + [canon(a, b)]
        s = min_sections(trial)
        if s < base:
            cur = trial
            used.add(canon(a, b))
            deg[a] += 1
            deg[b] += 1
            base = s
            out.append(Bridge(a, b, float(cost), float(length_fn(a, b))))
    return out


# ---------------------------------------------------------------- planning
@dataclass
class RoutePlan:
    sections: List[List[int]]                  # 0-based nail trails
    min_sections: int
    is_continuous: bool
    duplicates: List[Edge]
    components: int
    odd_vertices: int
    bridges_applied: List[Edge] = field(default_factory=list)
    reordered: bool = False

    @property
    def n_steps(self) -> int:
        return sum(len(s) - 1 for s in self.sections)


def plan_route(edges_in_order: Sequence[Edge], given_sections: Optional[List[List[int]]] = None,
               extra_edges: Sequence[Edge] = (), xy: Optional[np.ndarray] = None) -> RoutePlan:
    edges = [canon(*e) for e in edges_in_order] + [canon(*e) for e in extra_edges]
    dup = find_duplicates(edges)
    if dup:
        raise ValueError(f"duplicate connections in selection: {[(a + 1, b + 1) for a, b in dup[:5]]}")
    smin = min_sections(edges)
    deg = degrees(edges)
    n_odd = sum(1 for d in deg.values() if d % 2)
    n_comp = len(components(edges))
    if given_sections and not extra_edges and len(given_sections) == smin and validate_sections(given_sections, edges):
        secs = [list(s) for s in given_sections]
        reordered = False
    else:
        secs = euler_decomposition(edges, xy)
        reordered = True
        if given_sections and not extra_edges and len(given_sections) <= len(secs) \
                and validate_sections(given_sections, edges):
            secs, reordered = [list(s) for s in given_sections], False
    secs = order_sections(secs, xy)
    plan = RoutePlan(sections=secs, min_sections=smin, is_continuous=len(secs) == 1, duplicates=dup,
                     components=n_comp, odd_vertices=n_odd,
                     bridges_applied=[canon(*e) for e in extra_edges], reordered=reordered)
    if not validate_sections(plan.sections, edges):
        raise AssertionError("route validation failed")
    return plan


def order_sections(secs: List[List[int]], xy: Optional[np.ndarray]) -> List[List[int]]:
    """Order sections (and orient them) so each starts near where the previous ended."""
    if len(secs) <= 1 or xy is None:
        return secs
    rest = [list(s) for s in secs]
    rest.sort(key=len, reverse=True)
    out = [rest.pop(0)]
    while rest:
        end = xy[out[-1][-1]]
        best, bi, flip = None, 0, False
        for i, s in enumerate(rest):
            for f, v in ((False, s[0]), (True, s[-1])):
                d = float(np.hypot(*(xy[v] - end)))
                if best is None or d < best:
                    best, bi, flip = d, i, f
        s = rest.pop(bi)
        out.append(s[::-1] if flip else s)
    return out


def validate_sections(sections: Sequence[Sequence[int]], edges: Sequence[Edge]) -> bool:
    """True iff the sections use every edge exactly once and nothing else."""
    want = {canon(*e) for e in edges}
    if len(want) != len(edges):
        return False
    got = []
    for s in sections:
        if len(s) < 2:
            return False
        got.extend(canon(a, b) for a, b in zip(s[:-1], s[1:]))
    return len(got) == len(set(got)) and set(got) == want


# ---------------------------------------------------------------- thread length
def wrap_length_mm(xy: np.ndarray, prev: int, v: int, nxt: int, nail_d: float, thread_d: float,
                   style: str) -> float:
    """Thread consumed turning around nail ``v`` between two straight runs.

    The thread changes direction by ``pi - phi`` where ``phi`` is the angle at
    ``v`` between the two runs; it hugs the nail on an arc of radius
    ``(nail_d + thread_d) / 2`` through that angle.  ``full_loop`` adds one
    complete turn (a common anti-slip practice).
    """
    a = xy[prev] - xy[v]
    b = xy[nxt] - xy[v]
    na, nb = np.hypot(*a), np.hypot(*b)
    if na == 0 or nb == 0:
        return 0.0
    cosphi = float(np.clip(np.dot(a, b) / (na * nb), -1, 1))
    turn = np.pi - np.arccos(cosphi)
    r = (nail_d + thread_d) / 2
    extra = 2 * np.pi * r if style == "full_loop" else 0.0
    return float(r * turn + extra)


def section_length_mm(xy: np.ndarray, sec: Sequence[int], nail_d: float, thread_d: float, style: str):
    straight = float(sum(np.hypot(*(xy[a] - xy[b])) for a, b in zip(sec[:-1], sec[1:])))
    wraps = float(sum(wrap_length_mm(xy, sec[i - 1], sec[i], sec[i + 1], nail_d, thread_d, style)
                      for i in range(1, len(sec) - 1)))
    return straight, wraps
