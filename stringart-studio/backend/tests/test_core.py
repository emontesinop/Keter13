"""Unit tests: geometry, rasterisation, metrics, optimiser, imaging."""
import io
import threading

import numpy as np
import pytest
from PIL import Image

from stringart.config import BoardSettings, ProjectSettings
from stringart.engine import Cancelled, LayerOptimizer, LayerParams
from stringart.geometry import BoardGeometry
from stringart.imaging import load_image, target_coverage
from stringart.metrics import mae, psnr, ssim
from stringart.raster import LineCache, rasterize_line


# ------------------------------------------------------------------ geometry
@pytest.mark.parametrize("n", [50, 150, 200, 300, 400, 500])
def test_circle_nails_on_ring_and_equidistant(n):
    g = BoardGeometry(BoardSettings(nail_count=n, diameter_mm=300, edge_margin_mm=6))
    r = 150 - 6
    assert g.n == n
    assert np.allclose(np.hypot(g.xy_mm[:, 0], g.xy_mm[:, 1]), r)
    chord = 2 * r * np.sin(np.pi / n)
    assert np.allclose(g.dist_next, chord)
    assert np.allclose(g.dist_prev, chord)
    assert np.allclose(np.diff(np.unwrap(np.radians(g.angle_deg))), 2 * np.pi / n)


def test_numbering_direction_and_start():
    cw = BoardGeometry(BoardSettings(nail_count=60, numbering="clockwise", edge_margin_mm=0, diameter_mm=200))
    # nail 1 at 12 o'clock, nail 16 (a quarter turn later) at 3 o'clock (clockwise, +y down)
    assert np.allclose(cw.xy_mm[0], [0, -100])
    assert np.allclose(cw.xy_mm[15], [100, 0], atol=1e-9)
    assert cw.angle_deg[15] == pytest.approx(90)
    ccw = BoardGeometry(BoardSettings(nail_count=60, numbering="counterclockwise", edge_margin_mm=0, diameter_mm=200))
    assert np.allclose(ccw.xy_mm[15], [-100, 0], atol=1e-9)
    shifted = BoardGeometry(BoardSettings(nail_count=60, start_angle_deg=90, edge_margin_mm=0, diameter_mm=200))
    assert np.allclose(shifted.xy_mm[0], [100, 0], atol=1e-9)
    assert [n.number for n in cw.nails()] == list(range(1, 61))


def test_rectangle_perimeter_and_same_side_rule():
    g = BoardGeometry(BoardSettings(shape="rectangle", width_mm=300, height_mm=400, edge_margin_mm=0, nail_count=140))
    per = 2 * (300 + 400)
    assert np.isclose(g.dist_next.sum(), per, rtol=0.02)   # chords cut corners slightly
    on_edge = (np.isclose(np.abs(g.xy_mm[:, 0]), 150)) | (np.isclose(np.abs(g.xy_mm[:, 1]), 200))
    assert on_edge.all()
    top = [i for i in range(g.n) if np.isclose(g.xy_mm[i, 1], -200)]
    assert not g.valid_pair(top[0], top[-1], 1)


def test_pixel_frame_and_mask():
    g = BoardGeometry(BoardSettings())
    w, h, s = g.pixel_frame(300)
    assert (w, h) == (300, 300)
    m = g.board_mask(300)
    assert m[150, 150] and not m[0, 0]


# ------------------------------------------------------------------ raster
def test_rasterize_line_basic():
    pix, wf, length = rasterize_line((0, 0), (9, 0), 10, 10)
    assert list(pix) == list(range(10))
    assert wf == pytest.approx(1.0)
    pix, wf, _ = rasterize_line((0, 0), (9, 9), 10, 10)
    assert list(pix) == [i * 10 + i for i in range(10)]
    assert wf == pytest.approx(np.sqrt(2))


def test_rasterized_pixels_unique_and_symmetric():
    g = BoardGeometry(BoardSettings(nail_count=120))
    c = LineCache(g, 160, 5)
    rng = np.random.default_rng(0)
    for _ in range(200):
        a, b = rng.integers(0, 120, 2)
        if not c.is_valid(a, b):
            continue
        p1, w1 = c.line(a, b)
        p2, w2 = c.line(b, a)
        assert np.array_equal(p1, p2) and w1 == w2
        assert len(np.unique(p1)) == len(p1)
    assert not c.is_valid(0, 3)        # below min skip
    assert c.is_valid(0, 5)


# ------------------------------------------------------------------ metrics
def test_metrics_identity():
    rng = np.random.default_rng(1)
    a = rng.random((64, 64)).astype(np.float32)
    assert ssim(a, a) == pytest.approx(1.0)
    assert psnr(a, a) == float("inf")
    assert mae(a, a) == 0
    b = np.clip(a + 0.1, 0, 1)
    assert ssim(a, b) < 1 and mae(a, b) > 0


