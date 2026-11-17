import pytest

from app.analyzer import Action, HandInput, Street, analyze, eval_postflop, eval_preflop, villain_range
from app.content import load_content

C = load_content()


def H(**kw):
    base = dict(position="CO", stack_bb=100, hero=["Ah", "Kd"], profile="regular", players=2,
                pre_situation="rfi", villain_pos="BB", hero_pre=Action("raise", 5))
    base.update(kw)
    return HandInput(**base)


def verdicts(findings):
    return [(f.verdict, f.leak) for f in findings]


# ---------- preflop ----------

def test_rfi_open_in_range_ok():
    assert verdicts(eval_preflop(H(), C)) == [("ok", None)]


def test_open_limp_flagged():
    fs = eval_preflop(H(hero_pre=Action("limp", 1)), C)
    assert ("error", "open_limp") in verdicts(fs)


def test_fold_aces_is_error():
    fs = eval_preflop(H(hero=["As", "Ad"], hero_pre=Action("fold")), C)
    assert verdicts(fs) == [("error", "preflop_tight")]


def test_open_too_loose_and_size():
    fs = eval_preflop(H(position="UTG", hero=["7c", "2d"], hero_pre=Action("raise", 10)), C)
    v = verdicts(fs)
    assert ("error", "preflop_loose") in v and ("dudoso", "sizing_pre") in v
    fs = eval_preflop(H(position="UTG", hero=["Kc", "9c"]), C)  # K9s se abre desde MP
    assert verdicts(fs) == [("dudoso", "preflop_loose")]


def test_limpers_iso_passive_and_size():
    h = H(position="BTN", pre_situation="limpers", limpers=2, villain_pos="MP", hero=["As", "Qs"],
          hero_pre=Action("limp", 1))
    assert verdicts(eval_preflop(h, C)) == [("dudoso", "iso_passive")]
    h.hero_pre = Action("raise", 4)
    assert verdicts(eval_preflop(h, C)) == [("ok", None), ("dudoso", "sizing_pre")]  # referencia 7 bb


def test_bb_checks_vs_limpers():
    h = H(position="BB", pre_situation="limpers", limpers=2, villain_pos="MP", hero=["7c", "2d"],
          hero_pre=Action("check"))
    assert verdicts(eval_preflop(h, C)) == [("ok", None)]


def test_vs_open_loose_call_and_passive():
    h = H(position="CO", pre_situation="vs_open", villain_pos="UTG", villain_size=5, hero=["Ac", "Td"],
          hero_pre=Action("call", 5))
    assert verdicts(eval_preflop(h, C)) == [("error", "loose_call_pre")]
    h.hero = ["Ks", "Kd"]
    assert verdicts(eval_preflop(h, C)) == [("dudoso", "passive_3bet")]
    h.hero_pre = Action("raise", 15)
    assert verdicts(eval_preflop(h, C)) == [("ok", None)]  # 3x IP


def test_vs_3bet():
    h = H(position="CO", pre_situation="vs_3bet", villain_pos="BTN", hero=["Js", "Jd"], hero_pre=Action("call", 15))
    assert verdicts(eval_preflop(h, C)) == [("ok", None)]  # JJ call IP
    h.hero = ["Ac", "Jd"]
    assert verdicts(eval_preflop(h, C)) == [("error", "vs3bet")]


def test_villain_range_selection():
    r, d = villain_range(H(pre_situation="vs_open", villain_pos="UTG"), C)
    assert r == C.rfi["UTG"]
    r, d = villain_range(H(pre_situation="limpers", villain_pos="MP"), C)
    assert r == C.population["limp"]
    r, d = villain_range(H(position="BTN", villain_pos="BB"), C)
    assert r == C.vs_open["BB_vs_LATE"]["call"]


# ---------- postflop ----------

def river_hand(hero, board, villain, hero_act, profile="regular", pot=30):
    flop, turn, river = board[:3], board[3:4], board[4:5]
    return H(hero=hero, profile=profile, streets=[
        Street("flop", flop, 11, Action("check"), Action("check")),
        Street("turn", turn, 11, Action("check"), Action("check")),
        Street("river", river, pot, villain, hero_act),
    ])


def test_overcall_vs_nit_river():
    # bottom pair contra un nit que apuesta el bote en el river: pagar es error
    h = river_hand(["2h", "Ad"], ["Kc", "Qs", "7d", "2s", "9c"], Action("bet", 30), Action("call"), profile="nit")
    fs = eval_postflop(h, C)
    river = [f for f in fs if f.street == "river"]
    assert river[0].verdict == "error" and river[0].leak == "overcall"


def test_fold_nuts_is_overfold():
    h = river_hand(["Ah", "Kh"], ["Qh", "Jh", "Th", "2c", "3d"], Action("bet", 30), Action("fold"))
    river = [f for f in eval_postflop(h, C) if f.street == "river"]
    assert (river[0].verdict, river[0].leak) == ("error", "overfold")


