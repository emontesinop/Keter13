"""HTTP API (FastAPI) and static hosting of the built frontend."""
from __future__ import annotations

import base64
import io
import os
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__, jobs, project as store
from .config import (MODE_PRESETS, PALETTE_PRESETS, THREAD_PRESETS, ProjectSettings, effective_min_skip, resolve_tone)
from .exports import media, pdf, vector
from .geometry import BoardGeometry
from .imaging import target_coverage, to_png_bytes
from .pipeline import (build_steps, effective_settings, finalize, generate, layer_specs, process_image,
                       background_hex, target_appearance)
from .render import apply_board_shape, board_diagram, to_uint8
from . import color as colormod

app = FastAPI(title="StringArt Studio", version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _404(e):
    raise HTTPException(404, f"not found: {e}")


def _png(arr: np.ndarray) -> bytes:
    return to_png_bytes(arr)


def _b64(arr: np.ndarray) -> str:
    return "data:image/png;base64," + base64.b64encode(_png(arr)).decode()


# ------------------------------------------------------------------ meta
@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__}


@app.get("/api/defaults")
def defaults():
    return {
        "settings": ProjectSettings().model_dump(),
        "modes": MODE_PRESETS,
        "thread_presets": {k: {"thread": v[0], "background": v[1]} for k, v in THREAD_PRESETS.items()},
        "palette_presets": {k: {"background": v[0], "colors": [{"name": n, "hex": h} for n, h in v[1]]}
                            for k, v in PALETTE_PRESETS.items()},
    }


# ------------------------------------------------------------------ projects
@app.get("/api/projects")
def projects():
    return store.list_projects()


@app.post("/api/projects")
async def create(file: UploadFile = File(...), name: str = Form("")):
    data = await file.read()
    if len(data) > 60 * 1024 * 1024:
        raise HTTPException(413, "image too large (60 MB max)")
    try:
        return store.create_project(name, file.filename or "image.png", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"could not read image: {e}")


@app.post("/api/projects/import")
async def import_project(file: UploadFile = File(...)):
    try:
        return store.import_saproj(await file.read())
    except Exception as e:
        raise HTTPException(400, f"invalid project file: {e}")


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    try:
        return store.get_project(pid)
    except KeyError as e:
        _404(e)


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    settings: Optional[dict] = None