# ------------------------------------------------------------------ engine
def _band_problem(n=150, res=160, lines=120):
    g = BoardGeometry(BoardSettings(nail_count=n))
    c = LineCache(g, res, 6)
    T = np.zeros((res, res), np.float32)
    T[70:90, :] = 2.0
    p = LayerParams(max_lines=lines, thread_px=0.3, min_improvement=0.0)
    return g, c, T, p


def test_optimizer_no_duplicates_continuity_and_error_decrease():
    g, c, T, p = _band_problem()
    opt = LayerOptimizer(c, T, np.ones_like(T), p)
    r = opt.run()
    edges = r.edges()
    canon = {tuple(sorted(e)) for e in edges}
    assert len(canon) == len(edges)                 # never repeats a connection
    assert len(r.sections) == 1                     # continuous strategy -> one trail
    assert r.final_error < r.initial_error
    curve = r.error_curve
    assert all(b <= a + 1e-6 for a, b in zip(curve, curve[1:]))
    d = r.density.reshape(T.shape)
    assert d[70:90].mean() > 5 * d[:50].mean()      # thread goes where the target is dark
    # recorded density == re-rendered density of the selected edges
    re = np.zeros(T.size, np.float32)
    for a, b in edges:
        pix, _ = c.line(a, b)
        re[pix] += opt.dline[a][c.slot[a, b]]
    assert np.allclose(re, r.density, atol=1e-4)


def test_optimizer_hybrid_respects_section_cap():
    g, c, T, p = _band_problem(lines=300)
    T[10:20, 60:100] = 2.5     # a second, separate dark area
    p.strategy, p.max_sections, p.continuity_preference = "hybrid", 3, 0.9
    r = LayerOptimizer(c, T, np.ones_like(T), p).run()
    assert 1 <= len(r.sections) <= 3
    assert len({tuple(sorted(e)) for e in r.edges()}) == r.n_lines


def test_optimizer_cancel():
    g, c, T, p = _band_problem(lines=5000)
    ev = threading.Event()
    ev.set()
    with pytest.raises(Cancelled):
        LayerOptimizer(c, T, np.ones_like(T), p, cancel=ev).run()


def test_target_quality_stops_early():
    g, c, T, p = _band_problem(lines=2000)
    p.target_quality = 0.3
    r = LayerOptimizer(c, T, np.ones_like(T), p).run()
    assert r.stop_reason == "target_quality"
    assert 1 - r.final_error / r.initial_error >= 0.29


# ------------------------------------------------------------------ imaging
@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP", "TIFF", "BMP"])
def test_load_formats(fmt):
    im = Image.fromarray((np.random.default_rng(0).random((40, 60, 3)) * 255).astype(np.uint8))
    buf = io.BytesIO()
    im.save(buf, fmt)
    arr = load_image(buf.getvalue())
    assert arr.shape == (40, 60, 3) and arr.dtype == np.float32 and arr.max() <= 1


def test_target_coverage_physics():
    tone = np.linspace(0, 1, 11, dtype=np.float32)[None, :]
    bw = target_coverage(tone, "#000000", "#ffffff", 0.99, physics=1.0)
    # black thread on white: darker tone -> more coverage, mid grey needs ~78 %
    assert np.all(np.diff(bw[0]) <= 1e-6)
    assert 0.74 < bw[0, 5] < 0.82
    wb = target_coverage(tone, "#ffffff", "#000000", 0.99, physics=1.0)
    assert np.all(np.diff(wb[0]) >= -1e-6) and wb[0, 0] == 0
    perceptual = target_coverage(tone, "#000000", "#ffffff", 0.99, physics=0.0)
    assert perceptual[0, 5] == pytest.approx(0.5, abs=0.02)
    with pytest.raises(ValueError):
        target_coverage(tone, "#777777", "#787878", 0.9)


def test_auto_tone_and_settings_migration():
    from stringart.config import ThreadSettings, migrate_settings, resolve_tone
    t = ThreadSettings()
    assert resolve_tone("#111111", "#f5f3ee", t, 0.7) == (1.0, 0.98, 0.7)     # dark thread, light board
    assert resolve_tone("#f4f4f0", "#0b0b0c", t, 0.7) == (0.5, 0.90, 1.0)     # light thread, dark board
    manual = ThreadSettings(auto_tone=False, tone_physics=0.3, max_coverage=0.8)
    assert resolve_tone("#111111", "#ffffff", manual, 2.0) == (0.3, 0.8, 2.0)
    old = {"thread": {"tone_physics": 0.25, "max_coverage": 0.9}, "generation": {"max_lines": 3500}}
    new = migrate_settings(old)
    assert new["version"] == 2 and new["thread"]["auto_tone"] is True
    assert new["generation"]["max_lines"] == 6000 and new["generation"]["min_improvement"] == 0.0
    ProjectSettings(**new)                                                    # still valid
    assert migrate_settings(new) == new                                       # idempotent
