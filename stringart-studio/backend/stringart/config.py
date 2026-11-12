"""Typed configuration models for every stage of the pipeline.

All physical quantities are in millimetres unless a name says otherwise.
The models are pydantic so they validate API input and serialise cleanly
into the portable project format.
"""
from __future__ import annotations

from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, Field, field_validator


HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class ImageSettings(BaseModel):
    # framing
    zoom: float = Field(1.0, ge=0.2, le=8.0)
    offset_x: float = Field(0.0, ge=-1.0, le=1.0)  # fraction of source width
    offset_y: float = Field(0.0, ge=-1.0, le=1.0)
    rotation: float = Field(0.0, ge=-180, le=180)  # degrees, counter-clockwise
    auto_center: bool = True                        # centre on detected subject
    auto_zoom: bool = True                          # zoom so a detected face is well framed
    auto_levels: bool = True                        # stretch tones to the full range
    # tone
    brightness: float = Field(0.0, ge=-1.0, le=1.0)
    contrast: float = Field(1.0, ge=0.1, le=4.0)
    gamma: float = Field(1.0, ge=0.2, le=5.0)
    exposure: float = Field(0.0, ge=-3.0, le=3.0)   # EV stops
    clahe: float = Field(1.5, ge=0.0, le=8.0)       # local contrast (0 = off)
    sharpness: float = Field(0.4, ge=0.0, le=4.0)
    denoise: float = Field(0.2, ge=0.0, le=1.0)
    threshold: float = Field(0.0, ge=0.0, le=1.0)   # >0 posterises toward 2 tones
    invert: bool = False
    # background / subject
    background_mode: Literal["keep", "simplify", "remove"] = "keep"
    background_strength: float = Field(0.8, ge=0.0, le=1.0)
    # importance map
    edge_emphasis: float = Field(0.6, ge=0.0, le=4.0)
    detail: float = Field(0.5, ge=0.0, le=1.0)      # detail preservation
    face_emphasis: float = Field(0.8, ge=0.0, le=4.0)
    face_detection: bool = True


class BoardSettings(BaseModel):
    shape: Literal["circle", "square", "rectangle"] = "circle"
    diameter_mm: float = Field(300.0, ge=50, le=3000)   # circle diameter / square side
    width_mm: float = Field(300.0, ge=50, le=3000)      # rectangle only
    height_mm: float = Field(400.0, ge=50, le=3000)     # rectangle only
    thickness_mm: float = Field(18.0, ge=1, le=200)
    material: str = "Plywood (black painted)"
    nail_count: int = Field(300, ge=50, le=1000)
    edge_margin_mm: float = Field(6.0, ge=0, le=200)
    nail_diameter_mm: float = Field(1.6, ge=0.3, le=10)
    nail_height_mm: float = Field(14.0, ge=2, le=100)    # exposed height
    numbering: Literal["clockwise", "counterclockwise"] = "clockwise"
    start_angle_deg: float = Field(0.0, ge=-360, le=360)  # 0 = 12 o'clock

    @property
    def size_mm(self) -> Tuple[float, float]:
        if self.shape == "circle" or self.shape == "square":
            return (self.diameter_mm, self.diameter_mm)
        return (self.width_mm, self.height_mm)


class ThreadColor(BaseModel):
    name: str = "Thread"
    hex: str = Field("#ffffff", pattern=HEX_COLOR)
    enabled: bool = True


THREAD_PRESETS = {
    "white_on_black": ("#f4f4f0", "#0b0b0c"),
    "black_on_white": ("#111111", "#f5f3ee"),
    "red_on_black": ("#c41e26", "#0b0b0c"),
    "white_on_wood": ("#f4f4f0", "#9a6b3f"),
    "black_on_wood": ("#111111", "#c9a27a"),
}

PALETTE_PRESETS = {
    "cmyk": ("#ffffff", [("Cyan", "#00a3d9"), ("Magenta", "#d4237a"), ("Yellow", "#f6d40e"), ("Black", "#111111")]),
    "rgb": ("#0b0b0c", [("Red", "#d62a2a"), ("Green", "#2fa84f"), ("Blue", "#2a5bd6"), ("White", "#f4f4f0")]),
    "warm": ("#f5f3ee", [("Black", "#111111"), ("Brick", "#a63d2a"), ("Ochre", "#d39b2a"), ("Navy", "#1f2f5c")]),
}


class ThreadSettings(BaseModel):
    color_mode: Literal["mono", "color"] = "mono"
    preset: str = "white_on_black"
    thread_color: str = Field("#f4f4f0", pattern=HEX_COLOR)
    background_color: str = Field("#0b0b0c", pattern=HEX_COLOR)
    thickness_mm: float = Field(0.15, ge=0.03, le=3.0)
    opacity: float = Field(0.85, ge=0.05, le=1.0)    # optical opacity of one fibre
    max_coverage: float = Field(0.9, ge=0.3, le=0.995)
    tone_physics: float = Field(0.25, ge=0.0, le=1.0)   # 0 = perceptual tone axis, 1 = exact linear-light mix
    palette: List[ThreadColor] = Field(default_factory=lambda: [
        ThreadColor(name=n, hex=h) for n, h in PALETTE_PRESETS["cmyk"][1]])
    palette_background: str = Field("#ffffff", pattern=HEX_COLOR)

    @field_validator("palette")
    @classmethod
    def _max_colors(cls, v):
        if len(v) > 12:
            raise ValueError("at most 12 thread colours are supported")
        return v


