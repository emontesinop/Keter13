"""Route planning (graph theory), materials, pipeline consistency and exports."""
import csv
import io
import json
import re

import numpy as np
import pytest
from PIL import Image

from stringart.config import BoardSettings, MaterialSettings, ProjectSettings, ThreadColor
from stringart.exports import media, pdf, vector
from stringart.geometry import BoardGeometry
from stringart.materials import layer_thread
from stringart.pipeline import build_steps, finalize, generate, all_edges
from stringart.render import layer_density
from stringart.route import (canon, components, euler_decomposition, min_sections, plan_route, propose_bridges,
                             validate_sections, wrap_length_mm)


# ------------------------------------------------------------------ graph theory
def test_min_sections_known_graphs():
    path = [(0, 1), (1, 2), (2, 3)]
    cycle = [(0, 1), (1, 2), (2, 0)]
    star = [(0, 1), (0, 2), (0, 3), (0, 4)]          # 4 odd leaves (centre even) -> 2 trails
    two = cycle + [(5, 6)]
    assert min_sections(path) == 1
    assert min_sections(cycle) == 1
    assert min_sections(star) == 2
    assert min_sections(two) == 2
    assert len(components(two)) == 2


@pytest.mark.parametrize("seed", range(6))
def test_euler_decomposition_is_minimal_and_valid(seed):
    rng = np.random.default_rng(seed)
    n = 30
    edges = set()
    while len(edges) < 80:
        a, b = rng.integers(0, n, 2)
        if a != b:
            edges.add(canon(int(a), int(b)))
    edges = list(edges)
    secs = euler_decomposition(edges)
    assert validate_sections(secs, edges)
    assert len(secs) == min_sections(edges)


def test_validate_rejects_bad_routes():
    edges = [(0, 1), (1, 2)]
    assert validate_sections([[0, 1, 2]], edges)
    assert not validate_sections([[0, 1, 0]], edges)          # repeats an edge
    assert not validate_sections([[0, 1]], edges)              # misses an edge
    assert not validate_sections([[0, 1, 2, 3]], edges)        # adds an edge
    with pytest.raises(ValueError):
        plan_route([(0, 1), (1, 0)])                            # duplicate connection


def test_plan_route_keeps_optimizer_trail_and_reports_continuity():
    trail = [0, 5, 2, 7, 1]
    edges = list(zip(trail[:-1], trail[1:]))
    plan = plan_route(edges, given_sections=[trail])
    assert plan.is_continuous and plan.sections == [trail] and not plan.reordered


def test_plan_route_reduces_sections_when_possible():
    # two trails given, but the union is a single path -> 1 section
    edges = [(0, 1), (1, 2), (2, 3)]
    plan = plan_route(edges, given_sections=[[0, 1], [1, 2, 3]])
    assert len(plan.sections) == 1 and plan.reordered


def test_bridges_reduce_sections_and_are_not_silent():
    edges = [(0, 1), (2, 3), (4, 5)]                    # 3 separate sections
    br = propose_bridges(edges, 5, cost_fn=lambda a, b: 0.0, valid_fn=lambda a, b: True,
                         length_fn=lambda a, b: abs(a - b))
    assert len(br) == 2
    plan = plan_route(edges, extra_edges=[(b.a, b.b) for b in br])
    assert len(plan.sections) == 1
    # without approval nothing is added
    assert len(plan_route(edges).sections) == 3


def test_wrap_and_thread_length():
    xy = np.array([[0.0, 0.0], [100.0, 0.0], [0.0, 0.0]])
    # straight back-and-forth: 180 deg turn around nail 1
    w = wrap_length_mm(xy, 0, 1, 2, nail_d=2.0, thread_d=0.0, style="contact")
    assert w == pytest.approx(np.pi * 1.0)
    g = BoardGeometry(BoardSettings(nail_count=100))
    sec = [0, 50, 10, 60]
    m = MaterialSettings(knot_allowance_mm=0, slack_percent=0, waste_percent=0)
    t = layer_thread(g, [sec], g.board, 0.0, m)
    straight = sum(g.distance_mm(a, b) for a, b in zip(sec[:-1], sec[1:]))
    assert t["straight_mm"] == pytest.approx(straight)
    assert t["total_mm"] == pytest.approx(straight + t["wrap_mm"])
    m2 = MaterialSettings(knot_allowance_mm=100, slack_percent=10, waste_percent=0)
    t2 = layer_thread(g, [sec], g.board, 0.0, m2)
    assert t2["total_mm"] == pytest.approx((straight + t["wrap_mm"]) * 1.1 + 200)


