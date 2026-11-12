"""Validation benchmark over the sample images and several nail counts.

    python scripts/benchmark.py [--out docs/benchmark] [--quick]

For every (image, nail count) it records connections, thread length,
generation time, route continuity, duplicate check, export/simulation
consistency and quality indicators, then writes a Markdown report and a
contact sheet of the simulated results.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "backend"))

from stringart.config import PALETTE_PRESETS, ProjectSettings, ThreadColor  # noqa: E402
from stringart.geometry import BoardGeometry  # noqa: E402
from stringart.imaging import load_image  # noqa: E402
from stringart.pipeline import all_edges, build_steps, generate, render_result  # noqa: E402
from stringart.render import apply_board_shape, layer_density  # noqa: E402
from stringart.route import canon, validate_sections  # noqa: E402


def make_logo(path: str):
    """Synthetic high-contrast logo (original artwork, no trademark)."""
    img = np.full((800, 800, 3), 255, np.uint8)
    cv2.circle(img, (400, 400), 300, (0, 0, 0), 46, cv2.LINE_AA)
    pts = np.array([[400, 170], [610, 540], [190, 540]], np.int32)
    cv2.fillPoly(img, [pts], (0, 0, 0), cv2.LINE_AA)
    cv2.fillPoly(img, [np.array([[400, 300], [500, 480], [300, 480]], np.int32)], (255, 255, 255), cv2.LINE_AA)
    cv2.putText(img, "SA", (300, 690), cv2.FONT_HERSHEY_DUPLEX, 3.4, (0, 0, 0), 12, cv2.LINE_AA)
    cv2.imwrite(path, img)


CASES = [
    ("portrait", "portrait_astronaut.png", "black_on_white", "mono"),
    ("animal", "animal_cat.png", "white_on_black", "mono"),
    ("landscape", "landscape_rocket.jpg", "black_on_white", "mono"),
    ("logo", "logo_synthetic.png", "black_on_white", "mono"),
    ("color", "color_coffee.png", None, "cmyk"),
]


def run(out: str, quick: bool):
    os.makedirs(out, exist_ok=True)
    samples = os.path.join(ROOT, "samples")
    logo = os.path.join(samples, "logo_synthetic.png")
    if not os.path.exists(logo):
        make_logo(logo)
    nail_counts = [150, 300] if quick else [150, 200, 300, 400]
    rows = []
    tiles = {}
    for name, fname, preset, cmode in CASES:
        rgb = load_image(os.path.join(samples, fname))
        for n in nail_counts:
            s = ProjectSettings()
            s.board.nail_count = n
            s.generation.mode = "balanced"
            if cmode == "mono":
                s.thread.preset = preset
            else:
                bg, cols = PALETTE_PRESETS[cmode]
                s.thread.color_mode = "color"
                s.thread.palette_background = bg
                s.thread.palette = [ThreadColor(name=a, hex=b) for a, b in cols]
            t0 = time.time()
            r, imgs = generate(rgb, s)
            dt = time.time() - t0
            geom = BoardGeometry(s.board)
            steps = build_steps(r)
            # independent checks
            dup = 0
            valid = True
            for L in r["layers"]:
                e = [tuple(x) for x in L["selected_edges"]]
                dup += len(e) - len({canon(*x) for x in e})
                valid &= validate_sections(L["sections"], e)
            # simulation accuracy: re-render from exported steps vs. optimiser selection
            max_diff = 0.0
            for li, L in enumerate(r["layers"]):
                d_steps = layer_density(geom, [(st["from"] - 1, st["to"] - 1) for st in steps if st["layer"] == li],
                                        r["comparison_resolution"], s.thread.thickness_mm, s.thread.opacity)
                d_sel = layer_density(geom, all_edges(L), r["comparison_resolution"], s.thread.thickness_mm,
                                      s.thread.opacity)
                max_diff = max(max_diff, float(np.abs(d_steps - d_sel).max()))
            m = r["metrics"]
            rows.append({
                "image": name, "nails": n, "connections": r["totals"]["connections"],
                "sections": r["totals"]["sections"], "continuous": all(L["route"]["continuous"] for L in r["layers"]),
                "thread_m": r["materials"]["total_thread_m"], "time_s": dt, "duplicates": dup, "route_valid": valid,
                "sim_export_max_diff": max_diff, "ssim": m["ssim"], "psnr_db": m["psnr_db"], "mae": m["mae"],
                "delta_e2000": m.get("delta_e2000"), "error_reduction": m["error_reduction"],
                "stop": ",".join(L["stats"]["stop_reason"] for L in r["layers"]),
            })
            print(json.dumps(rows[-1]))
            art = apply_board_shape(render_result(r, 420), geom, r["background"])
            tiles[(name, n)] = (np.clip(art, 0, 1) * 255).astype(np.uint8)
            if n == nail_counts[-1] or n == 300:
                tgt = apply_board_shape(cv2.resize(imgs["intended"], (420, 420)), geom, r["background"])
                tiles[(name, "target")] = (np.clip(tgt, 0, 1) * 255).astype(np.uint8)
    # contact sheet: rows = images, cols = target + nail counts
    cols = ["target"] + nail_counts
    sheet_rows = []
    for name, *_ in CASES:
        row = []
        for c in cols:
            t = tiles.get((name, c), np.zeros((420, 420, 3), np.uint8)).copy()
            label = f"{name} - {'intended' if c == 'target' else f'{c} nails'}"
            cv2.putText(t, label, (8, 412), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (217, 164, 65), 1, cv2.LINE_AA)
            row.append(t)
        sheet_rows.append(np.hstack(row))
    sheet = np.vstack(sheet_rows)
    cv2.imwrite(os.path.join(out, "contact_sheet.jpg"), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, 88])
    with open(os.path.join(out, "results.json"), "w") as f:
        json.dump(rows, f, indent=1)
    write_report(out, rows, nail_counts)


def write_report(out, rows, nail_counts):
    L = ["# Benchmark report", "",
         "Generated by `scripts/benchmark.py` (mode: balanced, 300 mm circular board, 0.15 mm thread).", "",
         "![contact sheet](contact_sheet.jpg)", "",
         "| Image | Nails | Connections | Sections | Thread (m) | Time (s) | Duplicates | Route valid | "
         "Sim = export | SSIM | PSNR (dB) | ΔE2000 | Error removed | Stop |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['image']} | {r['nails']} | {r['connections']} | {r['sections']} | {r['thread_m']:.0f} | "
                 f"{r['time_s']:.1f} | {r['duplicates']} | {'yes' if r['route_valid'] else 'NO'} | "
                 f"{'yes' if r['sim_export_max_diff'] < 1e-4 else 'NO'} | {r['ssim']:.3f} | {r['psnr_db']:.1f} | "
                 f"{(r['delta_e2000'] or 0):.1f} | {100 * r['error_reduction']:.0f}% | {r['stop']} |")
    L += ["", "*Duplicates*: repeated undirected connections in the selection (must be 0). "
          "*Route valid*: every selected connection used exactly once by the planned sections. "
          "*Sim = export*: the density re-rendered from the exported step list equals the optimiser's selection. "
          "Quality indicators compare the simulation with the intended appearance and are approximate."]
    with open(os.path.join(out, "REPORT.md"), "w") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "benchmark"))
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    run(a.out, a.quick)
