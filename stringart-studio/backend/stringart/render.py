"""Physically based rendering of thread layers.

The same density model as the optimiser is used, so a render is a faithful
picture of what the exported sequence produces (within the model's limits).

Colour mixing (several thread colours)
--------------------------------------
Threads lying side by side mix *partitively* (spatial averaging, like a
halftone), not subtractively like inks.  With per-colour optical densities
``A_k``::

    C   = 1 - exp(-sum_k A_k)                 total covered fraction
    mix = sum_k A_k * c_k / sum_k A_k         average thread colour (linear light)
    out = (1 - C) * background + C * mix

For one colour this reduces exactly to the monochrome model.
"""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .colorsci import hex_to_rgb, linear_to_srgb, srgb_to_linear
from .geometry import BoardGeometry
from .raster import rasterize_many


def layer_density(geom: BoardGeometry, edges: Sequence[Tuple[int, int]], size: int,
                  thread_mm: float, opacity: float) -> np.ndarray:
    """Optical density image (h, w) for a set of connections at ``size`` px."""
    w, h, scale = geom.pixel_frame(size)
    acc = np.zeros(w * h, np.float32)
    if len(edges) == 0:
        return acc.reshape(h, w)
    nails = geom.to_pixels(size)
    e = np.asarray(edges, dtype=np.int64)
    lo, hi = np.minimum(e[:, 0], e[:, 1]), np.maximum(e[:, 0], e[:, 1])
    chunk = 4000
    alpha = opacity * thread_mm * scale
    for i in range(0, len(e), chunk):
        flat, offs, wf, _ = rasterize_many(nails[lo[i:i + chunk]], nails[hi[i:i + chunk]], w, h)
        d = -np.log1p(-np.clip(alpha * wf, 1e-5, 0.999)).astype(np.float32)
        np.add.at(acc, flat, np.repeat(d, np.diff(offs)))
    return acc.reshape(h, w)


def composite(densities: List[np.ndarray], colors_hex: List[str], background_hex: str) -> np.ndarray:
    """sRGB image in [0,1] from per-colour densities."""
    bg = srgb_to_linear(hex_to_rgb(background_hex))
    h, w = densities[0].shape if densities else (1, 1)
    if not densities:
        return np.broadcast_to(linear_to_srgb(bg), (h, w, 3)).astype(np.float32)
    total = np.zeros((h, w), np.float32)
    mix = np.zeros((h, w, 3), np.float32)
    for A, c in zip(densities, colors_hex):
        total += A
        mix += A[..., None] * srgb_to_linear(hex_to_rgb(c)).astype(np.float32)
    C = 1 - np.exp(-total)
    mix = mix / np.maximum(total, 1e-9)[..., None]
    out = (1 - C)[..., None] * bg + C[..., None] * mix
    return linear_to_srgb(out).astype(np.float32)


def apply_board_shape(img: np.ndarray, geom: BoardGeometry, background_hex: str,
                      outside_hex: str = "#1a1b1e") -> np.ndarray:
    """Paint outside the board area (circle) with a neutral colour."""
    h, w = img.shape[:2]
    if geom.board.shape != "circle":
        return img
    yy, xx = np.mgrid[0:h, 0:w]
    r = w / 2
    inside = (xx - w / 2 + 0.5) ** 2 + (yy - h / 2 + 0.5) ** 2 <= r * r
    out = img.copy()
    out[~inside] = hex_to_rgb(outside_hex)
    return out


def draw_nails(img: np.ndarray, geom: BoardGeometry, numbers: bool = True,
               highlight: Optional[dict] = None, every: Optional[int] = None) -> np.ndarray:
    """Overlay nail markers (and numbers) on an sRGB float image."""
    h, w = img.shape[:2]
    out = (np.clip(img, 0, 1) * 255).astype(np.uint8).copy()
    pts = geom.to_pixels(int(round(w * max(geom.width_mm, geom.height_mm) / geom.width_mm)))
    rad = max(1, int(round(w / 400)))
    lum = out.reshape(-1, 3).mean()
    col = (210, 180, 90) if lum < 128 else (150, 110, 30)
    for i, (x, y) in enumerate(pts):
        cv2.circle(out, (int(round(x)), int(round(y))), rad, col, -1, cv2.LINE_AA)
    if numbers:
        step = every or max(1, int(np.ceil(geom.n / max(1, w / 28))))
        fs = max(0.3, w / 2400)
        cx, cy = w / 2, h / 2
        for i, (x, y) in enumerate(pts):
            if i % step and i != 0:
                continue
            dx, dy = x - cx, y - cy
            n = np.hypot(dx, dy) or 1
            tx, ty = x - dx / n * (w * 0.035), y - dy / n * (w * 0.035)
            txt = str(i + 1)
            (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)
            cv2.putText(out, txt, (int(tx - tw / 2), int(ty + th / 2)), cv2.FONT_HERSHEY_SIMPLEX, fs, col, 1,
                        cv2.LINE_AA)
    if highlight:
        for idx, c in highlight.items():
            x, y = pts[idx]
            cv2.circle(out, (int(x), int(y)), rad * 4, c, 2, cv2.LINE_AA)
    return out.astype(np.float32) / 255.0


def board_diagram(geom: BoardGeometry, size: int = 1600, background_hex: str = "#121316") -> np.ndarray:
    w, h, _ = geom.pixel_frame(size)
    img = np.ones((h, w, 3), np.float32) * hex_to_rgb(background_hex)
    return draw_nails(img, geom, numbers=True)


def to_uint8(img: np.ndarray) -> np.ndarray:
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
