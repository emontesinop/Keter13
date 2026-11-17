import pytest

from app.core import pokermath as pm


def test_required_equity_standard_sizes():
    assert pm.required_equity(100, 50) == pytest.approx(0.25)
    assert pm.required_equity(100, 100) == pytest.approx(1 / 3)
    assert pm.required_equity(100, 200) == pytest.approx(0.4)


def test_pot_odds_ratio():
    assert pm.pot_odds_ratio(100, 50) == pytest.approx(3.0)


def test_rule_2_4_and_exact():
    assert pm.rule_of_2_4(9, 2) == 36
    assert pm.rule_of_2_4(9, 1) == 18
    assert pm.outs_probability(9, 47, 2) == pytest.approx(1 - (38 * 37) / (47 * 46))
    assert pm.outs_probability(9, 47, 2) == pytest.approx(0.3497, abs=1e-4)
    assert pm.outs_probability(8, 46, 1) == pytest.approx(8 / 46)


def test_ev_call():
    # bote 60, apuesta 20, equity 30 %: 0,3*80 - 0,7*20 = 10
    assert pm.ev_call(0.30, 60, 20) == pytest.approx(10)
    # a la equity justa el EV es 0
    eq = pm.required_equity(100, 50)
    assert pm.ev_call(eq, 100, 50) == pytest.approx(0)


def test_bluff_math_and_mdf():
    assert pm.breakeven_fold_freq(100, 50) == pytest.approx(1 / 3)
    assert pm.breakeven_fold_freq(100, 100) == pytest.approx(0.5)
    assert pm.mdf(100, 100) == pytest.approx(0.5)
    assert pm.mdf(100, 50) + pm.breakeven_fold_freq(100, 50) == pytest.approx(1)
    assert pm.ev_bluff(0.5, 100, 100) == pytest.approx(0)


def test_spr_and_implied():
    assert pm.spr(400, 100) == 4
    # set mining: pagar 10 en bote de 15 con 12 % → necesitas ganar ~48 más
    assert pm.implied_needed(15, 10, 0.12) == pytest.approx(10 / 0.12 - 35)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        pm.required_equity(100, 0)
    with pytest.raises(ValueError):
        pm.rule_of_2_4(9, 3)
