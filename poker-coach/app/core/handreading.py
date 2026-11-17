"""Herramientas de lectura de manos sobre el evaluador de treys.

Un "rango en el board" es una lista de combos vivos (sin cartas visibles)
ordenados de mejor a peor según su mano en ese board.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from math import ceil, comb

from .cards import RANK_VALUE, class_combos
from .equity import RANK_CLASS_ES, _EVAL, strength


def live_combos(classes, dead) -> list[tuple[str, str]]:
    d = set(dead)
    return [c for hc in sorted(classes) for c in class_combos(hc) if c[0] not in d and c[1] not in d]


def count_live(hc: str, dead) -> int:
    return len(live_combos([hc], dead))


@dataclass
class Scored:
    combo: tuple[str, str]
    score: int  # menor = mejor (treys)


def on_board(combos, board) -> list[Scored]:
    return sorted((Scored(c, strength(c, board)) for c in combos), key=lambda s: s.score)


def top_fraction(rng_scored: list[Scored], frac: float) -> list[Scored]:
    return rng_scored[:ceil(frac * len(rng_scored))] if frac > 0 else []


def bottom_fraction(rng_scored: list[Scored], frac: float) -> list[Scored]:
    n = ceil(frac * len(rng_scored)) if frac > 0 else 0
    return rng_scored[len(rng_scored) - n:] if n else []


@dataclass
class Showdown:
    win: int
    tie: int
    lose: int

    @property
    def n(self) -> int:
        return self.win + self.tie + self.lose

    @property
    def equity(self) -> float:
        return (self.win + self.tie / 2) / self.n if self.n else 0.0


def showdown(hero, villain: list[Scored], board) -> Showdown:
    """River: resultado exacto de hero contra cada combo del rango."""
    hs = strength(hero, board)
    w = sum(1 for v in villain if hs < v.score)
    t = sum(1 for v in villain if hs == v.score)
    return Showdown(w, t, len(villain) - w - t)


def hand_desc(hole, board) -> str:
    """Descripción en español: 'top pair', 'overpair', 'color', etc."""
    s = strength(hole, board)
    cls = _EVAL.get_rank_class(s)
    name = RANK_CLASS_ES[cls]
    b_ranks = [c[0] for c in board]
    board_paired = len(set(b_ranks)) < len(b_ranks)
    if cls == 7 and sum(1 for r in set(b_ranks) if b_ranks.count(r) >= 2) >= 2:
        return "doble pareja del board (juegas tu kicker)"
    if cls == 7 and board_paired:
        return "doble pareja (una de ellas es la pareja del board)"
    if cls == 6 and any(b_ranks.count(r) >= 3 for r in b_ranks):
        return "trío del board (sin mano propia)"
    if cls != 8:
        return name.lower()
    board_ranks = sorted({RANK_VALUE[c[0]] for c in board}, reverse=True)
    h = [RANK_VALUE[c[0]] for c in hole]
    if h[0] == h[1]:
        if h[0] > board_ranks[0]:
            return "overpair"
        return "pareja de bolsillo por debajo del board" if h[0] < board_ranks[-1] else "pareja de bolsillo media"
    paired = [r for r in h if r in board_ranks]
    if not paired:
        return "pareja del board (sin mano propia)"
    idx = board_ranks.index(paired[0])
    return ["top pair", "segunda pareja", "tercera pareja"][min(idx, 2)] if idx < 3 else "pareja baja"


def flush_possible(board) -> bool:
    suits = [c[1] for c in board]
    return max(suits.count(s) for s in set(suits)) >= 3


def range_vs_range_equity(range_a, range_b, board, rng: random.Random, iterations: int = 3000) -> float:
    """Equity Monte Carlo del rango A contra el rango B en un flop/turn."""
    dead = set(board)
    a = live_combos(range_a, dead)
    b = live_combos(range_b, dead)
    from .cards import FULL_DECK
    deck = [c for c in FULL_DECK if c not in dead]
    k = 5 - len(board)
    total = 0.0
    n = 0
    while n < iterations:
        ca, cb = rng.choice(a), rng.choice(b)
        if set(ca) & set(cb):
            continue
        rest = [c for c in deck if c not in ca and c not in cb]
        full = list(board) + rng.sample(rest, k)
        sa, sb = strength(ca, full), strength(cb, full)
        total += 1.0 if sa < sb else (0.5 if sa == sb else 0.0)
        n += 1
    return total / n


def strong_share(classes, board, max_class: int = 7) -> float:
    """Fracción de combos con doble pareja o mejor (rank class <= 7) en el board."""
    combos = live_combos(classes, board)
    if not combos:
        return 0.0
    good = sum(1 for c in combos if _EVAL.get_rank_class(strength(c, board)) <= max_class)
    return good / len(combos)


def pair_combos(k: int) -> int:
    return comb(k, 2)


def equity_vs_combos(hero, combos, board, rng: random.Random, iterations: int = 3000) -> float:
    """Equity de hero contra una lista de combos (uniforme por combo) hasta el river.

    River: exacta. Turn: exacta (todas las cartas del river). Flop: Monte Carlo.
    """
    from .cards import FULL_DECK
    combos = [c for c in combos if not (set(c) & set(hero))]
    if not combos:
        return 0.0
    k = 5 - len(board)
    if k == 0:
        return showdown(hero, on_board(combos, board), board).equity
    dead = set(hero) | set(board)
    total = n = 0.0
    if k == 1:
        for v in combos:
            for card in FULL_DECK:
                if card in dead or card in v:
                    continue
                full = list(board) + [card]
                a, b = strength(hero, full), strength(v, full)
                total += 1.0 if a < b else (0.5 if a == b else 0.0)
                n += 1
        return total / n
    deck = [c for c in FULL_DECK if c not in dead]
    for _ in range(iterations):
        v = rng.choice(combos)
        rest = [c for c in deck if c not in v]
        full = list(board) + rng.sample(rest, k)
        a, b = strength(hero, full), strength(v, full)
        total += 1.0 if a < b else (0.5 if a == b else 0.0)
        n += 1
    return total / n
