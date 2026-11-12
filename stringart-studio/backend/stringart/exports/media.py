"""Raster exports: PNG/JPG artwork, GIF/MP4 simulation, step image sequence."""
from __future__ import annotations

import io
import os
import tempfile
import zipfile
from typing import List, Optional

import cv2
import numpy as np
from PIL import Image

from ..colorsci import hex_to_rgb, srgb_to_linear, linear_to_srgb
from ..config import ProjectSettings
from ..geometry import BoardGeometry
from ..pipeline import build_steps, render_result
from ..raster import rasterize_many
from ..render import apply_board_shape, draw_nails, to_uint8


def artwork_image(result: dict, size: int = 2400, fmt: str = "PNG", nails: bool = False) -> bytes:
    img = render_result(result, size)
    geom = BoardGeometry(ProjectSettings(**result["settings"]).board)
    if nails:
        img = draw_nails(img, geom, numbers=False)
    img = apply_board_shape(img, geom, result["background"])
    im = Image.fromarray(to_uint8(img))
    buf = io.BytesIO()
    if fmt.upper() in ("JPG", "JPEG"):
        im.save(buf, "JPEG", quality=93)
    else:
        im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


class ProgressiveRenderer:
    """Adds connections one by one to a density canvas (physically consistent)."""

    def __init__(self, result: dict, size: int):
        self.s = ProjectSettings(**result["settings"])
        self.geom = BoardGeometry(self.s.board)
        self.w, self.h, self.scale = self.geom.pixel_frame(size)
        self.nails = self.geom.to_pixels(size)
        self.layers = result["layers"]
        self.bg = srgb_to_linear(hex_to_rgb(result["background"])).astype(np.float32)
        self.cols = [srgb_to_linear(hex_to_rgb(L["color"])).astype(np.float32) for L in self.layers]
        self.total = np.zeros(self.w * self.h, np.float32)
        self.mix = np.zeros((self.w * self.h, 3), np.float32)
        self.alpha = self.s.thread.opacity * self.s.thread.thickness_mm * self.scale
        self.steps = build_steps(result)

    def add(self, steps):
        by_layer = {}
        for st in steps:
            if st.get("kind", "line") == "line":
                by_layer.setdefault(st["layer"], []).append((st["from"] - 1, st["to"] - 1))
        for li, e in by_layer.items():
            e = np.asarray(e)
            lo, hi = np.minimum(e[:, 0], e[:, 1]), np.maximum(e[:, 0], e[:, 1])
            flat, offs, wf, _ = rasterize_many(self.nails[lo], self.nails[hi], self.w, self.h)
            d = np.repeat(-np.log1p(-np.clip(self.alpha * wf, 1e-5, 0.999)), np.diff(offs)).astype(np.float32)
            np.add.at(self.total, flat, d)
            np.add.at(self.mix, flat, d[:, None] * self.cols[li][None, :])

    def image(self) -> np.ndarray:
        C = 1 - np.exp(-self.total)
        mix = self.mix / np.maximum(self.total, 1e-9)[:, None]
        out = (1 - C)[:, None] * self.bg + C[:, None] * mix
        return linear_to_srgb(out.reshape(self.h, self.w, 3)).astype(np.float32)


def _frame(img, geom, result, highlight=None, caption=None):
    img = draw_nails(img, geom, numbers=True, highlight=highlight)
    img = apply_board_shape(img, geom, result["background"])
    a = to_uint8(img)
    if caption:
        cv2.putText(a, caption, (10, a.shape[0] - 12), cv2.FONT_HERSHEY_SIMPLEX, max(0.4, a.shape[1] / 1100),
                    (230, 200, 120), 1, cv2.LINE_AA)
    return a


