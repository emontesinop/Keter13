"""PDF exports: construction manual and full-scale nail templates (reportlab)."""
from __future__ import annotations

import io
import time
from typing import List

import numpy as np
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from ..colorsci import hex_to_rgb
from ..config import ProjectSettings
from ..geometry import BoardGeometry
from ..pipeline import build_steps
from .media import artwork_image

ACCENT = colors.HexColor("#b4873a")
INK = colors.HexColor("#1b1c1f")
MUTED = colors.HexColor("#6b6d73")


def _geom(result):
    return BoardGeometry(ProjectSettings(**result["settings"]).board)


# ------------------------------------------------------------------ template primitives
def _draw_nail_template(c: canvas.Canvas, geom: BoardGeometry, ox: float, oy: float, labels: bool = True):
    """Draw the board at 1:1 scale with its centre at (ox, oy) in points (+y up)."""
    b = geom.board
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.6)
    if b.shape == "circle":
        c.circle(ox, oy, b.diameter_mm / 2 * mm)
        c.setDash(3, 3)
        c.setStrokeColor(colors.grey)
        c.circle(ox, oy, (b.diameter_mm / 2 - b.edge_margin_mm) * mm)
        c.setDash()
        c.setStrokeColor(colors.black)
    else:
        c.rect(ox - geom.width_mm / 2 * mm, oy - geom.height_mm / 2 * mm, geom.width_mm * mm, geom.height_mm * mm)
    # centre mark
    c.setLineWidth(0.4)
    c.line(ox - 10 * mm, oy, ox + 10 * mm, oy)
    c.line(ox, oy - 10 * mm, ox, oy + 10 * mm)
    c.circle(ox, oy, 3 * mm)
    r = b.nail_diameter_mm / 2 * mm
    fs = float(np.clip(geom.nail_spacing_mm() * 0.55, 1.2, 4.0)) * mm
    c.setLineWidth(0.25)
    for i, (x, y) in enumerate(geom.xy_mm):
        X, Y = ox + x * mm, oy - y * mm
        c.circle(X, Y, r)
        c.line(X - r, Y, X + r, Y)
        c.line(X, Y - r, X, Y + r)
        if labels:
            n = np.hypot(x, y) or 1
            tx, ty = X - x / n * (r + fs * 1.6), Y + y / n * (r + fs * 1.6)
            ang = np.degrees(np.arctan2(-y, x))
            if ang > 90 or ang < -90:
                ang += 180
            c.saveState()
            c.translate(tx, ty)
            c.rotate(ang)
            c.setFont("Helvetica", fs)
            c.drawCentredString(0, -fs * 0.35, str(i + 1))
            c.restoreState()


def _calibration(c: canvas.Canvas, x: float, y: float):
    c.setLineWidth(0.5)
    c.line(x, y, x + 100 * mm, y)
    for k in range(0, 101, 10):
        c.line(x + k * mm, y, x + k * mm, y + (3.5 if k % 50 == 0 else 2) * mm)
    c.setFont("Helvetica", 7)
    c.drawString(x + 102 * mm, y, "100 mm - verify with a ruler; print at 100 % / 'actual size'")


def template_fullsize_pdf(result_or_geom, margin_mm: float = 20) -> bytes:
    """One page exactly the board size plus margins (for plotters / print shops)."""
    geom = result_or_geom if isinstance(result_or_geom, BoardGeometry) else _geom(result_or_geom)
    W = (geom.width_mm + 2 * margin_mm) * mm
    H = (geom.height_mm + 2 * margin_mm + 12) * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle("Nail template (full scale)")
    _draw_nail_template(c, geom, W / 2, H / 2 + 6 * mm)
    _calibration(c, margin_mm * mm, 8 * mm)
    c.setFont("Helvetica", 8)
    c.drawString(margin_mm * mm, H - 8 * mm, f"StringArt Studio - {geom.board.shape} {geom.width_mm:g} x "
                 f"{geom.height_mm:g} mm - {geom.n} nails ({geom.board.numbering}, nail 1 at "
                 f"{geom.board.start_angle_deg:g} deg) - full scale")
    c.showPage()
    c.save()
    return buf.getvalue()


