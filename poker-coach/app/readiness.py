"""Criterio «listo para ganar dinero en vivo»: niveles 0-3 aprobados (con examen),
bankroll suficiente para el límite objetivo y stop-loss definido."""
from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session as DB
from sqlmodel import select

from . import progress
from .content import Content, get_content
from .models import Session

REQUIRED_LEVELS = (0, 1, 2, 3)


def _m(x: float) -> str:
    return ("−" if x < 0 else "") + f"${abs(x):,.0f}".replace(",", " ")


@dataclass
class Check:
    label: str
    ok: bool
    detail: str
    href: str
    cta: str


def bankroll_now(db: DB) -> float:
    initial = float(progress.get_setting(db, "initial_bankroll", "0") or 0)
    return initial + sum(s.cash_out - s.buy_in for s in db.exec(select(Session)).all())


def target_stakes(db: DB) -> str:
    t = progress.get_setting(db, "target_stakes")
    if t:
        return t
    last = db.exec(select(Session).order_by(Session.date.desc(), Session.id.desc())).first()
    return last.stakes if last else "1/2"


def readiness(db: DB, c: Content | None = None) -> tuple[list[Check], bool]:
    c = c or get_content()
    b = c.config["bankroll"]
    checks = []

    passed = [l for l in REQUIRED_LEVELS if progress.level_status(db, l) == "passed"]
    missing = [l for l in REQUIRED_LEVELS if l not in passed]
    checks.append(Check(
        "Niveles 0-3 aprobados con examen", not missing,
        "Todos aprobados." if not missing else
        "Faltan: " + ", ".join(f"{l} ({c.level_name(l)})" for l in missing),
        f"/nivel/{missing[0]}" if missing else "/ruta", "Ir al nivel" if missing else "Ver ruta"))

    stakes = target_stakes(db)
    try:
        bb = float(stakes.split("/")[-1])
    except ValueError:
        bb = 2.0
    bi = bb * b["buyin_bb"]
    br = bankroll_now(db)
    need = b["min_buyins"] * bi
    checks.append(Check(
        f"Bankroll ≥ {b['min_buyins']} buy-ins de {stakes}", br >= need,
        f"Tienes {_m(br)} ≈ {f'{br / bi:.1f}'.replace('.', ',')} buy-ins ({_m(bi)} cada uno). Mínimo: {_m(need)}.",
        "/sesiones", "Ajustar bankroll"))

    sl = progress.get_setting(db, "stop_loss_bi", "") or ""
    try:
        sl_ok = float(sl.replace(",", ".")) > 0
    except ValueError:
        sl_ok = False
    checks.append(Check(
        "Stop-loss definido", sl_ok,
        f"Stop-loss: {sl} buy-in(s) = {_m(float(sl.replace(',', '.')) * bi)}." if sl_ok
        else "Decide en frío cuántos buy-ins puedes perder como máximo por sesión.",
        "/sesiones", "Definir stop-loss"))
    return checks, all(ch.ok for ch in checks)
