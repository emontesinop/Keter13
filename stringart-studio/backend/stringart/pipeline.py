"""End-to-end generation pipeline.

    image -> framing/preprocessing -> target densities (mono or colour)
          -> greedy line selection per layer         (image problem)
          -> graph route planning per layer          (physical problem)
          -> render + metrics + materials

The two optimisation problems are deliberately separate: line selection
never sees route cost except through the explicit ``hybrid`` strategy, and
route planning never adds connections unless the user approves a proposed
bridge.
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from . import color as colormod
from .colorsci import hex_to_rgb, linear_to_srgb, srgb_to_linear
from .config import (ProjectSettings, THREAD_PRESETS, apply_mode, effective_min_skip, MODE_IMAGE_HINTS)
from .engine import LayerOptimizer, LayerParams
from .geometry import BoardGeometry
from .imaging import ProcessedImage, preprocess, target_coverage
from .materials import estimate
from .metrics import quality_report
from .raster import LineCache
from .render import composite, layer_density
from .route import canon, plan_route, propose_bridges, min_sections

ProgressFn = Optional[Callable[[dict], None]]

_CACHE_LOCK = threading.Lock()
_CACHES: Dict[tuple, LineCache] = {}


def get_cache(geom: BoardGeometry, resolution: int, min_skip: int) -> LineCache:
    """Line caches are expensive; keep the few most recent configurations."""
    key = (geom.board.model_dump_json(), resolution, min_skip)
    with _CACHE_LOCK:
        c = _CACHES.get(key)
        if c is None:
            c = LineCache(geom, resolution, min_skip)
            if len(_CACHES) >= 3:
                _CACHES.pop(next(iter(_CACHES)))
            _CACHES[key] = c
        return c


def effective_settings(settings: ProjectSettings) -> ProjectSettings:
    s = settings.model_copy(deep=True)
    s.generation = apply_mode(s.generation)
    if s.generation.mode in MODE_IMAGE_HINTS:
        s.image = s.image.model_copy(update=MODE_IMAGE_HINTS[s.generation.mode])
    if s.thread.color_mode == "mono" and s.thread.preset in THREAD_PRESETS:
        th, bg = THREAD_PRESETS[s.thread.preset]
        s.thread.thread_color, s.thread.background_color = th, bg
    return s


def background_hex(s: ProjectSettings) -> str:
    return s.thread.background_color if s.thread.color_mode == "mono" else s.thread.palette_background


def layer_specs(s: ProjectSettings) -> List[Tuple[str, str]]:
    if s.thread.color_mode == "mono":
        return [("Thread", s.thread.thread_color)]
    return [(c.name, c.hex) for c in s.thread.palette if c.enabled]


def board_tone(s: ProjectSettings) -> float:
    """Grey level (1 = white) that leaves the board bare."""
    return float(linear_to_srgb(np.dot(srgb_to_linear(hex_to_rgb(background_hex(s))), [0.2126, 0.7152, 0.0722])))


def process_image(src_rgb: np.ndarray, s: ProjectSettings, resolution: int, faces=None) -> Tuple[BoardGeometry, ProcessedImage]:
    geom = BoardGeometry(s.board)
    tone_bg = board_tone(s)
    # background removal should drive pixels toward "no thread"
    pi = preprocess(src_rgb, geom, resolution, s.image, background_tone=tone_bg, faces=faces)
    return geom, pi


def target_appearance(s: ProjectSettings, pi: ProcessedImage, layers: List[Tuple[str, str]],
                      densities: List[np.ndarray]) -> np.ndarray:
    """What the processed image *should* look like when made of this thread on this board."""
    return composite(densities, [c for _, c in layers], background_hex(s))


def generate(src_rgb: np.ndarray, settings: ProjectSettings, progress: ProgressFn = None,
             cancel: Optional[threading.Event] = None, faces=None) -> Tuple[dict, dict]:
    t_start = time.time()
    s = effective_settings(settings)
    gen = s.generation
    report = progress or (lambda d: None)
    report({"stage": "preprocess", "fraction": 0.02})
    geom, pi = process_image(src_rgb, s, gen.resolution, faces)
    min_skip = effective_min_skip(gen, geom.n)
    report({"stage": "line_cache", "fraction": 0.05})
    t0 = time.time()
    cache = get_cache(geom, gen.resolution, min_skip)
    t_cache = time.time() - t0
    layers = layer_specs(s)
    if not layers:
        raise ValueError("no thread colour enabled")
    bg = background_hex(s)

    # ---------------- target densities
    if s.thread.color_mode == "mono":
        C = target_coverage(pi.tone, layers[0][1], bg, s.thread.max_coverage, s.thread.tone_physics)
        targets = [-np.log1p(-C)]
    else:
        dens, _ = colormod.decompose(pi.color, [c for _, c in layers], bg, s.thread.max_coverage,
                                     s.thread.tone_physics, pi.mask)
        targets = [d * pi.mask for d in dens]
    targets = [t * pi.mask for t in targets]
    intended = target_appearance(s, pi, layers, targets)

    # line budget per layer (colour): proportional to required density^balance
    weights = np.array([float(t.sum()) for t in targets]) ** gen.color_balance
    weights = weights / max(weights.sum(), 1e-9)
    budgets = [max(30, int(round(gen.max_lines * w))) for w in weights]

    thread_px = s.thread.thickness_mm * cache.px_per_mm
    layer_out = []
    densities = []
    n_layers = len(layers)
    for li, ((name, hexc), tgt, budget) in enumerate(zip(layers, targets, budgets)):
        def prog(d, li=li, name=name):
            frac = 0.08 + 0.82 * (li + d["lines"] / max(1, d["max_lines"])) / n_layers
            report({"stage": "optimise", "layer": name, "layer_index": li, "fraction": min(0.9, frac),
                    "lines": d["lines"], "error_reduction": d["error_reduction"],
                    "partial": [[int(v) for v in sec] for sec in d["sections"]]})
        params = LayerParams(max_lines=budget, min_improvement=gen.min_improvement,
                             target_quality=gen.target_quality, overshoot_penalty=gen.overshoot_penalty,
                             strategy=gen.strategy, max_sections=gen.max_sections,
                             continuity_preference=gen.continuity_preference,
                             start_nail=(gen.start_nail - 1) % geom.n, thread_px=thread_px,
                             opacity=s.thread.opacity, patience=gen.patience)
        opt = LayerOptimizer(cache, tgt, pi.importance, params, progress=prog, cancel=cancel)
        res = opt.run()
        edges = res.edges()
        # bridge proposals are scored against the *final* residual of this layer
        proposals = []
        if s.route.mode == "practical" and min_sections(edges) > 1:
            proposals = propose_bridges(
                edges, s.route.max_bridges,
                cost_fn=lambda a, b: -opt.score_line(a, b),
                valid_fn=lambda a, b: cache.is_valid(a, b),
                length_fn=lambda a, b: geom.distance_mm(a, b))
        layer_out.append({
            "name": name, "color": hexc,
            "selected_edges": [[int(a), int(b)] for a, b in edges],
            "optimizer_sections": [[int(v) for v in sec] for sec in res.sections],
            "stats": {"lines": res.n_lines, "stop_reason": res.stop_reason,
                      "error_reduction": 1 - res.final_error / res.initial_error if res.initial_error > 0 else 0.0,
                      "jumps": res.jumps, "trimmed_tail_lines": res.trimmed, "elapsed_s": res.elapsed_s,
                      "budget": budget, "error_curve": [float(x) for x in res.error_curve]},
            "bridges_proposed": [b.to_dict() for b in proposals],
        })
        densities.append(res.density.reshape(cache.height, cache.width))

    result = {
        "id": uuid.uuid4().hex[:12],
        "created": time.time(),
        "settings": s.model_dump(),
        "board": geom.summary(),
        "nails": [n.to_dict() for n in geom.nails()],
        "background": bg,
        "thread_mm": s.thread.thickness_mm,
        "opacity": s.thread.opacity,
        "comparison_resolution": gen.resolution,
        "min_skip": min_skip,
        "candidate_lines": cache.n_lines,
        "layers": layer_out,
        "analysis": pi.analysis,
        "timings": {"line_cache_s": t_cache, "total_s": 0.0},
    }
    report({"stage": "route", "fraction": 0.93})
    finalize(result, s, geom, approved=s.route.approved_bridges, intended=intended, mask=pi.mask)
    result["timings"]["total_s"] = time.time() - t_start
    images = {"processed": pi.tone, "processed_color": pi.color, "framed": pi.framed_rgb,
              "importance": pi.importance / max(1e-6, float(pi.importance.max())), "edges": pi.edges,
              "intended": intended}
    report({"stage": "done", "fraction": 1.0})
    return result, images


def finalize(result: dict, s: ProjectSettings, geom: BoardGeometry, approved, intended=None, mask=None):
    """(Re)compute route, materials and metrics. Safe to call again after approvals."""
    approved_set = {canon(a - 1, b - 1) for a, b in approved}
    xy = geom.xy_mm
    mat_layers = []
    for L in result["layers"]:
        edges = [tuple(e) for e in L["selected_edges"]]
        proposed = {canon(b["from"] - 1, b["to"] - 1) for b in L.get("bridges_proposed", [])}
        extra = sorted(approved_set & proposed)
        plan = plan_route(edges, given_sections=L["optimizer_sections"], extra_edges=extra, xy=xy)
        L["sections"] = [[int(v) for v in sec] for sec in plan.sections]
        L["bridges_applied"] = [[a + 1, b + 1] for a, b in extra]
        L["route"] = {"sections": len(plan.sections), "min_sections": plan.min_sections,
                      "continuous": plan.is_continuous, "components": plan.components,
                      "odd_vertices": plan.odd_vertices, "reordered": plan.reordered,
                      "steps": plan.n_steps, "validated": True,
                      "min_sections_without_bridges": min_sections(edges)}
        mat_layers.append({"name": L["name"], "color": L["color"], "sections": L["sections"]})
    result["materials"] = estimate(geom, mat_layers, s.board, s.thread, s.materials)
    # metrics: compare simulated vs intended appearance at comparison resolution
    res = result["comparison_resolution"]
    if mask is None:
        mask = geom.board_mask(res)
    dens = [layer_density(geom, all_edges(L), res, s.thread.thickness_mm, s.thread.opacity)
            for L in result["layers"]]
    sim = composite(dens, [L["color"] for L in result["layers"]], result["background"])
    if intended is not None:
        result["metrics"] = quality_report(intended, sim, mask)
        result["metrics"]["error_reduction"] = float(np.mean([L["stats"]["error_reduction"] for L in result["layers"]]))
    result["totals"] = {
        "connections": sum(L["route"]["steps"] for L in result["layers"]),
        "unique_connections": sum(len(L["selected_edges"]) + len(L["bridges_applied"]) for L in result["layers"]),
        "bridges": sum(len(L["bridges_applied"]) for L in result["layers"]),
        "sections": sum(L["route"]["sections"] for L in result["layers"]),
    }
    return result


def all_edges(L: dict):
    return [tuple(e) for e in L["selected_edges"]] + [(a - 1, b - 1) for a, b in L.get("bridges_applied", [])]


def build_steps(result: dict) -> List[dict]:
    """Flat, numbered construction sequence (1-based nail numbers)."""
    nails = result["nails"]
    xy = np.array([[n["x_mm"], n["y_mm"]] for n in nails])
    steps = []
    k = 0
    for li, L in enumerate(result["layers"]):
        bridges = {canon(a - 1, b - 1) for a, b in L.get("bridges_applied", [])}
        for si, sec in enumerate(L["sections"]):
            for a, b in zip(sec[:-1], sec[1:]):
                k += 1
                steps.append({"step": k, "layer": li, "color_name": L["name"], "color": L["color"],
                              "section": si + 1, "from": a + 1, "to": b + 1,
                              "distance_mm": round(float(np.hypot(*(xy[a] - xy[b]))), 2),
                              "bridge": canon(a, b) in bridges})
    return steps


def render_result(result: dict, size: int = 1000, upto: Optional[int] = None) -> np.ndarray:
    """sRGB render of the artwork (optionally only the first ``upto`` steps)."""
    s = ProjectSettings(**result["settings"])
    geom = BoardGeometry(s.board)
    steps = build_steps(result)
    if upto is not None:
        steps = steps[:upto]
    per = [[] for _ in result["layers"]]
    for st in steps:
        per[st["layer"]].append((st["from"] - 1, st["to"] - 1))
    dens = [layer_density(geom, e, size, s.thread.thickness_mm, s.thread.opacity) for e in per]
    return composite(dens, [L["color"] for L in result["layers"]], result["background"])
