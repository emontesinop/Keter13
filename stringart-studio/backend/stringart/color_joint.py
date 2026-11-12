"""Joint multi-colour optimiser (desktop port of the iPhone engine's colorOpt.ts).

Model (partitive mixing, see render.py)::

    C = 1 - exp(-sum_k A_k),  mix = sum_k A_k c_k / sum_k A_k,  P = (1 - C) bg + C mix   (linear RGB)

Error, measured on sqrt(linear RGB) (close to perceptual lightness)::

    E = sum_p w_p || sqrt(P_p) - sqrt(T_p) ||^2

Greedy selection over ALL (colour, connection) pairs on the whole board, with no continuity
constraint, so the colours compete for and complement each other on every pixel.

Lazy evaluation in vectorised batches: candidates sit in a heap with their last known gain. The
top 64 are re-evaluated exactly in one NumPy pass, and every refreshed candidate that still beats
the rest of the queue is accepted (lines share only the pixels where they cross, so accepting
several per batch is a close approximation of strict greedy). All gains are recomputed
periodically, because colour mixing makes gains non-monotone. The physical route (Euler trails
joined around the rim) is planned afterwards by pipeline.py.
"""
from __future__ import annotations

import heapq
import threading
import time
from typing import Callable, List, Optional, Tuple

import numpy as np

from .engine import Cancelled
from .raster import LineCache