# ------------------------------------------------------------------ pipeline + exports
@pytest.fixture(scope="module")
def result():
    rng = np.random.default_rng(3)
    yy, xx = np.mgrid[0:200, 0:200]
    img = np.ones((200, 200, 3), np.float32)
    img[(xx - 100) ** 2 + (yy - 80) ** 2 < 40 ** 2] = 0.1          # dark disc
    img[140:170, 40:160] = 0.3                                     # dark bar
    s = ProjectSettings()
    s.board.nail_count = 160
    s.generation.mode = "custom"
    s.generation.max_lines = 600
    s.generation.resolution = 160
    s.thread.preset = "black_on_white"
    s.route.mode = "practical"
    s.generation.strategy = "hybrid"
    s.generation.max_sections = 6
    s.generation.continuity_preference = 1.0     # cut whenever a better line exists elsewhere
    r, imgs = generate(img, s)
    return r, imgs, s


def test_result_route_is_validated(result):
    r, _, _ = result
    for L in r["layers"]:
        edges = [tuple(e) for e in L["selected_edges"]]
        assert validate_sections(L["sections"], edges)
        assert L["route"]["validated"]
        assert len({canon(*e) for e in edges}) == len(edges)


def test_exported_sequence_matches_simulation(result):
    r, _, s = result
    all_steps = build_steps(r)
    steps = [st for st in all_steps if st["kind"] == "line"]
    rims = [st for st in all_steps if st["kind"] == "rim"]
    g = BoardGeometry(s.board)
    # with the default "rim" join, sections of one colour are linked by moves around the outside
    assert len(rims) == r["layers"][0]["route"]["sections"] - 1
    # sequence edges == simulated edges, step by step and in total
    from_steps = sorted(canon(st["from"] - 1, st["to"] - 1) for st in steps)
    simulated = sorted(canon(*e) for e in all_edges(r["layers"][0]))
    assert from_steps == simulated
    # continuity inside each section
    # continuity: within one colour every step (line or rim move) starts where the previous ended
    for a, b in zip(all_steps, all_steps[1:]):
        if a["layer"] == b["layer"]:
            assert a["to"] == b["from"]
    # rendering the exported steps reproduces the optimiser density exactly
    d1 = layer_density(g, [(st["from"] - 1, st["to"] - 1) for st in steps], r["comparison_resolution"],
                       s.thread.thickness_mm, s.thread.opacity)
    d2 = layer_density(g, [tuple(e) for e in r["layers"][0]["selected_edges"]], r["comparison_resolution"],
                       s.thread.thickness_mm, s.thread.opacity)
    assert np.allclose(d1, d2, atol=1e-4)


def test_bridge_approval_flow(result):
    r, imgs, s = result
    r = json.loads(json.dumps(r))
    L = r["layers"][0]
    before = L["route"]["sections"]
    assert before > 1 and L["bridges_proposed"], "fixture must produce several sections"
    b = L["bridges_proposed"][0]
    s2 = ProjectSettings(**r["settings"])
    finalize(r, s2, BoardGeometry(s2.board), approved=[(b["from"], b["to"])], intended=imgs["intended"])
    assert r["layers"][0]["route"]["sections"] == before - 1
    assert r["totals"]["bridges"] == 1
    assert any(st["bridge"] for st in build_steps(r))


def test_csv_and_json_exports(result):
    r, _, _ = result
    steps = build_steps(r)
    text = vector.sequence_csv(r).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:3] == ["Step", "From nail", "To nail"]
    assert len(rows) - 1 == len(steps)
    assert [int(x[1]) for x in rows[1:6]] == [st["from"] for st in steps[:5]]
    js = json.loads(vector.sequence_json(r))
    assert js["units"] == "mm" and len(js["steps"]) == len(steps)
    assert len(js["nails"]) == 160
    nails = list(csv.reader(io.StringIO(vector.nails_csv(r).decode("utf-8-sig"))))
    assert len(nails) == 161


def test_template_scale_svg_dxf(result):
    r, _, s = result
    g = BoardGeometry(s.board)
    svg = vector.template_svg(r, margin_mm=15).decode()
    assert 'width="330.000mm"' in svg                       # 300 mm board + 2*15 mm margin
    circles = re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="0.800"', svg)
    assert len(circles) == 160
    x0, y0 = map(float, circles[0])
    assert x0 - 165 == pytest.approx(g.xy_mm[0, 0], abs=1e-3)
    assert y0 - 165 == pytest.approx(g.xy_mm[0, 1], abs=1e-3)
    dxf = vector.template_dxf(r).decode()
    assert dxf.count("DRILL_HOLES") == 160
    m = re.search(r"CIRCLE\n8\nDRILL_HOLES\n10\n([-\d.]+)\n20\n([-\d.]+)", dxf)
    assert float(m.group(1)) == pytest.approx(g.xy_mm[0, 0], abs=1e-3)
    assert float(m.group(2)) == pytest.approx(-g.xy_mm[0, 1], abs=1e-3)   # DXF is +Y up
    assert vector.drilling_gcode(r).decode().count("(nail ") == 160


