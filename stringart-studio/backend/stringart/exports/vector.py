"""Text/vector exports: CSV, JSON, SVG (artwork + full-scale template), DXF, G-code."""
from __future__ import annotations

import csv
import io
import json
from typing import List

import numpy as np

from ..colorsci import hex_to_rgb
from ..config import ProjectSettings
from ..geometry import BoardGeometry
from ..pipeline import all_edges, build_steps


def _geom(result) -> BoardGeometry:
    return BoardGeometry(ProjectSettings(**result["settings"]).board)


# ------------------------------------------------------------------ sequence
def sequence_csv(result: dict, excel: bool = True) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Step", "From nail", "To nail", "Thread color", "Color hex", "Distance (mm)", "Section", "Bridge",
                "Action"])
    for s in build_steps(result):
        w.writerow([s["step"], s["from"], s["to"], s["color_name"], s["color"], f'{s["distance_mm"]:.2f}',
                    s["section"], "yes" if s["bridge"] else "",
                    "around the outside of the board (no line)" if s["kind"] == "rim" else "line"])
    data = buf.getvalue().encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if excel else data   # BOM so Excel detects UTF-8


def nails_csv(result: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Nail", "X from centre (mm)", "Y from centre (mm, down)", "X from left edge (mm)",
                "Y from top edge (mm)", "Angle (deg, clockwise from 12 o'clock)", "Radius (mm)",
                "Distance to next (mm)"])
    b = result["board"]
    for n in result["nails"]:
        w.writerow([n["number"], f'{n["x_mm"]:.3f}', f'{n["y_mm"]:.3f}', f'{n["x_mm"] + b["width_mm"] / 2:.3f}',
                    f'{n["y_mm"] + b["height_mm"] / 2:.3f}', f'{n["angle_deg"]:.4f}', f'{n["radius_mm"]:.3f}',
                    f'{n["dist_next_mm"]:.3f}'])
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


def sequence_json(result: dict) -> bytes:
    out = {
        "format": "stringart-studio/sequence",
        "version": 1,
        "units": "mm",
        "board": result["board"],
        "background": result["background"],
        "thread_mm": result["thread_mm"],
        "nails": [{"number": n["number"], "x_mm": n["x_mm"], "y_mm": n["y_mm"], "angle_deg": n["angle_deg"]}
                  for n in result["nails"]],
        "layers": [{"name": L["name"], "color": L["color"], "sections": [[v + 1 for v in s] for s in L["sections"]],
                    "bridges_applied": L.get("bridges_applied", []), "route": L["route"]}
                   for L in result["layers"]],
        "steps": build_steps(result),
        "totals": result["totals"],
        "materials": result["materials"],
    }
    return json.dumps(out, indent=1).encode("utf-8")


# ------------------------------------------------------------------ SVG
def _svg_header(w_mm, h_mm, extra=""):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w_mm:.3f}mm" height="{h_mm:.3f}mm" '
            f'viewBox="0 0 {w_mm:.3f} {h_mm:.3f}" {extra}>\n')


def artwork_svg(result: dict, nails: bool = True) -> bytes:
    """Physically scaled vector artwork (1 user unit = 1 mm)."""
    geom = _geom(result)
    W, H = geom.width_mm, geom.height_mm
    ox, oy = W / 2, H / 2
    xy = geom.xy_mm
    parts = [_svg_header(W, H)]
    if geom.board.shape == "circle":
        parts.append(f'<circle cx="{ox}" cy="{oy}" r="{W / 2}" fill="{result["background"]}"/>\n')
    else:
        parts.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="{result["background"]}"/>\n')
    t = result["thread_mm"]
    op = result["opacity"]
    for st_layer, L in enumerate(result["layers"]):
        parts.append(f'<g stroke="{L["color"]}" stroke-width="{t}" stroke-opacity="{op}" '
                     f'stroke-linecap="round" fill="none" id="layer-{st_layer + 1}">\n')
        for sec in L["sections"]:
            pts = " ".join(f"{xy[v, 0] + ox:.3f},{xy[v, 1] + oy:.3f}" for v in sec)
            parts.append(f'<polyline points="{pts}"/>\n')
        parts.append("</g>\n")
    if nails:
        r = geom.board.nail_diameter_mm / 2
        parts.append('<g fill="#b4975a">\n')
        for x, y in xy:
            parts.append(f'<circle cx="{x + ox:.3f}" cy="{y + oy:.3f}" r="{r:.3f}"/>\n')
        parts.append("</g>\n")
    parts.append("</svg>\n")
    return "".join(parts).encode("utf-8")


