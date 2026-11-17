import re
from datetime import date

from sqlmodel import Session as DB
from sqlmodel import select

from app import leaks
from app.content import load_content
from app.db import get_engine
from app.models import Attempt, Hand, HandFinding

C = load_content()

BASE = {"date": "2026-11-17", "stakes": "1/2", "position": "CO", "cards": "AhKd", "stack_bb": "100",
        "players": "2", "profile": "regular", "pre_situation": "rfi", "villain_pos": "BB",
        "hero_pre_kind": "raise", "hero_pre_size": "5"}


def post_hand(client, **kw):
    data = dict(BASE, **kw)
    return client.post("/manos", data=data, follow_redirects=False)


def test_create_and_view_hand(client):
    r = post_hand(client, flop_cards="Ac8s4d", flop_pot="11", flop_v_kind="check", flop_h_kind="bet",
                  flop_h_size="5", river_cards="", result_bb="12")
    assert r.status_code == 303
    page = client.get(r.headers["location"]).text
    assert "Preflop" in page and "Flop" in page and "Abrir AKo" in page
    with DB(get_engine()) as db:
        h = db.exec(select(Hand)).one()
        assert h.n_errors == 0 and h.result_bb == 12


def test_open_limp_creates_leak_and_priority(client):
    for _ in range(2):
        post_hand(client, hero_pre_kind="limp", hero_pre_size="1")
    with DB(get_engine()) as db:
        fs = db.exec(select(HandFinding).where(HandFinding.leak == "open_limp")).all()
        assert len(fs) == 2
        pr = leaks.priorities(db, C)
        assert pr[0].concept == "l1_rfi" and "Open-limp" in pr[0].reasons[0]
    page = client.get("/leaks").text
    assert "Rangos de apertura por posición" in page and "Plan para esta semana" in page
    assert "Leaks principales" in client.get("/").text


def test_form_validation_errors(client):
    r = post_hand(client, cards="AhAh")
    assert r.status_code == 200 and "Cartas repetidas" in r.text
    r = post_hand(client, flop_cards="AhQs2c")
    assert "Carta repetida en el flop" in r.text
    r = post_hand(client, turn_cards="9h")
    assert "hace falta la calle anterior" in r.text
    r = post_hand(client, flop_cards="Qs2c")
    assert "3 cartas" in r.text


def test_delete_hand(client):
    r = post_hand(client)
    hid = int(r.headers["location"].rsplit("/", 1)[1])
    client.post(f"/manos/{hid}/borrar")
    with DB(get_engine()) as db:
        assert db.exec(select(Hand)).all() == [] and db.exec(select(HandFinding)).all() == []


def test_drill_leaks_and_weekly_plan(client):
    with DB(get_engine()) as db:
        for i in range(10):
            db.add(Attempt(level=0, skill="math", drill_type="pot_odds", concept_id="l0_pot_odds", seed=i,
                           user_answer="x", correct_answer="y", correct=i < 4))  # 40 %
        db.commit()
        dl = leaks.drill_leaks(db, C)
        assert dl[0].concept == "l0_pot_odds" and dl[0].accuracy == 0.4
        plan = leaks.weekly_plan(db, C, today=date(2026, 11, 16))  # lunes
        assert len(plan) == 7 and plan[0].day == "Lun 16"
        assert plan[0].href == "/leccion/l0_pot_odds"
        assert plan[6].href == "/manos/nueva"
        assert len({d.href for d in plan[:5]}) == 3  # tres focos distintos, no el mismo 5 días


def test_pages(client):
    for p in ["/manos", "/manos/nueva", "/leaks"]:
        assert client.get(p).status_code == 200


def test_form_second_action_is_evaluated(client):
    r = post_hand(client, flop_cards="Ac8s4d", flop_pot="20", flop_v_kind="check", flop_h_kind="bet",
                  flop_h_size="10", flop_v2_kind="raise", flop_v2_size="30", flop_h2_kind="call")
    page = client.get(r.headers["location"]).text
    assert "Call ante subida 30 bb" in page and "pagar 20 bb para un bote de 80" in page
