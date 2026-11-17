"""Cartas, manos iniciales (169 clases) y combinaciones.

Notación de cartas: rango + palo, p. ej. "As", "Td", "7c" (compatible con treys).
Notación de clases: "AA", "AKs" (suited), "AKo" (offsuit).
"""
from __future__ import annotations

from itertools import combinations

RANKS = "23456789TJQKA"
SUITS = "shdc"
RANK_VALUE = {r: i for i, r in enumerate(RANKS)}  # '2' -> 0 ... 'A' -> 12
SUIT_SYMBOL = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
RANK_NAME = {
    "A": "As", "K": "Rey", "Q": "Reina", "J": "Jota", "T": "10",
    "9": "9", "8": "8", "7": "7", "6": "6", "5": "5", "4": "4", "3": "3", "2": "2",
}
FULL_DECK: tuple[str, ...] = tuple(r + s for r in RANKS for s in SUITS)


class CardError(ValueError):
    pass


def parse_card(text: str) -> str:
    t = text.strip()
    if len(t) == 3 and t[:2] == "10":
        t = "T" + t[2]
    if len(t) != 2:
        raise CardError(f"Carta inválida: '{text}'")
    r, s = t[0].upper(), t[1].lower()
    if r not in RANKS or s not in SUITS:
        raise CardError(f"Carta inválida: '{text}'")
    return r + s


def parse_cards(text: str) -> list[str]:
    """'AsKd', 'As Kd' o 'As,Kd' -> ['As', 'Kd']. Rechaza duplicados."""
    compact = text.replace(",", " ").split()
    tokens: list[str] = []
    for chunk in compact:
        chunk = chunk.replace("10", "T")
        if len(chunk) % 2:
            raise CardError(f"Cartas inválidas: '{text}'")
        tokens += [chunk[i:i + 2] for i in range(0, len(chunk), 2)]
    cards = [parse_card(t) for t in tokens]
    if len(set(cards)) != len(cards):
        raise CardError(f"Cartas repetidas: '{text}'")
    return cards


def hand_class(c1: str, c2: str) -> str:
    """Clase de mano de dos cartas: ('Ah','Kh') -> 'AKs'."""
    a, b = parse_card(c1), parse_card(c2)
    if a == b:
        raise CardError("Las dos cartas son iguales")
    if RANK_VALUE[a[0]] < RANK_VALUE[b[0]]:
        a, b = b, a
    if a[0] == b[0]:
        return a[0] + b[0]
    return a[0] + b[0] + ("s" if a[1] == b[1] else "o")


def is_valid_class(hc: str) -> bool:
    if len(hc) == 2:
        return hc[0] == hc[1] and hc[0] in RANKS
    if len(hc) == 3:
        return (hc[0] in RANKS and hc[1] in RANKS and hc[2] in "so"
                and RANK_VALUE[hc[0]] > RANK_VALUE[hc[1]])
    return False


def all_hand_classes() -> list[str]:
    """Las 169 clases en orden de matriz (AA, AKs, ..., 22)."""
    out = []
    rs = RANKS[::-1]
    for i, r1 in enumerate(rs):
        for j, r2 in enumerate(rs):
            if i == j:
                out.append(r1 + r2)
            elif j > i:
                out.append(r1 + r2 + "s")
            else:
                out.append(r2 + r1 + "o")
    return out


def class_combos(hc: str) -> list[tuple[str, str]]:
    if not is_valid_class(hc):
        raise CardError(f"Clase de mano inválida: '{hc}'")
    r1, r2 = hc[0], hc[1]
    if len(hc) == 2:
        return [(r1 + a, r1 + b) for a, b in combinations(SUITS, 2)]
    if hc[2] == "s":
        return [(r1 + s, r2 + s) for s in SUITS]
    return [(r1 + a, r2 + b) for a in SUITS for b in SUITS if a != b]


def class_combo_count(hc: str) -> int:
    if len(hc) == 2:
        return 6
    return 4 if hc[2] == "s" else 12


def fmt_card(c: str) -> str:
    return ("10" if c[0] == "T" else c[0]) + SUIT_SYMBOL[c[1]]


def fmt_cards(cards) -> str:
    return " ".join(fmt_card(c) for c in cards)


def has_straight(ranks: set[int]) -> bool:
    """ranks: valores 0..12. Considera la rueda A-2-3-4-5."""
    rs = set(ranks)
    if 12 in rs:
        rs.add(-1)
    return any(all((lo + k) in rs for k in range(5)) for lo in range(-1, 9))
