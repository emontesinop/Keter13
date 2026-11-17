import json
import re

from sqlmodel import Session as DB
from sqlmodel import select

from app import drills, progress
from app.db import get_engine
from app.models import Attempt, LevelProgress, Run


def _answer_run(client, run_id, correct=True):
    with DB(get_engine()) as db:
        plan = progress.run_plan(db.get(Run, run_id))
    for i, (t, seed) in enumerate(plan):
        q = drills.generate(t, seed)
        ans = q.answer if correct else next(v for v, _ in q.options if v != q.answer)
        r = client.post(f"/run/{run_id}/{i}", data={"answer": ans}, follow_redirects=False)
        assert r.status_code == 303
    return client.get(f"/run/{run_id}/resultado")


def _run_id(resp):
    return re.search(r"/run/([0-9a-f]+)", str(resp.url)).group(1)


def test_pages_load(client):
    for path in ["/", "/ruta", "/nivel/0", "/nivel/3", "/leccion/l0_pot_odds", "/practicar",
                 "/sesiones", "/diagnostico", "/fuentes"]:
        r = client.get(path)
        assert r.status_code == 200, path


def test_locked_level_redirects(client):
    r = client.get("/practicar?level=1", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/ruta"


def test_diagnostic_perfect_places_level_2(client):
    r = client.post("/diagnostico")
    res = _answer_run(client, _run_id(r), correct=True)
    assert res.status_code == 200 and "nivel 2" in res.text
    with DB(get_engine()) as db:
        assert db.get(LevelProgress, 0).status == "placed"
        assert db.get(LevelProgress, 1).status == "placed"
        assert db.get(LevelProgress, 2).status == "unlocked"
        assert progress.gate(db, 0).exam_ready  # convalidado: examen directo
    # recargar el resultado no vuelve a aplicar nada
    assert client.get(res.url).status_code == 200


def test_diagnostic_all_wrong_stays_level_0(client):
    r = client.post("/diagnostico")
    _answer_run(client, _run_id(r), correct=False)
    with DB(get_engine()) as db:
        assert db.get(LevelProgress, 0).status == "unlocked"
        assert db.get(LevelProgress, 1).status == "locked"
        assert not progress.gate(db, 0).exam_ready


def test_exam_requires_gate(client):
    r = client.post("/examen/0", follow_redirects=False)
    assert r.status_code == 403


def test_gate_then_exam_pass_unlocks_next(client):
    with DB(get_engine()) as db:
        for i in range(50):
            db.add(Attempt(level=0, skill="math", drill_type="pot_odds", concept_id="l0_pot_odds",
                           seed=i, user_answer="x", correct_answer="x", correct=i >= 5))  # 90 %
        db.commit()
        assert progress.gate(db, 0).exam_ready
    r = client.post("/examen/0")
    res = _answer_run(client, _run_id(r), correct=True)
    assert "Aprobado" in res.text
    with DB(get_engine()) as db:
        assert db.get(LevelProgress, 0).status == "passed"
        assert db.get(LevelProgress, 1).status == "unlocked"


def test_gate_blocks_below_threshold(client):
    with DB(get_engine()) as db:
        for i in range(50):
            db.add(Attempt(level=0, skill="math", drill_type="pot_odds", concept_id="l0_pot_odds",
                           seed=i, user_answer="x", correct_answer="x", correct=i >= 10))  # 80 %
        db.commit()
        g = progress.gate(db, 0)
        assert g.count == 50 and not g.exam_ready


def test_failed_placed_exam_returns_to_normal_gate(client):
    _answer_run(client, _run_id(client.post("/diagnostico")), correct=True)
    r = client.post("/examen/0")
    res = _answer_run(client, _run_id(r), correct=False)
    assert "No aprobado" in res.text
    with DB(get_engine()) as db:
        assert db.get(LevelProgress, 0).status == "unlocked"
        assert not progress.gate(db, 0).exam_ready


def test_practice_records_attempt(client):
    page = client.get("/practicar?level=0").text
    t = re.search(r'name="drill_type" value="([^"]+)"', page).group(1)
    seed = int(re.search(r'name="seed" value="(\d+)"', page).group(1))
    q = drills.generate(t, seed)
    r = client.post("/practicar", data={"drill_type": t, "seed": seed, "answer": q.answer, "level": 0})
    assert r.status_code == 200 and "Correcto" in r.text
    with DB(get_engine()) as db:
        a = db.exec(select(Attempt)).one()
        assert a.correct and a.mode == "practice" and a.level == 0


def test_sessions_crud_and_stats(client):
    client.post("/ajustes", data={"initial_bankroll": 4000, "stop_loss_bi": "2"})
    client.post("/sesiones", data={"date": "2026-11-01", "stakes": "1/2", "hours": 4,
                                    "buy_in": 200, "cash_out": 350, "location": "Casino"})
    client.post("/sesiones", data={"date": "2026-11-03", "stakes": "1/3", "hours": 5,
                                    "buy_in": 300, "cash_out": 150})
    page = client.get("/sesiones").text
    assert "$0" in page and "9,0 h" in page and "Muestra mínima" in page
    assert client.post("/sesiones", data={"date": "2026-11-04", "stakes": "abc", "hours": 2,
                                           "buy_in": 1, "cash_out": 1}).status_code == 400
