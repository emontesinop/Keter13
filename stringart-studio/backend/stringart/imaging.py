"""Image import, framing, preprocessing and analysis.

The output of this module is a *tone image* in [0, 1] (1 = white) framed
exactly onto the board raster, plus an *importance map* that tells the
optimiser where accuracy matters most (edges, faces, detail).
"""
from __future__ import annotations

import io
import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from .colorsci import hex_to_rgb, relative_luminance, srgb_to_linear, linear_to_srgb
from .config import ImageSettings
from .geometry import BoardGeometry

SUPPORTED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif")


# ------------------------------------------------------------------ loading
def load_image(src) -> np.ndarray:
    """Load any PIL-readable image (path or bytes) as float32 RGB in [0,1].

    EXIF orientation is honoured; transparency is composited onto white.
    """
    if isinstance(src, (bytes, bytearray)):
        im = Image.open(io.BytesIO(src))
    else:
        im = Image.open(src)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    if im.mode == "I;16" or im.mode == "I":
        arr = np.asarray(im, dtype=np.float32)
        arr = arr / max(1.0, float(arr.max()))
        return np.repeat(arr[..., None], 3, axis=2)
    im = im.convert("RGB")
    arr = np.asarray(im, dtype=np.float32) / 255.0
    # bound working size; very large photos add nothing at string-art resolution
    h, w = arr.shape[:2]
    m = max(h, w)
    if m > 2400:
        s = 2400 / m
        arr = cv2.resize(arr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return arr


# ------------------------------------------------------------------ detection
_FACE_CASCADE = None


def detect_faces(rgb: np.ndarray) -> List[Tuple[float, float, float, float]]:
    """Return face boxes as fractions (x, y, w, h) of the image size."""
    global _FACE_CASCADE
    try:
        if _FACE_CASCADE is None:
            path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
            _FACE_CASCADE = cv2.CascadeClassifier(path)
        if _FACE_CASCADE.empty():
            return []
    except Exception:
        return []
    gray = (cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY))
    h, w = gray.shape
    s = 640 / max(h, w) if max(h, w) > 640 else 1.0
    small = cv2.resize(gray, (int(w * s), int(h * s))) if s != 1.0 else gray
    small = cv2.equalizeHist(small)
    min_side = max(24, int(min(small.shape) * 0.08))
    faces = _FACE_CASCADE.detectMultiScale(small, scaleFactor=1.1, minNeighbors=6,
                                           minSize=(min_side, min_side))
    out = []
    for (x, y, fw, fh) in (faces if len(faces) else []):
        out.append((x / small.shape[1], y / small.shape[0], fw / small.shape[1], fh / small.shape[0]))
    out.sort(key=lambda b: -b[2] * b[3])
    return out[:4]


def saliency_map(gray: np.ndarray) -> np.ndarray:
    """Spectral-residual saliency (Hou & Zhang 2007), normalised to [0,1]."""
    small = cv2.resize(gray.astype(np.float32), (128, 128), interpolation=cv2.INTER_AREA)
    f = np.fft.fft2(small)
    log_amp = np.log(np.abs(f) + 1e-6)
    phase = np.angle(f)
    resid = log_amp - cv2.blur(log_amp, (3, 3))
    sal = np.abs(np.fft.ifft2(np.exp(resid + 1j * phase))) ** 2
    sal = cv2.GaussianBlur(sal, (0, 0), 3)
    sal = cv2.resize(sal, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_LINEAR)
    sal -= sal.min()
    return sal / (sal.max() + 1e-9)


def subject_center(rgb: np.ndarray, faces) -> Tuple[float, float]:
    """Centre of the main subject as image fractions."""
    if faces:
        x, y, w, h = faces[0]
        # frame a portrait with the face slightly above centre
        return (x + w / 2, min(1.0, y + h * 0.85))
    gray = relative_luminance(rgb).astype(np.float32)
    sal = saliency_map(gray)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    wmap = sal * 0.6 + cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 8) * 0.4
    wmap = wmap ** 2
    tot = wmap.sum()
    if tot <= 0:
        return (0.5, 0.5)
    yy, xx = np.mgrid[0:gray.shape[0], 0:gray.shape[1]]
    cx = float((wmap * xx).sum() / tot / gray.shape[1])
    cy = float((wmap * yy).sum() / tot / gray.shape[0])
    # pull toward the geometric centre so framing stays conservative
    return (0.5 + (cx - 0.5) * 0.6, 0.5 + (cy - 0.5) * 0.6)


