from __future__ import annotations

import random
import time
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlmodel import Session as DB
from sqlmodel import select

from . import drills, progress
from .charts import line_chart, radar
from .content import get_content, pos_label
from .core.cards import fmt_card
from .core.stats import SessionData, bankroll_curve, buyins, summarize
from .db import get_db, get_engine, init_db
from .models import Attempt, Run, Session

BASE = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_content()  # valida el contenido: si algo está mal, no arranca
    init_db()
    with DB(get_engine()) as db:
        progress.ensure_levels(db)
    yield


app = FastAPI(title="Poker Coach", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


def _card_html(c: str) -> str:
    color = "red" if c[1] in "hd" else "black"
    return f'<span class="card {color}">{fmt_card(c)}</span>'


templates.env.filters["card"] = _card_html
templates.env.filters["pos"] = pos_label
templates.env.filters["pct"] = lambda x: "—" if x is None else f"{x * 100:.0f} %"
templates.env.filters["money"] = lambda x: "—" if x is None else (("−" if x < 0 else "") + f"${abs(x):,.0f}".replace(",", " "))
templates.env.filters["num"] = lambda x, d=1: "—" if x is None else f"{x:.{d}f}".replace(".", ",").replace("-", "−")
templates.env.globals["skill_label"] = drills.SKILL_LABEL


def render(request: Request, name: str, **ctx) -> HTMLResponse:
    ctx.setdefault("c", get_content())
    return templates.TemplateResponse(request, name, ctx)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _record(db: DB, q: drills.Question, answer: str, ok: bool, issued: int | None,
            mode: str, run_id: str | None = None) -> None:
    ms = None
    if issued:
        ms = max(0, min(_now_ms() - issued, 30 * 60 * 1000))
    db.add(Attempt(level=q.level, skill=q.skill, drill_type=q.drill_type, concept_id=q.concept_id,
                   seed=q.seed, user_answer=answer, correct_answer=q.answer, correct=ok,
                   ms_taken=ms, mode=mode, run_id=run_id))
    db.commit()


# ---------------- Hoy ----------------

@app.get("/", response_class=HTMLResponse)
def home(request: Request, db: DB = Depends(get_db)):
    c = get_content()
    lvl = progress.current_level(db)
    scores = progress.skill_scores(db)
    sessions = db.exec(select(Session)).all()
    summ = summarize([_sd(s) for s in sessions]) if sessions else None
    return render(request, "home.html",
                  rec=progress.recommendation(db, c), level=lvl, gate=progress.gate(db, lvl, c),
                  radar=radar({k: v[0] for k, v in scores.items()}, drills.SKILL_LABEL),
                  scores=scores, summ=summ)


# ---------------- Diagnóstico y exámenes ----------------

@app.get("/diagnostico", response_class=HTMLResponse)
def diagnostic_intro(request: Request, db: DB = Depends(get_db)):
    last = progress.get_setting(db, "diagnostic_done")
    n = len(progress.DIAGNOSTIC_PLAN) + sum(1 for q in get_content().questions.values() if q.get("diagnostic_only"))
    return render(request, "diagnostic_intro.html", last=last, n=n)


@app.post("/diagnostico")
def diagnostic_start(db: DB = Depends(get_db)):
    run = progress.create_diagnostic(db)
    return RedirectResponse(f"/run/{run.id}", status_code=303)


@app.post("/examen/{level}")
def exam_start(level: int, db: DB = Depends(get_db)):
    if not progress.gate(db, level).exam_ready:
        raise HTTPException(403, "Aún no cumples el requisito para el examen de este nivel.")
    run = progress.create_exam(db, level)
    return RedirectResponse(f"/run/{run.id}", status_code=303)


def _get_run(db: DB, run_id: str) -> Run:
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "No existe")
    return run


@app.get("/run/{run_id}")
def run_next(run_id: str, db: DB = Depends(get_db)):
    run = _get_run(db, run_id)
    done = len(progress.run_attempts(db, run))
    if done >= len(progress.run_plan(run)):
        return RedirectResponse(f"/run/{run_id}/resultado", status_code=303)
    return RedirectResponse(f"/run/{run_id}/{done}", status_code=303)


