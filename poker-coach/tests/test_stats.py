from math import sqrt

import pytest

from app.core.stats import SessionData, bankroll_curve, buyins, hourly_sd, max_drawdown, summarize


def S(date, h, profit_bb, bb=2.0):
    return SessionData(date, h, 200, 200 + profit_bb * bb, bb)


def test_summary_win_rates():
    ss = [S("2026-01-01", 2, 40), S("2026-01-02", 4, -20), S("2026-01-03", 2, 60)]
    s = summarize(ss, 1000)
    assert s.hours == 8 and s.profit == pytest.approx(160)
    assert s.bb_per_hour == pytest.approx(10)
    assert s.dollars_per_hour == pytest.approx(20)
    # var = (20² /2 + 60²/4 + 40²/2) / 2 = 950
    assert s.sd_bb_hour == pytest.approx(sqrt(950))
    lo, hi = s.ci95_bb_hour
    assert (hi - lo) / 2 == pytest.approx(1.96 * sqrt(950) / sqrt(8))
    assert s.winning_sessions_pct == pytest.approx(200 / 3)


def test_mixed_stakes_in_bb():
    ss = [SessionData("a", 5, 300, 400, 2), SessionData("b", 5, 300, 450, 3)]
    s = summarize(ss)
    assert s.bb_per_hour == pytest.approx((50 + 50) / 10)


def test_single_session_no_sd():
    s = summarize([S("a", 3, 30)])
    assert s.sd_bb_hour is None and s.ci95_bb_hour is None
    assert hourly_sd([S("a", 3, 30)]) is None


def test_empty():
    s = summarize([])
    assert s.bb_per_hour is None and s.n_sessions == 0
    assert s.sample_label == "Muestra mínima"


def test_curve_and_drawdown():
    ss = [S("2026-01-02", 3, -50), S("2026-01-01", 3, 100), S("2026-01-03", 3, -100)]
    curve = bankroll_curve(1000, ss)
    assert [v for _, v in curve] == [1000, 1200, 1100, 900]
    assert max_drawdown([v for _, v in curve]) == 300
    assert summarize(ss, 1000).max_drawdown == 300


def test_buyins():
    assert buyins(4000, 2) == 20
