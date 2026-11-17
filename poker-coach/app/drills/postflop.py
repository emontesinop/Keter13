"""Drills de nivel 2: postflop.

Las decisiones se calculan con treys contra un MODELO explícito del rival
(su rango de call preflop y un perfil que fija qué fracción paga, apuesta o
farolea). La explicación muestra el modelo y los números: no es un solver,
es aritmética exacta sobre supuestos visibles.
"""
from __future__ import annotations

import random

from ..core import pokermath as pm
from ..core.cards import FULL_DECK, RANK_VALUE, fmt_cards
from ..core.handreading import (bottom_fraction, hand_desc, live_combos, on_board, range_vs_range_equity,
                                showdown, strong_share, top_fraction)
from .base import Question, dec, numeric_options, pct

OPENER_GROUP = {"UTG": "EP", "UTG1": "EP", "MP": "EP", "LJ": "MP", "HJ": "MP", "CO": "LATE", "BTN": "LATE"}



def call_profiles(c) -> dict:
    """{etiqueta: fracción que paga} de los perfiles marcados para drills (content/profiles.yaml)."""
    return {p["label"]: p["call"] for p in c.profiles.values() if p.get("drill_call")}


def bet_profiles(c) -> dict:
    return {p["label"]: (p["bet_value"], p["bet_bluff"]) for p in c.profiles.values() if p.get("drill_bet")}

BET_SIZES = [(0.5, "medio bote"), (0.66, "2/3 del bote"), (0.75, "3/4 del bote"), (1.0, "el bote")]


def _bb(x: float) -> str:
    return f"{dec(x, 1).replace(',0', '')} bb"


def _spot(rng, c, openers=("HJ", "CO", "BTN")):
    opener = rng.choice(openers)
    spot = f"BB_vs_{OPENER_GROUP[opener]}"
    return opener, c.rfi[opener], c.vs_open[spot]["call"]


def gen_mdf(rng, c) -> Question:
    pot = rng.randrange(20, 201, 10)
    frac, label = rng.choice(BET_SIZES + [(1 / 3, "1/3 del bote"), (1.5, "1,5 botes")])
    bet = max(5, round(pot * frac / 5) * 5)
    m = pm.mdf(pot, bet)
    opts, ans = numeric_options(rng, m, [pm.breakeven_fold_freq(pot, bet), pm.required_equity(pot, bet),
                                         1 - pm.required_equity(pot, bet)], pct, min_gap=0.03)
    exp = (f"MDF = bote ÷ (bote + apuesta) = {pot} ÷ {pot + bet} = {pct(m)}. Si continúas con menos que eso, "
           f"un farol con cualquier carta gana dinero contra ti. En vivo a bajos límites la mayoría farolea poco: "
           f"contra ellos puedes foldear más de lo que dice la MDF (ajuste explotativo).")
    return Question("", 0, 0, "postflop", "l2_mdf", "¿Qué fracción de tu rango debes continuar como mínimo (MDF)?",
                    opts, ans, exp, situation=[("Bote", f"${pot}"), ("El rival apuesta", f"${bet} ({label})")])


def gen_spr(rng, c) -> Question:
    sb, bb = rng.choice([(1, 2), (1, 3)])
    open_bb = rng.choice([4, 5, 6])
    callers = rng.randint(1, 3)
    stack_bb = rng.choice([60, 80, 100, 120, 150, 200])
    three_bet = callers == 1 and rng.random() < 0.3
    if three_bet:
        size_bb = open_bb * 3 + (rng.choice([0, 1]))
        pot_bb = size_bb * 2 + 1.5  # 3-bet pagado + ciegas
        story = f"Abres a {open_bb} bb, te hacen 3-bet a {size_bb} bb y pagas."
        invested = size_bb
    else:
        pot_bb = open_bb * (callers + 1) + 1.5
        story = f"Abres a {open_bb} bb y pagan {callers} jugador{'es' if callers > 1 else ''}."
        invested = open_bb
    stack_left = stack_bb - invested
    spr = stack_left / pot_bb
    fmt = lambda v: dec(v, 1)
    opts, ans = numeric_options(rng, spr, [stack_bb / pot_bb, spr * 2, spr / 2, pot_bb / stack_left],
                                fmt, min_gap=0.5)
    if spr < 3:
        guide = "SPR bajo (< 3): con top pair buen kicker o mejor normalmente vas all-in sin dudar."
    elif spr <= 6:
        guide = "SPR medio (3–6): top pair fuerte u overpair suele valer 2 calles. Ve con cuidado si te suben."
    else:
        guide = "SPR alto (> 6): para meter el stack necesitas manos más fuertes (dos pares o mejor). Una pareja quiere controlar el bote."
    exp = (f"Bote en el flop: {_bb(pot_bb)}. Stack efectivo restante: {stack_bb} − {invested} = {stack_left} bb. "
           f"SPR = {stack_left} ÷ {dec(pot_bb, 1)} = {fmt(spr)}. {guide}")
    return Question("", 0, 0, "postflop", "l2_spr", "¿Cuál es el SPR en el flop?", opts, ans, exp,
                    situation=[("Mesa", f"${sb}/${bb}"), ("Stacks efectivos", f"{stack_bb} bb"), ("Preflop", story)])


