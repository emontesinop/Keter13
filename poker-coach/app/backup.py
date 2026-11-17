"""Exportar e importar todos tus datos (JSON) y sesiones en CSV."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from sqlmodel import Session as DB
from sqlmodel import delete, select

from .models import (Attempt, Hand, HandFinding, LevelProgress, MentalCheckin, Run, Session, Setting, SrsCard)

APP_ID = "poker-coach"
VERSION = 1
TABLES = {
    "attempts": Attempt, "level_progress": LevelProgress, "runs": Run, "sessions": Session,
    "settings": Setting, "srs_cards": SrsCard, "mental_checkins": MentalCheckin,
    "hands": Hand, "hand_findings": HandFinding,
}


class BackupError(ValueError):
    pass


def export_data(db: DB) -> dict:
    return {
        "app": APP_ID,
        "version": VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "tables": {name: [row.model_dump(mode="json") for row in db.exec(select(model)).all()]
                   for name, model in TABLES.items()},
    }


def import_data(db: DB, data: dict) -> dict[str, int]:
    """Reemplaza TODOS los datos por los del archivo. Todo o nada."""
    if not isinstance(data, dict) or data.get("app") != APP_ID:
        raise BackupError("El archivo no es una copia de Poker Coach.")
    if data.get("version") != VERSION:
        raise BackupError(f"Versión de copia no soportada: {data.get('version')}.")
    tables = data.get("tables")
    if not isinstance(tables, dict):
        raise BackupError("Copia incompleta: faltan las tablas.")
    try:
        rows = {name: [model.model_validate(r) for r in tables.get(name, [])] for name, model in TABLES.items()}
    except Exception as e:  # datos corruptos: no tocar nada
        raise BackupError(f"Datos inválidos en la copia: {e.__class__.__name__}") from e
    try:
        for model in TABLES.values():
            db.exec(delete(model))
        for name, items in rows.items():
            for r in items:
                db.add(r)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {name: len(items) for name, items in rows.items()}


def sessions_csv(db: DB) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["fecha", "limite", "bb", "horas", "buy_in", "cash_out", "resultado", "resultado_bb", "lugar", "notas"])
    for s in db.exec(select(Session).order_by(Session.date, Session.id)).all():
        profit = s.cash_out - s.buy_in
        w.writerow([s.date, s.stakes, s.bb, s.hours, s.buy_in, s.cash_out, profit, round(profit / s.bb, 2),
                    s.location, s.notes])
    return buf.getvalue()