def simulation_frames(result: dict, size: int = 600, mode: str = "timelapse", max_frames: int = 160):
    """Yield RGB uint8 frames: empty board -> successive connections -> final.

    mode: 'timelapse' (frames spread over the sequence), 'instructional'
    (first connections one by one, then accelerating), 'full' (one frame per
    connection, capped), 'final' (only the final artwork).
    """
    R = ProgressiveRenderer(result, size)
    steps = R.steps
    n = len(steps)
    if mode == "final":
        R.add(steps)
        yield _frame(R.image(), R.geom, result, caption=f"{n} connections")
        return
    if mode == "full":
        marks = list(range(1, n + 1))[: max_frames * 10]
    elif mode == "instructional":
        first = list(range(1, min(n, 40) + 1))
        rest = np.unique(np.geomspace(max(41, 1), max(n, 41), max(2, max_frames - len(first))).astype(int))
        marks = first + [int(m) for m in rest if 40 < m <= n]
    else:
        marks = [int(m) for m in np.unique(np.linspace(1, n, max_frames).astype(int))]
    if marks and marks[-1] != n:
        marks.append(n)
    yield _frame(R.image(), R.geom, result, caption="Step 0 - empty board")
    done = 0
    for m in marks:
        R.add(steps[done:m])
        done = m
        st = steps[m - 1]
        hl = {st["from"] - 1: (80, 200, 255), st["to"] - 1: (255, 90, 90)}
        yield _frame(R.image(), R.geom, result, highlight=hl,
                     caption=(f'Step {m}/{n}  around the outside {st["from"]} ~> {st["to"]}  ({st["color_name"]})'
                              if st.get("kind") == "rim" else
                              f'Step {m}/{n}  nail {st["from"]} -> {st["to"]}  ({st["color_name"]}, section {st["section"]})'))


def simulation_gif(result: dict, size: int = 520, mode: str = "timelapse", max_frames: int = 120,
                   fps: int = 12) -> bytes:
    frames = [Image.fromarray(f).quantize(colors=128, method=Image.Quantize.MEDIANCUT)
              for f in simulation_frames(result, size, mode, max_frames)]
    durations = [int(1000 / fps)] * len(frames)
    durations[0] = 800
    durations[-1] = 2500
    buf = io.BytesIO()
    frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=durations, loop=0,
                   optimize=False, disposal=1)
    return buf.getvalue()


def simulation_mp4(result: dict, size: int = 720, mode: str = "timelapse", max_frames: int = 300,
                   fps: int = 30) -> Optional[bytes]:
    size = size - size % 2
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "sim.mp4")
        vw = None
        for f in simulation_frames(result, size, mode, max_frames):
            if vw is None:
                h, w = f.shape[:2]
                vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w - w % 2, h - h % 2))
                if not vw.isOpened():
                    return None
            vw.write(cv2.cvtColor(f[: f.shape[0] - f.shape[0] % 2, : f.shape[1] - f.shape[1] % 2], cv2.COLOR_RGB2BGR))
        if vw is None:
            return None
        for _ in range(fps * 2):  # hold the final frame
            vw.write(cv2.cvtColor(f[: f.shape[0] - f.shape[0] % 2, : f.shape[1] - f.shape[1] % 2], cv2.COLOR_RGB2BGR))
        vw.release()
        with open(path, "rb") as fh:
            return fh.read()


def step_sequence_zip(result: dict, size: int = 800, every: int = 0) -> bytes:
    """ZIP of PNG snapshots every ``every`` steps (auto ~ 60 images)."""
    R = ProgressiveRenderer(result, size)
    n = len(R.steps)
    every = every or max(1, n // 60)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        done = 0
        marks = list(range(every, n + 1, every))
        if not marks or marks[-1] != n:
            marks.append(n)
        for m in marks:
            R.add(R.steps[done:m])
            done = m
            st = R.steps[m - 1]
            f = _frame(R.image(), R.geom, result, highlight={st["to"] - 1: (255, 90, 90)},
                       caption=f"Step {m}/{n}")
            ib = io.BytesIO()
            Image.fromarray(f).save(ib, "PNG")
            z.writestr(f"step_{m:05d}.png", ib.getvalue())
    return buf.getvalue()
