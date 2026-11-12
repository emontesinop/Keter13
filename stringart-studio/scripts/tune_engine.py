"""Objective engine tuning: how much does the physical render look like the photo?

    python scripts/tune_engine.py                  # default settings, both thread directions
    python scripts/tune_engine.py --physics 0.25   # compare a manual tone mapping

For each sample image it runs the real pipeline, renders the result with the physical thread model
at 1200 px, downsamples it (viewing distance), blurs both images slightly and reports SSIM against
the processed photo. Use it before changing engine defaults: v1 -> v2 raised the mean SSIM for
dark thread on a light board from 0.616 to 0.701 (see docs/ALGORITHMS.md, "Engine tuning").
"""
from __future__ import annotations

import argparse
import os
import sys

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from stringart.config import ProjectSettings, THREAD_PRESETS  # noqa: E402
from stringart.geometry import BoardGeometry  # noqa: E402
from stringart.imaging import load_image  # noqa: E402
from stringart.metrics import ssim  # noqa: E402
from stringart.pipeline import process_image, render_result  # noqa: E402
from stringart.pipeline import generate  # noqa: E402

IMAGES = ["portrait_astronaut.png", "animal_cat.png", "landscape_rocket.jpg", "color_coffee.png"]


def likeness(result: dict, tone: np.ndarray, mask: np.ndarray, size: int = 300) -> float:
    art = render_result(result, 1200)
    g = art[..., 0] * 0.2126 + art[..., 1] * 0.7152 + art[..., 2] * 0.0722
    g = cv2.resize(g, (size, size), interpolation=cv2.INTER_AREA)
    t = cv2.resize(tone, (size, size), interpolation=cv2.INTER_AREA)
    m = cv2.resize(mask.astype(np.uint8), (size, size)) > 0
    return ssim(cv2.GaussianBlur(g.astype(np.float64), (0, 0), 2), cv2.GaussianBlur(t.astype(np.float64), (0, 0), 2), m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--physics", type=float, default=None, help="manual tone_physics (disables auto tone)")
    ap.add_argument("--coverage", type=float, default=None, help="manual max_coverage")
    ap.add_argument("--nails", type=int, default=300)
    ap.add_argument("--thickness", type=float, default=0.15)
    ap.add_argument("--mode", default="balanced")
    a = ap.parse_args()
    for preset in ("black_on_white", "white_on_black"):
        scores, lines = [], []
        for f in IMAGES:
            s = ProjectSettings()
            s.thread.preset = preset
            s.thread.thread_color, s.thread.background_color = THREAD_PRESETS[preset]
            s.board.nail_count = a.nails
            s.thread.thickness_mm = a.thickness
            s.generation.mode = a.mode
            if a.physics is not None or a.coverage is not None:
                s.thread.auto_tone = False
                s.thread.tone_physics = a.physics if a.physics is not None else s.thread.tone_physics
                s.thread.max_coverage = a.coverage if a.coverage is not None else s.thread.max_coverage
            rgb = load_image(os.path.join(ROOT, "samples", f))
            r, _ = generate(rgb, s)
            _, pi = process_image(rgb, s, 400)
            scores.append(likeness(r, pi.tone, pi.mask))
            lines.append(r["totals"]["connections"])
        print(f"{preset:15s} SSIM={np.mean(scores):.3f}  per image={[round(x, 3) for x in scores]}  lines={lines}")


if __name__ == "__main__":
    main()
