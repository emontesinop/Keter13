"""Drills de nivel 3: lectura de manos (combos, blockers, rangos)."""
from __future__ import annotations

from ..core import pokermath as pm
from ..core.cards import FULL_DECK, RANKS, RANK_VALUE, fmt_cards
from ..core.handreading import count_live, flush_possible, hand_desc, live_combos, on_board, showdown
from .base import Question, numeric_options, pct
from .postflop import BET_SIZES, _spot


def _sorted_ranks(board):
    return sorted({c[0] for c in board}, key=lambda r: -RANK_VALUE[r])


def _remaining(rank, dead):
    return 4 - sum(1 for c in dead if c[0] == rank)


def gen_combos(rng, c) -> Question:
    for _ in range(200):
        board = rng.sample(FULL_DECK, rng.choice([3, 4]))
        rest = [x for x in FULL_DECK if x not in board]
        hero = rng.sample(rest, 2)
        dead = board + hero
        ranks = _sorted_ranks(board)
        kind = rng.choice(["set", "twopair", "overpair", "topkicker"])
        if kind == "set":
            r = rng.choice(ranks)
            classes, label = [r + r], f"{r}{r} (set)"
            k = _remaining(r, dead)
            formula = f"quedan {k} cartas {r} vivas → C({k},2) = {k * (k - 1) // 2}"
        elif kind == "twopair" and len(ranks) >= 2:
            a, b = rng.sample(ranks[:3], 2)
            a, b = (a, b) if RANK_VALUE[a] > RANK_VALUE[b] else (b, a)
            classes, label = [a + b + "s", a + b + "o"], f"{a}{b} (dos pares)"
            ka, kb = _remaining(a, dead), _remaining(b, dead)
            formula = f"quedan {ka} {a} y {kb} {b} → {ka} × {kb} = {ka * kb}"
        elif kind == "overpair":
            over = [r for r in RANKS if RANK_VALUE[r] > RANK_VALUE[ranks[0]]]
            if not over:
                continue
            r = rng.choice(over)
            classes, label = [r + r], f"{r}{r} (overpair)"
            k = _remaining(r, dead)
            formula = f"quedan {k} cartas {r} vivas → C({k},2) = {k * (k - 1) // 2}"
        else:
            top = ranks[0]
            if top == "A":
                continue
            classes, label = ["A" + top + "s", "A" + top + "o"], f"A{top} (top pair kicker as)"
            ka, kt = _remaining("A", dead), _remaining(top, dead)
            formula = f"quedan {ka} ases y {kt} {top} → {ka} × {kt} = {ka * kt}"
        n = sum(count_live(hc, dead) for hc in classes)
        naive = sum(count_live(hc, []) for hc in classes)
        if n != naive or rng.random() < 0.3:
            break
    opts, ans = numeric_options(rng, n, [naive, n + 3, n - 2, n * 2, n + 1],
                                lambda v: str(int(round(v))), min_gap=1)
    exp = (f"Sin cartas visibles serían {naive} combos. Con el board y tu mano, {formula}. "
           "Cada carta que ves quita combos al rival. Es la base para pesar valor contra faroles.")
    return Question("", 0, 0, "reading", "l3_combos", f"¿Cuántos combos de {label} puede tener el rival?",
                    opts, ans, exp, cards=[("Tu mano", hero), ("Board", board)])


def gen_blockers(rng, c) -> Question:
    for _ in range(300):
        board = rng.sample(FULL_DECK, 5)
        ranks = _sorted_ranks(board)
        value = [r + r for r in ranks[:3]]
        a, b = ranks[0], ranks[1]
        value += [a + b + "s", a + b + "o"]
        rest = [x for x in FULL_DECK if x not in board]
        hands = []
        while len(hands) < 3:
            h = rng.sample(rest, 2)
            if not any(set(h) & set(x) for x in hands):
                hands.append(h)
        base = sum(count_live(hc, board) for hc in value)
        removed = [base - sum(count_live(hc, board + h) for hc in value) for h in hands]
        best = max(removed)
        need_two = rng.random() < 0.6  # que piense: a menudo dos manos bloquean algo
        if best > 0 and removed.count(best) == 1 and (not need_two or sorted(removed)[-2] > 0):
            break
    labels = [fmt_cards(h) for h in hands]
    ans = str(removed.index(best))
    vdesc = f"sets de {', '.join(ranks[:3])} y dos pares {a}{b}"
    detail = "; ".join(f"{l}: quita {r}" for l, r in zip(labels, removed))
    exp = (f"El rango de valor ({vdesc}) tiene {base} combos con este board. {detail}. "
           "Tener cartas del board en la mano bloquea sus sets y dobles parejas. "
           "Los mejores faroles bloquean el valor del rival y no sus faroles.")
    return Question("", 0, 0, "reading", "l3_blockers",
                    f"El rival representa {vdesc}. ¿Cuál de tus manos le bloquea más combos de valor?",
                    [(str(i), l) for i, l in enumerate(labels)], ans, exp, cards=[("Board", board)])