def test_missed_value_vs_station():
    h = river_hand(["As", "Kd"], ["Ac", "8s", "4d", "2h", "9c"], Action("check"), Action("check"),
                   profile="calling_station")
    river = [f for f in eval_postflop(h, C) if f.street == "river"]
    assert (river[0].verdict, river[0].leak) == ("error", "missed_value")


def test_value_bet_ok_and_small_size_flag():
    h = river_hand(["As", "Kd"], ["Ac", "8s", "4d", "2h", "9c"], Action("check"), Action("bet", 8),
                   profile="calling_station")
    river = [f for f in eval_postflop(h, C) if f.street == "river"]
    assert verdicts(river) == [("ok", None), ("dudoso", "sizing_post")]


def test_bluff_vs_station_on_flop():
    h = H(profile="calling_station", hero=["5c", "4d"], streets=[
        Street("flop", ["Ks", "Qh", "9d"], 11, Action("check"), Action("bet", 7))])
    assert verdicts(eval_postflop(h, C)) == [("error", "bad_bluff")]


def test_multiway_bluff_on_flop():
    h = H(players=4, hero=["5c", "4d"], streets=[Street("flop", ["Ks", "Qh", "9d"], 20, Action("check"), Action("bet", 10))])
    assert verdicts(eval_postflop(h, C)) == [("dudoso", "multiway_bluff")]


def test_spr_stackoff_with_one_pair():
    h = H(hero=["As", "Kd"], stack_bb=200, streets=[
        Street("flop", ["Ac", "8s", "4d"], 11, Action("allin", 195), Action("call"))])
    leaks = [f.leak for f in eval_postflop(h, C)]
    assert "spr_stackoff" in leaks


def test_missing_pot_is_info():
    h = H(streets=[Street("flop", ["Ac", "8s", "4d"], None, Action("check"), Action("bet", 5))])
    assert verdicts(eval_postflop(h, C)) == [("info", None)]


def test_analyze_full_hand_runs():
    h = river_hand(["Ah", "Kh"], ["Qh", "Jh", "2c", "3d", "9s"], Action("bet", 20), Action("call"))
    fs = analyze(h, C)
    assert fs[0].street == "preflop" and all(f.verdict in ("ok", "dudoso", "error", "info") for f in fs)


# ---------- varias acciones por calle y estrechamiento ----------
import re


def test_bet_raise_call_uses_real_price():
    # apuestas 10 en bote de 20, te suben a 30, pagas 20 para un bote de 80 → 25 %
    h = H(hero=["Ah", "Kd"], streets=[
        Street("flop", ["Ac", "8s", "4d"], 20, Action("check"), Action("bet", 10), Action("raise", 30), Action("call"))])
    fs = eval_postflop(h, C)
    facing = [f for f in fs if "ante" in f.decision][0]
    assert "pagar 20 bb para un bote de 80 pide 25%" in facing.explanation
    assert "sube con su mejor" in facing.explanation
    assert len(fs) == 2  # la apuesta inicial y el call ante la subida


def test_fold_to_raise_ends_hand():
    h = H(hero=["7h", "7d"], profile="nit", streets=[
        Street("flop", ["Ac", "Ks", "Qd"], 20, Action("check"), Action("bet", 10), Action("raise", 40), Action("fold")),
        Street("turn", ["2c"], 100, Action("check"), Action("check"))])
    fs = eval_postflop(h, C)
    assert all(f.street == "flop" for f in fs)
    assert fs[-1].decision.startswith("Fold") and fs[-1].verdict == "ok"


def _river_combos(fs):
    river = [f for f in fs if f.street == "river"][0]
    return int(re.search(r"(\d+) combos posibles", river.explanation).group(1))


def test_villain_range_narrows_after_calling():
    board = (["Kc", "8s", "4d"], ["2h"], ["9c"])
    checked = H(hero=["Ah", "Kd"], streets=[
        Street("flop", board[0], 11, Action("check"), Action("check")),
        Street("turn", board[1], 11, Action("check"), Action("check")),
        Street("river", board[2], 11, Action("check"), Action("check"))])
    called = H(hero=["Ah", "Kd"], streets=[
        Street("flop", board[0], 11, Action("check"), Action("bet", 6), Action("call"), Action()),
        Street("turn", board[1], 23, Action("check"), Action("bet", 15), Action("call"), Action()),
        Street("river", board[2], 53, Action("check"), Action("check"))])
    n_checked, n_called = _river_combos(eval_postflop(checked, C)), _river_combos(eval_postflop(called, C))
    assert n_called < n_checked * 0.7


def test_missing_villain_size_is_info():
    h = H(streets=[Street("flop", ["Ac", "8s", "4d"], 11, Action("bet"), Action("call"))])
    assert verdicts(eval_postflop(h, C)) == [("info", None)]
