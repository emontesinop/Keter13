"""Line rasterisation and the cached candidate-line store.

Thread footprint model
----------------------
A thread of physical width ``t`` (pixels) crossing a pixel column covers an
area of ``t * sqrt(1 + m^2)`` where ``m`` is the minor/major slope.  We
rasterise one pixel per step along the major axis (DDA, no duplicates) and
attach a per-line *weight factor* ``wf = length / major_steps`` so the
per-pixel coverage of one pass is ``min(1, t * wf)``.  This keeps the cache
to one int32 per pixel (no per-pixel weights) while remaining physically
consistent for any line angle.

Lines are always rasterised from the lower to the higher nail index so the
pixel set of an undirected connection is identical no matter which end it is
looked up from: the simulation, the optimiser and every export share it.

Cache layout ("star" layout)
----------------------------
For each nail ``i`` we store, contiguously, all valid lines that touch it:
``partners[i]`` (other nail), ``offsets[i]`` (CSR offsets into ``pix[i]``),
``wf[i]``.  Scoring every candidate from the current nail is then a single
gather + ``np.add.reduceat`` - the hot loop of the greedy optimiser.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from .geometry import BoardGeometry


def rasterize_many(p0: np.ndarray, p1: np.ndarray, width: int, height: int):
    """Rasterise many segments at once.

    Returns (flat_pixel_indices, offsets, weight_factor, length_px) where the
    pixels of segment k are ``flat[offsets[k]:offsets[k+1]]``.
    """
    p0 = np.atleast_2d(p0).astype(np.float64)
    p1 = np.atleast_2d(p1).astype(np.float64)
    d = p1 - p0
    major = np.maximum(np.abs(d[:, 0]), np.abs(d[:, 1]))
    steps = np.maximum(1, np.ceil(major).astype(np.int64))
    length = np.hypot(d[:, 0], d[:, 1])
    wf = np.where(major > 0, length / np.maximum(major, 1e-9), 1.0)
    n_pts = steps + 1
    maxn = int(n_pts.max())
    k = np.arange(maxn)[None, :]
    t = k / steps[:, None]
    valid = k < n_pts[:, None]
    x = np.rint(p0[:, 0:1] + t * d[:, 0:1]).astype(np.int64)
    y = np.rint(p0[:, 1:2] + t * d[:, 1:2]).astype(np.int64)
    np.clip(x, 0, width - 1, out=x)
    np.clip(y, 0, height - 1, out=y)
    idx = y * width + x
    # sampling at <= 1 px steps can hit the same pixel twice in a row: count it once
    valid[:, 1:] &= idx[:, 1:] != idx[:, :-1]
    flat = idx[valid]
    offsets = np.zeros(len(p0) + 1, dtype=np.int64)
    offsets[1:] = np.cumsum(valid.sum(axis=1))
    return flat.astype(np.int32), offsets, wf.astype(np.float32), length


def rasterize_line(p0, p1, width: int, height: int):
    flat, _, wf, length = rasterize_many(np.asarray([p0]), np.asarray([p1]), width, height)
    return flat, float(wf[0]), float(length[0])


class LineCache:
    """Pre-rasterised valid connections, organised per nail."""

    def __init__(self, geom: BoardGeometry, resolution: int, min_skip: int):
        self.geom = geom
        self.resolution = resolution
        self.min_skip = min_skip
        self.width, self.height, self.px_per_mm = geom.pixel_frame(resolution)
        self.n = geom.n
        self.nails_px = geom.to_pixels(resolution)
        self.partners: List[np.ndarray] = []
        self.offsets: List[np.ndarray] = []
        self.pix: List[np.ndarray] = []
        self.wf: List[np.ndarray] = []
        self.length_px: List[np.ndarray] = []
        self.slot = np.full((self.n, self.n), -1, dtype=np.int32)  # slot[i, j] = position of j in partners[i]
        self._build()

    def _build(self):
        n = self.n
        idx = np.arange(n)
        for i in range(n):
            ok = np.array([self.geom.valid_pair(i, j, self.min_skip) for j in idx]) if self.geom.board.shape != "circle" \
                else self._circle_ok(i)
            partners = idx[ok]
            lo = np.minimum(i, partners)
            hi = np.maximum(i, partners)
            flat, offs, wf, length = rasterize_many(self.nails_px[lo], self.nails_px[hi], self.width, self.height)
            self.partners.append(partners.astype(np.int32))
            self.offsets.append(offs)
            self.pix.append(flat)
            self.wf.append(wf)
            self.length_px.append(length)
            self.slot[i, partners] = np.arange(len(partners), dtype=np.int32)

    def _circle_ok(self, i: int) -> np.ndarray:
        d = np.abs(np.arange(self.n) - i)
        d = np.minimum(d, self.n - d)
        return d >= max(1, self.min_skip)

    # --------------------------------------------------------------
    def line(self, a: int, b: int) -> Tuple[np.ndarray, float]:
        s = int(self.slot[a, b])
        if s < 0:
            raise KeyError(f"connection {a + 1}-{b + 1} is not a valid candidate")
        o = self.offsets[a]
        return self.pix[a][o[s]:o[s + 1]], float(self.wf[a][s])

    def is_valid(self, a: int, b: int) -> bool:
        return self.slot[a, b] >= 0

    @property
    def n_lines(self) -> int:
        return int(sum(len(p) for p in self.partners) // 2)

    @property
    def nbytes(self) -> int:
        return int(sum(p.nbytes for p in self.pix))
