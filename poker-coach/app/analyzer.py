"""Analizador de manos jugadas en vivo.

Evalúa cada decisión con los principios del currículo:
- Preflop: contra las tablas de rangos y tamaños de content/ (exacto respecto a ellas).
- Postflop: estima el rango del rival a partir de su acción preflop y su perfil
  (content/profiles.yaml) y calcula con treys tu equity frente a su rango de
  apuesta, o el EV de apostar o pasar en el river.

Es un modelo, no un solver. Cada hallazgo dice qué supuso y con qué números.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from .content import POSITIONS_9, Content, pos_label
from .core import pokermath as pm
from .core.cards import hand_class
from .core.equity import _EVAL, draw_outs, strength
from .core.handreading import (bottom_fraction, equity_vs_combos, hand_desc, live_combos, narrow_after_calls,
                               on_board, showdown, top_fraction)

POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG1", "MP", "LJ", "HJ", "CO", "BTN"]
STREETS = ("flop", "turn", "river")
STREET_ES = {"preflop": "Preflop", "flop": "Flop", "turn": "Turn", "river": "River"}


@dataclass
class Action:
    kind: str = ""          # "", fold, check, limp, call, bet, raise, allin
    size: float | None = None


@dataclass
class Street:
    """Una calle: hasta dos intercambios (rival, tú). Tamaños = total puesto en la calle."""
    name: str
    cards: list[str]
    pot: float | None
    villain: Action
    hero: Action
    villain2: Action = field(default_factory=Action)
    hero2: Action = field(default_factory=Action)


@dataclass
class HandInput:
    position: str
    stack_bb: float
    hero: list[str]
    profile: str                  # id de content/profiles.yaml
    players: int                  # jugadores que ven el flop
    pre_situation: str            # rfi | limpers | vs_open | vs_3bet
    villain_pos: str | None
    limpers: int = 0
    villain_size: float | None = None
    hero_pre: Action = field(default_factory=Action)
    streets: list[Street] = field(default_factory=list)


@dataclass
class Finding:
    street: str
    decision: str
    verdict: str                  # ok | dudoso | error | info
    leak: str | None
    explanation: str
    concept_id: str | None = None


def _f(street, decision, verdict, leak, text, c: Content):
    concept = c.leaks[leak]["concept"] if leak else None
    return Finding(street, decision, verdict, leak, text, concept)


def _group(groups: dict, pos: str) -> str:
    for g, members in groups.items():
        if pos in members:
            return g
    raise KeyError(pos)


def hero_in_position(h: HandInput) -> bool | None:
    if not h.villain_pos or h.villain_pos == h.position:
        return None
    return POSTFLOP_ORDER.index(h.position) > POSTFLOP_ORDER.index(h.villain_pos)


def _act_label(a: Action) -> str:
    names = {"fold": "fold", "check": "check", "limp": "limp", "call": "call", "bet": "apuesta",
             "raise": "subida", "allin": "all-in"}
    base = names.get(a.kind, a.kind)
    return f"{base} {a.size:g} bb" if a.size and a.kind in ("bet", "raise", "allin", "limp", "call") else base


# ---------------- rango estimado del rival ----------------

def villain_range(h: HandInput, c: Content) -> tuple[frozenset, str]:
    vp = h.villain_pos
    sit = h.pre_situation
    if sit == "limpers":
        return c.population["limp"], "rango típico de limper en vivo"
    if sit == "vs_open" and vp:
        return c.rfi.get(vp, c.rfi["BTN"]), f"rango de apertura de {pos_label(vp)}"
    if sit in ("rfi", "vs_3bet") and vp:
        opener = h.position if h.position != "BB" else "SB"
        grp = _group(c.vs_open_groups, opener) if opener != "SB" else "LATE"
        kind = vp if vp in ("SB", "BB") else "IP"
        spot = f"{kind}_vs_{grp}"
        if spot not in c.vs_open:
            spot = f"BB_vs_{grp}"
        key = "3bet" if sit == "vs_3bet" else "call"
        return c.vs_open[spot][key], f"rango de {'3-bet' if key == '3bet' else 'call'} de {pos_label(vp)}"
    return c.rfi["BTN"], "rango amplio genérico (falta la posición del rival)"


# ---------------- preflop ----------------

def eval_preflop(h: HandInput, c: Content) -> list[Finding]:
    out: list[Finding] = []
    hc = hand_class(*h.hero)
    a = h.hero_pre.kind
    size = h.hero_pre.size
    s = c.config["sizing"]
    pos = h.position
    st = "preflop"
    if not a:
        return out
    if h.pre_situation == "rfi":
        if pos == "BB":
            return [_f(st, "Walk", "info", None, "Todos foldearon hasta la BB.", c)]
        in_range = hc in c.rfi[pos]
        rtxt = c.range_text[f"rfi.{pos}"]
        if a in ("limp", "call"):
            out.append(_f(st, f"Open-limp con {hc}", "error", "open_limp",
                          f"Si nadie entró, sube o foldea. Rango de {pos_label(pos)}: {rtxt}.", c))
        elif a in ("raise", "allin"):
            if in_range:
                out.append(_f(st, f"Abrir {hc} desde {pos_label(pos)}", "ok", None, f"{hc} está en el rango de {pos_label(pos)}.", c))
            else:
                first = next((p for p in c.rfi_order + ["SB"] if hc in c.rfi[p]), None)
                verdict = "dudoso" if first else "error"
                where = f"Se abre desde {pos_label(first)}." if first else "No entra en ningún rango de apertura."
                out.append(_f(st, f"Abrir {hc} desde {pos_label(pos)}", verdict, "preflop_loose",
                              f"Fuera del rango de {pos_label(pos)} ({rtxt}). {where}", c))
            if size and a == "raise" and abs(size - s["open_bb"]) > 1.5:
                out.append(_f(st, f"Open a {size:g} bb", "dudoso", "sizing_pre",
                              f"El tamaño de referencia en vivo es {s['open_bb']} bb.", c))
        elif a == "fold":
            if in_range:
                out.append(_f(st, f"Fold de {hc} en {pos_label(pos)}", "error", "preflop_tight",
                              f"{hc} es un open estándar desde {pos_label(pos)} ({rtxt}).", c))
            else:
                out.append(_f(st, f"Fold de {hc}", "ok", None, f"Fuera del rango de {pos_label(pos)}.", c))
        return out

    if h.pre_situation == "limpers":
        grp = _group(c.vs_limpers_groups, pos) if pos != "UTG" else "EP"
        r = c.vs_limpers[grp]
        expected = "iso" if hc in r["iso"] else ("overlimp" if hc in r["overlimp"] else ("check" if pos == "BB" else "fold"))
        did = {"raise": "iso", "allin": "iso", "limp": "overlimp", "call": "overlimp", "check": "check", "fold": "fold"}.get(a, a)
        names = {"iso": "subir (aislar)", "overlimp": "limp detrás", "check": "pasar", "fold": "fold"}
        ref = f"Aislar: {c.range_text[f'vs_limpers.{grp}.iso']}. Limp detrás: {c.range_text[f'vs_limpers.{grp}.overlimp']}."
        dec = f"{names.get(did, did).capitalize()} con {hc} ({h.limpers or '?'} limper/s)"
        if did == expected:
            out.append(_f(st, dec, "ok", None, f"Coincide con la tabla contra limpers. {ref}", c))
        else:
            table = {("iso", "overlimp"): ("dudoso", "iso_passive"), ("iso", "check"): ("dudoso", "iso_passive"),
                     ("iso", "fold"): ("error", "preflop_tight"), ("overlimp", "fold"): ("dudoso", "preflop_tight"),
                     ("overlimp", "iso"): ("dudoso", "preflop_loose"), ("fold", "overlimp"): ("dudoso", "preflop_loose"),
                     ("fold", "iso"): ("error", "preflop_loose"), ("check", "iso"): ("dudoso", "preflop_loose")}
            verdict, leak = table.get((expected, did), ("dudoso", "preflop_loose"))
            out.append(_f(st, dec, verdict, leak, f"Lo recomendado era {names[expected]}. {ref}", c))
        if did == "iso" and size and h.limpers:
            target = s["open_bb"] + s["per_limper_bb"] * h.limpers + (s["oop_extra_bb"] if pos in ("SB", "BB") else 0)
            if abs(size - target) > 1.5:
                out.append(_f(st, f"Iso a {size:g} bb", "dudoso", "sizing_pre",
                              f"Referencia: {target} bb ({s['open_bb']} + {s['per_limper_bb']} por limper).", c))
        return out

    if h.pre_situation == "vs_open":
        vp = h.villain_pos or "MP"
        grp = _group(c.vs_open_groups, vp)
        kind = pos if pos in ("SB", "BB") else "IP"
        spot = f"{kind}_vs_{grp}"
        r = c.vs_open[spot]
        expected = "3bet" if hc in r["3bet"] else ("call" if hc in r["call"] else "fold")
        did = {"raise": "3bet", "allin": "3bet", "call": "call", "fold": "fold"}.get(a, a)
        names = {"3bet": "3-bet", "call": "call", "fold": "fold"}
        ref = (f"Contra {pos_label(vp)} desde {pos_label(pos)}: 3-bet {c.range_text[f'vs_open.{spot}.3bet']}; "
               f"call {c.range_text[f'vs_open.{spot}.call']}.")
        dec = f"{names.get(did, did).capitalize()} con {hc} contra open de {pos_label(vp)}"
        if did == expected:
            out.append(_f(st, dec, "ok", None, ref, c))
        else:
            table = {("3bet", "call"): ("dudoso", "passive_3bet"), ("3bet", "fold"): ("error", "preflop_tight"),
                     ("call", "fold"): ("dudoso", "preflop_tight"), ("fold", "call"): ("error", "loose_call_pre"),
                     ("fold", "3bet"): ("dudoso", "preflop_loose"), ("call", "3bet"): ("dudoso", "preflop_loose")}
            verdict, leak = table.get((expected, did), ("dudoso", "loose_call_pre"))
            out.append(_f(st, dec, verdict, leak, f"Lo recomendado era {names[expected]}. {ref}", c))
        if did == "3bet" and a == "raise" and size and h.villain_size:
            x = s["threebet_ip_x" if kind == "IP" else "threebet_oop_x"]
            target = x * h.villain_size
            if abs(size - target) > 0.25 * target:
                out.append(_f(st, f"3-bet a {size:g} bb", "dudoso", "sizing_pre",
                              f"Referencia: {x}x el open = {target:g} bb.", c))
        return out

    if h.pre_situation == "vs_3bet":
        ip = hero_in_position(h)
        call_rng = c.population["vs3bet_call_ip" if ip else "vs3bet_call_oop"]
        expected = "4bet" if hc in c.population["vs3bet_4bet"] else ("call" if hc in call_rng else "fold")
        did = {"raise": "4bet", "allin": "4bet", "call": "call", "fold": "fold"}.get(a, a)
        ref = (f"4-bet: {c.range_text['population.vs3bet_4bet']}. Call {'en posición' if ip else 'fuera de posición'}: "
               f"{c.range_text['population.vs3bet_call_ip' if ip else 'population.vs3bet_call_oop']}.")
        dec = f"{did.capitalize()} con {hc} contra 3-bet"
        if did == expected:
            out.append(_f(st, dec, "ok", None, ref, c))
        else:
            verdict = "dudoso" if (expected, did) in (("call", "fold"), ("4bet", "call")) else "error"
            out.append(_f(st, dec, verdict, "vs3bet", f"Lo recomendado era {expected}. {ref}", c))
        return out
    return out


# ---------------- postflop ----------------

def _hero_invested_pre(h: HandInput) -> float:
    if h.hero_pre.kind in ("raise", "call", "limp", "allin") and h.hero_pre.size:
        return h.hero_pre.size
    if h.hero_pre.kind in ("call",) and h.villain_size:
        return h.villain_size
    return 1.0 if h.position == "BB" else 0.0


def _eval_facing(h, c, prof, vdesc, name, board, R, a, v, to_call, pot_total, raised, spr_flop, rng, out):
    """Decisión del héroe ante una apuesta o subida. Devuelve los combos del rango de apuesta."""
    hd = hand_desc(h.hero, board)
    cls = _EVAL.get_rank_class(strength(h.hero, board))
    outs = len(draw_outs(h.hero, board).all) if len(board) < 5 and cls > 5 else 0
    vf, bf = prof["bet_value"], prof["bet_bluff"]
    if raised:
        vf, bf = vf * 0.5, bf * 0.5
    value, bluffs = top_fraction(R, vf), bottom_fraction(R, bf)
    betting = [x.combo for x in value] + [x.combo for x in bluffs if x not in value]
    eq = equity_vs_combos(h.hero, betting, board, rng)
    req = to_call / (pot_total + to_call)
    what = "sube" if raised else "apuesta"
    model = (f"Tienes {hd}{f' + {outs} outs' if outs >= 4 else ''}. Rival ({prof['label']}, {vdesc}): "
             f"{what} con su mejor {vf:.0%}{f' y farolea con su peor {bf:.0%}' if bf else ''}. "
             f"Tu equity contra ese rango ≈ {eq:.0%}; pagar {to_call:g} bb para un bote de {pot_total + to_call:g} pide {req:.0%}.")
    dec = f"{_act_label(a).capitalize()} ante {_act_label(v)}"
    if a.kind == "call":
        if eq >= req:
            out.append(_f(name, dec, "ok", None, model + " Call rentable.", c))
        else:
            gap = req - eq
            implied = name != "river" and outs >= 8 and (h.stack_bb - _hero_invested_pre(h)) >= 4 * to_call
            if implied:
                out.append(_f(name, dec, "dudoso", "overcall", model + " Falta equity directa, pero con proyecto y stacks profundos las implied odds pueden compensar.", c))
            else:
                out.append(_f(name, dec, "error" if gap > 0.06 else "dudoso", "overcall", model + " Pagas sin la equity necesaria.", c))
    elif a.kind == "fold":
        if eq <= req:
            out.append(_f(name, dec, "ok", None, model + " Fold correcto.", c))
        else:
            out.append(_f(name, dec, "error" if eq - req > 0.06 else "dudoso", "overfold", model + " Tenías precio para pagar.", c))
    else:
        if eq >= 0.6:
            out.append(_f(name, dec, "ok", None, model + " Subida por valor razonable.", c))
        elif eq >= req:
            out.append(_f(name, dec, "dudoso", None, model + " El call ya era rentable. La subida depende de que paguen peores o foldeen mejores (no modelado).", c))
        else:
            verdict = "error" if h.profile == "calling_station" else "dudoso"
            out.append(_f(name, dec, verdict, "bad_bluff", model + " Subida sin equity suficiente: solo funciona si el rival foldea mucho.", c))
    if a.kind in ("call", "allin", "raise") and cls == 8 and spr_flop and spr_flop > 6 and "allin" in (a.kind, v.kind):
        out.append(_f(name, "Stack con una pareja", "dudoso", "spr_stackoff",
                      f"SPR en el flop ≈ {spr_flop:.1f}. Con SPR alto, una pareja rara vez es favorita cuando entra todo el dinero.", c))
    return betting


def _eval_initiative(h, c, prof, name, board, R, a, pot, out):
    """Apostar o pasar sin apuesta delante."""
    hd = hand_desc(h.hero, board)
    cls = _EVAL.get_rank_class(strength(h.hero, board))
    outs = len(draw_outs(h.hero, board).all) if len(board) < 5 and cls > 5 else 0
    size = a.size or round(0.66 * pot, 1)
    if name == "river":
        C = top_fraction(R, prof["call"])
        sd_all, sd_c = showdown(h.hero, R, board), showdown(h.hero, C, board)
        folds = len(R) - len(C)
        ev_check = sd_all.equity * pot
        ev_bet = (folds * pot + sd_c.win * (pot + size) - sd_c.lose * size + sd_c.tie * pot / 2) / len(R)
        model = (f"Tienes {hd}. Rival ({prof['label']}, {len(R)} combos posibles a estas alturas) paga con su mejor "
                 f"{prof['call']:.0%}. Equity contra lo que paga: {sd_c.equity:.0%}. EV(check) ≈ {ev_check:.1f} bb, "
                 f"EV(apostar {size:g}) ≈ {ev_bet:.1f} bb.")
        tol = 0.03 * pot
        if a.kind in ("bet", "allin"):
            if ev_bet >= ev_check - tol:
                kind = "valor" if sd_c.equity >= 0.5 else "farol"
                out.append(_f(name, f"Apostar ({kind})", "ok", None, model, c))
                if kind == "valor" and h.profile == "calling_station" and size < 0.45 * pot:
                    out.append(_f(name, f"Tamaño {size:g} bb", "dudoso", "sizing_post",
                                  "Contra una calling station apuesta más grande por valor.", c))
            else:
                out.append(_f(name, "Apostar", "error", "bad_bluff", model + " Te pagan sobre todo manos mejores.", c))
        else:
            if ev_check >= ev_bet - tol:
                out.append(_f(name, "Check", "ok", None, model, c))
            elif sd_c.equity >= 0.5:
                out.append(_f(name, "Check", "error", "missed_value", model + " Te pagaban peores: apuesta por valor.", c))
            else:
                out.append(_f(name, "Check", "dudoso", "missed_bluff", model + " Un farol tenía EV positivo contra este perfil.", c))
        return
    strong, air = cls <= 7, cls == 9
    if a.kind in ("bet", "allin"):
        if air and outs < 8 and h.players >= 3:
            out.append(_f(name, "Apostar sin mano multiway", "dudoso", "multiway_bluff",
                          f"Tienes {hd} con {outs} outs contra {h.players - 1} rivales. Alguien suele haber ligado.", c))
        elif air and outs < 8 and h.profile == "calling_station":
            out.append(_f(name, "Farol contra calling station", "error", "bad_bluff",
                          f"Tienes {hd} con {outs} outs y el rival casi nunca foldea.", c))
        elif strong and h.profile == "calling_station" and size < 0.45 * pot:
            out.append(_f(name, f"Apuesta pequeña ({size:g} bb)", "dudoso", "sizing_post",
                          f"Tienes {hd}: contra quien paga, apuesta 2/3 o más.", c))
        else:
            out.append(_f(name, f"Apostar con {hd}", "ok", None,
                          "Coherente: " + ("mano fuerte, apuesta por valor." if strong else
                          "pareja: valor y protección contra cartas que te superan." if cls == 8 else
                          f"semifarol con {outs} outs." if outs >= 8 else "apuesta con iniciativa."), c))
    else:
        if strong and h.profile in ("calling_station", "maniac"):
            out.append(_f(name, f"Check con {hd}", "dudoso", "missed_value",
                          "Contra un rival que paga mucho, el slowplay pierde valor. Apuesta.", c))
        else:
            out.append(_f(name, f"Check con {hd}", "ok", None, "Sin objeción con los principios de la app.", c))


def eval_postflop(h: HandInput, c: Content, rng: random.Random | None = None) -> list[Finding]:
    """Recorre cada calle y hasta dos intercambios (rival → tú) por calle.

    Lleva lo que cada uno ha puesto en la calle para calcular el precio real
    ante subidas, y estrecha el rango del rival según lo que hizo:
    - si pagó una apuesta tuya: se queda con lo que continúa (pareja+, proyectos);
    - si apostó o subió y tú pagaste: se queda con su rango de apuesta modelado.
    """
    rng = rng or random.Random(0)
    out: list[Finding] = []
    prof = c.profiles.get(h.profile, c.profiles["unknown"])
    vclasses, vdesc = villain_range(h, c)
    vcombos: list | None = None
    board: list[str] = []
    spr_flop = None
    for st in h.streets:
        if not st.cards:
            break
        board = board + st.cards
        name = st.name
        if vcombos is None:
            vcombos = live_combos(vclasses, board + h.hero)
        else:
            vcombos = [x for x in vcombos if not (set(x) & set(st.cards))]
        if name == "flop" and st.pot:
            spr_flop = max(0.0, h.stack_bb - _hero_invested_pre(h)) / st.pot
        exchanges = [(st.villain, st.hero), (st.villain2, st.hero2)]
        if not any(a.kind for _, a in exchanges) or not vcombos:
            continue
        if st.pot is None:
            first = next(a for _, a in exchanges if a.kind)
            out.append(_f(name, _act_label(first), "info", None, "Falta el bote al inicio de la calle: no se puede evaluar.", c))
            continue
        hero_in = vill_in = 0.0
        villain_called = False
        villain_bet_range = None
        for idx, (v, a) in enumerate(exchanges):
            if v.kind in ("bet", "raise", "allin"):
                if not v.size:
                    if a.kind:
                        out.append(_f(name, _act_label(a), "info", None, "Falta el tamaño de la apuesta del rival.", c))
                    break
                vill_in = max(vill_in, v.size)
            elif v.kind == "call" and hero_in > vill_in:
                vill_in = hero_in
                villain_called = True
            if not a.kind:
                continue
            R = on_board(vcombos, board)
            if not R:
                break
            if vill_in > hero_in and a.kind in ("call", "fold", "raise", "allin"):
                raised = v.kind == "raise" or hero_in > 0
                betting = _eval_facing(h, c, prof, vdesc, name, board, R, a, v, vill_in - hero_in,
                                       st.pot + hero_in + vill_in, raised, spr_flop, rng, out)
                if a.kind == "call":
                    villain_bet_range = betting
            elif vill_in <= hero_in and a.kind in ("bet", "check", "allin"):
                _eval_initiative(h, c, prof, name, board, R, a, st.pot + hero_in + vill_in, out)
            if a.kind == "fold":
                return out
            if a.kind in ("bet", "raise", "allin") and a.size:
                hero_in = max(hero_in, a.size)
            elif a.kind == "call":
                hero_in = vill_in
        # el rango del rival para la calle siguiente
        if villain_bet_range:
            vcombos = villain_bet_range
        elif villain_called and len(board) < 5:
            vcombos = narrow_after_calls(vcombos, board, (len(board),))
    return out


def analyze(h: HandInput, c: Content) -> list[Finding]:
    return eval_preflop(h, c) + eval_postflop(h, c)
