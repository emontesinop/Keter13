# Algorithms and mathematical model

This document describes what each optimisation module computes and why. The image problem (which
connections to use) and the physical problem (in what order and in how many thread pieces) are kept
separate on purpose.

## 1. Nail geometry (`geometry.py`)

Units are millimetres. The origin is the board centre, +x points right and +y points down (seen from
the front). For a circular board with N nails on a ring of radius `r = D/2 − margin`:

```
θ_k = θ_0 + s · k · 360°/N        s = +1 clockwise, −1 counter-clockwise, θ measured from 12 o'clock
x_k = r · sin θ_k ,   y_k = −r · cos θ_k
```

This is the familiar `x = cx + r·cos a, y = cy + r·sin a` with `a = θ − 90°`. Every nail stores its
number, x/y, compass angle, radius and the chord distance to its neighbours (`2r·sin(π/N)` on a circle).
Square and rectangular boards space nails at equal arc length along the inset perimeter. A connection
between two nails on the same straight side is forbidden, because the thread would lie along the rim.

## 2. Image → target (`imaging.py`)

1. **Framing.** A crop with the board's aspect ratio is centred on the main subject: the largest Haar
   face if one is found, otherwise a mix of spectral-residual saliency and gradient energy. When a face
   is found, the crop is zoomed so the face spans about 40 % of the board. User zoom, offset and rotation
   are then applied with a single affine warp.
2. **Tone.** Perceptual grey, then auto-levels (1–99 percentile), bilateral denoise, CLAHE,
   exposure/contrast/brightness/gamma, unsharp masking and optional soft threshold. The background can
   be simplified or removed using a GrabCut mask (seeded with any faces as certain foreground).
3. **Importance map** `w ≥ 0`, mean 1 inside the board: `1 + edge_emphasis·edges + face_emphasis·faces`,
   damped outside the subject. This tells the optimiser where errors matter most.
4. **Required coverage.** A pixel partially covered by thread looks like the linear-light mix
   `bg + (thread − bg)·C`. The desired perceptual grey is placed on the board→thread axis
   (parameter t) and converted to linear light, then solved for C. A mid grey on a white board
   therefore needs ~78 % black coverage, not 50 %, which is why this is not a simple inversion. Exact
   linear light spends a lot of thread on mid tones such as skin, which hides small dark features.
   `tone_physics` (default 0.25) blends the exact solution with the perceptual position t.

## 3. Thread model and line cache (`raster.py`, `engine.py`)

* One pass of a thread of width `t` px over a pixel covers `c = opacity · t · wf`, where
  `wf = length / major_steps` corrects for the line's slope.
* Overlaps compose like translucent layers: `coverage = 1 − Π(1 − c_k) = 1 − e^(−A)` with optical
  density `A = Σ −ln(1 − c_k)`. Density is **additive and order-independent**, so the optimiser works
  in A, and the monochrome result does not depend on the order in which lines are laid.
* Every valid connection (`min_skip` excludes very short chords) is rasterised once (DDA, one pixel
  per step along the major axis, consecutive duplicates removed). Lines are always rasterised from the
  lower to the higher nail index, so a connection has exactly the same pixels in the optimiser, the
  simulator and every export. The cache uses a per-nail "star" layout: all lines touching nail i are
  stored contiguously, so all candidates from a nail are scored with one gather and one
  `np.add.reduceat`.
* **Comparison resolution.** The image comparison runs on a ~200–300 px raster (0.75–1.5 mm pixels for a
  300 mm board). At that scale each pixel averages several threads, as the eye does at viewing
  distance. Experiments showed that finer rasters reward placing lines exactly on dark pixels and give
  visibly worse results.

## 4. Line selection: greedy error minimisation (`engine.py`)

The objective is

```
E = Σ_p w_p · φ(A*_p − A_p),       φ(r) = r²  (r ≥ 0),   λ·r²  (r < 0)
```

where λ (overshoot penalty) makes over-darkening costlier than leaving a pixel slightly light. This is
what stops thread from piling up in dark regions.

At each step, the exact reduction `ΔE = Σ w(φ(r) − φ(r − d))` is computed for every unused connection
from the current nail, and the best one is taken. Then the canvas and residual are updated
incrementally. Constraints and stopping rules:

* An undirected connection is never used twice (boolean N×N matrix).
* *Patience*: when the best continuation from the current nail is weak but the board still has useful
  lines, a limited number of "transit" moves keep the thread going.
* Stopping rules: maximum connections; best gain below `min_improvement` × the best first-line gain;
  error reduction reaching `target_quality` (minimum-strokes mode); no improving line left.
* *Refinement*: trailing lines whose marginal contribution has become negative are removed. Removing
  lines from the end of a trail never breaks continuity.
* **Strategies.** `continuous` always starts the next line at the current nail, so the selection is
  one trail by construction. `hybrid` may cut the thread and restart at the best line anywhere on the
  board, but only when the local best is below `continuity_preference` × the global best, and never
  more than `max_sections` times. Every cut is reported.