# ------------------------------------------------------------------ framing
def frame_image(rgb: np.ndarray, out_w: int, out_h: int, s: ImageSettings,
                center: Tuple[float, float]) -> np.ndarray:
    """Crop / zoom / rotate the source so it fills an out_w x out_h raster."""
    H, W = rgb.shape[:2]
    aspect = out_w / out_h
    # largest crop of the output aspect that fits in the source, then zoom in
    if W / H > aspect:
        crop_h = H
        crop_w = H * aspect
    else:
        crop_w = W
        crop_h = W / aspect
    crop_w /= s.zoom
    crop_h /= s.zoom
    cx = center[0] * W + s.offset_x * W
    cy = center[1] * H + s.offset_y * H
    # keep the crop inside the image when possible (no rotation case)
    if s.rotation == 0 and s.zoom >= 1.0:
        cx = float(np.clip(cx, crop_w / 2, W - crop_w / 2))
        cy = float(np.clip(cy, crop_h / 2, H - crop_h / 2))
    scale = out_w / crop_w
    M = cv2.getRotationMatrix2D((cx, cy), s.rotation, scale)
    M[0, 2] += out_w / 2 - cx
    M[1, 2] += out_h / 2 - cy
    border = (1.0, 1.0, 1.0)
    return cv2.warpAffine(rgb, M, (out_w, out_h), flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=border)


def transform_boxes(boxes, src_shape, out_w, out_h, s: ImageSettings, center):
    """Map face boxes from source fractions into the framed raster (pixels)."""
    H, W = src_shape[:2]
    aspect = out_w / out_h
    if W / H > aspect:
        crop_h, crop_w = H, H * aspect
    else:
        crop_w, crop_h = W, W / aspect
    crop_w /= s.zoom
    crop_h /= s.zoom
    cx = center[0] * W + s.offset_x * W
    cy = center[1] * H + s.offset_y * H
    if s.rotation == 0 and s.zoom >= 1.0:
        cx = float(np.clip(cx, crop_w / 2, W - crop_w / 2))
        cy = float(np.clip(cy, crop_h / 2, H - crop_h / 2))
    scale = out_w / crop_w
    M = cv2.getRotationMatrix2D((cx, cy), s.rotation, scale)
    M[0, 2] += out_w / 2 - cx
    M[1, 2] += out_h / 2 - cy
    out = []
    for (x, y, w, h) in boxes:
        pts = np.array([[x * W, y * H, 1], [(x + w) * W, (y + h) * H, 1]])
        p = pts @ M.T
        x0, y0 = p[0]
        x1, y1 = p[1]
        out.append((float(min(x0, x1)), float(min(y0, y1)), float(abs(x1 - x0)), float(abs(y1 - y0))))
    return out


def auto_zoom_settings(rgb, faces, out_w, out_h, s: ImageSettings) -> ImageSettings:
    """Increase zoom so the main face spans ~40 % of the board width."""
    if not (s.auto_zoom and s.auto_center and faces):
        return s
    H, W = rgb.shape[:2]
    aspect = out_w / out_h
    crop_w = H * aspect if W / H > aspect else W
    face_w = faces[0][2] * W
    z = float(np.clip(crop_w / (face_w / 0.40), 1.0, 3.0))
    return s.model_copy(update={"zoom": s.zoom * z})


