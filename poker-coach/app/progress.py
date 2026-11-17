"""Gates de nivel, diagnóstico, exámenes, puntajes por habilidad y recomendación diaria."""
from __future__ import annotations

import json
import random
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlmodel import Session as DB
from sqlmodel import select

from . import drills
from .content import Content, get_content
from .models import Attempt, LevelProgress, Run, Setting

MAX_LEVEL = 5
TRAINING_MODES = ("practice", "review")  # cuentan para el gate


# ---------- niveles ----------

def ensure_levels(db: DB) -> None:
    existing = {lp.level for lp in db.exec(select(LevelProgress)).all()}
    for lvl in range(MAX_LEVEL + 1):
        if lvl not in existing:
            db.add(LevelProgress(level=lvl, status="unlocked" if lvl == 0 else "locked"))
    db.commit()


def level_status(db: DB, level: int) -> str:
    lp = db.get(LevelProgress, level)
    return lp.status if lp else ("unlocked" if level == 0 else "locked")


def is_open(db: DB, level: int) -> bool:
    return level_status(db, level) != "locked"


@dataclass
class Gate:
    level: int
    status: str
    count: int
    window: int
    accuracy: float | None
    min_accuracy: float
    exam_ready: bool
    has_content: bool

    @property
    def remaining(self) -> int:
        return max(0, self.window - self.count)


def gate(db: DB, level: int, c: Content | None = None) -> Gate:
    c = c or get_content()
    g = c.config["gate"]
    rows = db.exec(select(Attempt).where(Attempt.level == level, Attempt.mode.in_(TRAINING_MODES))
                   .order_by(Attempt.ts.desc(), Attempt.id.desc()).limit(g["window"])).all()
    acc = sum(r.correct for r in rows) / len(rows) if rows else None
    status = level_status(db, level)
    gens, quiz = drills.candidates(level=level, c=c)
    has_content = bool(gens or quiz)
    ready = has_content and (status == "placed" or (
        status == "unlocked" and len(rows) >= g["window"] and acc is not None and acc >= g["min_accuracy"]))
    return Gate(level, status, len(rows), g["window"], acc, g["min_accuracy"], ready, has_content)


def current_level(db: DB) -> int:
    """Primer nivel abierto y no aprobado."""
    for lvl in range(MAX_LEVEL + 1):
        st = level_status(db, lvl)
        if st != "passed":
            return lvl
    return MAX_LEVEL


def _unlock(db: DB, level: int, status: str = "unlocked") -> None:
    if level > MAX_LEVEL:
        return
    lp = db.get(LevelProgress, level)
    if lp.status == "locked" or (status == "placed" and lp.status == "unlocked"):
        lp.status = status
        db.add(lp)


# ---------- runs (diagnóstico / examen) ----------

DIAGNOSTIC_PLAN = (
    ["pot_odds", "outs", "rule24", "ev_call", "hand_rank", "position", "bluff_math"]            # nivel 0
    + ["rfi"] * 3 + ["vs_open"] * 2 + ["vs_limpers", "sizing"]                                  # nivel 1
    + ["mdf", "spr", "river_decision", "facing_bet"]                                            # nivel 2
    + ["combos", "range_vs_hand"]                                                               # nivel 3
    + ["profile_id"]                                                                            # nivel 4
    + ["bankroll_move"]                                                                         # nivel 5
)


def create_diagnostic(db: DB, c: Content | None = None) -> Run:
    c = c or get_content()
    rng = random.Random()
    plan = [[t, drills.new_seed()] for t in DIAGNOSTIC_PLAN]
    for q in c.questions.values():
        if q.get("diagnostic_only"):
            plan.append([drills.QUIZ_PREFIX + q["id"], drills.new_seed()])
    rng.shuffle(plan)
    plan.sort(key=lambda p: drills.generate(p[0], p[1], c).level)  # de fácil a difícil
    run = Run(id=uuid.uuid4().hex[:12], kind="diagnostic", plan=json.dumps(plan))
    db.add(run)
    db.commit()
    return run


def create_exam(db: DB, level: int, c: Content | None = None) -> Run:
    c = c or get_content()
    rng = random.Random()
    n = c.config["gate"]["exam_size"]
    plan = [[drills.pick(rng, level=level, c=c), drills.new_seed()] for _ in range(n)]
    run = Run(id=uuid.uuid4().hex[:12], kind="exam", level=level, plan=json.dumps(plan))
    db.add(run)
    db.commit()
    return run


def run_plan(run: Run) -> list[tuple[str, int]]:
    return [tuple(p) for p in json.loads(run.plan)]


def run_attempts(db: DB, run: Run) -> list[Attempt]:
    return db.exec(select(Attempt).where(Attempt.run_id == run.id).order_by(Attempt.id)).all()


@dataclass
class DiagnosticResult:
    by_level: dict          # level -> (correct, total)
    by_skill: dict          # skill -> (correct, total)
    placed_level: int       # primer nivel no convalidado (puede ser MAX_LEVEL + 1)
    weaknesses: list        # [(concept_id, correct, total)]

    @property
    def start_level(self) -> int:
        return min(self.placed_level, MAX_LEVEL)