@app.get("/run/{run_id}/resultado", response_class=HTMLResponse)
def run_result(request: Request, run_id: str, db: DB = Depends(get_db)):
    c = get_content()
    run = _get_run(db, run_id)
    atts = progress.run_attempts(db, run)
    if len(atts) < len(progress.run_plan(run)):
        return RedirectResponse(f"/run/{run_id}", status_code=303)
    progress.finish_run(db, run, c)
    wrong = [(a, drills.generate(a.drill_type, a.seed, c)) for a in atts if not a.correct]
    ctx = dict(run=run, atts=atts, wrong=wrong)
    if run.kind == "diagnostic":
        ctx["res"] = progress.diagnostic_result(db, run, c)
    else:
        ctx["passed"] = run.score >= c.config["gate"]["exam_pass"]
    return render(request, "run_result.html", **ctx)


@app.get("/run/{run_id}/{i}", response_class=HTMLResponse)
def run_question(request: Request, run_id: str, i: int, db: DB = Depends(get_db)):
    run = _get_run(db, run_id)
    plan = progress.run_plan(run)
    done = len(progress.run_attempts(db, run))
    if i != done or i >= len(plan):
        return RedirectResponse(f"/run/{run_id}", status_code=303)
    t, seed = plan[i]
    q = drills.generate(t, seed)
    return render(request, "question.html", q=q, action=f"/run/{run_id}/{i}", issued=_now_ms(),
                  progress_txt=f"{i + 1} / {len(plan)}", run=run, feedback=None)


@app.post("/run/{run_id}/{i}")
def run_answer(run_id: str, i: int, answer: str = Form(...), issued: int | None = Form(None),
               db: DB = Depends(get_db)):
    run = _get_run(db, run_id)
    plan = progress.run_plan(run)
    if i == len(progress.run_attempts(db, run)) and i < len(plan):
        t, seed = plan[i]
        q, ok = drills.grade(t, seed, answer)
        _record(db, q, answer, ok, issued, run.kind, run.id)
    return RedirectResponse(f"/run/{run_id}", status_code=303)


# ---------------- Ruta, niveles, lecciones ----------------

@app.get("/ruta", response_class=HTMLResponse)
def route_map(request: Request, db: DB = Depends(get_db)):
    c = get_content()
    gates = [progress.gate(db, l["level"], c) for l in c.levels]
    return render(request, "ruta.html", gates=gates)


@app.get("/nivel/{level}", response_class=HTMLResponse)
def level_page(request: Request, level: int, db: DB = Depends(get_db)):
    c = get_content()
    if level < 0 or level > progress.MAX_LEVEL:
        raise HTTPException(404)
    g = progress.gate(db, level, c)
    acc = {k: (a, n) for k, a, n in progress.concept_accuracy(db, level, min_n=1)}
    return render(request, "nivel.html", level=level, g=g, lessons=c.lessons_for_level(level), acc=acc)


@app.get("/leccion/{lesson_id}", response_class=HTMLResponse)
def lesson_page(request: Request, lesson_id: str, db: DB = Depends(get_db)):
    c = get_content()
    lesson = c.lessons.get(lesson_id)
    if not lesson:
        raise HTTPException(404)
    return render(request, "leccion.html", lesson=lesson, open=progress.is_open(db, lesson["level"]))


@app.get("/fuentes", response_class=HTMLResponse)
def sources_page(request: Request):
    return render(request, "fuentes.html")


# ---------------- Práctica ----------------

def _filters(level: int | None, concept: str | None, timer: int) -> str:
    q = {k: v for k, v in (("level", level), ("concept", concept), ("timer", timer or None)) if v is not None}
    return urlencode(q)


@app.get("/practicar", response_class=HTMLResponse)
def practice(request: Request, level: int | None = None, concept: str | None = None, timer: int = 0,
             db: DB = Depends(get_db)):
    c = get_content()
    if concept and concept not in c.lessons:
        raise HTTPException(404)
    if concept:
        level = None
        lvl = c.lessons[concept]["level"]
    else:
        level = progress.current_level(db) if level is None else level
        lvl = level
    if not progress.is_open(db, lvl):
        return RedirectResponse("/ruta", status_code=303)
    try:
        t = drills.pick(random.Random(), level=level, concept=concept, c=c)
    except LookupError:
        return render(request, "empty.html", level=lvl)
    q = drills.generate(t, drills.new_seed(), c)
    return render(request, "question.html", q=q, action="/practicar", issued=_now_ms(),
                  filters=_filters(level, concept, timer), level=level, concept=concept,
                  timer=timer, feedback=None, gate=progress.gate(db, lvl, c))