# ------------------------------------------------------------------ segmentation
def segment_subject(rgb: np.ndarray, faces_px) -> np.ndarray:
    """Soft foreground mask in [0,1] using GrabCut initialised from the framing."""
    h, w = rgb.shape[:2]
    img8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    s = 320 / max(h, w)
    small = cv2.resize(img8, (max(8, int(w * s)), max(8, int(h * s))), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    mask = np.full((sh, sw), cv2.GC_PR_BGD, np.uint8)
    mx, my = int(sw * 0.08), int(sh * 0.06)
    mask[my:sh - 2, mx:sw - mx] = cv2.GC_PR_FGD
    mask[:3, :] = cv2.GC_BGD
    mask[:, :3] = cv2.GC_BGD
    mask[:, -3:] = cv2.GC_BGD
    for (x, y, fw, fh) in faces_px:
        x0, y0 = int(x * s + fw * s * 0.2), int(y * s + fh * s * 0.2)
        x1, y1 = int((x + fw) * s - fw * s * 0.2), int((y + fh) * s - fh * s * 0.2)
        mask[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, mask, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return np.ones((h, w), np.float32)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1.0, 0.0).astype(np.float32)
    # keep the largest component, soften the edge
    n, lab, stats, _ = cv2.connectedComponentsWithStats((fg > 0).astype(np.uint8))
    if n > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = (lab == biggest).astype(np.float32)
    fg = cv2.resize(fg, (w, h), interpolation=cv2.INTER_LINEAR)
    fg = cv2.GaussianBlur(fg, (0, 0), max(1.0, w / 160))
    if fg.mean() < 0.03:  # segmentation failed: keep everything
        return np.ones((h, w), np.float32)
    return np.clip(fg, 0, 1)


# ------------------------------------------------------------------ preprocessing
@dataclass
class ProcessedImage:
    framed_rgb: np.ndarray            # framed colour image, sRGB [0,1]
    tone: np.ndarray                  # processed grayscale, 1 = white
    color: np.ndarray                 # processed colour (same tone pipeline), sRGB [0,1]
    importance: np.ndarray            # >= 0, mean ~1 inside the board
    edges: np.ndarray                 # [0,1]
    subject: Optional[np.ndarray]     # [0,1] foreground mask or None
    mask: np.ndarray                  # board mask (bool)
    faces_px: list = field(default_factory=list)
    center: Tuple[float, float] = (0.5, 0.5)
    analysis: dict = field(default_factory=dict)


def _tone_curve(v: np.ndarray, s: ImageSettings) -> np.ndarray:
    if s.exposure:
        v = linear_to_srgb(srgb_to_linear(v) * (2.0 ** s.exposure))
    v = (v - 0.5) * s.contrast + 0.5 + s.brightness * 0.5
    v = np.clip(v, 0, 1)
    if s.gamma != 1.0:
        v = np.power(v, 1.0 / s.gamma)
    return v


def preprocess(rgb_src: np.ndarray, geom: BoardGeometry, resolution: int, s: ImageSettings,
               background_tone: float, faces=None) -> ProcessedImage:
    """Frame and process the source image for a board raster of ``resolution`` px.

    ``background_tone`` is the grey level (1 = white) that shows the bare board,
    used when simplifying/removing the background.
    """
    w, h, _ = geom.pixel_frame(resolution)
    if faces is None:
        faces = detect_faces(rgb_src) if s.face_detection else []
    center = subject_center(rgb_src, faces) if s.auto_center else (0.5, 0.5)
    s = auto_zoom_settings(rgb_src, faces, w, h, s)
    framed = frame_image(rgb_src, w, h, s, center)
    faces_px = transform_boxes(faces, rgb_src.shape, w, h, s, center)
    faces_px = [b for b in faces_px if b[0] + b[2] > 0 and b[1] + b[3] > 0 and b[0] < w and b[1] < h]

    # --- grayscale + colour working copies
    gray = relative_luminance(framed)
    gray = linear_to_srgb(gray)  # perceptual grey
    color = framed.copy()
    if s.auto_levels:
        inner = geom.board_mask(resolution)
        lo, hi = np.percentile(gray[inner], [1.0, 99.0])
        if hi - lo > 0.05:
            gray = np.clip((gray - lo) / (hi - lo), 0, 1)
            color = np.clip((color - lo) / (hi - lo), 0, 1)

    if s.denoise > 0:
        d = int(3 + 6 * s.denoise)
        sigma = 0.05 + 0.15 * s.denoise
        gray = cv2.bilateralFilter(gray.astype(np.float32), d, sigma, d)
        color = cv2.bilateralFilter(color.astype(np.float32), d, sigma, d)

    if s.clahe > 0:
        tiles = max(2, int(round(min(w, h) / 64)))
        cl = cv2.createCLAHE(clipLimit=float(s.clahe), tileGridSize=(tiles, tiles))
        g8 = (np.clip(gray, 0, 1) * 255).astype(np.uint8)
        g_eq = cl.apply(g8).astype(np.float32) / 255.0
        # apply the same luminance change to colour
        ratio = (g_eq + 0.02) / (gray + 0.02)
        color = np.clip(color * ratio[..., None], 0, 1)
        gray = g_eq

    gray = _tone_curve(gray, s)
    color = _tone_curve(color, s)

    if s.sharpness > 0:
        sig = max(0.6, w / 400)
        blur = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), sig)
        gray = np.clip(gray + s.sharpness * (gray - blur), 0, 1)
        cblur = cv2.GaussianBlur(color.astype(np.float32), (0, 0), sig)
        color = np.clip(color + s.sharpness * (color - cblur), 0, 1)

    if s.threshold > 0:
        # soft posterisation: push tones toward black/white around the median
        t = float(np.median(gray))
        k = 4 + 40 * s.threshold
        hard = 1 / (1 + np.exp(-k * (gray - t)))
        gray = (1 - s.threshold) * gray + s.threshold * hard

    subject = None
    if s.background_mode != "keep":
        subject = segment_subject(framed, faces_px)
        bg_w = (1 - subject) * s.background_strength
        if s.background_mode == "simplify":
            soft = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), max(2, w / 60))
            soft = soft * 0.5 + background_tone * 0.5
            gray = gray * (1 - bg_w) + soft * bg_w
        else:
            gray = gray * (1 - bg_w) + background_tone * bg_w
        bg_rgb = np.full(3, background_tone, dtype=np.float32)
        color = color * (1 - bg_w[..., None]) + bg_rgb * bg_w[..., None]

    if s.invert:
        gray = 1 - gray
        color = 1 - color

    gray = np.clip(gray, 0, 1).astype(np.float32)
    color = np.clip(color, 0, 1).astype(np.float32)
    mask = geom.board_mask(resolution)

    edges = edge_map(gray, s.detail)
    importance = importance_map(gray, edges, faces_px, subject, mask, s)
    analysis = analyse(gray, edges, mask, faces_px, subject)
    return ProcessedImage(framed_rgb=framed.astype(np.float32), tone=gray, color=color,
                          importance=importance, edges=edges, subject=subject, mask=mask,
                          faces_px=faces_px, center=center, analysis=analysis)


