"""Equity y comparación de manos usando el evaluador de `treys` (no propio).

- Enumeración exacta cuando el número de runouts es pequeño (flop/turn/river).
- Monte Carlo (con RNG sembrable, reproducible) cuando es grande (preflop).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from itertools import combinations
from math import comb

from treys import Card, Evaluator

from .cards import FULL_DECK, RANK_VALUE, SUITS, class_combos, has_straight, parse_card

_EVAL = Evaluator()
_TREYS = {c: Card.new(c) for c in FULL_DECK}

RANK_CLASS_ES = {
    0: "Escalera real", 1: "Escalera de color", 2: "Póker", 3: "Full", 4: "Color", 5: "Escalera",
    6: "Trío", 7: "Doble pareja", 8: "Pareja", 9: "Carta alta",
}


@dataclass
class EquityResult:
    win: float
    tie: float
    lose: float
    samples: int
    exact: bool

    @property
    def equity(self) -> float:
        return self.win + self.tie / 2


def strength(hole, board) -> int:
    """Puntuación treys: menor = mejor. board debe tener 3-5 cartas."""
    return _EVAL.evaluate([_TREYS[c] for c in hole], [_TREYS[c] for c in board])


def hand_name(hole, board) -> str:
    return RANK_CLASS_ES[_EVAL.get_rank_class(strength(hole, board))]


def compare(hero, villain, board) -> int:
    """1 si gana hero, -1 si gana villano, 0 empate (board de 5 cartas)."""
    a, b = strength(hero, board), strength(villain, board)
    return (a < b) - (a > b)


def _check_dead(cards):
    cs = [parse_card(c) for c in cards]
    if len(set(cs)) != len(cs):
        raise ValueError("Cartas repetidas entre manos/board")
    return cs


def equity_vs_hand(hero, villain, board=(), iterations=20000, rng=None,
                   exact_limit=3000) -> EquityResult:
    hero, villain, board = list(hero), list(villain), list(board)
    _check_dead(hero + villain + board)
    deck = [c for c in FULL_DECK if c not in set(hero + villain + board)]
    k = 5 - len(board)
    w = t = n = 0
    if comb(len(deck), k) <= exact_limit:
        for extra in combinations(deck, k):
            r = compare(hero, villain, board + list(extra))
            w += r == 1
            t += r == 0
            n += 1
        exact = True
    else:
        rng = rng or random.Random()
        for _ in range(iterations):
            r = compare(hero, villain, board + rng.sample(deck, k))
            w += r == 1
            t += r == 0
        n, exact = iterations, False
    return EquityResult(w / n, t / n, (n - w - t) / n, n, exact)


def equity_vs_range(hero, villain_classes, board=(), iterations=20000, rng=None,
                    exact_limit=60000) -> EquityResult:
    """Equity contra un rango (clases de mano), ponderado por combinaciones vivas."""
    hero, board = list(hero), list(board)
    dead = set(_check_dead(hero + board))
    combos = [c for hc in villain_classes for c in class_combos(hc)
              if c[0] not in dead and c[1] not in dead]
    if not combos:
        raise ValueError("El rango del rival no tiene combinaciones vivas")
    k = 5 - len(board)
    remaining = 52 - len(dead) - 2
    w = t = n = 0
    if len(combos) * comb(remaining, k) <= exact_limit:
        for v in combos:
            deck = [c for c in FULL_DECK if c not in dead and c not in v]
            for extra in combinations(deck, k):
                r = compare(hero, list(v), board + list(extra))
                w += r == 1
                t += r == 0
                n += 1
        exact = True
    else:
        rng = rng or random.Random()
        for _ in range(iterations):
            v = rng.choice(combos)
            deck = [c for c in FULL_DECK if c not in dead and c not in v]
            r = compare(hero, list(v), board + rng.sample(deck, k))
            w += r == 1
            t += r == 0
        n, exact = iterations, False
    return EquityResult(w / n, t / n, (n - w - t) / n, n, exact)


@dataclass
class DrawOuts:
    flush: list[str]
    straight: list[str]

    @property
    def all(self) -> list[str]:
        return sorted(set(self.flush) | set(self.straight))

    @property
    def shared(self) -> int:
        return len(set(self.flush) & set(self.straight))


def made_straight_or_flush(cards) -> bool:
    ranks = {RANK_VALUE[c[0]] for c in cards}
    suits = [c[1] for c in cards]
    return has_straight(ranks) or any(suits.count(s) >= 5 for s in SUITS)


def draw_outs(hole, board) -> DrawOuts:
    """Cartas que completan color o escalera en la siguiente calle.

    Pensado para flops/turns sin pareja: con 3-4 cartas en mesa, la carta nueva
    nunca forma escalera o color solo con el board, así que la mano siempre usa
    al menos una carta propia.
    """
    known = set(hole) | set(board)
    flush, straight = [], []
    for c in FULL_DECK:
        if c in known:
            continue
        cards = list(hole) + list(board) + [c]
        suits = [x[1] for x in cards]
        if any(suits.count(s) >= 5 for s in SUITS):
            flush.append(c)
        if has_straight({RANK_VALUE[x[0]] for x in cards}):
            straight.append(c)
    return DrawOuts(flush, straight)
