"""Approximate image-quality indicators.

These compare the *simulated* artwork with the *intended* appearance of the
processed image on the chosen board/thread.  They are relative indicators to
compare variations, not guarantees of physical fidelity (real thread
tension, sheen and lighting are not modelled).
"""
from __future__ import annotations

import cv2
import numpy as np

from .colorsci import delta_e76, delta_e2000, srgb_to_lab


def _gray(img):
    return img if img.ndim == 2 else (img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722)


def ssim(a: np.ndarray, b: np.ndarray, mask=None, sigma: float = 1.5) -> float:
    a = _gray(a).astype(np.float64)
    b = _gray(b).astype(np.float64)
    C1, C2 = (0.01) ** 2, (0.03) ** 2
    mu_a = cv2.GaussianBlur(a, (0, 0), sigma)
    mu_b = cv2.GaussianBlur(b, (0, 0), sigma)
    saa = cv2.GaussianBlur(a * a, (0, 0), sigma) - mu_a ** 2
    sbb = cv2.GaussianBlur(b * b, (0, 0), sigma) - mu_b ** 2
    sab = cv2.GaussianBlur(a * b, (0, 0), sigma) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + C1) * (2 * sab + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (saa + sbb + C2))
    return float(m[mask].mean() if mask is not None else m.mean())


def psnr(a, b, mask=None) -> float:
    d = (_gray(a) - _gray(b)) ** 2
    mse = float(d[mask].mean() if mask is not None else d.mean())
    return float("inf") if mse == 0 else float(10 * np.log10(1.0 / mse))


def mae(a, b, mask=None) -> float:
    d = np.abs(_gray(a) - _gray(b))
    return float(d[mask].mean() if mask is not None else d.mean())


def quality_report(target_rgb: np.ndarray, sim_rgb: np.ndarray, mask: np.ndarray, viewing_blur: float = 1.0) -> dict:
    """Metrics at the comparison resolution, after a small 'viewing distance' blur."""
    if viewing_blur > 0:
        target_rgb = cv2.GaussianBlur(target_rgb, (0, 0), viewing_blur)
        sim_rgb = cv2.GaussianBlur(sim_rgb, (0, 0), viewing_blur)
    out = {
        "ssim": ssim(target_rgb, sim_rgb, mask),
        "psnr_db": psnr(target_rgb, sim_rgb, mask),
        "mae": mae(target_rgb, sim_rgb, mask),
    }
    if target_rgb.ndim == 3:
        la, lb = srgb_to_lab(target_rgb), srgb_to_lab(sim_rgb)
        out["delta_e76"] = float(delta_e76(la, lb)[mask].mean())
        out["delta_e2000"] = float(delta_e2000(la, lb)[mask].mean())
    return out