def template_tiled_pdf(result_or_geom, page=A4, overlap_mm: float = 12.0, margin_mm: float = 8.0) -> bytes:
    """The full-scale template split over standard pages with overlap and alignment marks."""
    geom = result_or_geom if isinstance(result_or_geom, BoardGeometry) else _geom(result_or_geom)
    PW, PH = page
    usable_w = PW / mm - 2 * margin_mm
    usable_h = PH / mm - 2 * margin_mm - 10
    step_w, step_h = usable_w - overlap_mm, usable_h - overlap_mm
    total_w, total_h = geom.width_mm + 20, geom.height_mm + 20
    nx = max(1, int(np.ceil((total_w - overlap_mm) / step_w)))
    ny = max(1, int(np.ceil((total_h - overlap_mm) / step_h)))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=page)
    c.setTitle("Nail template (tiled)")
    for j in range(ny):
        for i in range(nx):
            # window of the drawing (mm, origin top-left of the total area)
            wx0 = i * step_w
            wy0 = j * step_h
            c.saveState()
            p = c.beginPath()
            p.rect(margin_mm * mm, margin_mm * mm + 10 * mm, usable_w * mm, usable_h * mm)
            c.clipPath(p, stroke=0, fill=0)
            # board centre in page coordinates
            cx = margin_mm * mm + (total_w / 2 - wx0) * mm
            cy = PH - margin_mm * mm - (total_h / 2 - wy0) * mm
            _draw_nail_template(c, geom, cx, cy)
            # alignment grid crosses every 50 mm in board coordinates
            c.setStrokeColor(colors.HexColor("#3a7bd5"))
            c.setLineWidth(0.4)
            for gx in np.arange(-500, 501, 50):
                for gy in np.arange(-500, 501, 50):
                    X, Y = cx + gx * mm, cy - gy * mm
                    c.line(X - 3 * mm, Y, X + 3 * mm, Y)
                    c.line(X, Y - 3 * mm, X, Y + 3 * mm)
            c.restoreState()
            c.setStrokeColor(colors.grey)
            c.setDash(2, 2)
            c.rect(margin_mm * mm, margin_mm * mm + 10 * mm, usable_w * mm, usable_h * mm)
            c.setDash()
            c.setStrokeColor(colors.black)
            c.setFont("Helvetica", 8)
            c.drawString(margin_mm * mm, PH - margin_mm * mm + 2,
                         f"Tile row {j + 1}/{ny}, column {i + 1}/{nx} - overlap {overlap_mm:g} mm; "
                         f"align blue crosses (50 mm grid from board centre)")
            _calibration(c, margin_mm * mm, margin_mm * mm + 2 * mm)
            c.showPage()
    c.save()
    return buf.getvalue()


# ------------------------------------------------------------------ manual
class _Doc:
    def __init__(self, title):
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=A4)
        self.c.setTitle(title)
        self.W, self.H = A4
        self.page = 0
        self.y = 0
        self.new_page()

    def new_page(self):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.y = self.H - 22 * mm
        c = self.c
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        c.drawString(18 * mm, 10 * mm, "StringArt Studio - construction manual")
        c.drawRightString(self.W - 18 * mm, 10 * mm, f"page {self.page}")
        c.setFillColor(INK)

    def need(self, h):
        if self.y - h < 18 * mm:
            self.new_page()

    def h1(self, text):
        self.need(16 * mm)
        self.c.setFillColor(ACCENT)
        self.c.setFont("Helvetica-Bold", 17)
        self.c.drawString(18 * mm, self.y, text)
        self.c.setFillColor(INK)
        self.y -= 9 * mm

    def h2(self, text):
        self.need(12 * mm)
        self.c.setFont("Helvetica-Bold", 11.5)
        self.c.drawString(18 * mm, self.y, text)
        self.y -= 6 * mm

    def para(self, text, size=9.5, indent=0):
        from reportlab.lib.utils import simpleSplit
        lines = simpleSplit(text, "Helvetica", size, self.W - 36 * mm - indent)
        for ln in lines:
            self.need(5 * mm)
            self.c.setFont("Helvetica", size)
            self.c.drawString(18 * mm + indent, self.y, ln)
            self.y -= size * 0.45 * mm + 1.6 * mm
        self.y -= 1.5 * mm

    def bullets(self, items):
        for it in items:
            self.para("• " + it, indent=3 * mm)

    def kv(self, rows, col=70 * mm):
        for k, v in rows:
            self.need(5.5 * mm)
            self.c.setFont("Helvetica", 9.5)
            self.c.setFillColor(MUTED)
            self.c.drawString(18 * mm, self.y, k)
            self.c.setFillColor(INK)
            self.c.drawString(18 * mm + col, self.y, str(v))
            self.y -= 5.2 * mm
        self.y -= 2 * mm

    def finish(self):
        self.c.showPage()
        self.c.save()
        return self.buf.getvalue()


