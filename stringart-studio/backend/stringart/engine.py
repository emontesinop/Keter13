"""Greedy string-art optimiser (one thread colour = one layer).

Physical tone model
-------------------
Each pass of a thread over a pixel covers a fraction ``c = opacity * t * wf``
of it (``t`` = thread width in pixels, ``wf`` = slope factor, see raster.py).
Overlapping passes combine like stacked translucent layers::

    coverage = 1 - prod(1 - c_k) = 1 - exp(-A),     A = sum(-ln(1 - c_k))

so we optimise in *optical density* ``A`` where thread accumulation is
additive and order independent.  The target density is
``A* = -ln(1 - C*)`` with ``C*`` the required coverage (imaging.target_coverage).

Objective
---------
    E = sum_p  w_p * phi(A*_p - A_p),    phi(r) = r^2 (r >= 0),  lambda * r^2 (r < 0)

``w`` is the importance map (edges, faces); ``lambda`` (overshoot penalty)
makes over-darkening already dark regions more expensive than leaving a
pixel slightly light, which is what prevents excessive thread accumulation.

Selection
---------
Greedy steepest descent: at each step every allowed connection from the
current nail is scored by its exact reduction of E (vectorised gather +
``np.add.reduceat`` over the cached line pixels) and the best one is taken.
An undirected connection is never used twice.  Because the next line always
starts where the previous one ended, the selected set is a single trail by
construction (strategy ``continuous``).

Strategy ``hybrid`` allows the thread to be cut and restarted (a new
*section*) when the best local continuation is much weaker than the best
connection anywhere on the board - trading a knot for image quality.  The
number of sections is capped by ``max_sections`` and reported explicitly.

Stopping: ``max_lines``; best gain below ``min_improvement`` x first gain;
error reduction reaching ``target_quality``; no improving line left.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional

import numpy as np

from .raster import LineCache


class Cancelled(Exception):
    pass


@dataclass
class LayerParams:
    max_lines: int = 3500
    min_improvement: float = 0.004
    target_quality: float = 0.0
    overshoot_penalty: float = 2.0
    strategy: str = "continuous"
    max_sections: int = 1
    continuity_preference: float = 0.35
    start_nail: int = 0                   # 0-based
    thread_px: float = 0.3                # thread width in pixels
    opacity: float = 0.85
    patience: int = 12                    # consecutive weak "transit" moves allowed


@dataclass
class LayerResult:
    sections: List[List[int]]             # each a list of 0-based nail indices (a trail)
    density: np.ndarray                   # final simulated optical density (flat)
    initial_error: float
    final_error: float
    error_curve: List[float]              # error after every 25 lines (normalised)
    stop_reason: str
    elapsed_s: float
    jumps: int = 0
    trimmed: int = 0

    @property
    def n_lines(self) -> int:
        return sum(max(0, len(s) - 1) for s in self.sections)

    def edges(self):
        out = []
        for s in self.sections:
            out.extend(zip(s[:-1], s[1:]))
        return out


def line_density(cache: LineCache, params: LayerParams) -> List[np.ndarray]:
    """Per-nail array: density increment of one pass of each candidate line."""
    alpha = params.opacity * params.thread_px
    out = []
    for wf in cache.wf:
        c = np.clip(alpha * wf, 1e-4, 0.999)
        out.append((-np.log1p(-c)).astype(np.float32))
    return out


class LayerOptimizer:
    def __init__(self, cache: LineCache, target_density: np.ndarray, importance: np.ndarray,
                 params: LayerParams, used: Optional[np.ndarray] = None,
                 progress: Optional[Callable[[dict], None]] = None,
                 cancel: Optional[threading.Event] = None):
        self.cache = cache
        self.p = params
        self.target = target_density.astype(np.float32).ravel()
        self.w = importance.astype(np.float32).ravel()
        self.A = np.zeros_like(self.target)
        self.resid = self.target.copy()
        self.lam = np.float32(params.overshoot_penalty)
        self.dline = line_density(cache, params)
        self.counts = [np.diff(o).astype(np.int64) for o in cache.offsets]
        self.used = used if used is not None else np.zeros((cache.n, cache.n), dtype=bool)
        self.progress = progress
        self.cancel = cancel

    # ---------------------------------------------------------- scoring
    def _phi(self, r):
        return np.where(r >= 0, r * r, self.lam * r * r)

    def scores_from(self, nail: int) -> np.ndarray:
        """Exact error reduction for every candidate line leaving ``nail``."""
        pix = self.cache.pix[nail]
        g = self.resid[pix]
        d = np.repeat(self.dline[nail], self.counts[nail])
        w = self.w[pix]
        gain = w * (self._phi(g) - self._phi(g - d))
        s = np.add.reduceat(gain, self.cache.offsets[nail][:-1])
        s[self.used[nail, self.cache.partners[nail]]] = -np.inf
        return s

    def total_error(self) -> float:
        return float(np.sum(self.w * self._phi(self.resid)))

    def apply(self, a: int, b: int, sign: float = 1.0):
        s = int(self.cache.slot[a, b])
        o = self.cache.offsets[a]
        pix = self.cache.pix[a][o[s]:o[s + 1]]
        d = self.dline[a][s] * sign
        self.A[pix] += d
        self.resid[pix] -= d
        if sign > 0:
            self.used[a, b] = self.used[b, a] = True
        else:
            self.used[a, b] = self.used[b, a] = False

    def global_best(self):
        best = (-np.inf, -1, -1)
        for i in range(self.cache.n):
            s = self.scores_from(i)
            k = int(np.argmax(s))
            if s[k] > best[0]:
                best = (float(s[k]), i, int(self.cache.partners[i][k]))
        return best

    # ---------------------------------------------------------- main loop
    def run(self) -> LayerResult:
        t0 = time.time()
        p = self.p
        E0 = self.total_error()
        E = E0
        cur = int(p.start_nail) % self.cache.n
        sections: List[List[int]] = [[cur]]
        curve = [1.0]
        first_gain = None
        recent = None             # EMA of accepted gains
        cooldown = 0
        jumps = 0
        stalls = 0
        stop = "max_lines"
        n_lines = 0
        last_report = time.time()
        while n_lines < p.max_lines:
            if self.cancel is not None and self.cancel.is_set():
                raise Cancelled()
            s = self.scores_from(cur)
            k = int(np.argmax(s))
            gain = float(s[k])
            if first_gain is None:
                # calibrate the threshold on the best line on the whole board
                first_gain = max(gain, self.global_best()[0], 1e-12)
            threshold = p.min_improvement * first_gain
            weak = gain <= threshold or not np.isfinite(gain)
            want_jump = (p.strategy == "hybrid" and len(sections) < p.max_sections and cooldown <= 0 and
                         recent is not None and (weak or gain < p.continuity_preference * recent))
            if want_jump:
                g_gain, ga, gb = self.global_best()
                if g_gain > threshold and (weak or gain < p.continuity_preference * g_gain):
                    sections.append([ga])
                    cur = ga
                    k = int(self.cache.slot[ga, gb])
                    gain = g_gain
                    jumps += 1
                    weak = False
                else:
                    cooldown = 150
            cooldown -= 1
            if weak and np.isfinite(gain) and stalls < p.patience and recent is not None and recent > 3 * threshold:
                # transit move: the best continuation from this nail is weak but the
                # board still has useful lines elsewhere - keep the thread moving
                stalls += 1
                weak = False
            elif not weak:
                stalls = 0
            if weak:
                stop = "no_improving_line" if not np.isfinite(gain) or gain <= 0 else "min_improvement"
                break
            nxt = int(self.cache.partners[cur][k])
            self.apply(cur, nxt)
            sections[-1].append(nxt)
            cur = nxt
            n_lines += 1
            E -= gain
            recent = gain if recent is None else 0.97 * recent + 0.03 * gain
            if n_lines % 25 == 0:
                curve.append(E / E0 if E0 > 0 else 0.0)
            if p.target_quality > 0 and E0 > 0 and (1 - E / E0) >= p.target_quality:
                stop = "target_quality"
                break
            if self.progress is not None and (time.time() - last_report > 0.25):
                last_report = time.time()
                self.progress({"lines": n_lines, "max_lines": p.max_lines,
                               "error_reduction": 1 - E / E0 if E0 > 0 else 0.0,
                               "sections": sections})
        sections = [sec for sec in sections if len(sec) > 1]
        trimmed = self._trim_tail(sections)
        E = self.total_error()
        curve.append(E / E0 if E0 > 0 else 0.0)
        return LayerResult(sections=sections, density=self.A.copy(), initial_error=E0, final_error=E,
                           error_curve=curve, stop_reason=stop, elapsed_s=time.time() - t0,
                           jumps=jumps, trimmed=trimmed)

    def _trim_tail(self, sections) -> int:
        """Refinement: drop trailing lines whose marginal contribution is negative.

        Removing lines from the *end* of a section never breaks continuity.
        """
        trimmed = 0
        for sec in sections:
            while len(sec) > 1:
                a, b = sec[-2], sec[-1]
                s = int(self.cache.slot[a, b])
                o = self.cache.offsets[a]
                pix = self.cache.pix[a][o[s]:o[s + 1]]
                d = self.dline[a][s]
                g = self.resid[pix]
                w = self.w[pix]
                # gain of having this line = phi(r + d) - phi(r)
                contrib = float(np.sum(w * (self._phi(g + d) - self._phi(g))))
                if contrib >= 0:
                    break
                self.apply(a, b, sign=-1.0)
                sec.pop()
                trimmed += 1
        return trimmed

    def marginal_contributions(self, edges) -> np.ndarray:
        """Error increase if each selected line were removed (diagnostic)."""
        out = np.empty(len(edges), dtype=np.float64)
        for i, (a, b) in enumerate(edges):
            s = int(self.cache.slot[a, b])
            o = self.cache.offsets[a]
            pix = self.cache.pix[a][o[s]:o[s + 1]]
            d = self.dline[a][s]
            g = self.resid[pix]
            out[i] = float(np.sum(self.w[pix] * (self._phi(g + d) - self._phi(g))))
        return out

    def score_line(self, a: int, b: int) -> float:
        """Error reduction of adding (a, b) to the current state."""
        s = int(self.cache.slot[a, b])
        o = self.cache.offsets[a]
        pix = self.cache.pix[a][o[s]:o[s + 1]]
        d = self.dline[a][s]
        g = self.resid[pix]
        return float(np.sum(self.w[pix] * (self._phi(g) - self._phi(g - d))))
