"""Varianza en cash: intervalos, horas necesarias, riesgo de ruina y simulación.

Modelo: el resultado por hora es aproximadamente normal con media = win rate
(bb/h) y desviación = sd (bb/√h). Es la aproximación estándar para cash.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from math import erf, exp, sqrt

Z95 = 1.96


def ci_halfwidth(sd: float, hours: float, z: float = Z95) -> float:
    if hours <= 0:
        raise ValueError("horas debe ser > 0")
    return z * sd / sqrt(hours)


def hours_for_significance(winrate: float, sd: float, z: float = Z95) -> float:
    """Horas para que el intervalo del 95 % excluya el 0 (con ese win rate real)."""
    if winrate <= 0:
        return float("inf")
    return (z * sd / winrate) ** 2


def normal_cdf(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


def prob_losing(winrate: float, sd: float, hours: float) -> float:
    """Probabilidad de ir en negativo tras `hours` horas."""
    return normal_cdf(-winrate * sqrt(hours) / sd)


def risk_of_ruin(winrate: float, sd: float, bankroll_bb: float) -> float:
    """Riesgo de ruina (aprox. de difusión): exp(−2·wr·B / sd²). 1 si wr ≤ 0."""
    if winrate <= 0:
        return 1.0
    return min(1.0, exp(-2 * winrate * bankroll_bb / sd ** 2))


@dataclass
class SimResult:
    hours: float
    finals: list[float]                # resultado final de cada simulación (bb), ordenado
    drawdowns: list[float]             # peor caída de cada simulación (bb), ordenada
    paths: list[list[float]]           # algunas trayectorias para dibujar
    steps: int

    def pct(self, q: float, data: list[float] | None = None) -> float:
        d = self.finals if data is None else data
        i = min(len(d) - 1, max(0, round(q * (len(d) - 1))))
        return d[i]

    @property
    def p_loss(self) -> float:
        return sum(1 for x in self.finals if x < 0) / len(self.finals)


def simulate(winrate: float, sd: float, hours: float, n_sims: int = 2000, max_steps: int = 100,
             n_paths: int = 20, rng: random.Random | None = None) -> SimResult:
    rng = rng or random.Random()
    steps = int(max(1, min(max_steps, round(hours))))
    dt = hours / steps
    mu, sig = winrate * dt, sd * sqrt(dt)
    finals, dds, paths = [], [], []
    for i in range(n_sims):
        x = peak = dd = 0.0
        path = [0.0] if i < n_paths else None
        for _ in range(steps):
            x += rng.gauss(mu, sig)
            if x > peak:
                peak = x
            elif peak - x > dd:
                dd = peak - x
            if path is not None:
                path.append(x)
        finals.append(x)
        dds.append(dd)
        if path is not None:
            paths.append(path)
    finals.sort()
    dds.sort()
    return SimResult(hours, finals, dds, paths, steps)