Modes are parameter presets: quality = hybrid, more lines, 280 px; balanced; min strokes = stop at 80 %
error reduction; contrast = stronger CLAHE, edge and face weights and a lower overshoot penalty;
fast = 160 px.

## 5. Colour (`color.py`, `render.py`)

Threads lying side by side mix **partitively** (spatial averaging), not subtractively like ink. With
per-colour densities `A_k`:

```
C = 1 − e^(−ΣA_k),   mix = Σ A_k c_k / ΣA_k,   pixel = (1 − C)·bg + C·mix
```

In coverage shares `a_k = C·A_k/ΣA` this model is linear: `pixel = bg + Σ a_k (c_k − bg)` with
`a_k ≥ 0` and `Σ a_k ≤ C_max`. Every pixel is unmixed into the user's real thread palette by
constrained least squares (vectorised FISTA projected gradient). The result is converted back to
per-colour target densities, and each colour gets its own optimiser run, route and sequence.
Lines are allocated in proportion to each colour's required density (the `color_balance` exponent).
Quality is reported as mean CIE ΔE76 and ΔE2000 in Lab. "CMYK" is offered as a palette of physical
threads; no ink separation is involved.

## 6. Route planning (`route.py`)

Nails are vertices and selected connections are the edges of a simple graph. A thread section is a
trail, in which nails may repeat but connections may not.

* **Lower bound / optimum.** A connected component with 2k > 0 odd-degree nails needs exactly k trails.
  An all-even component needs one closed trail. So `S_min = Σ_components max(1, odd/2)`.
* **Construction.** Odd nails are paired with virtual edges (greedy nearest pairing). Hierholzer's
  algorithm finds an Euler circuit of the augmented graph, and the circuit is cut at the virtual
  edges. This reaches `S_min` exactly.
* The optimiser's own trail order is kept when it is already valid and minimal. Otherwise the route is
  re-decomposed; for monochrome the picture is unchanged because density is order-independent.
  Sections are ordered and oriented so each starts near where the previous one ended.
* **Practical mode.** Bridges are candidate extra connections between odd nails. Each one lowers
  `S_min` by one. They are ranked by visual cost, which is the error increase evaluated on the final
  residual. They are only **proposed**: they are added only after the user approves them, and they
  are marked in every export.
* **Validation.** `validate_sections` checks that the sections use every selected connection
  (+ approved bridges) exactly once and nothing else. Every result is validated before it is
  stored, and the `continuous` flag is only reported after this check.

## 7. Thread length (`materials.py`)

```
length = Σ chords + Σ wraps + slack% + 2 knots per section,   then × (1 + waste%)
wrap at nail v = ((d_nail + d_thread)/2) · (π − φ)   (+2π·r for "full loop" style)
```

Here φ is the angle at v between the incoming and outgoing runs. Spools are rounded up to standard
lengths. Time is connections × s/connection + sections × s/section + nails × s/nail.

## 8. Consistency guarantees (tested)

* The exported step list → re-rendered density equals the optimiser's density (`max |Δ| = 0`).
* No repeated undirected connection in any layer.
* The routes are valid edge decompositions with the minimum number of sections.
* SVG, PDF and DXF templates place nails at the computed millimetre coordinates. DXF uses +Y up, as
  CAD expects, and every file has a 100 mm calibration bar.

## 9. Engine tuning (v2)

`scripts/tune_engine.py` measures how much the **physical render** (real thread width, 1200 px,
downsampled to viewing distance) looks like the processed photo: SSIM after a slight blur, averaged
over the sample images. v1 used `tone_physics = 0.25`, which lightened mid-tones. The optimiser
then filled an already-washed-out target and stopped at about 2,000–2,500 connections, whatever
the user's maximum.

A parameter search (tone mapping, overshoot penalty, comparison resolution, length normalisation,
a perceptual-blur objective, local refinement of the trail, thread width and nail count) gave:

| Setting | Result |
|---|---|
| `tone_physics` 1.0 + max coverage 0.98 (dark thread, light board) | SSIM 0.616 → 0.701 in the isolated search; 0.631 → 0.665 through the full app; lines ≈ 2,700 → 4,600 |
| Light thread on a dark board | best at `tone_physics` 0.5, coverage 0.90, overshoot ≥ 1.0 (0.571 → 0.578); intrinsically harder, because every light line also brightens dark areas |
| Overshoot penalty | 0.7 slightly better than 1–3 |
| Length-normalised ("mean darkness") scoring | worse (0.658 vs 0.687) and over-darkens without a penalty |
| Perceptual-blur objective, local node-swap refinement | no meaningful gain (< 0.003); not used |
| More nails (400) / thinner thread (0.10 mm) | better (0.709 / 0.716 with both) |
| Thicker thread (0.25 mm), fewer nails (200) | worse (0.667 / 0.670) |

`ThreadSettings.auto_tone` (default on) applies these per thread/board contrast direction.
Projects saved by v1 are migrated automatically (`migrate_settings`). The maximum number of
connections is an upper limit. When the optimiser stops earlier, the image is complete for that
thread and board, and more lines would only darken it; the UI says so and suggests thinner thread,
more nails or a larger board.
