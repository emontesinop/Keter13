"""Drills de nivel 0: matemática, ranking y posiciones (procedurales)."""
from __future__ import annotations

import random

from ..content import POSITIONS_9, pos_label
from ..core import pokermath as pm
from ..core.cards import FULL_DECK, RANK_VALUE, all_hand_classes, class_combo_count, fmt_cards
from ..core.equity import compare, draw_outs, equity_vs_hand, hand_name, made_straight_or_flush
from .base import Question, concrete_combo, dec, money, numeric_options, pct

BET_FRACTIONS = [(1 / 3, "1/3 del bote"), (1 / 2, "medio bote"), (2 / 3, "2/3 del bote"),
                 (3 / 4, "3/4 del bote"), (1.0, "el bote"), (1.5, "1,5 botes")]


def _round5(x: float) -> int:
    return max(5, int(round(x / 5.0)) * 5)


def _pot_and_bet(rng: random.Random) -> tuple[int, int]:
    pot = rng.randrange(20, 301, 10)
    frac, _ = rng.choice(BET_FRACTIONS)
    return pot, _round5(pot * frac)


def gen_pot_odds(rng, c) -> Question:
    pot, bet = _pot_and_bet(rng)
    req = pm.required_equity(pot, bet)
    opts, ans = numeric_options(
        rng, req,
        [bet / (pot + bet), bet / pot if bet < pot else None, req + 0.08, req - 0.07],
        pct, min_gap=0.03)
    ratio = pm.pot_odds_ratio(pot, bet)
    exp = (f"Pagas {money(bet)} para un bote final de {money(pot + 2 * bet)}: "
           f"{bet}/{pot + 2 * bet} = {pct(req)}. En odds: {money(pot + bet)} a {money(bet)} = {dec(ratio, 1)}:1. "
           f"Error común: dividir {bet}/{pot + bet} sin contar tu propio call.")
    return Question("", 0, 0, "math", "l0_pot_odds",
                    "¿Qué equity mínima necesitas para pagar?", opts, ans, exp,
                    situation=[("Bote", money(pot)), ("El rival apuesta", money(bet))])


def gen_outs(rng, c) -> Question:
    for _ in range(5000):
        cards = rng.sample(FULL_DECK, 5)
        hole, board = cards[:2], cards[2:]
        ranks = [x[0] for x in cards]
        if len(set(ranks)) < 5:  # sin pares: outs limpios de color/escalera
            continue
        if made_straight_or_flush(cards):
            continue
        d = draw_outs(hole, board)
        n = len(d.all)
        if 4 <= n <= 15:
            break
    distract = [n + 1, n - 1, n + 4, n - 4, len(d.flush) + len(d.straight), n * 2]
    opts, ans = numeric_options(rng, n, distract, lambda v: str(int(round(v))), min_gap=1)
    parts = []
    if d.flush:
        parts.append(f"color: {len(d.flush)} ({fmt_cards(sorted(d.flush, key=lambda x: -RANK_VALUE[x[0]]))})")
    if d.straight:
        parts.append(f"escalera: {len(d.straight)} ({fmt_cards(sorted(d.straight, key=lambda x: -RANK_VALUE[x[0]]))})")
    exp = "Outs para " + "; ".join(parts) + "."
    if d.shared:
        exp += f" {d.shared} carta(s) completan ambas, así que se cuentan una sola vez."
    exp += f" Total: {n}. Regla rápida: {n} × 2 ≈ {n * 2} % para el turn y {n} × 4 ≈ {n * 4} % hasta el river."
    return Question("", 0, 0, "math", "l0_outs",
                    "¿Cuántos outs tienes para ligar escalera o color en el turn?", opts, ans, exp,
                    cards=[("Tu mano", hole), ("Flop", board)])


