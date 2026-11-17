"""Propiedades de todos los generadores de drills."""
import random
import re

import pytest

from app.content import load_content
from app.core import pokermath as pm
from app.drills import GENERATORS, candidates, generate, pick

C = load_content()
SEEDS = range(1, 13)


@pytest.mark.parametrize("drill_type", sorted(GENERATORS))
def test_generator_properties(drill_type):
    for seed in SEEDS:
        q = generate(drill_type, seed, C)
        values = [v for v, _ in q.options]
        assert q.answer in values, (drill_type, seed)
        assert len(set(values)) == len(values), (drill_type, seed, q.options)
        assert len({l for _, l in q.options}) == len(q.options)
        assert q.explanation and q.prompt
        assert q.concept_id in C.lessons, (drill_type, q.concept_id)
        assert q.level == GENERATORS[drill_type][0]


@pytest.mark.parametrize("drill_type", sorted(GENERATORS))
def test_generator_is_deterministic(drill_type):
    a, b = generate(drill_type, 7, C), generate(drill_type, 7, C)
    assert (a.prompt, a.options, a.answer, a.cards, a.situation) == (b.prompt, b.options, b.answer, b.cards, b.situation)


def test_every_level_0_to_3_has_drills_and_lessons():
    for lvl in range(4):
        gens, quiz = candidates(level=lvl, c=C)
        assert gens and quiz, lvl
        assert C.lessons_for_level(lvl)


def test_every_lesson_drill_exists():
    for l in C.lessons.values():
        for d in l["drills"]:
            assert d in GENERATORS, (l["id"], d)


def test_mdf_answer_matches_formula():
    for seed in SEEDS:
        q = generate("mdf", seed, C)
        pot = int(q.situation[0][1].strip("$"))
        bet = int(re.match(r"\$(\d+)", q.situation[1][1]).group(1))
        assert q.answer == f"{pm.mdf(pot, bet) * 100:.0f} %"


def test_value_bluff_answer_matches_counts():
    for seed in SEEDS:
        q = generate("value_bluff", seed, C)
        v, b = map(int, re.search(r"Valor: (\d+) combos vivos\. Faroles: (\d+)", q.explanation).groups())
        pot = int(re.search(r"bote de (\d+) bb", q.prompt).group(1))
        bet = int(re.search(r"apuesta (\d+) bb", q.prompt).group(1))
        expected = "call" if b / (v + b) >= pm.required_equity(pot, bet) else "fold"
        assert q.answer == expected


def test_pick_by_concept_stays_in_concept():
    rng = random.Random(0)
    for _ in range(30):
        t = pick(rng, concept="l2_mdf", c=C)
        assert generate(t, 1, C).concept_id == "l2_mdf"
