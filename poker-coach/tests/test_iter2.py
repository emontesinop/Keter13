import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session as DB
from sqlmodel import select

from app import drills, mental, progress, review
from app.db import get_engine
from app.models import Attempt, MentalCheckin, Session, SrsCard


def _practice_once(client, correct):
    page = client.get("/practicar?level=0").text
    t = re.search(r'name="drill_type" value="([^"]+)"', page).group(1)
    seed = int(re.search(r'name="seed" value="(\d+)"', page).group(1))
    m = re.search(r'name="card_id" value="(\d+)"', page)
    q = drills.generate(t, seed)
    ans = q.answer if correct else next(v for v, _ in q.options if v != q.answer)
    data = {"drill_type": t, "seed": seed, "answer": ans, "level": 0}
    if m:
        data["card_id"] = m.group(1)
    return client.post("/practicar", data=data), t, seed


def _make_due(card_id=None):
    with DB(get_engine()) as db:
        for c in db.exec(select(SrsCard)).all():
            c.due = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.add(c)
        db.commit()


def test_error_creates_card_due_in_minutes(client):
    r, t, seed = _practice_once(client, correct=False)
    assert "vuelve en unos 10 minutos" in r.text
    with DB(get_engine()) as db:
        card = db.exec(select(SrsCard)).one()
        assert card.drill_type == t and card.seed == seed and card.show_exact and card.lapses == 1
        assert review.due_count(db) == 0  # todavía no: vuelve en ~10 min
    assert "No tienes repasos pendientes" in client.get("/repasar").text


def test_review_flow_exact_then_advance(client):
    _, t, seed = _practice_once(client, correct=False)
    _make_due()
    page = client.get("/repasar").text
    assert "Repaso" in page
    card_id = re.search(r'name="card_id" value="(\d+)"', page).group(1)
    shown_seed = int(re.search(r'name="seed" value="(\d+)"', page).group(1))
    assert shown_seed == seed  # primer repaso: la situación exacta del error
    q = drills.generate(t, shown_seed)
    r = client.post("/repasar", data={"card_id": card_id, "drill_type": t, "seed": shown_seed, "answer": q.answer})
    assert "Próximo repaso en 1 día" in r.text
    with DB(get_engine()) as db:
        card = db.get(SrsCard, int(card_id))
        assert card.repetitions == 1 and card.interval == 1 and not card.show_exact
        modes = [a.mode for a in db.exec(select(Attempt)).all()]
        assert modes == ["practice", "review"]
        assert progress.gate(db, 0).count == 2  # los repasos cuentan para el gate


def test_review_error_is_lapse(client):
    _, t, _ = _practice_once(client, correct=False)
    _make_due()
    page = client.get("/repasar").text
    card_id = re.search(r'name="card_id" value="(\d+)"', page).group(1)
    seed = int(re.search(r'name="seed" value="(\d+)"', page).group(1))
    q = drills.generate(t, seed)
    wrong = next(v for v, _ in q.options if v != q.answer)
    client.post("/repasar", data={"card_id": card_id, "drill_type": t, "seed": seed, "answer": wrong})
    with DB(get_engine()) as db:
        card = db.get(SrsCard, int(card_id))
        assert card.lapses == 2 and card.repetitions == 0 and card.easiness < 2.5


def test_review_rejects_mismatched_card(client):
    _practice_once(client, correct=False)
    with DB(get_engine()) as db:
        cid = db.exec(select(SrsCard)).one().id
    r = client.post("/repasar", data={"card_id": cid, "drill_type": "otro", "seed": 1, "answer": "x"})
    assert r.status_code == 400


def test_recommendation_prioritizes_reviews(client):
    with DB(get_engine()) as db:
        progress.set_setting(db, "diagnostic_done", "x")
        for t in ["pot_odds", "outs", "ev_call"]:
            db.add(SrsCard(drill_type=t, level=0, skill="math", concept_id="l0_pot_odds", seed=1,
                           due=datetime.now(timezone.utc) - timedelta(hours=1)))
        db.commit()
        rec = progress.recommendation(db)
        assert rec.href == "/repasar" and "3 repasos" in rec.text
    assert "3 repasos pendientes" in client.get("/").text


def test_locked_level_cards_wait(client):
    with DB(get_engine()) as db:
        db.add(SrsCard(drill_type="rfi", level=1, skill="preflop", concept_id="l1_rfi", seed=1,
                       due=datetime.now(timezone.utc) - timedelta(hours=1)))
        db.commit()
        assert review.due_count(db) == 0  # nivel 1 bloqueado


def test_checkin_links_to_session_and_correlates(client):
    r = client.post("/checkin", data={"tilt": 4, "energy": 2, "focus": 3})
    assert "tilt alto" in r.text and "stop-loss" in r.text
    r = client.post("/sesiones", data={"date": "2026-11-17", "stakes": "1/2", "hours": 4, "buy_in": 200,
                                        "cash_out": 100, "post_tilt": 5, "post_energy": 2, "post_focus": 2},
                    follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/mental?post=")
    page = client.get(r.headers["location"]).text
    assert "Anota la mano" in page
    with DB(get_engine()) as db:
        s = db.exec(select(Session)).one()
        cs = db.exec(select(MentalCheckin).where(MentalCheckin.session_id == s.id)).all()
        assert {c.phase for c in cs} == {"pre", "post"}


def test_checkin_validates_scale(client):
    assert client.post("/checkin", data={"tilt": 9, "energy": 2, "focus": 3}).status_code == 400


def test_correlations_math(client):
    with DB(get_engine()) as db:
        for i, (energy, profit) in enumerate([(1, -100), (2, -40), (4, 60), (5, 120)]):
            s = Session(date=f"2026-11-0{i + 1}", stakes="1/2", bb=2, hours=4, buy_in=200, cash_out=200 + profit)
            db.add(s)
            db.commit()
            db.refresh(s)
            db.add(MentalCheckin(date=s.date, phase="pre", tilt=1, energy=energy, focus=3, session_id=s.id))
        db.commit()
        corr = {(x.phase, x.metric): x for x in mental.correlations(db)}
        e = corr[("pre", "energy")]
        assert e.n == 4 and e.r > 0.95
        assert e.high_bbh == pytest.approx((7.5 + 15) / 2) and e.low_bbh == pytest.approx((-12.5 - 5) / 2)
        assert corr[("pre", "tilt")].r is None  # sin varianza
    assert client.get("/mental").status_code == 200


def test_new_pages_load(client):
    for p in ["/checkin", "/mental", "/repasar"]:
        assert client.get(p).status_code == 200
