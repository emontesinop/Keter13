from __future__ import annotations

import random
from dataclasses import dataclass, field

from ..core.cards import class_combos


@dataclass
class Question:
    drill_type: str
    seed: int
    level: int
    skill: str
    concept_id: str
    prompt: str
    options: list[tuple[str, str]]          # (valor, etiqueta)
    answer: str
    explanation: str
    situation: list[tuple[str, str]] = field(default_factory=list)
    cards: list[tuple[str, list[str]]] = field(default_factory=list)
    title: str = ""

    def option_label(self, value: str) -> str:
        for v, label in self.options:
            if v == value:
                return label
        return value

    @property
    def answer_label(self) -> str:
        return self.option_label(self.answer)


SKILL_LABEL = {
    "math": "Matemática",
    "preflop": "Preflop",
    "postflop": "Postflop",
    "reading": "Lectura",
    "mental": "Mental",
}


def numeric_options(rng: random.Random, correct: float, distractors, fmt, min_gap: float,
                    n: int = 4) -> tuple[list[tuple[str, str]], str]:
    """Construye n opciones numéricas distintas (tras formatear) con la correcta incluida."""
    labels = [fmt(correct)]
    for d in distractors:
        if len(labels) >= n:
            break
        if d is not None and d >= 0 and all(abs(d - v) >= min_gap for v in [correct]) and fmt(d) not in labels:
            labels.append(fmt(d))
    step = 1
    while len(labels) < n:
        for cand in (correct + step * min_gap * 1.5, correct - step * min_gap * 1.5):
            if cand >= 0 and fmt(cand) not in labels and len(labels) < n:
                labels.append(fmt(cand))
        step += 1
    answer = labels[0]
    rng.shuffle(labels)
    return [(l, l) for l in labels], answer


def concrete_combo(rng: random.Random, hc: str) -> list[str]:
    return list(rng.choice(class_combos(hc)))


def pct(x: float) -> str:
    return f"{x * 100:.0f} %"


def money(x: float) -> str:
    sign = "−" if x < 0 else ""
    return f"{sign}${abs(x):,.0f}".replace(",", " ")


def dec(x: float, digits: int = 2) -> str:
    return f"{x:.{digits}f}".replace(".", ",")