def edge_map(gray: np.ndarray, detail: float) -> np.ndarray:
    """Edge strength in [0,1]; ``detail`` (0..1) selects finer structure."""
    h, w = gray.shape
    sig = max(0.5, (w / 300) * (2.2 - 1.8 * detail))
    g = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), sig)
    gx = cv2.Scharr(g, cv2.CV_32F, 1, 0)
    gy = cv2.Scharr(g, cv2.CV_32F, 0, 1)
    mag = np.hypot(gx, gy)
    hi = np.percentile(mag, 98) + 1e-6
    mag = np.clip(mag / hi, 0, 1)
    g8 = (g * 255).astype(np.uint8)
    canny = cv2.Canny(g8, 40, 110).astype(np.float32) / 255.0
    canny = cv2.GaussianBlur(canny, (0, 0), max(0.8, w / 400))
    canny /= canny.max() + 1e-6
    return np.clip(0.6 * mag + 0.4 * canny, 0, 1).astype(np.float32)


def importance_map(gray, edges, faces_px, subject, mask, s: ImageSettings) -> np.ndarray:
    h, w = gray.shape
    imp = np.ones((h, w), np.float32)
    imp += s.edge_emphasis * cv2.GaussianBlur(edges, (0, 0), max(1.0, w / 250))
    if faces_px and s.face_emphasis > 0:
        fm = np.zeros((h, w), np.float32)
        for (x, y, fw, fh) in faces_px:
            cx, cy = x + fw / 2, y + fh / 2
            cv2.ellipse(fm, (int(cx), int(cy)), (max(1, int(fw * 0.62)), max(1, int(fh * 0.8))),
                        0, 0, 360, 1.0, -1)
        fm = cv2.GaussianBlur(fm, (0, 0), max(2.0, w / 80))
        imp += s.face_emphasis * fm
    if subject is not None:
        imp *= 0.6 + 0.4 * subject
    imp *= mask
    m = imp[mask].mean() if mask.any() else 1.0
    return (imp / (m + 1e-9)).astype(np.float32)


