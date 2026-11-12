"""Background job runner with progress reporting and cancellation.

Generation runs in worker threads (NumPy releases the GIL in the heavy
kernels) so the API - and therefore the UI - never blocks.
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict

from .engine import Cancelled

_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="stringart-job")
_JOBS: Dict[str, dict] = {}
_LOCK = threading.Lock()


def submit(kind: str, fn: Callable[[Callable[[dict], None], threading.Event], dict], meta: dict = None) -> str:
    jid = uuid.uuid4().hex[:12]
    cancel = threading.Event()
    job = {"id": jid, "kind": kind, "status": "queued", "progress": {"stage": "queued", "fraction": 0.0},
           "result": None, "error": None, "created": time.time(), "meta": meta or {}, "_cancel": cancel}
    with _LOCK:
        _JOBS[jid] = job
        # forget old finished jobs
        old = [k for k, j in _JOBS.items() if j["status"] in ("done", "error", "cancelled")
               and time.time() - j["created"] > 3600]
        for k in old:
            _JOBS.pop(k, None)

    def progress(p: dict):
        job["progress"] = p

    def run():
        job["status"] = "running"
        try:
            job["result"] = fn(progress, cancel)
            job["status"] = "done"
            job["progress"] = {"stage": "done", "fraction": 1.0}
        except Cancelled:
            job["status"] = "cancelled"
        except Exception as e:  # surfaced to the UI
            job["status"] = "error"
            job["error"] = f"{type(e).__name__}: {e}"
            job["trace"] = traceback.format_exc()
    _POOL.submit(run)
    return jid


def get(jid: str) -> dict:
    j = _JOBS.get(jid)
    if j is None:
        raise KeyError(jid)
    return {k: v for k, v in j.items() if not k.startswith("_")}


def cancel(jid: str):
    j = _JOBS.get(jid)
    if j is None:
        raise KeyError(jid)
    j["_cancel"].set()
    if j["status"] == "queued":
        j["status"] = "cancelled"