class JointColorOptimizer:
    def __init__(self, cache: LineCache, target_lin: np.ndarray, weight: np.ndarray, colors_lin: List[np.ndarray],
                 bg_lin: np.ndarray, thread_px: float, opacity: float,
                 progress: Optional[Callable[[dict], None]] = None, cancel: Optional[threading.Event] = None):
        self.c = cache
        self.K = len(colors_lin)
        self.cols = np.asarray(colors_lin, dtype=np.float32)
        self.bg = np.asarray(bg_lin, dtype=np.float32)
        self.w = weight.astype(np.float32).ravel()
        self.tq = np.sqrt(np.clip(target_lin.reshape(-1, 3), 0, None)).astype(np.float32)
        N = self.w.size
        self.tot = np.zeros(N, np.float32)
        self.m = np.zeros((N, 3), np.float32)
        alpha = opacity * thread_px
        self.dl = [(-np.log1p(-np.clip(alpha * wf, 1e-4, 0.999))).astype(np.float32) for wf in cache.wf]
        self.counts = [np.diff(o).astype(np.int64) for o in cache.offsets]
        # global table of undirected lines (a < b) pointing into one flat pixel array
        base = np.concatenate([[0], np.cumsum([len(p) for p in cache.pix])])
        self.flat = np.concatenate(cache.pix).astype(np.int64)
        la, lb, start, length, dval = [], [], [], [], []
        self.lid_of = []
        for a in range(cache.n):
            ps = cache.partners[a]
            sel = np.nonzero(ps > a)[0]
            ids = np.full(len(ps), -1, np.int64)
            ids[sel] = np.arange(len(la), len(la) + len(sel))
            self.lid_of.append(ids)
            o = cache.offsets[a]
            la.extend([a] * len(sel)); lb.extend(ps[sel].tolist())
            start.extend((base[a] + o[sel]).tolist()); length.extend((o[sel + 1] - o[sel]).tolist())
            dval.extend(self.dl[a][sel].tolist())
        self.la, self.lb = np.asarray(la), np.asarray(lb)
        self.lstart, self.llen = np.asarray(start, np.int64), np.asarray(length, np.int64)
        self.ld = np.asarray(dval, np.float32)
        self.L = len(self.la)
        self.used = np.zeros((self.K, self.L), dtype=bool)
        self.err = self._err(np.arange(N), self.tot, self.m)
        self.progress = progress
        self.cancel = cancel
        # accept refreshed candidates within this ratio of the best stale (upper-bound) gain left in
        # the queue: 1.0 = strict lazy greedy; 0.7 measured 2x faster with the same error reduction (0.920 vs 0.921)
        self.accept_ratio = 0.7

    def _err(self, pix, t, m):
        C = 1.0 - np.exp(-t)
        inv = np.where(t > 1e-9, C / np.maximum(t, 1e-9), 0.0)
        P = (1.0 - C)[:, None] * self.bg + inv[:, None] * m
        d = np.sqrt(np.maximum(P, 0)) - self.tq[pix]
        return (self.w[pix] * (d * d).sum(axis=1)).astype(np.float32)

    def gains_batch(self, ks: np.ndarray, lids: np.ndarray) -> np.ndarray:
        """Exact gains of (colour k, line id) candidates in one vectorised pass."""
        lens = self.llen[lids]
        cum = np.cumsum(lens)
        first = cum - lens
        idx = np.arange(cum[-1]) + np.repeat(self.lstart[lids] - first, lens)
        pix = self.flat[idx]
        d = np.repeat(self.ld[lids], lens)
        cols = self.cols[np.repeat(ks, lens)]
        e = self._err(pix, self.tot[pix] + d, self.m[pix] + d[:, None] * cols)
        return np.add.reduceat(self.err[pix] - e, first)

    def _rebuild(self) -> list:
        heap = []
        for a in range(self.c.n):
            pix = self.c.pix[a]
            d = np.repeat(self.dl[a], self.counts[a])
            t = self.tot[pix] + d
            base_err = self.err[pix]
            mp = self.m[pix]
            ids = self.lid_of[a]
            starts = self.c.offsets[a][:-1]
            for k in range(self.K):
                e = self._err(pix, t, mp + d[:, None] * self.cols[k])
                g = np.add.reduceat(base_err - e, starts)
                ok = (ids >= 0) & (g > 0)
                ok[ok] &= ~self.used[k, ids[ok]]
                sel = np.nonzero(ok)[0]
                heap.extend(zip((-g[sel]).tolist(), [k] * len(sel), ids[sel].tolist()))
        heapq.heapify(heap)
        return heap

    def apply(self, k: int, lid: int):
        s0, n = self.lstart[lid], self.llen[lid]
        pix = self.flat[s0:s0 + n]              # pixels within one line are unique
        d = self.ld[lid]
        self.tot[pix] += d
        self.m[pix] += d * self.cols[k]
        self.err[pix] = self._err(pix, self.tot[pix], self.m[pix])
        self.used[k, lid] = True

    def run(self, max_lines: int, refresh_every: int = 2500) -> Tuple[List[List[Tuple[int, int]]], float, str, float]:
        t0 = time.time()
        E0 = float(self.err.sum())
        heap = self._rebuild()
        first = -heap[0][0] if heap else 0.0
        eps = max(first, 1e-12) * 1e-4
        edges: List[List[Tuple[int, int]]] = [[] for _ in range(self.K)]
        count, since, stop, last = 0, 0, "max_lines", time.time()
        while count < max_lines:
            if self.cancel is not None and self.cancel.is_set():
                raise Cancelled()
            ks, lids = [], []
            while heap and len(lids) < 64:
                _, k, lid = heapq.heappop(heap)
                if not self.used[k, lid]:
                    ks.append(k); lids.append(lid)
            if not lids:
                if since:
                    heap = self._rebuild(); since = 0
                    if heap:
                        continue
                stop = "no_improving_line"
                break
            ks_a, lids_a = np.asarray(ks), np.asarray(lids)
            gains = self.gains_batch(ks_a, lids_a)
            next_best = -heap[0][0] if heap else -np.inf
            order = np.argsort(-gains)
            if gains[order[0]] <= eps and next_best <= eps:
                if since:
                    heap = self._rebuild(); since = 0
                    continue
                stop = "no_improving_line"
                break
            accepted = 0
            for j in order:
                g = float(gains[j])
                k, lid = int(ks_a[j]), int(lids_a[j])
                if g > eps and g >= self.accept_ratio * next_best and accepted < 32 and count < max_lines:
                    self.apply(k, lid)
                    edges[k].append((int(self.la[lid]), int(self.lb[lid])))
                    count += 1
                    since += 1
                    accepted += 1
                elif g > eps:
                    heapq.heappush(heap, (-g, k, lid))
            if since >= refresh_every:
                heap = self._rebuild(); since = 0
            if self.progress is not None and time.time() - last > 0.3:
                last = time.time()
                self.progress({"lines": count, "max_lines": max_lines,
                               "error_reduction": 1 - float(self.err.sum()) / E0 if E0 > 0 else 0.0,
                               "edges": edges})
        Ef = float(self.err.sum())
        return edges, (1 - Ef / E0 if E0 > 0 else 0.0), stop, time.time() - t0