def _fmt(x, d=1):
    return f"{x:,.{d}f}"


def construction_manual(result: dict, project_name: str = "String art") -> bytes:
    s = ProjectSettings(**result["settings"])
    geom = BoardGeometry(s.board)
    steps = build_steps(result)
    rim_join = result["settings"].get("route", {}).get("join", "cut") == "rim"
    mat = result["materials"]
    doc = _Doc(f"{project_name} - construction manual")
    c = doc.c

    # ---- cover
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(INK)
    c.drawString(18 * mm, doc.y, project_name)
    doc.y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(18 * mm, doc.y, f"String art construction manual - generated {time.strftime('%Y-%m-%d %H:%M')}")
    c.setFillColor(INK)
    doc.y -= 6 * mm
    img = ImageReader(io.BytesIO(artwork_image(result, size=1400)))
    side = 120 * mm
    c.drawImage(img, (doc.W - side) / 2, doc.y - side, side, side * geom.height_mm / geom.width_mm,
                mask="auto")
    doc.y -= side * geom.height_mm / geom.width_mm + 8 * mm
    t = result["totals"]
    doc.kv([
        ("Board", f'{s.board.shape}, {geom.width_mm:g} x {geom.height_mm:g} mm, {s.board.material}'),
        ("Nails", f"{geom.n} (numbered {s.board.numbering}, nail 1 at {s.board.start_angle_deg:g} deg from 12 o'clock)"),
        ("Connections", f'{t["connections"]} ({t["unique_connections"]} unique, {t["bridges"]} approved bridges)'),
        ("Thread sections", f'{t["sections"]} (knots: {mat["knots"]}, cuts: {mat["cuts"]})'),
        ("Thread length", f'{_fmt(mat["total_thread_m"])} m incl. allowances'),
        ("Estimated time", f'{_fmt(mat["construction_time_h"]["total"])} h'),
    ])

    # ---- specifications
    doc.new_page()
    doc.h1("1. Technical specifications")
    doc.h2("Board")
    doc.kv([("Shape", s.board.shape), ("Size", f"{geom.width_mm:g} x {geom.height_mm:g} mm"),
            ("Thickness", f"{s.board.thickness_mm:g} mm"), ("Material", s.board.material),
            ("Background colour", result["background"]),
            ("Edge margin", f"{s.board.edge_margin_mm:g} mm")])
    doc.h2("Nails")
    doc.kv([("Count", geom.n), ("Spacing (centre to centre)", f"{geom.nail_spacing_mm():.2f} mm"),
            ("Nail diameter", f"{s.board.nail_diameter_mm:g} mm"),
            ("Exposed height", f"{s.board.nail_height_mm:g} mm"),
            ("Numbering", f"{s.board.numbering}, starting at {s.board.start_angle_deg:g} deg"),
            ] + ([("Nail ring radius", f'{result["board"]["nail_ring_radius_mm"]:.2f} mm'),
                  ("Angular step", f'{result["board"]["angular_step_deg"]:.4f} deg')]
                 if s.board.shape == "circle" else []))
    doc.h2("Thread and colour layers")
    rows = [("Thread thickness", f"{s.thread.thickness_mm:g} mm")]
    for L in mat["layers"]:
        rows.append((f'{L["name"]} ({L["color"]})',
                     f'{L["connections"]} connections, {L["sections"]} section(s), '
                     f'{_fmt(L["total_with_waste_m"])} m, spool {L["recommended_spool_m"]:g} m'))
    doc.kv(rows, col=55 * mm)
    doc.h2("Materials and cost")
    co = mat["costs"]
    doc.kv([("Nails", f'{_fmt(co["nails"], 2)} {co["currency"]}'), ("Board", f'{_fmt(co["board"], 2)} {co["currency"]}'),
            ("Thread", f'{_fmt(co["thread"], 2)} {co["currency"]}'), ("Other", f'{_fmt(co["other"], 2)} {co["currency"]}'),
            ("Total", f'{_fmt(co["total"], 2)} {co["currency"]}'),
            ("Time: nailing / threading", f'{_fmt(mat["construction_time_h"]["nailing"])} h / '
                                          f'{_fmt(mat["construction_time_h"]["threading"])} h')])
    if result.get("metrics"):
        m = result["metrics"]
        doc.h2("Simulation quality indicators (approximate)")
        doc.kv([("SSIM", f'{m["ssim"]:.3f}'), ("PSNR", f'{m["psnr_db"]:.1f} dB'), ("MAE", f'{m["mae"]:.3f}')]
               + ([("Mean Delta E 2000", f'{m["delta_e2000"]:.2f}')] if "delta_e2000" in m else []))

    # ---- instructions
    doc.new_page()
    doc.h1("2. How to build it")
    doc.h2("Board preparation")
    doc.bullets([
        f"Cut or buy a {s.board.shape} board of {geom.width_mm:g} x {geom.height_mm:g} mm, at least "
        f"{max(12, s.board.nail_height_mm):g} mm thick so nails hold firmly.",
        f"Finish the surface in the background colour ({result['background']}) and let it dry completely.",
        "Print the nail template (template PDF) at 100 % scale. Check the 100 mm calibration bar with a ruler.",
        "Tape the template to the board, aligning its centre cross with the centre of the board.",
    ])
    doc.h2("Nail placement and numbering")
    doc.bullets([
        f"Drive a nail at every marked hole ({geom.n} nails), leaving {s.board.nail_height_mm:g} mm exposed. "
        "Use a depth gauge (a drilled block) to keep the height constant.",
        "Keep nails vertical; a slight outward tilt helps the thread stay down.",
        "Remove the paper template carefully (tear along the nails).",
        f"Mark nail 1 and every 10th nail with a small dot or tape - numbering runs {s.board.numbering}.",
    ])
    doc.h2("Thread, starting and tension")
    doc.bullets([
        f"Use strong, low-stretch thread about {s.thread.thickness_mm:g} mm thick "
        "(e.g. polyester sewing or embroidery thread).",
        "Start each section by tying a double knot (or clove hitch) around its first nail; add a drop of glue.",
        "Pull every connection taut but do not over-tension - nails may bend. Keep tension consistent.",
        "Each step goes FROM the nail you are on TO the next nail, passing around the far side of that nail "
        "so the thread continues from it.",
        "Work in sessions; record the last completed step number (use the checkbox column).",
    ])
    doc.h2("Sections, cutting and finishing")
    rim_note = (
        [f"Each colour is ONE piece of thread ({mat.get('threads', t['sections'])} in total). Its line groups are joined by "
         f"{mat.get('rim_moves', 0)} moves around the OUTSIDE of the board, marked '~' and 'OUTSIDE' in the sequence: "
         "run the thread along the outside of the nails from the first nail to the second without crossing the "
         "board, then continue with the next line. Do not cut."]
        if rim_join and mat.get("rim_moves") else
        [f"This design uses {t['sections']} continuous thread section(s). A new section means: tie off the "
         "current thread on its last nail, cut it, and tie a new start on the first nail of the next section."])
    doc.bullets(rim_note + [
        "Colour layers are built one after another in the order listed in the sequence (lighter colours first).",
        "Finish each section with two half hitches around the last nail and a drop of glue; trim the tail.",
        f"Thread allowances included in estimates: {s.materials.knot_allowance_mm:g} mm per knot, "
        f"{s.materials.slack_percent:g} % tension slack, {s.materials.waste_percent:g} % waste.",
    ])
    if t["bridges"]:
        doc.para(f"Note: {t['bridges']} approved bridge connection(s) were added to reduce the number of "
                 "sections. They are marked 'B' in the sequence table.")

    # ---- board diagram
    doc.new_page()
    doc.h1("3. Board diagram")
    size = 165 * mm
    scale = size / max(geom.width_mm, geom.height_mm)
    cx, cy = doc.W / 2, doc.y - size / 2 - 4 * mm
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    if s.board.shape == "circle":
        c.circle(cx, cy, s.board.diameter_mm / 2 * scale)
    else:
        c.rect(cx - geom.width_mm / 2 * scale, cy - geom.height_mm / 2 * scale, geom.width_mm * scale,
               geom.height_mm * scale)
    step = max(1, int(np.ceil(geom.n / 100)))
    for i, (x, y) in enumerate(geom.xy_mm):
        X, Y = cx + x * scale, cy - y * scale
        c.setFillColor(ACCENT if i % 10 == 0 else INK)
        c.circle(X, Y, 0.55 * mm if i % 10 else 0.9 * mm, fill=1, stroke=0)
        if i % (step * 5) == 0:
            n = np.hypot(x, y) or 1
            c.setFont("Helvetica", 6)
            c.drawCentredString(X + x / n * 5 * mm, Y - y / n * 5 * mm - 2, str(i + 1))
    c.setFillColor(INK)
    doc.y = cy - size / 2 - 10 * mm
    doc.para("Nail 1 and every 10th nail are highlighted. The full numbering is on the 1:1 template.")

    # ---- nail coordinates
    doc.new_page()
    doc.h1("4. Nail coordinates (mm)")
    doc.para("Origin at the board centre, X to the right, Y downward, angle clockwise from 12 o'clock.", 8.5)
    cols = 3
    colw = (doc.W - 36 * mm) / cols
    rows_per_col = int((doc.y - 22 * mm) / (4.1 * mm))
    nails = result["nails"]
    idx = 0
    while idx < len(nails):
        top = doc.y
        for k in range(cols):
            yy = top
            c.setFont("Helvetica-Bold", 7.5)
            c.drawString(18 * mm + k * colw, yy, "Nail      X          Y        Angle")
            yy -= 4.1 * mm
            c.setFont("Courier", 7.5)
            for _ in range(rows_per_col - 1):
                if idx >= len(nails):
                    break
                n = nails[idx]
                c.drawString(18 * mm + k * colw, yy,
                             f'{n["number"]:>4} {n["x_mm"]:>8.2f} {n["y_mm"]:>8.2f} {n["angle_deg"]:>8.3f}')
                yy -= 4.1 * mm
                idx += 1
        if idx < len(nails):
            doc.new_page()
            rows_per_col = int((doc.y - 22 * mm) / (4.1 * mm))

    # ---- sequence
    doc.new_page()
    doc.h1("5. Connection sequence")
    doc.para("Tick each step when done. 'B' marks an approved bridge connection. Distances are centre to centre.", 8.5)
    cols = 4
    colw = (doc.W - 36 * mm) / cols
    lh = 3.75 * mm
    i = 0
    cur_sec = None
    while i < len(steps):
        rows = int((doc.y - 20 * mm) / lh)
        top = doc.y
        for k in range(cols):
            yy = top
            for _ in range(rows):
                if i >= len(steps):
                    break
                st = steps[i]
                key = st["layer"] if st.get("kind") == "rim" or rim_join else (st["layer"], st["section"])
                if key != cur_sec:
                    cur_sec = key
                    c.setFillColor(colors.HexColor(st["color"]) if st["color"].lower() not in ("#ffffff", "#f4f4f0") else INK)
                    c.setFont("Helvetica-Bold", 7)
                    c.drawString(18 * mm + k * colw, yy, f'{st["color_name"].upper()} THREAD' if rim_join
                                 else f'{st["color_name"].upper()} - SECTION {st["section"]}')
                    c.setFillColor(INK)
                    yy -= lh
                    continue
                if st.get("kind") == "rim":
                    c.setFont("Courier-Oblique", 7.3)
                    c.rect(18 * mm + k * colw, yy - 0.4 * mm, 2.4 * mm, 2.4 * mm)
                    c.drawString(18 * mm + k * colw + 3.4 * mm, yy, f'{st["step"]:>5} {st["from"]:>4}~{st["to"]:<4} OUTSIDE')
                    yy -= lh
                    i += 1
                    continue
                c.setFont("Courier", 7.3)
                c.rect(18 * mm + k * colw, yy - 0.4 * mm, 2.4 * mm, 2.4 * mm)
                c.drawString(18 * mm + k * colw + 3.4 * mm, yy,
                             f'{st["step"]:>5} {st["from"]:>4}>{st["to"]:<4}{"B" if st["bridge"] else " "}'
                             f'{st["distance_mm"]:>6.0f}')
                yy -= lh
                i += 1
        if i < len(steps):
            doc.new_page()
    return doc.finish()
