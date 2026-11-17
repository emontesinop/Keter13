import io
import json

from sqlmodel import Session as DB
from sqlmodel import select

from app import backup
from app.db import get_engine
from app.models import Attempt, Hand, MentalCheckin, Session, SrsCard


def _seed(client):
    client.post("/ajustes", data={"initial_bankroll": 4000, "stop_loss_bi": "2"})
    client.post("/checkin", data={"tilt": 2, "energy": 4, "focus": 4})
    client.post("/sesiones", data={"date": "2026-11-01", "stakes": "1/2", "hours": 4, "buy_in": 200,
                                    "cash_out": 350, "notes": "mesa floja, ñandú"})
    client.post("/manos", data={"position": "CO", "cards": "AhKd", "pre_situation": "rfi", "villain_pos": "BB",
                                 "hero_pre_kind": "limp", "hero_pre_size": "1"})
    with DB(get_engine()) as db:
        db.add(Attempt(level=0, skill="math", drill_type="pot_odds", concept_id="l0_pot_odds", seed=1,
                       user_answer="a", correct_answer="b", correct=False))
        db.add(SrsCard(drill_type="pot_odds", level=0, skill="math", concept_id="l0_pot_odds", seed=1))
        db.commit()


def test_export_import_roundtrip(client):
    _seed(client)
    r = client.get("/datos/exportar")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["app"] == "poker-coach" and len(data["tables"]["sessions"]) == 1
    # borrar todo importando una copia vacía de otra base y luego restaurar
    with DB(get_engine()) as db:
        empty = backup.export_data(db)
        for k in empty["tables"]:
            empty["tables"][k] = []
        backup.import_data(db, empty)
        assert db.exec(select(Session)).all() == []
    r = client.post("/datos/importar", data={"confirmar": "si"},
                    files={"archivo": ("copia.json", io.BytesIO(json.dumps(data).encode()), "application/json")})
    assert "Importado" in r.text
    with DB(get_engine()) as db:
        s = db.exec(select(Session)).one()
        assert s.notes == "mesa floja, ñandú" and s.cash_out == 350
        assert len(db.exec(select(Hand)).all()) == 1 and len(db.exec(select(MentalCheckin)).all()) == 1
        card = db.exec(select(SrsCard)).one()
        assert card.due.year >= 2026
    # la app sigue funcionando con los datos importados
    for p in ["/", "/sesiones", "/manos", "/leaks", "/repasar", "/mental"]:
        assert client.get(p).status_code == 200


def test_import_requires_confirmation_and_valid_file(client):
    _seed(client)
    f = {"archivo": ("x.json", io.BytesIO(b"{}"), "application/json")}
    assert "Marca la casilla" in client.post("/datos/importar", files=f).text
    f = {"archivo": ("x.json", io.BytesIO(b"no es json"), "application/json")}
    assert "no es un JSON" in client.post("/datos/importar", data={"confirmar": "si"}, files=f).text
    f = {"archivo": ("x.json", io.BytesIO(b'{"app": "otra"}'), "application/json")}
    assert "no es una copia" in client.post("/datos/importar", data={"confirmar": "si"}, files=f).text
    bad = {"app": "poker-coach", "version": 1, "tables": {"sessions": [{"date": "x"}]}}
    f = {"archivo": ("x.json", io.BytesIO(json.dumps(bad).encode()), "application/json")}
    assert "Datos inválidos" in client.post("/datos/importar", data={"confirmar": "si"}, files=f).text
    with DB(get_engine()) as db:  # nada se borró
        assert len(db.exec(select(Session)).all()) == 1


def test_sessions_csv(client):
    _seed(client)
    r = client.get("/datos/sesiones.csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("fecha,limite") and "150.0,75.0" in lines[1]
    assert client.get("/datos").status_code == 200
