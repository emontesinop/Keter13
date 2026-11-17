"""Estadísticas de bankroll y win rate con contexto de varianza."""
from __future__ import annotations

from dataclasses import dataclass
from math import sqrt


@dataclass
class SessionData:
    date: str
    hours: float
    buy_in: float
    cash_out: float
    bb: float  # tamaño de la ciega grande en $

    @property
    def profit(self) -> float:
        return self.cash_out - self.buy_in

    @property
    def profit_bb(self) -> float:
        return self.profit / self.bb


@dataclass
class Summary:
    n_sessions: int
    hours: float
    profit: float
    dollars_per_hour: float | None
    bb_per_hour: float | None
    sd_bb_hour: float | None       # desviación estándar por hora (en bb)
    ci95_bb_hour: tuple[float, float] | None
    winning_sessions_pct: float | None
    max_drawdown: float
    sample_label: str
    sample_note: str


def sample_quality(hours: float) -> tuple[str, str]:
    if hours < 50:
        return ("Muestra mínima", "Con menos de 50 h, el resultado es casi todo varianza.")
    if hours < 200:
        return ("Muestra pequeña", "Aún no distingue un jugador ganador de uno con suerte.")
    if hours < 500:
        return ("Muestra moderada", "Empieza a ser orientativa; mira el intervalo, no solo la media.")
    return ("Muestra razonable", "Útil para decisiones, pero sigue mirando el intervalo.")


def hourly_sd(sessions: list[SessionData]) -> float | None:
    """Desviación estándar por hora (en bb), ponderada por duración.

    var = Σ (x_i − μ·h_i)² / h_i / (n − 1),  con μ = Σx / Σh.
    """
    s = [x for x in sessions if x.hours > 0]
    if len(s) < 2:
        return None
    total_h = sum(x.hours for x in s)
    mu = sum(x.profit_bb for x in s) / total_h
    var = sum((x.profit_bb - mu * x.hours) ** 2 / x.hours for x in s) / (len(s) - 1)
    return sqrt(var)


def max_drawdown(values: list[float]) -> float:
    peak, dd = float("-inf"), 0.0
    for v in values:
        peak = max(peak, v)
        dd = max(dd, peak - v)
    return dd


def bankroll_curve(initial: float, sessions: list[SessionData]) -> list[tuple[str, float]]:
    pts, total = [("inicio", initial)], initial
    for s in sorted(sessions, key=lambda x: x.date):
        total += s.profit
        pts.append((s.date, total))
    return pts


def summarize(sessions: list[SessionData], initial_bankroll: float = 0.0) -> Summary:
    hours = sum(s.hours for s in sessions)
    profit = sum(s.profit for s in sessions)
    label, note = sample_quality(hours)
    if not sessions or hours <= 0:
        return Summary(len(sessions), hours, profit, None, None, None, None, None, 0.0, label, note)
    bbh = sum(s.profit_bb for s in sessions) / hours
    sd = hourly_sd(sessions)
    ci = None
    if sd is not None:
        half = 1.96 * sd / sqrt(hours)
        ci = (bbh - half, bbh + half)
    wins = 100.0 * sum(1 for s in sessions if s.profit > 0) / len(sessions)
    dd = max_drawdown([v for _, v in bankroll_curve(initial_bankroll, sessions)])
    return Summary(len(sessions), hours, profit, profit / hours, bbh, sd, ci, wins, dd, label, note)


def buyins(bankroll: float, bb: float, depth_bb: int = 100) -> float:
    return bankroll / (bb * depth_bb)


def pearson(xs: list[float], ys: list[float]) -> float | None:
    """Correlación de Pearson. None si hay < 3 puntos o varianza cero."""
    n = len(xs)
    if n != len(ys) or n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return sxy / sqrt(sxx * syy)