ADV_BUCKETS = [(0.0, 0.48, "Del defensor (BB)"), (0.48, 0.55, "Pareja"), (0.55, 1.01, "Del que abrió")]


def gen_range_adv(rng, c) -> Question:
    for _ in range(40):
        opener, orng, brng = _spot(rng, c, ("UTG", "MP", "HJ", "CO", "BTN"))
        board = rng.sample(FULL_DECK, 3)
        eq = range_vs_range_equity(orng, brng, board, random.Random(rng.random()), 2500)
        if all(abs(eq - x) > 0.02 for x in (0.48, 0.55)):
            break
    ans = next(l for lo, hi, l in ADV_BUCKETS if lo <= eq < hi)
    so, sd = strong_share(orng, board), strong_share(brng, board)
    if ans == "Del que abrió":
        plan = "Plan del que abrió: c-bet frecuente y de tamaño pequeño (≈ 1/3) con gran parte del rango."
    elif ans == "Pareja":
        plan = "Plan: c-bet selectiva, más polarizada y más grande; chequea manos medias."
    else:
        plan = "Plan del que abrió: chequea a menudo; apuesta grande solo con manos fuertes y buenos proyectos."
    exp = (f"Equity del rango de {opener} contra el de la BB en este flop ≈ {pct(eq)} (Monte Carlo con treys "
           f"sobre los rangos de la app). Doble pareja o mejor: {opener} {pct(so)} de sus combos, BB {pct(sd)}. "
           f"{plan} Los flops altos y secos suelen favorecer al que abre; los bajos y conectados, a quien defiende.")
    return Question("", 0, 0, "postflop", "l2_texture",
                    "¿Quién tiene la ventaja de rango en este flop?", [(l, l) for _, _, l in ADV_BUCKETS], ans, exp,
                    situation=[("Preflop", f"{opener} abre, la BB paga"), ("Rangos", "los de la app (100 bb)")],
                    cards=[("Flop", board)])


def _hero_combo(rng, classes, dead):
    combos = live_combos(classes, dead)
    return list(rng.choice(combos))


def _river_ev(hero, R, C, board, pot, bet):
    sd_all = showdown(hero, R, board)
    ev_check = sd_all.equity * pot
    sd_c = showdown(hero, C, board)
    n = len(R)
    folds = n - len(C)
    ev_bet = (folds * pot + sd_c.win * (pot + bet) - sd_c.lose * bet + sd_c.tie * (pot / 2)) / n
    return sd_all, sd_c, ev_check, ev_bet


