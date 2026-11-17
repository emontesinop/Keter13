"""Check-in mental: consejos antes/después de la sesión y su correlación con resultados.

Marco: Jared Tendler, The Mental Game of Poker. El tilt y el cansancio hacen
aparecer tu juego B o C; detectarlo antes de sentarte es parte del juego.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlmodel import Session as DB
from sqlmodel import select

from .core.stats import pearson
from .models import MentalCheckin, Session

METRICS = {"tilt": "Tilt", "energy": "Energía", "focus": "Enfoque"}


def advice(phase: str, tilt: int, energy: int, focus: int, stop_loss: str | None) -> list[str]:
    tips = []
    if phase == "pre":
        if tilt >= 4:
            tips.append("Llegas con el tilt alto. Escribe qué lo dispara (una mala racha, una injusticia, un error). "
                        "Si no baja en 10 minutos, hoy no juegues: tu juego C cuesta dinero (Tendler).")
        if energy <= 2:
            tips.append("Tu energía está baja y con cansancio tu juego B o C aparece antes. Haz una sesión corta o descansa.")
        if focus <= 2:
            tips.append("Te cuesta enfocarte. Fija una regla concreta para hoy (p. ej. «no pagar 3-bets fuera de posición») y revísala cada hora.")
        if not tips:
            tips.append("Buen estado para jugar. Decide ahora, en frío, cuándo vas a parar.")
        if stop_loss:
            tips.append(f"Tu stop-loss: {stop_loss} buy-in(s). Si lo alcanzas, te levantas.")
        else:
            tips.append("No tienes stop-loss definido. Ponlo en Sesiones → Ajustes antes de jugar.")
    else:
        if tilt >= 4:
            tips.append("Terminaste con tilt alto. Anota la mano o el momento que lo disparó y qué pensaste. "
                        "Ese registro es la materia prima para corregirlo (Tendler).")
        else:
            tips.append("Anota en una línea la mejor y la peor decisión de la sesión, no el resultado.")
    return tips


def link_pending_pre(db: DB, session: Session) -> None:
    """Vincula el último check-in 'pre' sin sesión de las últimas 24 h."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    pre = db.exec(select(MentalCheckin).where(MentalCheckin.phase == "pre", MentalCheckin.session_id.is_(None),
                                              MentalCheckin.ts >= since)
                  .order_by(MentalCheckin.ts.desc())).first()
    if pre:
        pre.session_id = session.id
        db.add(pre)


@dataclass
class Correlation:
    phase: str
    metric: str
    n: int
    r: float | None
    high_bbh: float | None   # bb/h promedio con valor 4-5
    low_bbh: float | None    # bb/h promedio con valor 1-2
    n_high: int
    n_low: int


def correlations(db: DB) -> list[Correlation]:
    sessions = {s.id: s for s in db.exec(select(Session)).all()}
    checks = db.exec(select(MentalCheckin).where(MentalCheckin.session_id.is_not(None))).all()
    out = []
    for phase in ("pre", "post"):
        rows = [(c, sessions[c.session_id]) for c in checks if c.phase == phase and c.session_id in sessions]
        for m in METRICS:
            xs, ys, hi, lo = [], [], [], []
            for c, s in rows:
                if s.hours <= 0:
                    continue
                bbh = (s.cash_out - s.buy_in) / s.bb / s.hours
                v = getattr(c, m)
                xs.append(v)
                ys.append(bbh)
                if v >= 4:
                    hi.append(bbh)
                elif v <= 2:
                    lo.append(bbh)
            out.append(Correlation(phase, m, len(xs), pearson(xs, ys),
                                   sum(hi) / len(hi) if hi else None, sum(lo) / len(lo) if lo else None,
                                   len(hi), len(lo)))
    return out


def strength_label(r: float | None) -> str:
    if r is None:
        return "sin datos suficientes"
    a = abs(r)
    word = "débil" if a < 0.3 else ("moderada" if a < 0.6 else "fuerte")
    return f"{word} {'positiva' if r > 0 else 'negativa'}"
