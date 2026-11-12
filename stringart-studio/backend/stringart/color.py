"""Multi-colour decomposition into per-thread target layers.

Given a palette of real thread colours ``c_k`` and the board colour ``b``,
the partitive mixing model (see render.py) is *linear* in the per-colour
coverage shares ``a_k = C * A_k / sum(A)``::

    pixel = b + sum_k a_k (c_k - b),     a_k >= 0,  sum_k a_k <= C_max

so finding the thread mix that best reproduces each pixel is a small
constrained least-squares problem, solved for all pixels at once with
projected gradient descent (FISTA-accelerated).  Shares convert back to
per-layer optical densities ``A_k = a_k / C * (-ln(1 - C))`` which each
layer optimiser then reproduces independently.  Their composite is scored
with CIE Delta E (Lab), a perceptual metric.

Like monochrome mode, ``physics`` blends the exact linear-light solution
with one computed on the perceptual (sRGB-encoded) axis.
"""
from __future__ import annotations

from typing import List, Tuple

import numpy as np

from .colorsci import hex_to_rgb, srgb_to_linear


def _unmix(P: np.ndarray, bg: np.ndarray, cols: np.ndarray, cmax: float, iters: int = 250) -> np.ndarray:
    """P: (N,3) target, bg: (3,), cols: (K,3) -> shares (N,K)."""
    M = (cols - bg).T                      # (3,K)
    y = P - bg                              # (N,3)
    MtM = M.T @ M + 1e-4 * np.eye(M.shape[1])
    L = float(np.linalg.eigvalsh(MtM).max())
    step = 1.0 / L
    Mty = y @ M                             # (N,K)
    a = np.zeros((P.shape[0], M.shape[1]))
    z = a.copy()
    t = 1.0
    for _ in range(iters):
        g = z @ MtM - Mty
        a_new = np.maximum(z - step * g, 0)
        s = a_new.sum(axis=1, keepdims=True)
        over = s > cmax
        a_new = np.where(over, a_new * (cmax / np.maximum(s, 1e-9)), a_new)
        t_new = (1 + np.sqrt(1 + 4 * t * t)) / 2
        z = a_new + ((t - 1) / t_new) * (a_new - a)
        a, t = a_new, t_new
    return a


def decompose(color_img: np.ndarray, palette_hex: List[str], background_hex: str, cmax: float,
              physics: float, mask: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Return (densities (K,h,w), shares (K,h,w)) for the enabled palette."""
    h, w = color_img.shape[:2]
    P_srgb = color_img.reshape(-1, 3).astype(np.float64)
    cols_srgb = np.array([hex_to_rgb(c) for c in palette_hex])
    bg_srgb = hex_to_rgb(background_hex)
    sel = mask.ravel()
    shares = np.zeros((P_srgb.shape[0], len(palette_hex)))
    a_lin = _unmix(srgb_to_linear(P_srgb[sel]), srgb_to_linear(bg_srgb), srgb_to_linear(cols_srgb), cmax)
    a_per = _unmix(P_srgb[sel], bg_srgb, cols_srgb, cmax)
    shares[sel] = physics * a_lin + (1 - physics) * a_per
    C = np.clip(shares.sum(axis=1), 0, cmax)
    total_A = -np.log1p(-C)
    dens = shares / np.maximum(C, 1e-9)[:, None] * total_A[:, None]
    return dens.T.reshape(-1, h, w).astype(np.float32), shares.T.reshape(-1, h, w).astype(np.float32)
