"""Repetición espaciada, variante de SM-2 (Wozniak, SuperMemo 2).

Calidad 0-5. Con calidad < 3 la tarjeta se reinicia (lapse) y vuelve pronto.
Con calidad >= 3 los intervalos crecen: 1 día, 6 días y luego intervalo × EF.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta

MIN_EF = 1.3
RELEARN_MINUTES = 10


@dataclass(frozen=True)
class SrsState:
    easiness: float = 2.5
    interval: int = 0          # días
    repetitions: int = 0
    lapses: int = 0


def quality_from(correct: bool, ms_taken: int | None, fast_ms: int = 10_000, slow_ms: int = 40_000) -> int:
    """Traduce acierto + tiempo a calidad SM-2.

    Acierto rápido = 5, acierto normal = 4, acierto lento = 3, error = 1.
    """
    if not correct:
        return 1
    if ms_taken is None:
        return 4
    if ms_taken <= fast_ms:
        return 5
    if ms_taken >= slow_ms:
        return 3
    return 4


def update_easiness(ef: float, q: int) -> float:
    return max(MIN_EF, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))


def review(state: SrsState, q: int, now: datetime) -> tuple[SrsState, datetime]:
    """Aplica una respuesta de calidad q. Devuelve (nuevo estado, próxima fecha)."""
    if not 0 <= q <= 5:
        raise ValueError("La calidad debe estar entre 0 y 5")
    if q < 3:
        new = replace(state, repetitions=0, interval=1, lapses=state.lapses + 1,
                      easiness=update_easiness(state.easiness, q))
        return new, now + timedelta(minutes=RELEARN_MINUTES)
    if state.repetitions == 0:
        interval = 1
    elif state.repetitions == 1:
        interval = 6
    else:
        interval = round(state.interval * state.easiness)
    new = replace(state, repetitions=state.repetitions + 1, interval=interval,
                  easiness=update_easiness(state.easiness, q))
    return new, now + timedelta(days=interval)
