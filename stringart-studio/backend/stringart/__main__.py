"""Command line entry point.

    python -m stringart serve [--port 8765]
    python -m stringart generate IMAGE [--out DIR] [--nails 300] [--mode balanced] [--preset white_on_black]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time


def main(argv=None):
    ap = argparse.ArgumentParser(prog="stringart", description="StringArt Studio")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sv = sub.add_parser("serve", help="run the web application")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8765)
    g = sub.add_parser("generate", help="generate from the command line")
    g.add_argument("image")
    g.add_argument("--out", default="stringart_out")
    g.add_argument("--nails", type=int, default=300)
    g.add_argument("--diameter", type=float, default=300)
    g.add_argument("--mode", default="balanced")
    g.add_argument("--preset", default="white_on_black")
    g.add_argument("--color", choices=["mono", "cmyk", "rgb", "warm"], default="mono")
    g.add_argument("--route", choices=["strict", "practical"], default="strict")
    a = ap.parse_args(argv)
    if a.cmd == "serve":
        import uvicorn
        print(f"StringArt Studio running at http://{a.host}:{a.port}")
        uvicorn.run("stringart.api:app", host=a.host, port=a.port, log_level="warning")
        return
    from .config import PALETTE_PRESETS, ProjectSettings, ThreadColor
    from .exports import media, pdf, vector
    from .imaging import load_image
    from .pipeline import generate
    s = ProjectSettings()
    s.board.nail_count = a.nails
    s.board.diameter_mm = a.diameter
    s.generation.mode = a.mode
    s.thread.preset = a.preset
    s.route.mode = a.route
    if a.color != "mono":
        bg, cols = PALETTE_PRESETS[a.color]
        s.thread.color_mode = "color"
        s.thread.palette_background = bg
        s.thread.palette = [ThreadColor(name=n, hex=h) for n, h in cols]
    os.makedirs(a.out, exist_ok=True)
    t = time.time()

    def prog(p):
        sys.stdout.write(f"\r{p.get('stage', ''):>10} {100 * p.get('fraction', 0):5.1f}%  lines {p.get('lines', '')}   ")
        sys.stdout.flush()
    r, _ = generate(load_image(a.image), s, progress=prog)
    print(f"\nDone in {time.time() - t:.1f}s: {r['totals']['connections']} connections, "
          f"{r['totals']['sections']} section(s), {r['materials']['total_thread_m']:.0f} m thread")
    files = {
        "artwork.png": media.artwork_image(r, 2000), "manual.pdf": pdf.construction_manual(r, os.path.basename(a.image)),
        "template_fullscale.pdf": pdf.template_fullsize_pdf(r), "template_A4.pdf": pdf.template_tiled_pdf(r),
        "sequence.csv": vector.sequence_csv(r), "sequence.json": vector.sequence_json(r),
        "artwork.svg": vector.artwork_svg(r), "template.dxf": vector.template_dxf(r),
    }
    for k, v in files.items():
        with open(os.path.join(a.out, k), "wb") as f:
            f.write(v)
    print(json.dumps(r["metrics"], indent=1))
    print("Files written to", os.path.abspath(a.out))


if __name__ == "__main__":
    main()