def test_pdf_and_media_exports(result):
    r, _, _ = result
    for data in (pdf.construction_manual(r, "Test"), pdf.template_fullsize_pdf(r), pdf.template_tiled_pdf(r)):
        assert data[:5] == b"%PDF-"
    gif = media.simulation_gif(r, size=200, mode="timelapse", max_frames=12)
    im = Image.open(io.BytesIO(gif))
    assert im.format == "GIF" and im.n_frames >= 12
    png = media.artwork_image(r, size=300)
    assert Image.open(io.BytesIO(png)).size == (300, 300)
    assert b"<polyline" in vector.artwork_svg(r)


def test_color_mode_layers():
    yy, xx = np.mgrid[0:160, 0:160]
    img = np.ones((160, 160, 3), np.float32)
    img[:, :80] = [0.9, 0.1, 0.1]
    img[:, 80:] = [0.1, 0.2, 0.9]
    s = ProjectSettings()
    s.board.nail_count = 150
    s.generation.mode = "fast"
    s.thread.color_mode = "color"
    s.thread.palette_background = "#ffffff"
    s.thread.palette = [ThreadColor(name="Red", hex="#d62a2a"), ThreadColor(name="Blue", hex="#2a5bd6"),
                        ThreadColor(name="Black", hex="#111111", enabled=False)]
    r, _ = generate(img, s)
    assert [L["name"] for L in r["layers"]] == ["Red", "Blue"]
    red, blue = r["layers"]
    g = BoardGeometry(s.board)
    xr = np.mean([g.xy_mm[v, 0] for sec in red["sections"] for v in sec])
    xb = np.mean([g.xy_mm[v, 0] for sec in blue["sections"] for v in sec])
    assert xr < xb                       # red thread works the left half, blue the right
    assert "delta_e2000" in r["metrics"]
    steps = build_steps(r)
    assert {st["color_name"] for st in steps} == {"Red", "Blue"}


def _two_colour_image():
    img = np.ones((160, 160, 3), np.float32)
    img[:, :80] = [0.85, 0.12, 0.12]
    img[:, 80:] = [0.12, 0.2, 0.85]
    return img


def test_joint_colour_route_is_one_thread_per_colour():
    s = ProjectSettings()
    s.board.nail_count = 150
    s.generation.mode = "fast"
    s.thread.color_mode = "color"
    s.thread.palette_background = "#ffffff"
    s.thread.palette = [ThreadColor(name="Red", hex="#d62a2a"), ThreadColor(name="Blue", hex="#2a5bd6")]
    r, _ = generate(_two_colour_image(), s)
    assert r["layers"][0]["stats"]["optimizer"] == "joint-colour"
    steps = build_steps(r)
    for L in r["layers"]:
        edges = [tuple(e) for e in L["selected_edges"]]
        assert len({canon(*e) for e in edges}) == len(edges)           # no repeated connection per colour
        assert validate_sections(L["sections"], edges)
        assert len(L["sections"]) == min_sections(edges)               # Euler minimum
    for a, b in zip(steps, steps[1:]):                                   # one continuous thread per colour
        if a["layer"] == b["layer"]:
            assert a["to"] == b["from"]
    mat = r["materials"]
    assert mat["threads"] == 2 and mat["cuts"] == 2
    assert mat["rim_moves"] == sum(1 for st in steps if st["kind"] == "rim")
    assert all(L["rim_mm"] > 0 for L in mat["layers"] if L["sections"] > 1)
    csv_rows = list(csv.reader(io.StringIO(vector.sequence_csv(r).decode("utf-8-sig"))))
    assert csv_rows[0][-1] == "Action" and len(csv_rows) - 1 == len(steps)


def test_cut_join_keeps_separate_sections():
    s = ProjectSettings()
    s.board.nail_count = 150
    s.generation.mode = "fast"
    s.thread.color_mode = "color"
    s.route.join = "cut"
    s.thread.palette = [ThreadColor(name="Red", hex="#d62a2a"), ThreadColor(name="Blue", hex="#2a5bd6")]
    r, _ = generate(_two_colour_image(), s)
    assert not any(st["kind"] == "rim" for st in build_steps(r))
    assert r["materials"]["cuts"] == r["totals"]["sections"]


def test_auto_palette_finds_the_photo_colours():
    from stringart.color import auto_palette
    img = _two_colour_image()
    mask = np.ones(img.shape[:2], bool)
    names = [n for n, _ in auto_palette(img, mask, np.ones(img.shape[:2]), "#ffffff", 2)]
    assert set(names) == {"Red", "Blue"}