def diagnostic_result(db: DB, run: Run, c: Content | None = None) -> DiagnosticResult:
    c = c or get_content()
    thr = c.config["gate"]["min_accuracy"]
    by_level, by_skill, by_concept = (defaultdict(lambda: [0, 0]) for _ in range(3))
    for a in run_attempts(db, run):
        for d, k in ((by_level, a.level), (by_skill, a.skill), (by_concept, a.concept_id)):
            d[k][0] += a.correct
            d[k][1] += 1
    placed = 0
    for lvl in range(MAX_LEVEL + 1):  # convalida niveles consecutivos con contenido
        if not any(drills.candidates(level=lvl, c=c)):
            break
        ok, tot = by_level.get(lvl, [0, 0])
        if tot and ok / tot >= thr:
            placed = lvl + 1
        else:
            break
    weak = sorted(((k, v[0], v[1]) for k, v in by_concept.items() if v[0] < v[1]),
                  key=lambda x: (x[1] / x[2], -x[2]))[:3]
    return DiagnosticResult({k: tuple(v) for k, v in by_level.items()},
                            {k: tuple(v) for k, v in by_skill.items()}, placed, weak)


def finish_run(db: DB, run: Run, c: Content | None = None) -> None:
    """Aplica el resultado una sola vez (idempotente)."""
    if run.applied:
        return
    c = c or get_content()
    atts = run_attempts(db, run)
    run.score = sum(a.correct for a in atts) / len(atts) if atts else 0.0
    run.finished = datetime.now(timezone.utc)
    if run.kind == "diagnostic":
        res = diagnostic_result(db, run, c)
        # Los niveles convalidados quedan "placed": puedes presentar su examen
        # directamente, sin los 50 ejercicios. El siguiente nivel se abre.
        for lvl in range(res.placed_level):
            _unlock(db, lvl, "placed")
        _unlock(db, res.placed_level)
        set_setting(db, "diagnostic_done", run.id)
    elif run.kind == "exam":
        lp = db.get(LevelProgress, run.level)
        lp.best_exam_score = max(lp.best_exam_score or 0.0, run.score)
        if run.score >= c.config["gate"]["exam_pass"]:
            lp.status = "passed"
            lp.exam_passed_at = datetime.now(timezone.utc)
            _unlock(db, run.level + 1)
        elif lp.status == "placed":
            # La convalidación del diagnóstico da un intento directo. Si fallas,
            # vuelves al gate normal (50 ejercicios ≥ 85 %).
            lp.status = "unlocked"
        db.add(lp)
    run.applied = True
    db.add(run)
    db.commit()


# ---------- settings ----------

def get_setting(db: DB, key: str, default: str | None = None) -> str | None:
    s = db.get(Setting, key)
    return s.value if s else default


def set_setting(db: DB, key: str, value: str) -> None:
    s = db.get(Setting, key) or Setting(key=key, value=value)
    s.value = value
    db.add(s)
    db.commit()


# ---------- puntajes y recomendación ----------

def skill_scores(db: DB, last: int = 100) -> dict:
    out = {}
    for skill in drills.SKILL_LABEL:
        rows = db.exec(select(Attempt).where(Attempt.skill == skill, Attempt.mode != "diagnostic")
                       .order_by(Attempt.id.desc()).limit(last)).all()
        out[skill] = (sum(r.correct for r in rows) / len(rows), len(rows)) if rows else (None, 0)
    return out


def concept_accuracy(db: DB, level: int, last: int = 30, min_n: int = 5) -> list:
    rows = db.exec(select(Attempt).where(Attempt.level == level, Attempt.mode.in_(TRAINING_MODES))
                   .order_by(Attempt.id.desc()).limit(300)).all()
    per = defaultdict(list)
    for r in rows:
        if len(per[r.concept_id]) < last:
            per[r.concept_id].append(r.correct)
    return sorted(((k, sum(v) / len(v), len(v)) for k, v in per.items() if len(v) >= min_n),
                  key=lambda x: x[1])


@dataclass
class Recommendation:
    text: str
    href: str
    cta: str


def recommendation(db: DB, c: Content | None = None) -> Recommendation:
    c = c or get_content()
    if not get_setting(db, "diagnostic_done"):
        return Recommendation("Empieza por el diagnóstico (unos 10 min). Te ubica en tu nivel y detecta tus puntos débiles.",
                              "/diagnostico", "Hacer diagnóstico")
    from .review import due_count
    due = due_count(db)
    if due >= 3:
        return Recommendation(f"Hoy primero: {due} repasos pendientes (≈ {max(2, due // 2)} min). "
                              "Son situaciones en las que fallaste; volver a ellas a tiempo es lo que fija el concepto.",
                              "/repasar", "Repasar")
    lvl = current_level(db)
    g = gate(db, lvl, c)
    if not g.has_content:
        return Recommendation(f"Aprobaste todo el contenido disponible. El nivel {lvl} ({c.level_name(lvl)}) llega en próximas iteraciones. "
                              "Mientras tanto, repasa con ejercicios mixtos.", "/practicar?level=1", "Repasar")
    if g.exam_ready:
        return Recommendation(f"Ya puedes presentar el examen del nivel {lvl} ({c.level_name(lvl)}).",
                              f"/nivel/{lvl}", "Ir al examen")
    weak = [w for w in concept_accuracy(db, lvl) if w[1] < g.min_accuracy]
    if weak:
        cid, acc, n = weak[0]
        title = c.lessons[cid]["title"] if cid in c.lessons else cid
        return Recommendation(f"Hoy: 15 min de «{title}». Tu precisión ahí es de {acc * 100:.0f} % en los últimos {n} ejercicios.",
                              f"/practicar?concept={cid}", "Practicar")
    acc_txt = f" Precisión actual: {g.accuracy * 100:.0f} %." if g.accuracy is not None else ""
    return Recommendation(f"Hoy: 15 min de práctica del nivel {lvl} ({c.level_name(lvl)}). "
                          f"Te faltan {g.remaining} ejercicios para completar la ventana del examen.{acc_txt}",
                          f"/practicar?level={lvl}", "Practicar")