GenerationMode = Literal["quality", "balanced", "min_strokes", "contrast", "fast", "custom"]


class GenerationSettings(BaseModel):
    mode: GenerationMode = "balanced"
    max_lines: int = Field(4000, ge=50, le=40000)
    min_improvement: float = Field(0.0005, ge=0.0, le=1.0)  # fraction of first-line gain
    target_quality: float = Field(0.0, ge=0.0, le=0.99)     # stop at this error reduction (0=off)
    resolution: int = Field(220, ge=100, le=1200)           # comparison raster, px across the board
    min_skip: int = Field(0, ge=0, le=200)                  # 0 = auto (nails / 25)
    overshoot_penalty: float = Field(1.0, ge=0.0, le=20.0)
    patience: int = Field(40, ge=0, le=500)
    strategy: Literal["continuous", "hybrid"] = "continuous"
    max_sections: int = Field(1, ge=1, le=500)
    continuity_preference: float = Field(0.35, ge=0.0, le=1.0)
    start_nail: int = Field(1, ge=1)
    color_balance: float = Field(1.0, ge=0.2, le=3.0)       # colour mode: allocation exponent


class RouteSettings(BaseModel):
    mode: Literal["strict", "practical"] = "strict"
    max_bridges: int = Field(20, ge=0, le=500)
    approved_bridges: List[Tuple[int, int]] = Field(default_factory=list)  # 1-based nail numbers


class MaterialSettings(BaseModel):
    knot_allowance_mm: float = Field(150.0, ge=0, le=2000)
    slack_percent: float = Field(5.0, ge=0, le=100)
    waste_percent: float = Field(10.0, ge=0, le=200)
    wrap_style: Literal["contact", "full_loop"] = "contact"
    seconds_per_connection: float = Field(7.0, ge=0.5, le=600)
    seconds_per_section: float = Field(120.0, ge=0, le=3600)
    seconds_per_nail: float = Field(15.0, ge=0, le=600)
    nail_price: float = Field(0.02, ge=0)
    board_price: float = Field(25.0, ge=0)
    thread_price_per_spool: float = Field(6.0, ge=0)
    spool_length_m: float = Field(1000.0, ge=1)
    other_costs: float = Field(5.0, ge=0)
    currency: str = "EUR"


class ProjectSettings(BaseModel):
    image: ImageSettings = Field(default_factory=ImageSettings)
    board: BoardSettings = Field(default_factory=BoardSettings)
    thread: ThreadSettings = Field(default_factory=ThreadSettings)
    generation: GenerationSettings = Field(default_factory=GenerationSettings)
    route: RouteSettings = Field(default_factory=RouteSettings)
    materials: MaterialSettings = Field(default_factory=MaterialSettings)


# ---------------------------------------------------------------- presets
MODE_PRESETS = {
    "quality": dict(max_lines=7000, min_improvement=0.0003, resolution=280, overshoot_penalty=1.0,
                    strategy="hybrid", max_sections=4, continuity_preference=0.30, patience=60),
    "balanced": dict(max_lines=4500, min_improvement=0.0005, resolution=220, overshoot_penalty=1.0,
                     strategy="continuous", max_sections=1, patience=40),
    "min_strokes": dict(max_lines=3000, min_improvement=0.003, resolution=200, overshoot_penalty=1.5,
                        strategy="continuous", max_sections=1, target_quality=0.8, patience=20),
    "contrast": dict(max_lines=4500, min_improvement=0.0005, resolution=220, overshoot_penalty=0.7,
                     strategy="continuous", max_sections=1, patience=40),
    "fast": dict(max_lines=2500, min_improvement=0.002, resolution=160, overshoot_penalty=1.0,
                 strategy="continuous", max_sections=1, patience=20),
}

# image-side adjustments a preset also implies
MODE_IMAGE_HINTS = {
    "contrast": dict(clahe=3.0, edge_emphasis=1.6, face_emphasis=1.4, sharpness=1.0),
}


def apply_mode(gen: GenerationSettings) -> GenerationSettings:
    """Return generation settings with the chosen preset applied (custom = unchanged)."""
    if gen.mode == "custom" or gen.mode not in MODE_PRESETS:
        return gen
    data = gen.model_dump()
    data.update(MODE_PRESETS[gen.mode])
    if gen.mode != "min_strokes":
        data["target_quality"] = 0.0
    return GenerationSettings(**data)


def effective_min_skip(gen: GenerationSettings, nail_count: int) -> int:
    return gen.min_skip if gen.min_skip > 0 else max(2, nail_count // 25)