def gen_river_decision(rng, c) -> Question:
    target = rng.choice(["value", "check", "bluff"])
    for _ in range(400):
        opener, orng, brng = _spot(rng, c)
        board = rng.sample(FULL_DECK, 5)
        hero = _hero_combo(rng, orng, board)
        R = on_board(live_combos(brng, board + hero), board)
        profiles = call_profiles(c)
        prof = rng.choice(list(profiles))
        C = top_fraction(R, profiles[prof])
        pot = rng.randrange(16, 61, 2)
        frac, label = rng.choice(BET_SIZES[:3])
        bet = round(pot * frac)
        sd_all, sd_c, ev_check, ev_bet = _river_ev(hero, R, C, board, pot, bet)
        if ev_bet > ev_check:
            ans = "value" if sd_c.equity >= 0.5 else "bluff"
        else:
            ans = "check"
        if ans == target and abs(ev_bet - ev_check) > 0.06 * pot:
            break
    desc = hand_desc(hero, board)
    fold_pct = 1 - profiles[prof]
    exp = (f"Tienes {desc}. Modelo: la BB llega al river con su rango de call preflop ({len(R)} combos vivos) "
           f"y, como {prof}, paga con su mejor {pct(profiles[prof])} y foldea el resto. "
           f"Tu equity contra todo su rango: {pct(sd_all.equity)}; contra las manos que pagan: {pct(sd_c.equity)}. "
           f"EV(check) ≈ {dec(ev_check, 1)} bb; EV(apostar {bet} bb) ≈ {dec(ev_bet, 1)} bb. ")
    exp += {
        "value": "Te pagan manos peores más de la mitad de las veces, así que es apuesta por valor.",
        "check": "Apostar solo te paga con manos mejores y foldean las peores. Mejor check para ganar en showdown.",
        "bluff": f"Pierdes contra lo que paga, pero el rival foldea {pct(fold_pct)} y el farol necesita "
                 f"{pct(pm.breakeven_fold_freq(pot, bet))}. Apostar gana más que rendirte.",
    }[ans]
    if prof == "calling station":
        exp += " Contra una calling station: valor fino sí, faroles casi nunca."
    return Question("", 0, 0, "postflop", "l2_value_bluff",
                    "River. La BB pasa. ¿Qué haces?",
                    [("value", f"Apostar por valor ({label})"), ("check", "Check"), ("bluff", f"Farol ({label})")],
                    ans, exp,
                    situation=[("Preflop", f"Abres en {opener}, la BB paga"), ("Bote", f"{pot} bb"),
                               ("Rival", prof)],
                    cards=[("Tu mano", hero), ("Board", board)])


def gen_facing_bet(rng, c) -> Question:
    target = rng.choice(["call", "fold"])
    for _ in range(400):
        opener, orng, brng = _spot(rng, c)
        board = rng.sample(FULL_DECK, 5)
        hero = _hero_combo(rng, brng, board)
        R = on_board(live_combos(orng, board + hero), board)
        profiles = bet_profiles(c)
        prof = rng.choice(list(profiles))
        v, b = profiles[prof]
        value, bluffs = top_fraction(R, v), bottom_fraction(R, b)
        betting = value + [x for x in bluffs if x not in value]
        sd = showdown(hero, betting, board)
        pot = rng.randrange(16, 61, 2)
        frac, label = rng.choice(BET_SIZES)
        bet = round(pot * frac)
        req = pm.required_equity(pot, bet)
        ans = "call" if sd.equity >= req else "fold"
        if ans == target and abs(sd.equity - req) > 0.04 and sd.lose < sd.n:
            break
    exp = (f"Tienes {hand_desc(hero, board)}. Modelo del rival ({prof}): apuesta por valor con su mejor {pct(v)} "
           f"({len(value)} combos)" + (f" y farolea con su peor {pct(b)} ({len(bluffs)} combos)" if b else ", sin faroles") +
           f". Contra ese rango de apuesta ganas {sd.win} de {sd.n} combos → equity {pct(sd.equity)}. "
           f"Necesitas {pct(req)} ({bet} ÷ {pot + 2 * bet}). " +
           ("Pagas." if ans == "call" else "Foldeas.") +
           (" Contra un nit que no farolea, hasta manos decentes son un fold." if prof == "nit" else ""))
    return Question("", 0, 0, "postflop", "l2_mdf", f"River. {opener} apuesta {bet} bb. ¿Qué haces?",
                    [("fold", "Fold"), ("call", "Call")], ans, exp,
                    situation=[("Preflop", f"{opener} abre, pagas en la BB"), ("Bote antes de la apuesta", f"{pot} bb"),
                               ("Apuesta", f"{bet} bb ({label})"), ("Rival", prof)],
                    cards=[("Tu mano", hero), ("Board", board)])


GENERATORS = {
    "mdf": (2, gen_mdf),
    "spr": (2, gen_spr),
    "range_adv": (2, gen_range_adv),
    "river_decision": (2, gen_river_decision),
    "facing_bet": (2, gen_facing_bet),
}