def template_svg(result_or_geom, margin_mm: float = 15.0) -> bytes:
    """Full-scale nail placement template with centre and calibration marks."""
    geom = result_or_geom if isinstance(result_or_geom, BoardGeometry) else _geom(result_or_geom)
    W, H = geom.width_mm + 2 * margin_mm, geom.height_mm + 2 * margin_mm
    ox, oy = W / 2, H / 2
    b = geom.board
    p = [_svg_header(W, H, 'font-family="Helvetica, Arial, sans-serif"')]
    p.append(f'<rect width="{W}" height="{H}" fill="white"/>\n')
    if b.shape == "circle":
        p.append(f'<circle cx="{ox}" cy="{oy}" r="{b.diameter_mm / 2}" fill="none" stroke="#000" stroke-width="0.3"/>\n')
        p.append(f'<circle cx="{ox}" cy="{oy}" r="{b.diameter_mm / 2 - b.edge_margin_mm}" fill="none" '
                 f'stroke="#888" stroke-width="0.15" stroke-dasharray="2 2"/>\n')
    else:
        p.append(f'<rect x="{margin_mm}" y="{margin_mm}" width="{geom.width_mm}" height="{geom.height_mm}" '
                 f'fill="none" stroke="#000" stroke-width="0.3"/>\n')
    # centre cross
    p.append(f'<g stroke="#000" stroke-width="0.2"><line x1="{ox - 10}" y1="{oy}" x2="{ox + 10}" y2="{oy}"/>'
             f'<line x1="{ox}" y1="{oy - 10}" x2="{ox}" y2="{oy + 10}"/>'
             f'<circle cx="{ox}" cy="{oy}" r="3" fill="none"/></g>\n')
    # calibration bar (100 mm) + corner registration marks
    cx0 = margin_mm
    cy0 = H - margin_mm / 2
    p.append(f'<g stroke="#000" stroke-width="0.3"><line x1="{cx0}" y1="{cy0}" x2="{cx0 + 100}" y2="{cy0}"/>')
    for k in range(0, 101, 10):
        p.append(f'<line x1="{cx0 + k}" y1="{cy0 - (2 if k % 50 else 3.5)}" x2="{cx0 + k}" y2="{cy0}"/>')
    p.append(f'</g><text x="{cx0 + 102}" y="{cy0}" font-size="3">100 mm calibration - measure after printing</text>\n')
    for (x, y) in [(5, 5), (W - 5, 5), (5, H - 5), (W - 5, H - 5)]:
        p.append(f'<g stroke="#000" stroke-width="0.2"><line x1="{x - 4}" y1="{y}" x2="{x + 4}" y2="{y}"/>'
                 f'<line x1="{x}" y1="{y - 4}" x2="{x}" y2="{y + 4}"/></g>\n')
    # nails
    r = b.nail_diameter_mm / 2
    fs = float(np.clip(geom.nail_spacing_mm() * 0.55, 1.2, 4.0))
    for i, (x, y) in enumerate(geom.xy_mm):
        X, Y = x + ox, y + oy
        p.append(f'<circle cx="{X:.3f}" cy="{Y:.3f}" r="{r:.3f}" fill="none" stroke="#000" stroke-width="0.12"/>'
                 f'<line x1="{X - r:.3f}" y1="{Y:.3f}" x2="{X + r:.3f}" y2="{Y:.3f}" stroke="#000" stroke-width="0.06"/>'
                 f'<line x1="{X:.3f}" y1="{Y - r:.3f}" x2="{X:.3f}" y2="{Y + r:.3f}" stroke="#000" stroke-width="0.06"/>\n')
        # number placed toward the centre, rotated radially for readability
        n = np.hypot(x, y) or 1
        tx, ty = X - x / n * (r + fs * 1.6), Y - y / n * (r + fs * 1.6)
        ang = np.degrees(np.arctan2(y, x))
        if 90 < ang or ang < -90:
            ang += 180
        p.append(f'<text x="{tx:.3f}" y="{ty:.3f}" font-size="{fs:.2f}" text-anchor="middle" '
                 f'dominant-baseline="central" transform="rotate({ang:.2f} {tx:.3f} {ty:.3f})">{i + 1}</text>\n')
    p.append(f'<text x="{margin_mm}" y="{margin_mm * 0.6}" font-size="3.5">StringArt Studio nail template - '
             f'{b.shape} {geom.width_mm:g} x {geom.height_mm:g} mm, {geom.n} nails ({b.numbering}), '
             f'print at 100 % scale</text>\n')
    p.append("</svg>\n")
    return "".join(p).encode("utf-8")