def gen_rule24(rng, c) -> Question:
    n = rng.choice([4, 8, 9, 12, 15])
    draw = {4: "gutshot", 8: "escalera abierta", 9: "proyecto de color",
            12: "color + gutshot", 15: "color + escalera abierta"}[n]
    flop = rng.random() < 0.5
    if flop:
        street = "Flop. Vas all-in, así que verás turn y river."
        approx, unseen, k = n * 4, 47, 2
    else:
        street = "Turn. Solo queda el river."
        approx, unseen, k = n * 2, 46, 1
    exact = pm.outs_probability(n, unseen, k)
    other = n * 2 if flop else n * 4
    opts, ans = numeric_options(rng, approx, [other, approx + 6, approx - 6, n],
                                lambda v: f"{int(round(v))} %", min_gap=3)
    exp = (f"{n} outs × {'4' if flop else '2'} = {approx} %. Valor exacto: {pct(exact)}. "
           + ("Con muchos outs la regla del 4 sobreestima un poco." if flop and n >= 12 else ""))
    return Question("", 0, 0, "math", "l0_outs",
                    "Según la regla del 2 y 4, ¿qué equity aproximada tienes?", opts, ans, exp,
                    situation=[("Proyecto", f"{draw} ({n} outs)"), ("Calle", street)])


def gen_ev_call(rng, c) -> Question:
    pot = rng.randrange(40, 301, 10)
    frac, _ = rng.choice(BET_FRACTIONS)
    bet = _round5(pot * frac)
    eq = rng.randrange(15, 61, 5) / 100
    ev = pm.ev_call(eq, pot, bet)
    distract = [eq * (pot + bet), eq * (pot + bet) - bet, eq * pot - (1 - eq) * bet]
    fmt = lambda v: money(round(v))
    # numeric_options solo admite >=0; manejamos signo con desplazamiento
    shift = 1000
    opts, ans = numeric_options(rng, ev + shift, [d + shift for d in distract], lambda v: fmt(v - shift), min_gap=4)
    win = pot + bet
    verdict = "pagar es rentable" if ev > 0 else ("es neutro" if abs(ev) < 0.5 else "foldear es mejor")
    exp = (f"EV = equity × lo que ganas − (1 − equity) × lo que pagas = "
           f"{dec(eq)} × {win} − {dec(1 - eq)} × {bet} = {money(ev)}, así que {verdict}. "
           f"Equity necesaria: {pct(pm.required_equity(pot, bet))}.")
    return Question("", 0, 0, "math", "l0_ev", "¿Cuál es el EV de pagar (sin implied odds)?",
                    opts, ans, exp,
                    situation=[("Bote antes de la apuesta", money(pot)), ("El rival apuesta", money(bet)),
                               ("Tu equity", pct(eq))])


def gen_bluff_math(rng, c) -> Question:
    pot = rng.randrange(20, 301, 10)
    frac, label = rng.choice(BET_FRACTIONS)
    bet = _round5(pot * frac)
    be = pm.breakeven_fold_freq(pot, bet)
    opts, ans = numeric_options(rng, be, [pm.required_equity(pot, bet), pm.mdf(pot, bet), bet / pot if bet < pot else None],
                                pct, min_gap=0.03)
    exp = (f"Arriesgas {money(bet)} para ganar {money(pot)}: {bet}/({pot}+{bet}) = {pct(be)}. "
           f"Si el rival foldea más que eso, el farol gana dinero aunque no tengas equity.")
    return Question("", 0, 0, "math", "l0_bluff_math",
                    "Faroleas sin equity. ¿Con qué frecuencia mínima debe foldear el rival para que sea rentable?",
                    opts, ans, exp, situation=[("Bote", money(pot)), ("Tu apuesta", f"{money(bet)} ({label})")])


