"""Gráficas SVG generadas en el servidor (sin dependencias ni internet)."""
from __future__ import annotations

from math import cos, pi, sin


def _m(x: float) -> str:
    return ("−" if x < 0 else "") + f"${abs(x):,.0f}".replace(",", " ")


def line_chart(values: list[float], width: int = 560, height: int = 180, pad: int = 28) -> str:
    if len(values) < 2:
        return ""
    lo, hi = min(values), max(values)
    if hi == lo:
        hi, lo = hi + 1, lo - 1
    n = len(values)
    xs = [pad + i * (width - 2 * pad) / (n - 1) for i in range(n)]
    ys = [height - pad - (v - lo) * (height - 2 * pad) / (hi - lo) for v in values]
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in zip(xs, ys))
    base_y = height - pad - (values[0] - lo) * (height - 2 * pad) / (hi - lo)
    last = values[-1]
    return (
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="Evolución del bankroll">'
        f'<line x1="{pad}" x2="{width - pad}" y1="{base_y:.1f}" y2="{base_y:.1f}" class="chart-base"/>'
        f'<polyline points="{pts}" class="chart-line" fill="none"/>'
        f'<circle cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="3.5" class="chart-dot"/>'
        f'<text x="{pad}" y="{pad - 10}" class="chart-label">{_m(hi)}</text>'
        f'<text x="{pad}" y="{height - 8}" class="chart-label">{_m(lo)}</text>'
        f'<text x="{width - pad}" y="{ys[-1] - 8:.1f}" text-anchor="end" class="chart-label strong">{_m(last)}</text>'
        "</svg>"
    )


def radar(scores: dict[str, float | None], labels: dict[str, str], size: int = 260) -> str:
    """Radar de habilidades (0-1). None se dibuja como 0 y se marca con '—'."""
    keys = list(scores)
    n = len(keys)
    cx = cy = size / 2
    r = size / 2 - 42

    def pt(i, frac):
        ang = -pi / 2 + 2 * pi * i / n
        return cx + r * frac * cos(ang), cy + r * frac * sin(ang)

    rings = "".join(
        '<polygon class="radar-ring" points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in (pt(i, f) for i in range(n))) + '"/>'
        for f in (0.25, 0.5, 0.75, 1.0))
    axes = "".join(f'<line class="radar-ring" x1="{cx}" y1="{cy}" x2="{pt(i, 1)[0]:.1f}" y2="{pt(i, 1)[1]:.1f}"/>' for i in range(n))
    shape = " ".join(f"{x:.1f},{y:.1f}" for x, y in (pt(i, scores[k] or 0) for i, k in enumerate(keys)))
    text = ""
    for i, k in enumerate(keys):
        x, y = pt(i, 1.22)
        v = scores[k]
        val = "—" if v is None else f"{v * 100:.0f}%"
        text += (f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" class="chart-label">{labels[k]}</text>'
                 f'<text x="{x:.1f}" y="{y + 13:.1f}" text-anchor="middle" class="chart-label strong">{val}</text>')
    return (f'<svg viewBox="0 0 {size} {size}" class="radar" role="img" aria-label="Precisión por habilidad">'
            f'{rings}{axes}<polygon class="radar-shape" points="{shape}"/>{text}</svg>')


def _s(x: float) -> str:
    return ("+" if x >= 0 else "−") + f"{abs(x):,.0f}".replace(",", " ")


def paths_chart(paths: list[list[float]], expected_end: float, width: int = 560, height: int = 220,
                pad: int = 30) -> str:
    """Trayectorias simuladas (finas) + línea esperada (discontinua) + cero."""
    if not paths:
        return ""
    allv = [v for p in paths for v in p] + [0.0, expected_end]
    lo, hi = min(allv), max(allv)
    if hi == lo:
        hi += 1
    n = len(paths[0])
    X = lambda i: pad + i * (width - 2 * pad) / (n - 1)
    Y = lambda v: height - pad - (v - lo) * (height - 2 * pad) / (hi - lo)
    lines = "".join(
        '<polyline class="sim-path" fill="none" points="' + " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(p)) + '"/>'
        for p in paths)
    return (
        f'<svg viewBox="0 0 {width} {height}" class="chart" role="img" aria-label="Trayectorias simuladas">'
        f'<line x1="{pad}" x2="{width - pad}" y1="{Y(0):.1f}" y2="{Y(0):.1f}" class="chart-base"/>'
        f'{lines}'
        f'<line x1="{X(0):.1f}" y1="{Y(0):.1f}" x2="{X(n - 1):.1f}" y2="{Y(expected_end):.1f}" class="sim-exp"/>'
        f'<text x="{pad}" y="{pad - 12}" class="chart-label">{_s(hi)} bb</text>'
        f'<text x="{pad}" y="{height - 10}" class="chart-label">{_s(lo)} bb</text>'
        f'<text x="{width - pad}" y="{Y(expected_end) - 8:.1f}" text-anchor="end" class="chart-label strong">esperado {_s(expected_end)}</text>'
        "</svg>"
    )
