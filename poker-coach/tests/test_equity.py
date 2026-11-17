import random

import pytest

from app.core.equity import compare, draw_outs, equity_vs_hand, equity_vs_range, hand_name


def test_compare_basic_and_board_plays():
    board = ["As", "Ad", "Kc", "Kh", "Qs"]
    assert compare(["Jc", "Jd"], ["3h", "2h"], board) == 0
    assert compare(["Ah", "2c"], ["Kd", "Qd"], board) == 1   # full de ases > full de reyes
    assert hand_name(["Ah", "2c"], board) == "Full"


def test_turn_exact_enumeration():
    # AhKh vs QsJd en 2h 7h Qc 3s: gana con 9 corazones + 3 ases + 3 reyes = 15/44
    r = equity_vs_hand(["Ah", "Kh"], ["Qs", "Jd"], ["2h", "7h", "Qc", "3s"])
    assert r.exact and r.samples == 44
    assert r.equity == pytest.approx(15 / 44)


def test_river_is_deterministic():
    r = equity_vs_hand(["Ah", "Kh"], ["Qs", "Jd"], ["2h", "7h", "Qc", "3s", "9h"])
    assert r.equity == 1.0


def test_preflop_monte_carlo_known_matchups():
    rng = random.Random(42)
    aa_kk = equity_vs_hand(["As", "Ah"], ["Ks", "Kh"], iterations=20000, rng=rng)
    assert aa_kk.equity == pytest.approx(0.82, abs=0.015)
    flip = equity_vs_hand(["Qs", "Qh"], ["Ad", "Kc"], iterations=20000, rng=rng)
    assert flip.equity == pytest.approx(0.57, abs=0.015)


def test_equity_symmetry():
    rng = random.Random(1)
    a = equity_vs_hand(["7c", "6c"], ["Ad", "Kd"], ["Ac", "8c", "2h"])
    b = equity_vs_hand(["Ad", "Kd"], ["7c", "6c"], ["Ac", "8c", "2h"])
    assert a.win == pytest.approx(b.lose) and a.tie == pytest.approx(b.tie)


def test_equity_vs_range_exact_on_river():
    # Contra {AA, KK} en mesa sin ases ni reyes, con QQ en board de reinas... simple:
    board = ["Qs", "Qd", "7c", "4h", "2s"]
    r = equity_vs_range(["Qh", "Jc"], ["AA", "KK"], board)
    assert r.exact and r.equity == 1.0  # trío de Q gana a pares mayores
    r2 = equity_vs_range(["Jh", "Jc"], ["AA", "KK", "TT"], board)
    # JJ gana solo a TT: 6 combos de 18
    assert r2.equity == pytest.approx(6 / 18)


def test_equity_vs_range_rejects_dead_range():
    with pytest.raises(ValueError):
        equity_vs_range(["As", "Ah"], ["AA"], ["Ad", "Ac", "2s"])


def test_duplicate_cards_rejected():
    with pytest.raises(ValueError):
        equity_vs_hand(["As", "Kd"], ["As", "Qd"])


def test_draw_outs():
    d = draw_outs(["Ah", "Kh"], ["2h", "7h", "Qc"])
    assert len(d.flush) == 9 and d.straight == [] and len(d.all) == 9
    oesd = draw_outs(["9s", "8d"], ["7c", "6h", "2s"])
    assert len(oesd.all) == 8
    combo = draw_outs(["9h", "8h"], ["7h", "6h", "2s"])
    assert len(combo.all) == 15 and combo.shared == 2
    gut = draw_outs(["9s", "8d"], ["6c", "5h", "Ks"])
    assert len(gut.all) == 4
