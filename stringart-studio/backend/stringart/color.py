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


# ---------------------------------------------------------------------------------------------
# Thread catalogue and automatic palette (same catalogue and method as the iPhone app)
THREAD_CATALOG = [
    ("Black", "#111111"), ("Charcoal", "#3b3b3b"), ("Grey", "#8a8a8a"), ("White", "#f4f4f0"),
    ("Dark brown", "#3e2418"), ("Brown", "#6e4026"), ("Chestnut", "#8e5634"), ("Tan", "#b9875c"),
    ("Caramel", "#c98f5a"), ("Skin medium", "#d29a77"), ("Skin light", "#eab99b"), ("Peach", "#f4cbb0"),
    ("Cream", "#efe2c4"), ("Dark red", "#7a1420"), ("Red", "#c41e26"), ("Coral", "#e26d5a"),
    ("Orange", "#e2711d"), ("Ochre", "#c9952b"), ("Yellow", "#f2cf1d"), ("Olive", "#66652a"),
    ("Dark green", "#1d5c33"), ("Green", "#3d9a4f"), ("Teal", "#127f86"), ("Sky blue", "#7fb2e5"),
    ("Blue", "#2a5bd6"), ("Navy", "#1f2f5c"), ("Purple", "#5f3d8a"), ("Pink", "#e48aa8"),
    ("Magenta", "#c62a7a"), ("Cyan", "#14a3d6"),
]


def auto_palette(color_img: np.ndarray, mask: np.ndarray, weight: np.ndarray, background_hex: str, k: int,
                 cmax: float = 0.95, sample: int = 1500) -> List[Tuple[str, str]]:
    """Pick ``k`` catalogue threads that best reproduce the photo on this board.

    Greedy forward selection: each round adds the catalogue colour whose inclusion most reduces the
    reconstruction error of the partitive-mixing unmixing on a pixel sample, measured as CIE76
    Delta E in Lab (perceptual, so chroma counts as much as lightness).
    """
    from .colorsci import linear_rgb_to_lab, relative_luminance
    idx = np.flatnonzero(mask.ravel())
    if idx.size == 0:
        return []
    idx = idx[:: max(1, idx.size // sample)]
    T = srgb_to_linear(color_img.reshape(-1, 3)[idx].astype(np.float64))
    w = 0.5 + 0.5 * np.minimum(2.0, weight.ravel()[idx])
    t_lab = linear_rgb_to_lab(T)
    bg = srgb_to_linear(hex_to_rgb(background_hex))
    bg_lum = float(relative_luminance(hex_to_rgb(background_hex)))
    chosen: List[int] = []

    def err(pal):
        cols = srgb_to_linear(np.array([hex_to_rgb(THREAD_CATALOG[i][1]) for i in pal]))
        a = _unmix(T, bg, cols, cmax, iters=80)
        P = np.clip(bg + a @ (cols - bg), 0, None)
        return float(np.sum(w * np.sqrt(np.sum((linear_rgb_to_lab(P) - t_lab) ** 2, axis=1))))

    for _ in range(k):
        best, bi = np.inf, -1
        for ci, (_, hx) in enumerate(THREAD_CATALOG):
            if ci in chosen or abs(float(relative_luminance(hex_to_rgb(hx))) - bg_lum) < 0.03:
                continue
            e = err(chosen + [ci])
            if e < best:
                best, bi = e, ci
        if bi < 0:
            break
        chosen.append(bi)
    return [THREAD_CATALOG[i] for i in chosen]
