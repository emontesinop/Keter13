"""Panel de leaks: combina los errores en ejercicios con los leaks de manos reales
y propone un plan de estudio para la semana."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session as DB
from sqlmodel import select

from . import progress
from .content import Content, get_content
from .models import Attempt, HandFinding

DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


@dataclass
class DrillLeak:
    concept: str
    accuracy: float
    n: int


@dataclass
class HandLeak:
    tag: str
    errors: int
    doubts: int

    @property
    def score(self) -> float:
        return self.errors + 0.5 * self.doubts


@dataclass
class Priority:
    concept: str
    score: float
    reasons: list = field(default_factory=list)


def drill_leaks(db: DB, c: Content, days: int = 30, min_n: int = 5) -> list[DrillLeak]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.exec(select(Attempt).where(Attempt.ts >= since, Attempt.mode != "diagnostic")).all()
    per = defaultdict(list)
    for r in rows:
        per[r.concept_id].append(r.correct)
    thr = c.config["gate"]["min_accuracy"]
    out = [DrillLeak(k, sum(v) / len(v), len(v)) for k, v in per.items()
           if len(v) >= min_n and sum(v) / len(v) < thr and k in c.lessons]
    return sorted(out, key=lambda x: (x.accuracy, -x.n))


def hand_leaks(db: DB, days: int = 60) -> list[HandLeak]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.exec(select(HandFinding).where(HandFinding.created >= since, HandFinding.leak.is_not(None))).all()
    agg = defaultdict(lambda: [0, 0])
    for r in rows:
        if r.verdict == "error":
            agg[r.leak][0] += 1
        elif r.verdict == "dudoso":
            agg[r.leak][1] += 1
    out = [HandLeak(t, e, d) for t, (e, d) in agg.items() if e or d]
    return sorted(out, key=lambda x: -x.score)


def priorities(db: DB, c: Content | None = None, top: int = 5) -> list[Priority]:
    """Prioridad por concepto. Un error en una mano real pesa más que uno en ejercicios."""
    c = c or get_content()
    pr: dict[str, Priority] = {}
    thr = c.config["gate"]["min_accuracy"]
    for d in drill_leaks(db, c):
        p = pr.setdefault(d.concept, Priority(d.concept, 0.0))
        p.score += (thr - d.accuracy) * 10 * min(d.n, 30) / 30
        p.reasons.append(f"{d.accuracy * 100:.0f} % de acierto en {d.n} ejercicios")
    for h in hand_leaks(db):
        concept = c.leaks[h.tag]["concept"]
        p = pr.setdefault(concept, Priority(concept, 0.0))
        p.score += 2 * h.score
        txt = f"«{c.leaks[h.tag]['label']}» en manos reales: {h.errors} error(es)"
        if h.doubts:
            txt += f", {h.doubts} dudoso(s)"
        p.reasons.append(txt)
    return sorted(pr.values(), key=lambda p: -p.score)[:top]


@dataclass
class PlanDay:
    day: str
    task: str
    href: str


def weekly_plan(db: DB, c: Content | None = None, today: date | None = None) -> list[PlanDay]:
    c = c or get_content()
    today = today or date.today()
    from .review import due_count
    prios = priorities(db, c, top=3)
    lvl = progress.current_level(db)
    focus = [p.concept for p in prios]
    # completa hasta 3 focos con los conceptos más flojos del nivel actual (y luego sus lecciones)
    fill = [w[0] for w in progress.concept_accuracy(db, lvl, min_n=1)] + [l["id"] for l in c.lessons_for_level(lvl)]
    for cid in fill:
        if len(focus) >= 3:
            break
        if cid in c.lessons and cid not in focus:
            focus.append(cid)
    review_txt = " + 5 min de repasos" if due_count(db) else ""
    plan = []
    for i in range(7):
        d = today + timedelta(days=i)
        label = DAYS_ES[d.weekday()] + f" {d.day}"
        if i == 5:
            plan.append(PlanDay(label, f"20 min de práctica mixta del nivel {lvl} ({c.level_name(lvl)}){review_txt}",
                                f"/practicar?level={lvl}"))
        elif i == 6:
            plan.append(PlanDay(label, "Analiza 2-3 manos de tu última sesión, las que más dudas te dejaron.", "/manos/nueva"))
        elif focus:
            cid = focus[i % len(focus)]
            title = c.lessons[cid]["title"] if cid in c.lessons else cid
            plan.append(PlanDay(label, f"15 min: «{title}», relee la lección y practica el concepto{review_txt}",
                                f"/leccion/{cid}"))
    return plan
