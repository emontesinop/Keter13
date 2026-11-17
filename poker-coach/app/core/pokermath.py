"""Matemática básica de poker. Todas las funciones son puras.

Convención: `pot` es el bote ANTES de que el rival apueste salvo que se indique.
"""
from __future__ import annotations

from math import comb


def required_equity(pot_before_bet: float, bet: float) -> float:
    """Equity mínima para pagar una apuesta (pot odds).

    El rival apuesta `bet` en un bote `pot_before_bet`; pagas `bet` para ganar
    pot_before_bet + bet. Equity necesaria = bet / (pot_before_bet + 2*bet).
    """
    if bet <= 0 or pot_before_bet < 0:
        raise ValueError("Apuesta y bote deben ser positivos")
    return bet / (pot_before_bet + 2 * bet)


def pot_odds_ratio(pot_before_bet: float, bet: float) -> float:
    """Odds del bote como X:1 (lo que ganas : lo que pagas)."""
    return (pot_before_bet + bet) / bet


def rule_of_2_4(outs: int, cards_to_come: int) -> float:
    """Aproximación en %: outs*4 con dos cartas por venir, outs*2 con una."""
    if cards_to_come not in (1, 2):
        raise ValueError("cards_to_come debe ser 1 o 2")
    return outs * (4 if cards_to_come == 2 else 2)


def outs_probability(outs: int, unseen: int, cards_to_come: int) -> float:
    """Probabilidad exacta de ligar al menos un out."""
    if not 0 <= outs <= unseen:
        raise ValueError("outs fuera de rango")
    if cards_to_come == 1:
        return outs / unseen
    if cards_to_come == 2:
        return 1 - comb(unseen - outs, 2) / comb(unseen, 2)
    raise ValueError("cards_to_come debe ser 1 o 2")


def ev_call(equity: float, pot_before_bet: float, bet: float) -> float:
    """EV de pagar vs foldear (EV de foldear = 0). Ignora implied odds."""
    win = pot_before_bet + bet  # lo que hay en el centro y ganas
    return equity * win - (1 - equity) * bet


def ev_bluff(fold_freq: float, pot: float, bet: float) -> float:
    """EV de un farol puro (0% equity si te pagan)."""
    return fold_freq * pot - (1 - fold_freq) * bet


def breakeven_fold_freq(pot: float, bet: float) -> float:
    """Frecuencia de fold que hace rentable un farol puro (alpha)."""
    return bet / (pot + bet)


def mdf(pot: float, bet: float) -> float:
    """Minimum Defense Frequency: proporción del rango que debes continuar."""
    return pot / (pot + bet)


def spr(effective_stack: float, pot: float) -> float:
    return effective_stack / pot


def implied_needed(pot_before_bet: float, bet: float, equity: float) -> float:
    """Cuánto más necesitas ganar en calles futuras para que pagar sea neutro."""
    if equity <= 0:
        return float("inf")
    return max(0.0, bet / equity - (pot_before_bet + 2 * bet))
