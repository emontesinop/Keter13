"""Carga y valida el contenido editable (content/*.yaml).

La validación corre al arrancar. Si un rango está mal escrito o una lección
cita una fuente inexistente, la app no arranca y dice exactamente qué falla.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from .core.ranges import RangeError, parse_range

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content"

POSITIONS_9 = ["UTG", "UTG1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]
POS_LABEL = {"UTG1": "UTG+1"}


def pos_label(p: str) -> str:
    return POS_LABEL.get(p, p)


class ContentError(ValueError):
    pass


@dataclass
class Content:
    sources: dict
    levels: list
    config: dict
    lessons: dict                 # id -> lesson
    questions: dict               # id -> question
    rfi: dict                     # pos -> frozenset
    rfi_order: list
    vs_open: dict                 # spot -> {"3bet": set, "call": set}
    vs_open_groups: dict          # group -> [pos]
    vs_limpers: dict              # group -> {"iso": set, "overlimp": set}
    vs_limpers_groups: dict
    range_text: dict = field(default_factory=dict)  # 'rfi.UTG' -> texto original
    population: dict = field(default_factory=dict)  # nombre -> frozenset
    leaks: dict = field(default_factory=dict)       # tag -> {label, concept, category, advice}
    profiles: dict = field(default_factory=dict)    # id -> {label, call, bet_value, bet_bluff}

    def lessons_for_level(self, level: int) -> list:
        return [l for l in self.lessons.values() if l["level"] == level]

    def level_name(self, level: int) -> str:
        for l in self.levels:
            if l["level"] == level:
                return l["name"]
        return f"Nivel {level}"


def _load(path: Path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _rng(text, where):
    try:
        return parse_range(text or "")
    except RangeError as e:
        raise ContentError(f"{where}: {e}") from e


def load_content(base: Path = CONTENT_DIR) -> Content:
    sources = {s["id"]: s for s in _load(base / "sources.yaml")}
    levels = _load(base / "levels.yaml")
    config = _load(base / "config.yaml")

    lessons: dict = {}
    for p in sorted((base / "lessons").glob("*.yaml")):
        for l in _load(p) or []:
            if l["id"] in lessons:
                raise ContentError(f"Lección duplicada: {l['id']}")
            for s in l.get("sources", []):
                if s["id"] not in sources:
                    raise ContentError(f"{l['id']}: fuente desconocida '{s['id']}'")
            l.setdefault("drills", [])
            lessons[l["id"]] = l

    questions: dict = {}
    for p in sorted((base / "questions").glob("*.yaml")):
        for q in _load(p) or []:
            qid = q["id"]
            if qid in questions:
                raise ContentError(f"Pregunta duplicada: {qid}")
            if not 0 <= q["answer"] < len(q["options"]):
                raise ContentError(f"{qid}: 'answer' fuera de rango")
            if q["concept"] not in lessons and not q.get("diagnostic_only"):
                raise ContentError(f"{qid}: concepto desconocido '{q['concept']}'")
            questions[qid] = q

    rfi_raw = _load(base / "ranges" / "rfi_100bb.yaml")
    texts: dict = {}
    rfi = {pos: _rng(txt, f"rfi.{pos}") for pos, txt in rfi_raw["ranges"].items()}
    texts.update({f"rfi.{p}": t for p, t in rfi_raw["ranges"].items()})
    order = rfi_raw["meta"]["order"]
    for a, b in zip(order, order[1:]):
        missing = rfi[a] - rfi[b]
        if missing:
            raise ContentError(
                f"rfi: {b} debería contener todo el rango de {a}; faltan {sorted(missing)}")

    vo_raw = _load(base / "ranges" / "vs_open.yaml")
    vs_open = {}
    for spot, acts in vo_raw["spots"].items():
        three, call = _rng(acts.get("3bet"), f"vs_open.{spot}.3bet"), _rng(acts.get("call"), f"vs_open.{spot}.call")
        if three & call:
            raise ContentError(f"vs_open.{spot}: 3bet y call se solapan en {sorted(three & call)}")
        vs_open[spot] = {"3bet": three, "call": call}
        texts[f"vs_open.{spot}.3bet"] = acts.get("3bet") or "—"
        texts[f"vs_open.{spot}.call"] = acts.get("call") or "—"

    vl_raw = _load(base / "ranges" / "vs_limpers.yaml")
    vs_limpers = {}
    for grp, acts in vl_raw["spots"].items():
        iso, ol = _rng(acts.get("iso"), f"vs_limpers.{grp}.iso"), _rng(acts.get("overlimp"), f"vs_limpers.{grp}.overlimp")
        if iso & ol:
            raise ContentError(f"vs_limpers.{grp}: iso y overlimp se solapan en {sorted(iso & ol)}")
        vs_limpers[grp] = {"iso": iso, "overlimp": ol}
        texts[f"vs_limpers.{grp}.iso"] = acts.get("iso") or "—"
        texts[f"vs_limpers.{grp}.overlimp"] = acts.get("overlimp") or "—"

    pop_raw = _load(base / "ranges" / "population.yaml")["ranges"]
    population = {k: _rng(v, f"population.{k}") for k, v in pop_raw.items()}
    texts.update({f"population.{k}": v for k, v in pop_raw.items()})
    for a, b in (("vs3bet_4bet", "vs3bet_call_ip"), ("vs3bet_4bet", "vs3bet_call_oop")):
        if population[a] & population[b]:
            raise ContentError(f"population: {a} y {b} se solapan")

    leaks = _load(base / "leaks.yaml")
    for tag, l in leaks.items():
        if l["concept"] not in lessons:
            raise ContentError(f"leaks.{tag}: concepto desconocido '{l['concept']}'")

    profiles = _load(base / "profiles.yaml")
    for pid, p in profiles.items():
        for k in ("call", "bet_value", "bet_bluff"):
            if not 0 <= p[k] <= 1:
                raise ContentError(f"profiles.{pid}.{k} debe estar entre 0 y 1")
        if p["bet_value"] + p["bet_bluff"] > 1:
            raise ContentError(f"profiles.{pid}: valor + farol > 100 %")

    return Content(sources, levels, config, lessons, questions, rfi, order,
                   vs_open, vo_raw["groups"], vs_limpers, vl_raw["groups"], texts, population, leaks, profiles)


@lru_cache(maxsize=1)
def get_content() -> Content:
    return load_content()
