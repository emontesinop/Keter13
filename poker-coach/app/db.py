from __future__ import annotations

import os
from pathlib import Path

from sqlmodel import Session as DBSession
from sqlmodel import SQLModel, create_engine

from . import models  # noqa: F401  (registra tablas)

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "poker.db"

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = os.environ.get("POKER_DB_URL") or f"sqlite:///{DEFAULT_DB}"
        if url.startswith("sqlite:///"):
            Path(url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(url, connect_args={"check_same_thread": False})
    return _engine


def reset_engine():
    global _engine
    _engine = None


def init_db():
    SQLModel.metadata.create_all(get_engine())


def get_db():
    with DBSession(get_engine()) as s:
        yield s
