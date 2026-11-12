"""Project storage, versions and the portable ``.saproj`` format.

Layout on disk (one folder per project)::

    <home>/projects/<id>/project.json      metadata + current settings + version list
    <home>/projects/<id>/source.<ext>      original image, byte-for-byte
    <home>/projects/<id>/versions/<vid>/result.json    full generation result
                                       /preview.png    rendered artwork
                                       /processed.png  processed tone image
                                       /intended.npy   intended appearance (for metrics)

A ``.saproj`` file is simply a ZIP of that folder, so projects move between
machines unchanged.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import threading
import time
import uuid
import zipfile
from pathlib import Path
from typing import List, Optional

import numpy as np

from .config import ProjectSettings, migrate_settings
from .imaging import SUPPORTED_EXTENSIONS, detect_faces, load_image, to_png_bytes

_LOCK = threading.RLock()


def home() -> Path:
    p = Path(os.environ.get("STRINGART_HOME", Path.home() / ".stringart_studio"))
    (p / "projects").mkdir(parents=True, exist_ok=True)
    return p


def _pdir(pid: str) -> Path:
    if not pid or any(ch in pid for ch in "/\\.") or len(pid) > 40:
        raise KeyError("invalid project id")
    return home() / "projects" / pid


def _vdir(pid: str, vid: str) -> Path:
    if not vid or any(ch in vid for ch in "/\\.") or len(vid) > 40:
        raise KeyError("invalid version id")
    return _pdir(pid) / "versions" / vid


def _write_json(path: Path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(path)


def list_projects() -> List[dict]:
    out = []
    for d in (home() / "projects").iterdir():
        f = d / "project.json"
        if f.exists():
            try:
                meta = json.loads(f.read_text())
                out.append({k: meta.get(k) for k in ("id", "name", "created", "updated", "current_version")}
                           | {"versions": len(meta.get("versions", []))})
            except Exception:
                continue
    out.sort(key=lambda m: m.get("updated") or 0, reverse=True)
    return out


def create_project(name: str, filename: str, data: bytes, settings: Optional[ProjectSettings] = None) -> dict:
    ext = os.path.splitext(filename)[1].lower() or ".png"
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"unsupported image type {ext}; use one of {', '.join(SUPPORTED_EXTENSIONS)}")
    rgb = load_image(data)  # validates the file
    pid = uuid.uuid4().hex[:12]
    d = _pdir(pid)
    (d / "versions").mkdir(parents=True)
    (d / f"source{ext}").write_bytes(data)
    faces = detect_faces(rgb)
    now = time.time()
    meta = {
        "id": pid, "name": name or os.path.splitext(filename)[0], "created": now, "updated": now,
        "source": f"source{ext}", "source_filename": filename, "source_size": [int(rgb.shape[1]), int(rgb.shape[0])],
        "faces": [list(map(float, f)) for f in faces],
        "settings": (settings or ProjectSettings()).model_dump(),
        "versions": [], "current_version": None, "format": "stringart-studio/project", "format_version": 1,
    }
    _write_json(d / "project.json", meta)
    return meta


def get_project(pid: str) -> dict:
    f = _pdir(pid) / "project.json"
    if not f.exists():
        raise KeyError(pid)
    meta = json.loads(f.read_text())
    meta["settings"] = migrate_settings(meta.get("settings", {}))
    return meta


def update_project(pid: str, **fields) -> dict:
    with _LOCK:
        meta = get_project(pid)
        if "settings" in fields and fields["settings"] is not None:
            meta["settings"] = ProjectSettings(**fields["settings"]).model_dump()
        if fields.get("name"):
            meta["name"] = str(fields["name"])[:120]
        meta["updated"] = time.time()
        _write_json(_pdir(pid) / "project.json", meta)
        return meta


def delete_project(pid: str):
    shutil.rmtree(_pdir(pid), ignore_errors=True)


def duplicate_project(pid: str) -> dict:
    with _LOCK:
        src = _pdir(pid)
        nid = uuid.uuid4().hex[:12]
        shutil.copytree(src, _pdir(nid))
        meta = get_project(nid)
        meta["id"] = nid
        meta["name"] = meta["name"] + " (copy)"
        meta["created"] = meta["updated"] = time.time()
        _write_json(_pdir(nid) / "project.json", meta)
        return meta


def source_path(pid: str) -> Path:
    return _pdir(pid) / get_project(pid)["source"]


def source_rgb(pid: str) -> np.ndarray:
    return load_image(str(source_path(pid)))


def faces(pid: str):
    return [tuple(f) for f in get_project(pid).get("faces", [])]


# ------------------------------------------------------------------ versions
def save_version(pid: str, result: dict, images: dict, preview_png: bytes, label: str = "") -> dict:
    with _LOCK:
        vid = result["id"]
        d = _vdir(pid, vid)
        d.mkdir(parents=True, exist_ok=True)
        _write_json(d / "result.json", result)
        (d / "preview.png").write_bytes(preview_png)
        (d / "processed.png").write_bytes(to_png_bytes(images["processed"]))
        np.save(d / "intended.npy", images["intended"].astype(np.float16))
        meta = get_project(pid)
        summary = version_summary(result, label or f"v{len(meta['versions']) + 1}")
        meta["versions"].append(summary)
        meta["current_version"] = vid
        meta["updated"] = time.time()
        _write_json(_pdir(pid) / "project.json", meta)
        return summary


def version_summary(result: dict, label: str) -> dict:
    s = result["settings"]
    return {
        "id": result["id"], "label": label, "created": result["created"],
        "mode": s["generation"]["mode"], "color_mode": s["thread"]["color_mode"],
        "nails": s["board"]["nail_count"], "connections": result["totals"]["connections"],
        "sections": result["totals"]["sections"], "thread_m": result["materials"]["total_thread_m"],
        "metrics": result.get("metrics", {}), "elapsed_s": result["timings"]["total_s"],
    }


def load_version(pid: str, vid: str) -> dict:
    f = _vdir(pid, vid) / "result.json"
    if not f.exists():
        raise KeyError(vid)
    return json.loads(f.read_text())


def store_version_result(pid: str, result: dict):
    with _LOCK:
        _write_json(_vdir(pid, result["id"]) / "result.json", result)
        meta = get_project(pid)
        for i, v in enumerate(meta["versions"]):
            if v["id"] == result["id"]:
                meta["versions"][i] = version_summary(result, v["label"])
        meta["updated"] = time.time()
        _write_json(_pdir(pid) / "project.json", meta)


def version_file(pid: str, vid: str, name: str) -> Path:
    if name not in ("preview.png", "processed.png", "intended.npy"):
        raise KeyError(name)
    return _vdir(pid, vid) / name


def delete_version(pid: str, vid: str):
    with _LOCK:
        shutil.rmtree(_vdir(pid, vid), ignore_errors=True)
        meta = get_project(pid)
        meta["versions"] = [v for v in meta["versions"] if v["id"] != vid]
        if meta["current_version"] == vid:
            meta["current_version"] = meta["versions"][-1]["id"] if meta["versions"] else None
        _write_json(_pdir(pid) / "project.json", meta)


def rename_version(pid: str, vid: str, label: str):
    with _LOCK:
        meta = get_project(pid)
        for v in meta["versions"]:
            if v["id"] == vid:
                v["label"] = label[:80]
        _write_json(_pdir(pid) / "project.json", meta)


# ------------------------------------------------------------------ portable format
def export_saproj(pid: str) -> bytes:
    d = _pdir(pid)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in d.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(d).as_posix())
    return buf.getvalue()


def import_saproj(data: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        if "project.json" not in names:
            raise ValueError("not a StringArt Studio project (project.json missing)")
        meta = json.loads(z.read("project.json"))
        ProjectSettings(**meta["settings"])  # validate
        nid = uuid.uuid4().hex[:12]
        d = _pdir(nid)
        d.mkdir(parents=True)
        for n in names:
            target = (d / n).resolve()
            if not str(target).startswith(str(d.resolve())) or n.endswith("/"):
                continue  # path traversal guard
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(n))
    meta["id"] = nid
    meta["updated"] = time.time()
    (d / "versions").mkdir(exist_ok=True)
    _write_json(d / "project.json", meta)
    return meta
