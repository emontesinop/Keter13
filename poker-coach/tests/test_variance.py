import random
from math import sqrt

import pytest

from app.core.variance import (ci_halfwidth, hours_for_significance, normal_cdf, prob_losing, risk_of_ruin,
                               simulate)


def test_ci_and_hours():
    assert ci_halfwidth(75, 200) == pytest.approx(1.96 * 75 / sqrt(200))
    h = hours_for_significance(8, 75)
    assert ci_halfwidth(75, h) == pytest.approx(8)
    assert hours_for_significance(0, 75) == float("inf")
    with pytest.raises(ValueError):
        ci_halfwidth(75, 0)


def test_normal_and_prob_losing():
    assert normal_cdf(0) == pytest.approx(0.5)
    assert normal_cdf(1.96) == pytest.approx(0.975, abs=1e-3)
    # 5 bb/h, sd 75, 100 h → z = 5·10/75 = 0.667 → P(perder) ≈ 0.252
    assert prob_losing(5, 75, 100) == pytest.approx(0.2525, abs=2e-3)


def test_risk_of_ruin():
    assert risk_of_ruin(0, 75, 2000) == 1.0
    assert risk_of_ruin(-2, 75, 2000) == 1.0
    r = risk_of_ruin(5, 75, 2000)  # 20 buy-ins
    assert r == pytest.approx(pytest.approx(2.718281828 ** (-2 * 5 * 2000 / 75 ** 2)))
    assert risk_of_ruin(5, 75, 3000) < r  # más bankroll → menos riesgo


def test_simulation_matches_theory():
    res = simulate(5, 75, 100, n_sims=4000, rng=random.Random(1))
    mean = sum(res.finals) / len(res.finals)
    assert mean == pytest.approx(500, abs=40)          # wr × horas
    sd = (sum((x - mean) ** 2 for x in res.finals) / len(res.finals)) ** 0.5
    assert sd == pytest.approx(750, rel=0.05)          # sd × √horas
    assert res.p_loss == pytest.approx(prob_losing(5, 75, 100), abs=0.02)
    assert res.finals == sorted(res.finals) and len(res.paths) == 20 and len(res.paths[0]) == res.steps + 1
    assert res.pct(0.05) < res.pct(0.5) < res.pct(0.95)
    assert all(d >= 0 for d in res.drawdowns)


def test_simulation_long_horizon_uses_coarse_steps():
    res = simulate(5, 75, 1000, n_sims=200, rng=random.Random(2))
    assert res.steps == 100
