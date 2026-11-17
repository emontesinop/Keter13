"""Registro de drills. Cada pregunta se regenera de forma determinista a partir
de (drill_type, seed), así que el servidor no guarda estado entre mostrar y corregir.
"""
from __future__ import annotations

import random

from ..content import Content, get_content
from . import mathx, preflop
from .base import Question, SKILL_LABEL  # noqa: F401

GENERATORS: dict = {**mathx.GENERATORS, **preflop.GENERATORS}
QUIZ_PREFIX = "quiz:"


def new_seed() -> int:
    return random.SystemRandom().randrange(1, 2**31)


def generate(drill_type: str, seed: int, c: Content | None = None) -> Question:
    c = c or get_content()
    if drill_type.startswith(QUIZ_PREFIX):
        q = c.questions[drill_type[len(QUIZ_PREFIX):]]
        rng = random.Random(f"{drill_type}:{seed}")
        idx = list(range(len(q["options"])))
        if len(idx) > 2 and not q.get("keep_order"):
            rng.shuffle(idx)
        opts = [(str(i), q["options"][i]) for i in idx]
        return Question(drill_type, seed, q["level"], q["skill"], q["concept"], q["prompt"],
                        opts, str(q["answer"]), q["explanation"])
    level, gen = GENERATORS[drill_type]
    q = gen(random.Random(f"{drill_type}:{seed}"), c)
    q.drill_type, q.seed, q.level = drill_type, seed, level
    return q


def candidates(level: int | None = None, concept: str | None = None,
               c: Content | None = None, include_diagnostic: bool = False) -> tuple[list[str], list[str]]:
    """(generadores, quizzes) que aplican al filtro."""
    c = c or get_content()
    if concept:
        lesson = c.lessons[concept]
        gens = [d for d in lesson["drills"] if d in GENERATORS]
        quiz = [QUIZ_PREFIX + q["id"] for q in c.questions.values() if q["concept"] == concept]
    else:
        gens = [t for t, (lvl, _) in GENERATORS.items() if lvl == level]
        quiz = [QUIZ_PREFIX + q["id"] for q in c.questions.values()
                if q["level"] == level and (include_diagnostic or not q.get("diagnostic_only"))]
    return gens, quiz


def pick(rng: random.Random, level: int | None = None, concept: str | None = None,
         c: Content | None = None, p_quiz: float = 0.2) -> str:
    gens, quiz = candidates(level, concept, c)
    if not gens and not quiz:
        raise LookupError("No hay ejercicios para este filtro")
    if quiz and (not gens or rng.random() < p_quiz):
        return rng.choice(quiz)
    return rng.choice(gens)


def grade(drill_type: str, seed: int, user_answer: str) -> tuple[Question, bool]:
    q = generate(drill_type, seed)
    return q, user_answer == q.answer
