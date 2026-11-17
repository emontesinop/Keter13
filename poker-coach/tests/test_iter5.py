from sqlmodel import Session as DB

from app import progress, readiness
from app.content import load_content
from app.db import get_engine
from app.drills.exploit import bankroll_decision
from app.models import LevelProgress

C = load_content()


def test_bankroll_rules():
    assert bankroll_decision(C, "1/2", 3000) == "down"    # < 20 × 200
    assert bankroll_decision(C, "1/2", 5000) == "stay"
    assert bankroll_decision(C, "1/2", 9000) == "up"      # 30 × 300
    assert bankroll_decision(C, "1/3", 14000) == "stay"   # 2/5 exige 15 000
    assert bankroll_decision(C, "1/3", 15000) == "up"


def test_readiness_flow(client):
    with DB(get_engine()) as db:
        checks, ok = readiness.readiness(db, C)
        assert not ok and [c.ok for c in checks] == [False, False, False]
    client.post("/ajustes", data={"initial_bankroll": 4000, "stop_loss_bi": "2", "target_stakes": "1/2"})
    with DB(get_engine()) as db:
        checks, ok = readiness.readiness(db, C)
        assert [c.ok for c in checks] == [False, True, True]
        for lvl in range(4):
            lp = db.get(LevelProgress, lvl)
            lp.status = "passed"
            db.add(lp)
        db.commit()
        checks, ok = readiness.readiness(db, C)
        assert ok
    assert "Cumples el criterio" in client.get("/listo").text
    # una sesión perdedora baja el bankroll por debajo del mínimo
    client.post("/sesiones", data={"date": "2026-11-17", "stakes": "1/2", "hours": 5, "buy_in": 600, "cash_out": 0})
    with DB(get_engine()) as db:
        checks, ok = readiness.readiness(db, C)
        assert not ok and not checks[1].ok


def test_placed_is_not_passed_for_readiness(client):
    with DB(get_engine()) as db:
        for lvl in range(4):
            lp = db.get(LevelProgress, lvl)
            lp.status = "placed"
            db.add(lp)
        db.commit()
        assert not readiness.readiness(db, C)[0][0].ok


def test_invalid_target_stakes(client):
    assert client.post("/ajustes", data={"target_stakes": "abc"}).status_code == 400


def test_variance_page(client):
    r = client.get("/varianza?wr=5&sd=75&hours=200&bankroll_bb=2000")
    assert r.status_code == 200 and "Trayectorias simuladas" in r.text and "1  " not in r.text
    assert "Riesgo de ruina" in r.text
    assert client.get("/varianza?wr=-3&sd=80&hours=100").status_code == 200
    assert client.get("/varianza").status_code == 200


def test_level_4_5_pages(client):
    for p in ["/nivel/4", "/nivel/5", "/leccion/l4_tells", "/leccion/l5_variance", "/listo"]:
        assert client.get(p).status_code == 200
