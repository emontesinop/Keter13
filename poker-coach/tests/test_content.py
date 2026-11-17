"""Validación de los rangos y contenido editable."""
from app.content import load_content
from app.core.ranges import range_percent


def test_content_loads_and_validates():
    c = load_content()
    assert c.lessons and c.questions


def test_rfi_monotonic_and_sane():
    c = load_content()
    order = c.rfi_order
    for a, b in zip(order, order[1:]):
        assert c.rfi[a] <= c.rfi[b]
    assert 8 <= range_percent(c.rfi["UTG"]) <= 18
    assert 35 <= range_percent(c.rfi["BTN"]) <= 60


def test_vs_open_disjoint_and_premiums_3bet():
    c = load_content()
    for spot, r in c.vs_open.items():
        assert not (r["3bet"] & r["call"]), spot
        assert {"AA", "KK", "AKs"} <= r["3bet"], spot


def test_vs_limpers_premiums_iso():
    c = load_content()
    for g, r in c.vs_limpers.items():
        assert {"AA", "KK", "QQ", "AKs"} <= r["iso"], g
        assert not (r["iso"] & r["overlimp"]), g


def test_every_lesson_cites_a_source():
    c = load_content()
    for l in c.lessons.values():
        assert l["sources"], l["id"]
