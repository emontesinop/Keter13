"""Thread length, material and cost estimation."""
from __future__ import annotations

from typing import Dict, List

import numpy as np

from .config import BoardSettings, MaterialSettings, ThreadSettings
from .geometry import BoardGeometry
from .route import section_length_mm

STANDARD_SPOOLS_M = [50, 100, 200, 250, 500, 1000, 2000, 5000]


def recommend_spool(length_m: float) -> float:
    for s in STANDARD_SPOOLS_M:
        if s >= length_m:
            return float(s)
    return float(np.ceil(length_m / 5000) * 5000)


def layer_thread(geom: BoardGeometry, sections: List[List[int]], board: BoardSettings,
                 thread_mm: float, m: MaterialSettings) -> dict:
    straight = wraps = 0.0
    sec_lengths = []
    for sec in sections:
        s, w = section_length_mm(geom.xy_mm, sec, board.nail_diameter_mm, thread_mm, m.wrap_style)
        knots = 2 * m.knot_allowance_mm
        sec_total = (s + w) * (1 + m.slack_percent / 100) + knots
        sec_lengths.append(sec_total)
        straight += s
        wraps += w
    knots_total = 2 * m.knot_allowance_mm * len(sections)
    slack = (straight + wraps) * m.slack_percent / 100
    total = straight + wraps + slack + knots_total
    with_waste = total * (1 + m.waste_percent / 100)
    return {
        "straight_mm": straight,
        "wrap_mm": wraps,
        "slack_mm": slack,
        "knots_mm": knots_total,
        "total_mm": total,
        "total_with_waste_m": with_waste / 1000,
        "section_lengths_m": [x / 1000 for x in sec_lengths],
        "recommended_spool_m": recommend_spool(with_waste / 1000),
    }


def estimate(geom: BoardGeometry, layers: List[dict], board: BoardSettings, thread: ThreadSettings,
             m: MaterialSettings) -> dict:
    """``layers``: [{"name", "color", "sections"}] with 0-based sections."""
    per_layer = []
    total_m = 0.0
    connections = 0
    sections = 0
    thread_cost = 0.0
    for L in layers:
        t = layer_thread(geom, L["sections"], board, thread.thickness_mm, m)
        n_conn = sum(len(s) - 1 for s in L["sections"])
        spools = int(np.ceil(t["total_with_waste_m"] / m.spool_length_m)) if t["total_with_waste_m"] > 0 else 0
        cost = spools * m.thread_price_per_spool
        per_layer.append({"name": L["name"], "color": L["color"], "connections": n_conn,
                          "sections": len(L["sections"]), "spools_needed": spools, "thread_cost": cost, **t})
        total_m += t["total_with_waste_m"]
        connections += n_conn
        sections += len(L["sections"])
        thread_cost += cost
    seconds = (connections * m.seconds_per_connection + sections * m.seconds_per_section
               + geom.n * m.seconds_per_nail)
    nails_cost = geom.n * m.nail_price
    total_cost = nails_cost + m.board_price + thread_cost + m.other_costs
    return {
        "board": {"width_mm": geom.width_mm, "height_mm": geom.height_mm, "thickness_mm": board.thickness_mm,
                  "material": board.material, "shape": board.shape},
        "nails": {"count": geom.n, "spacing_mm": geom.nail_spacing_mm(), "diameter_mm": board.nail_diameter_mm,
                  "exposed_height_mm": board.nail_height_mm},
        "layers": per_layer,
        "total_connections": connections,
        "total_sections": sections,
        "knots": 2 * sections,
        "cuts": sections,
        "total_thread_m": total_m,
        "construction_time_h": {
            "nailing": geom.n * m.seconds_per_nail / 3600,
            "threading": (connections * m.seconds_per_connection + sections * m.seconds_per_section) / 3600,
            "total": seconds / 3600,
        },
        "costs": {"nails": nails_cost, "board": m.board_price, "thread": thread_cost, "other": m.other_costs,
                  "total": total_cost, "currency": m.currency},
    }
