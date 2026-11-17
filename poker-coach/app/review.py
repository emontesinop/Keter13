"""Repetición espaciada sobre la base de datos: crear tarjetas desde errores,
elegir la siguiente pendiente y aplicar la respuesta."""
from __future__ import annotations

import random
from datetime import datetime, timezone

from sqlmodel import Session as DB
from sqlmodel import func, select

from . import drills, progress
from .core.srs import SrsState, quality_from, review
from .models import SrsCard


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _state(card: SrsCard) -> SrsState:
    return SrsState(card.easiness, card.interval, card.repetitions, card.lapses)


def _apply(card: SrsCard, q: int) -> None:
    s, due = review(_state(card), q, _now())
    card.easiness, card.interval, card.repetitions, card.lapses = s.easiness, s.interval, s.repetitions, s.lapses
    card.due = due
    card.last_reviewed = _now()


def on_answer(db: DB, q: drills.Question, correct: bool, ms: int | None, card_id: int | None = None) -> SrsCard | None:
    """Actualiza el SRS tras cualquier respuesta.

    - Error: crea la tarjeta de esa plantilla o registra un lapse. La situación
      exacta vuelve en ~10 min.
    - Acierto en un repaso: la tarjeta avanza según la calidad (acierto + tiempo).
    - Acierto fuera de un repaso: no cambia nada.
    """
    card = db.exec(select(SrsCard).where(SrsCard.drill_type == q.drill_type)).first()
    if not correct:
        if card is None:
            card = SrsCard(drill_type=q.drill_type, level=q.level, skill=q.skill,
                           concept_id=q.concept_id, seed=q.seed)
        _apply(card, 1)
        card.seed, card.show_exact = q.seed, True
    elif card is not None and card.id == card_id:
        _apply(card, quality_from(True, ms))
        card.show_exact = False
    else:
        return card
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def _due_query(db: DB, level: int | None = None, concept: str | None = None):
    open_levels = [l for l in range(progress.MAX_LEVEL + 1) if progress.is_open(db, l)]
    stmt = select(SrsCard).where(SrsCard.due <= _now(), SrsCard.level.in_(open_levels))
    if concept:
        stmt = stmt.where(SrsCard.concept_id == concept)
    elif level is not None:
        stmt = stmt.where(SrsCard.level == level)
    return stmt


def due_count(db: DB, level: int | None = None, concept: str | None = None) -> int:
    sub = _due_query(db, level, concept).subquery()
    return db.exec(select(func.count()).select_from(sub)).one()


def next_due(db: DB, level: int | None = None, concept: str | None = None,
             exclude: int | None = None) -> SrsCard | None:
    stmt = _due_query(db, level, concept).order_by(SrsCard.due, SrsCard.easiness)
    cards = db.exec(stmt).all()
    for c in cards:
        if c.id != exclude:
            return c
    return cards[0] if cards else None


def next_scheduled(db: DB) -> datetime | None:
    c = db.exec(select(SrsCard).order_by(SrsCard.due)).first()
    return _aware(c.due) if c else None


def card_question(card: SrsCard) -> drills.Question:
    seed = card.seed if card.show_exact else drills.new_seed()
    return drills.generate(card.drill_type, seed)


def maybe_review_in_practice(db: DB, rng: random.Random, level: int | None, concept: str | None,
                             p: float = 0.3) -> SrsCard | None:
    """Intercala repasos pendientes dentro de la práctica normal."""
    if rng.random() >= p:
        return None
    return next_due(db, level, concept)
