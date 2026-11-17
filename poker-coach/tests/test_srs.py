from datetime import datetime, timedelta

import pytest

from app.core.srs import MIN_EF, RELEARN_MINUTES, SrsState, quality_from, review, update_easiness

NOW = datetime(2026, 11, 17, 12, 0)


def test_quality_mapping():
    assert quality_from(False, 1000) == 1
    assert quality_from(True, 5000) == 5
    assert quality_from(True, 20000) == 4
    assert quality_from(True, 60000) == 3
    assert quality_from(True, None) == 4


def test_easiness_formula():
    assert update_easiness(2.5, 5) == pytest.approx(2.6)
    assert update_easiness(2.5, 4) == pytest.approx(2.5)
    assert update_easiness(2.5, 3) == pytest.approx(2.36)
    assert update_easiness(2.5, 1) == pytest.approx(1.96)
    assert update_easiness(1.35, 0) == MIN_EF


def test_interval_progression_perfect():
    s = SrsState()
    s, due = review(s, 5, NOW)
    assert s.interval == 1 and due == NOW + timedelta(days=1)
    s, due = review(s, 5, NOW)
    assert s.interval == 6
    s, due = review(s, 5, NOW)
    assert s.interval == round(6 * 2.7) == 16
    assert s.repetitions == 3 and s.easiness == pytest.approx(2.8)


def test_lapse_resets_and_returns_soon():
    s = SrsState(easiness=2.5, interval=16, repetitions=3)
    s2, due = review(s, 1, NOW)
    assert s2.repetitions == 0 and s2.lapses == 1
    assert due == NOW + timedelta(minutes=RELEARN_MINUTES)
    s3, due = review(s2, 4, NOW)
    assert s3.interval == 1  # tras un lapse, vuelve a empezar: 1 día


def test_errors_come_back_more_often():
    """Una tarjeta con muchos errores (EF bajo) crece más despacio."""
    good, bad = SrsState(), SrsState()
    for _ in range(3):
        bad, _ = review(bad, 1, NOW)
    for _ in range(4):
        good, _ = review(good, 4, NOW)
        bad, _ = review(bad, 4, NOW)
    assert bad.interval < good.interval


def test_invalid_quality():
    with pytest.raises(ValueError):
        review(SrsState(), 6, NOW)
