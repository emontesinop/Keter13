import random

import pytest

from app.content import load_content
from app.core.handreading import (bottom_fraction, count_live, flush_possible, hand_desc, live_combos,
                                  on_board, range_vs_range_equity, showdown, strong_share, top_fraction)


def test_count_live_with_blockers():
    board = ["Ks", "7d", "2c"]
    assert count_live("KK", board) == 3
    assert count_live("KK", board + ["Kh", "Qd"]) == 1
    assert count_live("AKo", board) == 4 * 3 - 3  # 3 reyes vivos, quitamos los suited
    assert count_live("AKs", board) == 3
    assert count_live("K7o", board) == 3 * 3 - 2  # K♥7♥ y K♣7♣ son suited
    assert count_live("QQ", board) == 6


def test_on_board_order_and_fractions():
    board = ["Ks", "7d", "2c", "9h", "4s"]
    rs = on_board(live_combos(["KK", "AA", "QQ", "32o"], board), board)
    assert rs[0].combo[0][0] == "K"  # set de reyes primero
    assert len(rs) == 3 + 6 + 6 + 9 and len(top_fraction(rs, 0.2)) == 5  # ceil(0.2*24)
    assert all(s.combo[0][0] == "3" for s in bottom_fraction(rs, 0.25))
    assert top_fraction(rs, 0) == [] and bottom_fraction(rs, 0) == []


def test_showdown_exact():
    board = ["Ks", "7d", "2c", "9h", "4s"]
    vill = on_board(live_combos(["AA", "QQ"], board + ["Kh", "Qd"]), board)
    sd = showdown(["Kh", "Qd"], vill, board)
    assert sd.win == 3 and sd.lose == 6 and sd.tie == 0  # gana a QQ (3 combos vivos), pierde con AA
    assert sd.equity == pytest.approx(3 / 9)


@pytest.mark.parametrize("hole,board,desc", [
    (["As", "Kd"], ["Kh", "7c", "2d", "9s", "4h"], "top pair"),
    (["Qs", "Qd"], ["Jh", "7c", "2d", "9s", "4h"], "overpair"),
    (["As", "9d"], ["Kh", "7c", "2d", "9s", "4h"], "segunda pareja"),
    (["As", "7d"], ["Kh", "7c", "2d", "9s", "4h"], "tercera pareja"),
    (["3s", "3d"], ["Kh", "7c", "5d", "9s", "4h"], "pareja de bolsillo por debajo del board"),
    (["As", "Qd"], ["Kh", "Kc", "2d", "9s", "4h"], "pareja del board (sin mano propia)"),
    (["7s", "7d"], ["Kh", "7c", "2d", "9s", "4h"], "trío"),
    (["Ac", "2d"], ["Qh", "2s", "3s", "7c", "Qs"], "doble pareja (una de ellas es la pareja del board)"),
    (["Ac", "Kd"], ["Qh", "Qs", "Qd", "7c", "3s"], "trío del board (sin mano propia)"),
    (["Ac", "Qd"], ["Qh", "2s", "3s", "7c", "2h"], "doble pareja (una de ellas es la pareja del board)"),
])
def test_hand_desc(hole, board, desc):
    assert hand_desc(hole, board) == desc


def test_flush_possible():
    assert flush_possible(["Ah", "Kh", "2h"])
    assert not flush_possible(["Ah", "Kh", "2c", "3d", "9s"])


def test_range_advantage_direction():
    """Sanity check de los rangos de la app: flop alto y seco favorece al que abre desde UTG."""
    c = load_content()
    utg, bb = c.rfi["UTG"], c.vs_open["BB_vs_EP"]["call"]
    eq_dry = range_vs_range_equity(utg, bb, ["Kd", "8s", "3h"], random.Random(3), 4000)
    eq_wet = range_vs_range_equity(utg, bb, ["7h", "6h", "5d"], random.Random(3), 4000)
    assert eq_dry > 0.56 and eq_wet < 0.50
    # en el flop bajo y conectado la BB tiene más manos fuertes (ventaja de nuts)
    assert strong_share(bb, ["7h", "6h", "5d"]) > 2 * strong_share(utg, ["7h", "6h", "5d"])


def test_narrow_after_calls_model():
    from app.core.handreading import continues_vs_bet, narrow_after_calls
    flop = ["Ks", "7d", "2c"]
    assert continues_vs_bet(("Kh", "Qd"), flop)          # top pair
    assert continues_vs_bet(("5s", "5d"), flop)          # pareja de bolsillo
    assert continues_vs_bet(("6h", "5h"), ["Ks", "4d", "3c"])  # escalera abierta
    assert not continues_vs_bet(("Ah", "Qd"), flop)      # aire (sin pareja ni proyecto)
    board = ["Ks", "7d", "2c", "9h", "4s"]
    combos = live_combos(["AQo", "KQs", "55", "86s"], board)
    narrowed = narrow_after_calls(combos, board)
    hands = {c[0][0] + c[1][0] for c in narrowed}
    assert "AQ" not in hands and {"KQ", "55"} <= hands
    assert "86" not in hands  # en K-7-2 no tiene proyecto (le faltan dos cartas): foldea el flop