# ------------------------------------------------------------------ DXF (R12)
def template_dxf(result_or_geom) -> bytes:
    """AutoCAD R12 ASCII DXF, millimetres, origin at board centre, +Y up."""
    geom = result_or_geom if isinstance(result_or_geom, BoardGeometry) else _geom(result_or_geom)
    b = geom.board
    out: List[str] = []

    def g(code, value):
        out.append(f"{code}\n{value}")
    g(0, "SECTION"); g(2, "HEADER"); g(9, "$INSUNITS"); g(70, 4); g(0, "ENDSEC")
    g(0, "SECTION"); g(2, "ENTITIES")

    def circle(x, y, r, layer):
        g(0, "CIRCLE"); g(8, layer); g(10, f"{x:.4f}"); g(20, f"{y:.4f}"); g(30, "0.0"); g(40, f"{r:.4f}")

    def line(x1, y1, x2, y2, layer):
        g(0, "LINE"); g(8, layer); g(10, f"{x1:.4f}"); g(20, f"{y1:.4f}"); g(30, "0.0")
        g(11, f"{x2:.4f}"); g(21, f"{y2:.4f}"); g(31, "0.0")

    def text(x, y, h, s, layer):
        g(0, "TEXT"); g(8, layer); g(10, f"{x:.4f}"); g(20, f"{y:.4f}"); g(30, "0.0"); g(40, f"{h:.3f}"); g(1, s)
        g(72, 1); g(11, f"{x:.4f}"); g(21, f"{y:.4f}"); g(31, "0.0")
    if b.shape == "circle":
        circle(0, 0, b.diameter_mm / 2, "BOARD_OUTLINE")
    else:
        hw, hh = geom.width_mm / 2, geom.height_mm / 2
        for (x1, y1, x2, y2) in [(-hw, -hh, hw, -hh), (hw, -hh, hw, hh), (hw, hh, -hw, hh), (-hw, hh, -hw, -hh)]:
            line(x1, y1, x2, y2, "BOARD_OUTLINE")
    line(-10, 0, 10, 0, "CENTER"); line(0, -10, 0, 10, "CENTER")
    fs = float(np.clip(geom.nail_spacing_mm() * 0.5, 1.0, 4.0))
    for i, (x, y) in enumerate(geom.xy_mm):
        circle(x, -y, b.nail_diameter_mm / 2, "DRILL_HOLES")
        n = np.hypot(x, y) or 1
        text(x - x / n * fs * 2.2, -(y - y / n * fs * 2.2), fs, str(i + 1), "NUMBERS")
    g(0, "ENDSEC"); g(0, "EOF")
    return ("\n".join(out) + "\n").encode("ascii")


def drilling_gcode(result_or_geom, depth_mm: float = 6.0, safe_z: float = 5.0, feed: float = 300.0) -> bytes:
    """Simple G81 peck-free drilling program (origin = board centre, +Y up)."""
    geom = result_or_geom if isinstance(result_or_geom, BoardGeometry) else _geom(result_or_geom)
    lines = ["(StringArt Studio drilling template)",
             f"(nails: {geom.n}, hole diameter: {geom.board.nail_diameter_mm} mm - choose drill accordingly)",
             "(origin X0 Y0 = board centre, Z0 = board surface. VERIFY BEFORE RUNNING)",
             "G21 G90 G17", f"G0 Z{safe_z:.3f}"]
    first = True
    for i, (x, y) in enumerate(geom.xy_mm):
        if first:
            lines.append(f"G81 X{x:.3f} Y{-y:.3f} Z{-depth_mm:.3f} R{safe_z / 2:.3f} F{feed:.0f} (nail {i + 1})")
            first = False
        else:
            lines.append(f"X{x:.3f} Y{-y:.3f} (nail {i + 1})")
    lines += ["G80", f"G0 Z{safe_z * 4:.3f}", "M30"]
    return ("\n".join(lines) + "\n").encode("ascii")