BEAT_BUCKETS = [(0, 0.2, "Menos de 20 %"), (0.2, 0.4, "20–40 %"), (0.4, 0.6, "40–60 %"),
                (0.6, 0.8, "60–80 %"), (0.8, 1.01, "Más de 80 %")]


def gen_range_vs_hand(rng, c) -> Question:
    for _ in range(300):
        opener, orng, brng = _spot(rng, c)
        board = rng.sample(FULL_DECK, 5)
        hero = list(rng.choice(live_combos(orng, board)))
        R = on_board(live_combos(brng, board + hero), board)
        sd = showdown(hero, R, board)
        frac = sd.lose / sd.n
        if all(abs(frac - x) > 0.03 for x in (0.2, 0.4, 0.6, 0.8)):
            break
    ans = next(l for lo, hi, l in BEAT_BUCKETS if lo <= frac < hi)
    exp = (f"Tienes {hand_desc(hero, board)}. De {sd.n} combos vivos del rango de call de la BB, "
           f"{sd.lose} te ganan, {sd.tie} empatan y {sd.win} pierden → te gana el {pct(frac)}. "
           "Leer manos es convertir «creo que tiene algo» en una lista de combos y contar.")
    return Question("", 0, 0, "reading", "l3_ranges",
                    "Si la BB llega al river con todo su rango de call preflop, ¿qué % de ese rango te gana?",
                    [(l, l) for _, _, l in BEAT_BUCKETS], ans, exp,
                    situation=[("Preflop", f"Abres en {opener}, la BB paga")],
                    cards=[("Tu mano", hero), ("Board", board)])


def gen_value_bluff(rng, c) -> Question:
    target = rng.choice(["call", "fold"])
    for _ in range(400):
        opener, orng, brng = _spot(rng, c)
        board = rng.sample(FULL_DECK, 5)
        if flush_possible(board):
            continue
        # fuerza por clase (sin color posible, todos los combos de una clase valen igual)
        cls = []
        for hc in orng:
            combos = live_combos([hc], board)
            if combos:
                cls.append((on_board(combos[:1], board)[0].score, hc))
        cls.sort()
        nv, nb = rng.randint(2, 6), rng.randint(1, 6)
        value_cls = [hc for _, hc in cls[:nv]]
        bluff_cls = [hc for _, hc in cls[-nb:]]
        worst_value, best_bluff = cls[nv - 1][0], cls[-nb][0]
        catchers = [x for x in live_combos(brng, board)
                    if best_bluff > on_board([x], board)[0].score > worst_value]
        if not catchers:
            continue
        hero = list(rng.choice(catchers))
        dead = board + hero
        v = sum(count_live(hc, dead) for hc in value_cls)
        b = sum(count_live(hc, dead) for hc in bluff_cls)
        if v + b == 0:
            continue
        frac, label = rng.choice(BET_SIZES)
        pot = rng.randrange(20, 61, 2)
        bet = round(pot * frac)
        req = pm.required_equity(pot, bet)
        share = b / (v + b)
        ans = "call" if share >= req else "fold"
        if ans == target and abs(share - req) > 0.03:
            break
    exp = (f"Valor: {v} combos vivos. Faroles: {b} combos. Tu {hand_desc(hero, board)} gana solo a los faroles: "
           f"{b} ÷ {v + b} = {pct(share)} de equity. Necesitas {pct(req)}, así que " +
           ("pagar es rentable." if ans == "call" else "es fold.") +
           " Fíjate en tus blockers: tu mano puede quitar combos de valor o de farol.")
    return Question("", 0, 0, "reading", "l3_value_bluff",
                    f"River. El rival apuesta {bet} bb en un bote de {pot} bb. Si su rango es este, ¿pagas?",
                    [("fold", "Fold"), ("call", "Call")], ans, exp,
                    situation=[("Valor", ", ".join(value_cls)), ("Faroles", ", ".join(bluff_cls)),
                               ("Apuesta", f"{bet} bb ({label})")],
                    cards=[("Tu mano", hero), ("Board", board)])


GENERATORS = {
    "combos": (3, gen_combos),
    "blockers": (3, gen_blockers),
    "range_vs_hand": (3, gen_range_vs_hand),
    "value_bluff": (3, gen_value_bluff),
}