def analyse(gray, edges, mask, faces_px, subject) -> dict:
    vals = gray[mask]
    hist, _ = np.histogram(vals, bins=64, range=(0, 1))
    local_var = cv2.GaussianBlur(gray ** 2, (0, 0), 3) - cv2.GaussianBlur(gray, (0, 0), 3) ** 2
    detail_frac = float((local_var[mask] > 0.004).mean())
    p2, p98 = np.percentile(vals, [2, 98])
    stats = {
        "mean_brightness": float(vals.mean()),
        "contrast_std": float(vals.std()),
        "dynamic_range": float(p98 - p2),
        "dark_fraction": float((vals < 0.33).mean()),
        "mid_fraction": float(((vals >= 0.33) & (vals < 0.66)).mean()),
        "light_fraction": float((vals >= 0.66).mean()),
        "edge_density": float((edges[mask] > 0.3).mean()),
        "detail_fraction": detail_frac,
        "faces": [list(map(float, b)) for b in faces_px],
        "subject_fraction": float(subject[mask].mean()) if subject is not None else None,
        "histogram": hist.astype(int).tolist(),
    }
    notes = []
    if stats["dynamic_range"] < 0.45:
        notes.append("Low dynamic range: raise contrast or local contrast (CLAHE).")
    if stats["mean_brightness"] > 0.75:
        notes.append("Very bright image: consider lowering exposure or brightness.")
    if stats["mean_brightness"] < 0.25:
        notes.append("Very dark image: consider raising exposure or brightness.")
    if stats["edge_density"] > 0.35:
        notes.append("Busy image: lower detail or remove/simplify the background for clarity.")
    if faces_px:
        notes.append(f"{len(faces_px)} face(s) detected: facial area is prioritised.")
    stats["notes"] = notes
    return stats


# ------------------------------------------------------------------ target mapping
def target_coverage(tone: np.ndarray, thread_hex: str, background_hex: str, max_cov: float,
                    physics: float = 1.0) -> np.ndarray:
    """Physical thread coverage needed per pixel to reproduce the tone image.

    The visible colour of a pixel partially covered by thread is the linear-light
    mix ``bg + (thread - bg) * C``.  The desired perceptual grey is interpolated
    between the board and thread luminance, converted to linear light, then
    solved for C.  This is *not* a naive inversion: e.g. a mid-grey on a white
    board needs ~78 % black coverage, not 50 %.
    """
    Lt = float(relative_luminance(hex_to_rgb(thread_hex)))
    Lb = float(relative_luminance(hex_to_rgb(background_hex)))
    vt, vb = float(linear_to_srgb(Lt)), float(linear_to_srgb(Lb))
    if abs(vt - vb) < 0.05:
        raise ValueError("thread and background colours are too similar in brightness")
    # position of each pixel along the board->thread perceptual axis
    t = (tone - vb) / (vt - vb)
    t = np.clip(t, 0, 1)
    desired_v = vb + (vt - vb) * t
    desired_lin = srgb_to_linear(desired_v)
    C_phys = (desired_lin - Lb) / (Lt - Lb)
    # ``physics`` blends the exact linear-light requirement with the perceptual
    # axis position t.  Pure linear light demands a lot of thread in mid tones
    # (skin, sky), which drowns small dark features; a perceptual bias keeps
    # light regions open and spends thread on structure.
    C = physics * C_phys + (1 - physics) * t
    return np.clip(C, 0, max_cov).astype(np.float32)


def to_png_bytes(arr: np.ndarray) -> bytes:
    a = np.clip(arr, 0, 1)
    a8 = (a * 255).astype(np.uint8)
    im = Image.fromarray(a8)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()
