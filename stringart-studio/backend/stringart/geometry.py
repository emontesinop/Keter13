"""Board and nail geometry.

Coordinate conventions
----------------------
* Physical coordinates are millimetres with the origin at the board centre,
  +x to the right and +y *down* (same orientation as image rows), as seen
  from the front of the board.
* ``angle_deg`` is a compass angle: 0 deg = 12 o'clock, increasing clockwise
  when looking at the front of the board.
* Nail *numbers* are 1-based (what a person writes on the board); internal
  indices are 0-based.

For a circular board the nail centres lie on a circle of radius
``r = diameter/2 - edge_margin``::

    theta_k = start + s * k * 360/N          (s = +1 clockwise, -1 counter-clockwise)
    x_k = r * sin(theta_k)
    y_k = -r * cos(theta_k)

which is the usual ``x = cx + r cos(a), y = cy + r sin(a)`` with
``a = theta - 90 deg`` expressed in image orientation.

Square / rectangular boards place nails at equal arc-length spacing along
the inset perimeter, starting at the top-centre.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import List, Tuple

import numpy as np

from .config import BoardSettings


@dataclass
class Nail:
    index: int          # 0-based
    number: int         # 1-based, as written on the board
    x_mm: float         # centre-origin, +y down
    y_mm: float
    angle_deg: float    # compass angle from board centre
    radius_mm: float    # distance from board centre
    dist_prev_mm: float
    dist_next_mm: float
    sides: int          # bitmask of perimeter sides (rectangles); 0 for circles

    def to_dict(self):
        return asdict(self)


class BoardGeometry:
    """Pre-computed nail layout for one board configuration."""

    def __init__(self, board: BoardSettings):
        self.board = board
        self.width_mm, self.height_mm = board.size_mm
        self.n = int(board.nail_count)
        self.direction = 1.0 if board.numbering == "clockwise" else -1.0
        if board.shape == "circle":
            xy, sides = self._circle()
        else:
            xy, sides = self._rectangle()
        self.xy_mm = xy                       # (N, 2) float64
        self.sides = sides                    # (N,) int
        nxt = np.roll(xy, -1, axis=0)
        prv = np.roll(xy, 1, axis=0)
        self.dist_next = np.hypot(*(nxt - xy).T)
        self.dist_prev = np.hypot(*(prv - xy).T)
        self.radius = np.hypot(xy[:, 0], xy[:, 1])
        self.angle_deg = (np.degrees(np.arctan2(xy[:, 0], -xy[:, 1])) + 360.0) % 360.0

    # ------------------------------------------------------------ layouts
    def _circle(self):
        b = self.board
        r = b.diameter_mm / 2.0 - b.edge_margin_mm
        if r <= 0:
            raise ValueError("edge margin is larger than the board radius")
        k = np.arange(self.n)
        theta = np.radians(b.start_angle_deg + self.direction * k * 360.0 / self.n)
        xy = np.stack([r * np.sin(theta), -r * np.cos(theta)], axis=1)
        return xy, np.zeros(self.n, dtype=int)

    def _rectangle(self):
        b = self.board
        w = self.width_mm - 2 * b.edge_margin_mm
        h = self.height_mm - 2 * b.edge_margin_mm
        if w <= 0 or h <= 0:
            raise ValueError("edge margin is larger than the board")
        per = 2 * (w + h)
        # start at top-centre, walk clockwise: top-right half, right, bottom, left, top-left half
        start_shift = (b.start_angle_deg % 360.0) / 360.0 * per
        s = (start_shift + self.direction * np.arange(self.n) * per / self.n) % per
        xy = np.zeros((self.n, 2))
        sides = np.zeros(self.n, dtype=int)
        hw, hh = w / 2, h / 2
        eps = 1e-9
        for i, d in enumerate(s):
            if d < hw:                                   # top, right half
                xy[i] = (d, -hh); sides[i] = 1
            elif d < hw + h:                             # right side, downward
                xy[i] = (hw, -hh + (d - hw)); sides[i] = 2
            elif d < hw + h + w:                         # bottom, leftward
                xy[i] = (hw - (d - hw - h), hh); sides[i] = 4
            elif d < hw + 2 * h + w:                     # left side, upward
                xy[i] = (-hw, hh - (d - hw - h - w)); sides[i] = 8
            else:                                        # top, left half
                xy[i] = (-hw + (d - hw - 2 * h - w), -hh); sides[i] = 1
            # nails exactly on a corner belong to both sides
            x, y = xy[i]
            if abs(abs(x) - hw) < eps and abs(abs(y) - hh) < eps:
                sides[i] = (1 if y < 0 else 4) | (2 if x > 0 else 8)
        return xy, sides

    # ------------------------------------------------------------ helpers
    def nails(self) -> List[Nail]:
        return [
            Nail(index=i, number=i + 1, x_mm=float(self.xy_mm[i, 0]), y_mm=float(self.xy_mm[i, 1]),
                 angle_deg=float(self.angle_deg[i]), radius_mm=float(self.radius[i]),
                 dist_prev_mm=float(self.dist_prev[i]), dist_next_mm=float(self.dist_next[i]),
                 sides=int(self.sides[i]))
            for i in range(self.n)
        ]

    def nail_spacing_mm(self) -> float:
        return float(np.mean(self.dist_next))

    def distance_mm(self, a: int, b: int) -> float:
        d = self.xy_mm[a] - self.xy_mm[b]
        return float(np.hypot(d[0], d[1]))

    def pixel_frame(self, resolution: int) -> Tuple[int, int, float]:
        """(width_px, height_px, px_per_mm) for a raster spanning the board."""
        scale = resolution / max(self.width_mm, self.height_mm)
        return int(round(self.width_mm * scale)), int(round(self.height_mm * scale)), scale

    def to_pixels(self, resolution: int) -> np.ndarray:
        w, h, scale = self.pixel_frame(resolution)
        px = np.empty_like(self.xy_mm)
        px[:, 0] = (self.xy_mm[:, 0] + self.width_mm / 2) * scale
        px[:, 1] = (self.xy_mm[:, 1] + self.height_mm / 2) * scale
        # keep inside the raster (nails on the rim of a zero-margin board)
        px[:, 0] = np.clip(px[:, 0], 0, w - 1)
        px[:, 1] = np.clip(px[:, 1], 0, h - 1)
        return px

    def board_mask(self, resolution: int) -> np.ndarray:
        """Boolean mask of the usable board area (inside the nail ring)."""
        w, h, scale = self.pixel_frame(resolution)
        yy, xx = np.mgrid[0:h, 0:w]
        if self.board.shape == "circle":
            r = (self.board.diameter_mm / 2 - self.board.edge_margin_mm) * scale
            return (xx - w / 2 + 0.5) ** 2 + (yy - h / 2 + 0.5) ** 2 <= r * r
        m = self.board.edge_margin_mm * scale
        return (xx >= m) & (xx < w - m) & (yy >= m) & (yy < h - m)

    def valid_pair(self, a: int, b: int, min_skip: int) -> bool:
        """Whether a thread between nails a and b is allowed."""
        if a == b:
            return False
        d = abs(a - b)
        d = min(d, self.n - d)
        if d < min_skip:
            return False
        if self.sides[a] & self.sides[b]:
            return False  # both on the same straight edge: thread would lie along the rim
        return True

    def summary(self) -> dict:
        b = self.board
        return {
            "shape": b.shape,
            "width_mm": self.width_mm,
            "height_mm": self.height_mm,
            "nail_count": self.n,
            "nail_ring_radius_mm": float(self.radius.mean()) if b.shape == "circle" else None,
            "nail_spacing_mm": self.nail_spacing_mm(),
            "angular_step_deg": 360.0 / self.n if b.shape == "circle" else None,
            "numbering": b.numbering,
            "start_angle_deg": b.start_angle_deg,
        }
