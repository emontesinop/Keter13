from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Attempt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=_utcnow, index=True)
    level: int = Field(index=True)
    skill: str = Field(index=True)
    drill_type: str
    concept_id: str = Field(index=True)
    seed: int
    user_answer: str
    correct_answer: str
    correct: bool
    ms_taken: int | None = None
    mode: str = Field(default="practice", index=True)   # practice | exam | diagnostic
    run_id: str | None = Field(default=None, index=True)


class LevelProgress(SQLModel, table=True):
    level: int = Field(primary_key=True)
    status: str = "locked"           # locked | unlocked | placed | passed
    exam_passed_at: datetime | None = None
    best_exam_score: float | None = None


class Run(SQLModel, table=True):
    """Diagnóstico o examen: lista fija de preguntas (drill_type, seed)."""
    id: str = Field(primary_key=True)
    kind: str                         # diagnostic | exam
    level: int | None = None
    created: datetime = Field(default_factory=_utcnow)
    finished: datetime | None = None
    plan: str                         # JSON [[drill_type, seed], ...]
    score: float | None = None
    applied: bool = False


class Session(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    date: str = Field(index=True)     # YYYY-MM-DD
    stakes: str                       # "1/2"
    bb: float
    hours: float
    buy_in: float
    cash_out: float
    location: str = ""
    notes: str = ""


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class SrsCard(SQLModel, table=True):
    """Tarjeta de repaso: nace de un error. Una por tipo de ejercicio (plantilla)."""
    id: int | None = Field(default=None, primary_key=True)
    drill_type: str = Field(index=True, unique=True)
    level: int = Field(index=True)
    skill: str
    concept_id: str = Field(index=True)
    seed: int                          # situación exacta del último error
    show_exact: bool = True            # el primer repaso repite esa situación
    easiness: float = 2.5
    interval: int = 0
    repetitions: int = 0
    lapses: int = 0
    due: datetime = Field(default_factory=_utcnow, index=True)
    last_reviewed: datetime | None = None
    created: datetime = Field(default_factory=_utcnow)


class MentalCheckin(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=_utcnow)
    date: str = Field(index=True)
    phase: str                         # pre | post
    tilt: int                          # 1 calma … 5 tilt fuerte
    energy: int                        # 1 agotado … 5 lleno
    focus: int                         # 1 disperso … 5 enfocado
    note: str = ""
    session_id: int | None = Field(default=None, index=True)
