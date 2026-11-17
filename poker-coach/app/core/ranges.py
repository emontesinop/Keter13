"""Parseo y validación de rangos en notación estándar.

Soporta: "77", "77+", "QQ-88", "AKs", "AKo", "AK", "A2s+", "KTo+", "A5s-A2s",
"T9s-65s" (conectores en paralelo). Separador: coma.
"""
from __future__ import annotations

import re

from .cards import RANKS, RANK_VALUE, class_combo_count

TOKEN = re.compile(r"^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)$")


class RangeError(ValueError):
    pass


def _pair_span(lo: int, hi: int) -> list[str]:
    return [RANKS[v] * 2 for v in range(lo, hi + 1)]


def _expand_suffix(hi: str, lo: str, suffix: str) -> list[str]:
    if suffix:
        return [hi + lo + suffix]
    return [hi + lo + "s", hi + lo + "o"]


def _parse_single(tok: str) -> list[str]:
    m = TOKEN.match(tok)
    if not m:
        raise RangeError(f"Token de rango inválido: '{tok}'")
    a, b, suffix, plus = m.groups()
    va, vb = RANK_VALUE[a], RANK_VALUE[b]
    if a == b:
        if suffix:
            raise RangeError(f"Un par no lleva s/o: '{tok}'")
        return _pair_span(va, 12) if plus else [a + b]
    if va < vb:
        raise RangeError(f"Escribe la carta alta primero: '{tok}' → '{b}{a}{suffix}{plus}'")
    if plus:  # sube el kicker hasta una carta por debajo de la alta
        out: list[str] = []
        for k in range(vb, va):
            out += _expand_suffix(a, RANKS[k], suffix)
        return out
    return _expand_suffix(a, b, suffix)


def _parse_dash(tok: str) -> list[str]:
    left, right = (t.strip() for t in tok.split("-", 1))
    ml, mr = TOKEN.match(left), TOKEN.match(right)
    if not ml or not mr or ml.group(4) or mr.group(4):
        raise RangeError(f"Rango con guion inválido: '{tok}'")
    a1, b1, s1, _ = ml.groups()
    a2, b2, s2, _ = mr.groups()
    if s1 != s2:
        raise RangeError(f"Los extremos deben tener el mismo sufijo: '{tok}'")
    v = RANK_VALUE
    if a1 == b1 and a2 == b2:  # pares
        lo, hi = sorted((v[a1], v[a2]))
        return _pair_span(lo, hi)
    if a1 == b1 or a2 == b2:
        raise RangeError(f"No mezcles pares con no-pares: '{tok}'")
    if v[a1] < v[b1] or v[a2] < v[b2]:
        raise RangeError(f"Escribe la carta alta primero: '{tok}'")
    out: list[str] = []
    if a1 == a2:  # misma carta alta, recorre kicker
        lo, hi = sorted((v[b1], v[b2]))
        for k in range(lo, hi + 1):
            out += _expand_suffix(a1, RANKS[k], s1)
        return out
    gap1, gap2 = v[a1] - v[b1], v[a2] - v[b2]
    if gap1 == gap2:  # conectores/gappers en paralelo
        lo, hi = sorted((v[a1], v[a2]))
        for h in range(lo, hi + 1):
            out += _expand_suffix(RANKS[h], RANKS[h - gap1], s1)
        return out
    raise RangeError(f"Rango con guion ambiguo: '{tok}'")


def parse_range(text: str) -> frozenset[str]:
    """Devuelve el conjunto de clases de mano. Lanza RangeError si algo no es válido."""
    if text is None:
        return frozenset()
    hands: set[str] = set()
    for raw in str(text).split(","):
        tok = raw.strip().replace(" ", "")
        if not tok:
            continue
        hands.update(_parse_dash(tok) if "-" in tok else _parse_single(tok))
    return frozenset(hands)


def combo_count(hands) -> int:
    return sum(class_combo_count(h) for h in hands)


def range_percent(hands) -> float:
    return 100.0 * combo_count(hands) / 1326