@app.patch("/api/projects/{pid}")
def patch_project(pid: str, body: ProjectPatch):
    try:
        return store.update_project(pid, name=body.name, settings=body.settings)
    except KeyError as e:
        _404(e)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    store.delete_project(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/duplicate")
def duplicate(pid: str):
    try:
        return store.duplicate_project(pid)
    except (KeyError, FileNotFoundError) as e:
        _404(e)


@app.get("/api/projects/{pid}/source")
def source(pid: str):
    try:
        return FileResponse(store.source_path(pid))
    except KeyError as e:
        _404(e)


@app.get("/api/projects/{pid}/export.saproj")
def export_project(pid: str):
    try:
        meta = store.get_project(pid)
        data = store.export_saproj(pid)
    except KeyError as e:
        _404(e)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{_safe(meta["name"])}.saproj"'})


def _safe(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_ " else "_" for ch in name).strip() or "stringart"


# ------------------------------------------------------------------ live preview / analysis
@app.post("/api/projects/{pid}/preview")
def preview(pid: str, settings: Optional[dict] = Body(None), size: int = Query(360, ge=120, le=900)):
    """Fast preview of framing/processing for the current (or supplied) settings."""
    try:
        meta = store.get_project(pid)
        rgb = store.source_rgb(pid)
    except KeyError as e:
        _404(e)
    s = effective_settings(ProjectSettings(**(settings or meta["settings"])))
    geom, pi = process_image(rgb, s, size, faces=store.faces(pid))
    layers = layer_specs(s)
    bg = background_hex(s)
    darkest = min((c for _, c in layers), key=lambda h: sum(int(h[i:i + 2], 16) for i in (1, 3, 5)))
    physics, cmax, _ = resolve_tone(layers[0][1] if s.thread.color_mode == "mono" else darkest, bg, s.thread, 1.0)
    if s.thread.color_mode == "mono":
        C = target_coverage(pi.tone, layers[0][1], bg, cmax, physics)
        dens = [-np.log1p(-C) * pi.mask]
    else:
        d, _ = colormod.decompose(pi.color, [c for _, c in layers], bg, cmax, physics, pi.mask)
        dens = [x * pi.mask for x in d]
    intended = apply_board_shape(target_appearance(s, pi, layers, dens), geom, bg)
    sub = pi.subject if pi.subject is not None else np.ones_like(pi.tone)
    return {
        "analysis": pi.analysis,
        "faces_px": pi.faces_px,
        "size": [int(pi.tone.shape[1]), int(pi.tone.shape[0])],
        "images": {
            "framed": _b64(pi.framed_rgb),
            "processed": _b64(pi.tone if s.thread.color_mode == "mono" else pi.color),
            "edges": _b64(pi.edges),
            "importance": _b64(pi.importance / max(1e-6, float(pi.importance.max()))),
            "subject": _b64(sub),
            "intended": _b64(intended),
        },
    }


@app.post("/api/geometry")
def geometry(board: dict = Body(...)):
    s = ProjectSettings(board=board)
    g = BoardGeometry(s.board)
    return {"summary": g.summary(), "nails": [n.to_dict() for n in g.nails()]}


@app.post("/api/template/{kind}")
def template_only(kind: str, board: dict = Body(...)):
    """Nail template exports without needing a generated artwork."""
    g = BoardGeometry(ProjectSettings(board=board).board)
    return _template(kind, g, "template")


def _template(kind, g, base):
    if kind == "pdf":
        return _file(pdf.template_fullsize_pdf(g), f"{base}_fullscale.pdf", "application/pdf")
    if kind == "a4.pdf":
        return _file(pdf.template_tiled_pdf(g), f"{base}_A4_tiled.pdf", "application/pdf")
    if kind == "svg":
        return _file(vector.template_svg(g), f"{base}.svg", "image/svg+xml")
    if kind == "dxf":
        return _file(vector.template_dxf(g), f"{base}.dxf", "application/dxf")
    if kind == "nc":
        return _file(vector.drilling_gcode(g), f"{base}_drill.nc", "text/plain")
    raise HTTPException(404, "unknown template format")


# ------------------------------------------------------------------ generation
@app.post("/api/projects/{pid}/generate")
def start_generate(pid: str, settings: Optional[dict] = Body(None)):
    try:
        if settings:
            store.update_project(pid, settings=settings)
        meta = store.get_project(pid)
        rgb = store.source_rgb(pid)
    except KeyError as e:
        _404(e)
    s = ProjectSettings(**meta["settings"])
    faces = store.faces(pid)

    def work(progress, cancel):
        result, images = generate(rgb, s, progress=progress, cancel=cancel, faces=faces)
        geom = BoardGeometry(ProjectSettings(**result["settings"]).board)
        from .pipeline import render_result
        prev = apply_board_shape(render_result(result, 900), geom, result["background"])
        summary = store.save_version(pid, result, images, _png(prev))
        return {"version": summary}
    jid = jobs.submit("generate", work, {"project": pid})
    return {"job_id": jid}


@app.get("/api/jobs/{jid}")
def job(jid: str):
    try:
        return jobs.get(jid)
    except KeyError as e:
        _404(e)


@app.delete("/api/jobs/{jid}")
def cancel_job(jid: str):
    try:
        jobs.cancel(jid)
    except KeyError as e:
        _404(e)
    return {"ok": True}


# ------------------------------------------------------------------ versions
@app.get("/api/projects/{pid}/versions/{vid}")
def version(pid: str, vid: str):
    try:
        return store.load_version(pid, vid)
    except KeyError as e:
        _404(e)


@app.delete("/api/projects/{pid}/versions/{vid}")
def delete_version(pid: str, vid: str):
    store.delete_version(pid, vid)
    return {"ok": True}


@app.patch("/api/projects/{pid}/versions/{vid}")
def rename_version(pid: str, vid: str, label: str = Body(..., embed=True)):
    store.rename_version(pid, vid, label)
    return {"ok": True}


@app.get("/api/projects/{pid}/versions/{vid}/steps")
def steps(pid: str, vid: str):
    try:
        return build_steps(store.load_version(pid, vid))
    except KeyError as e:
        _404(e)


@app.get("/api/projects/{pid}/versions/{vid}/image/{name}")
def version_image(pid: str, vid: str, name: str):
    try:
        return FileResponse(store.version_file(pid, vid, name))
    except KeyError as e:
        _404(e)


class RouteBody(BaseModel):
    approved_bridges: List[Tuple[int, int]] = []


@app.post("/api/projects/{pid}/versions/{vid}/route")
def reroute(pid: str, vid: str, body: RouteBody):
    """Apply (or clear) user-approved bridge connections and re-plan the route."""
    try:
        result = store.load_version(pid, vid)
    except KeyError as e:
        _404(e)
    s = ProjectSettings(**result["settings"])
    s.route.approved_bridges = [tuple(b) for b in body.approved_bridges]
    result["settings"] = s.model_dump()
    geom = BoardGeometry(s.board)
    intended = np.load(store.version_file(pid, vid, "intended.npy")).astype(np.float32)
    finalize(result, s, geom, approved=s.route.approved_bridges, intended=intended)
    store.store_version_result(pid, result)
    return result


# ------------------------------------------------------------------ exports
def _file(data: bytes, filename: str, mime: str):
    return Response(data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/projects/{pid}/versions/{vid}/export/{kind}")
def export(pid: str, vid: str, kind: str, mode: str = "timelapse", size: int = Query(0, ge=0, le=8000),
           nails: bool = False, frames: int = Query(0, ge=0, le=2000)):
    try:
        meta = store.get_project(pid)
        result = store.load_version(pid, vid)
    except KeyError as e:
        _404(e)
    base = _safe(meta["name"])
    if kind == "manual.pdf":
        return _file(pdf.construction_manual(result, meta["name"]), f"{base}_manual.pdf", "application/pdf")
    if kind.startswith("template."):
        return _template(kind.split(".", 1)[1], BoardGeometry(ProjectSettings(**result["settings"]).board),
                         f"{base}_template")
    if kind == "sequence.csv":
        return _file(vector.sequence_csv(result), f"{base}_sequence.csv", "text/csv")
    if kind == "sequence.json":
        return _file(vector.sequence_json(result), f"{base}_sequence.json", "application/json")
    if kind == "nails.csv":
        return _file(vector.nails_csv(result), f"{base}_nails.csv", "text/csv")
    if kind == "artwork.svg":
        return _file(vector.artwork_svg(result, nails=True), f"{base}.svg", "image/svg+xml")
    if kind in ("artwork.png", "artwork.jpg"):
        fmt = "JPG" if kind.endswith("jpg") else "PNG"
        return _file(media.artwork_image(result, size or 2400, fmt, nails), f"{base}.{fmt.lower()}",
                     "image/jpeg" if fmt == "JPG" else "image/png")
    if kind == "simulation.gif":
        return _file(media.simulation_gif(result, size or 520, mode, frames or 120), f"{base}_{mode}.gif",
                     "image/gif")
    if kind == "simulation.mp4":
        data = media.simulation_mp4(result, size or 720, mode, frames or 300)
        if not data:
            raise HTTPException(501, "MP4 encoding is not supported on this system; use GIF")
        return _file(data, f"{base}_{mode}.mp4", "video/mp4")
    if kind == "steps.zip":
        return _file(media.step_sequence_zip(result, size or 800), f"{base}_steps.zip", "application/zip")
    raise HTTPException(404, "unknown export")


# ------------------------------------------------------------------ frontend
_DIST = Path(os.environ.get("STRINGART_FRONTEND", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (_DIST / path).resolve()
        if path and f.is_file() and str(f).startswith(str(_DIST.resolve())):
            return FileResponse(f)
        return FileResponse(_DIST / "index.html")