def gen_hand_rank(rng, c) -> Question:
    from ..core.equity import _EVAL, strength
    want_same_class = rng.random() < 0.6
    for _ in range(5000):
        cards = rng.sample(FULL_DECK, 9)
        a, b, board = cards[:2], cards[2:4], cards[4:]
        sa, sb = strength(a, board), strength(b, board)
        ca, cb = _EVAL.get_rank_class(sa), _EVAL.get_rank_class(sb)
        if ca > 8 or cb > 8:
            continue
        if want_same_class and ca != cb:
            continue
        break
    r = compare(a, b, board)
    ans = {1: "A", -1: "B", 0: "T"}[r]
    na, nb = hand_name(a, board), hand_name(b, board)
    if r == 0:
        exp = f"Los dos tienen {na.lower()} con las mismas 5 cartas, así que empatan."
    else:
        win, wn, ln = ("A", na, nb) if r == 1 else ("B", nb, na)
        exp = f"Jugador A: {na.lower()}. Jugador B: {nb.lower()}. Gana {win}"
        exp += " por kicker o cartas más altas dentro de la misma categoría." if na == nb else f": {wn.lower()} > {ln.lower()}."
    return Question("", 0, 0, "reading", "l0_rankings", "¿Quién gana en el showdown?",
                    [("A", "Jugador A"), ("B", "Jugador B"), ("T", "Empate")], ans, exp,
                    cards=[("Jugador A", a), ("Jugador B", b), ("Mesa", board)])


POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG1", "MP", "LJ", "HJ", "CO", "BTN"]


def gen_position(rng, c) -> Question:
    p1, p2 = rng.sample(POSITIONS_9, 2)
    if rng.random() < 0.7:
        later = max(p1, p2, key=POSTFLOP_ORDER.index)
        prompt = "Postflop, ¿quién actúa último (tiene posición)?"
        exp = (f"Postflop el orden es SB, BB, UTG… BTN. {pos_label(later)} actúa después, así que tiene posición.")
        ans = later
    else:
        first = min(p1, p2, key=POSITIONS_9.index)
        prompt = "Preflop, ¿quién actúa primero?"
        exp = (f"Preflop el orden es UTG → … → BTN → SB → BB (las ciegas hablan al final). "
               f"Entre estos dos, {pos_label(first)} habla antes.")
        ans = first
    return Question("", 0, 0, "preflop", "l0_positions", prompt,
                    [(p1, pos_label(p1)), (p2, pos_label(p2))], ans, exp,
                    situation=[("Mesa", "9 jugadores")])


EQ_BUCKETS = [(0.0, 0.30, "Menos de 30 %"), (0.30, 0.45, "30–45 %"), (0.45, 0.55, "45–55 %"),
              (0.55, 0.70, "55–70 %"), (0.70, 1.01, "Más de 70 %")]


def _playable_classes(c) -> list[str]:
    return sorted(c.rfi["BTN"])


def gen_equity_pre(rng, c) -> Question:
    pool = _playable_classes(c)
    weights = [class_combo_count(h) for h in pool]
    for _ in range(200):
        h1, h2 = rng.choices(pool, weights, k=2)
        a = concrete_combo(rng, h1)
        b = concrete_combo(rng, h2)
        if set(a) & set(b):
            continue
        res = equity_vs_hand(a, b, iterations=3000, rng=random.Random(rng.random()))
        e = res.equity
        edges = [lo for lo, _, _ in EQ_BUCKETS[1:]]
        if all(abs(e - x) > 0.025 for x in edges):
            break
    ans = next(label for lo, hi, label in EQ_BUCKETS if lo <= e < hi)
    exp = (f"Equity simulada ≈ {pct(e)} ({res.samples} repartos Monte Carlo con treys). "
           "Referencias: par vs dos cartas menores ≈ 80 %, par vs overcards ≈ 55 %, dominada ≈ 30 %.")
    return Question("", 0, 0, "math", "l0_equity", "Preflop all-in. ¿Qué equity tienes?",
                    [(l, l) for _, _, l in EQ_BUCKETS], ans, exp,
                    cards=[("Tu mano", a), ("Rival", b)])


GENERATORS = {
    "pot_odds": (0, gen_pot_odds),
    "outs": (0, gen_outs),
    "rule24": (0, gen_rule24),
    "ev_call": (0, gen_ev_call),
    "bluff_math": (0, gen_bluff_math),
    "hand_rank": (0, gen_hand_rank),
    "position": (0, gen_position),
    "equity_pre": (0, gen_equity_pre),
}