@app.post("/practicar", response_class=HTMLResponse)
def practice_answer(request: Request, drill_type: str = Form(...), seed: int = Form(...),
                    answer: str = Form(...), issued: int | None = Form(None),
                    level: int | None = Form(None), concept: str | None = Form(None),
                    timer: int = Form(0), db: DB = Depends(get_db)):
    c = get_content()
    try:
        q, ok = drills.grade(drill_type, seed, answer)
    except KeyError:
        raise HTTPException(400, "Ejercicio desconocido")
    if not progress.is_open(db, q.level):
        return RedirectResponse("/ruta", status_code=303)
    _record(db, q, answer, ok, issued, "practice")
    lesson = c.lessons.get(q.concept_id)
    return render(request, "question.html", q=q, action=None, feedback={"ok": ok, "answer": answer},
                  lesson=lesson, filters=_filters(level, concept or None, timer), level=level,
                  concept=concept, timer=timer, gate=progress.gate(db, q.level, c))


# ---------------- Sesiones en vivo ----------------

def _sd(s: Session) -> SessionData:
    return SessionData(s.date, s.hours, s.buy_in, s.cash_out, s.bb)


def _parse_stakes(stakes: str) -> float:
    try:
        bb = float(stakes.replace("$", "").split("/")[-1])
    except ValueError:
        raise HTTPException(400, "Límite inválido. Usa el formato 1/2, 1/3, 2/5…")
    if bb <= 0:
        raise HTTPException(400, "Límite inválido")
    return bb


@app.get("/sesiones", response_class=HTMLResponse)
def sessions_page(request: Request, db: DB = Depends(get_db)):
    c = get_content()
    rows = db.exec(select(Session).order_by(Session.date.desc(), Session.id.desc())).all()
    initial = float(progress.get_setting(db, "initial_bankroll", "0") or 0)
    data = [_sd(s) for s in rows]
    summ = summarize(data, initial)
    curve = bankroll_curve(initial, data)
    bankroll = curve[-1][1]
    ref_bb = rows[0].bb if rows else 2.0
    bi = buyins(bankroll, ref_bb, c.config["bankroll"]["buyin_bb"])
    return render(request, "sesiones.html", rows=rows, summ=summ, chart=line_chart([v for _, v in curve]),
                  initial=initial, bankroll=bankroll, bi=bi, ref_bb=ref_bb,
                  stop_loss=progress.get_setting(db, "stop_loss_bi", ""),
                  today=date.today().isoformat())


@app.post("/sesiones")
def sessions_add(date_: str = Form(..., alias="date"), stakes: str = Form(...), hours: float = Form(...),
                 buy_in: float = Form(...), cash_out: float = Form(...), location: str = Form(""),
                 notes: str = Form(""), db: DB = Depends(get_db)):
    if hours <= 0 or hours > 48 or buy_in < 0 or cash_out < 0:
        raise HTTPException(400, "Revisa horas y montos")
    db.add(Session(date=date_, stakes=stakes.strip(), bb=_parse_stakes(stakes), hours=hours,
                   buy_in=buy_in, cash_out=cash_out, location=location.strip(), notes=notes.strip()))
    db.commit()
    return RedirectResponse("/sesiones", status_code=303)


@app.post("/sesiones/{sid}/borrar")
def sessions_delete(sid: int, db: DB = Depends(get_db)):
    s = db.get(Session, sid)
    if s:
        db.delete(s)
        db.commit()
    return RedirectResponse("/sesiones", status_code=303)


@app.post("/ajustes")
def settings_save(initial_bankroll: float = Form(0), stop_loss_bi: str = Form(""), db: DB = Depends(get_db)):
    progress.set_setting(db, "initial_bankroll", str(max(0.0, initial_bankroll)))
    progress.set_setting(db, "stop_loss_bi", stop_loss_bi.strip())
    return RedirectResponse("/sesiones", status_code=303)
