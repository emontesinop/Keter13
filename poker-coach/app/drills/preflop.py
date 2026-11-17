"""Drills de nivel 1: decisiones preflop a partir de los rangos en content/ranges."""
from __future__ import annotations

from ..content import POSITIONS_9, pos_label
from ..core.cards import all_hand_classes, class_combo_count
from ..core.ranges import range_percent
from .base import Question, concrete_combo, money, numeric_options

ALL = all_hand_classes()
STAKES = [(1, 2), (1, 3)]


def _pick_hand(rng, focus: set[str], p_focus: float = 0.7) -> str:
    pool = sorted(focus) if focus and rng.random() < p_focus else ALL
    return rng.choices(pool, [class_combo_count(h) for h in pool])[0]


def _first_open_pos(c, hc: str) -> str | None:
    for p in c.rfi_order + ["SB"]:
        if hc in c.rfi[p]:
            return p
    return None


def gen_rfi(rng, c) -> Question:
    order = c.rfi_order
    pos = rng.choice(order + ["SB"])
    if pos == "SB":
        tighter, looser = c.rfi["CO"], c.rfi["BTN"] | c.rfi["SB"]
    else:
        i = order.index(pos)
        tighter = c.rfi[order[i - 1]] if i > 0 else frozenset()
        looser = c.rfi[order[i + 1]] if i + 1 < len(order) else frozenset(ALL)
    hc = _pick_hand(rng, set(looser - tighter))
    hand = concrete_combo(rng, hc)
    ans = "raise" if hc in c.rfi[pos] else "fold"
    first = _first_open_pos(c, hc)
    where = (f"{hc} se abre desde {pos_label(first)} en adelante." if first and first != "SB"
             else ("Esta mano solo se abre desde SB." if first == "SB" else "No entra en ningún rango de apertura."))
    exp = (f"Rango de {pos_label(pos)} (≈{range_percent(c.rfi[pos]):.0f} % de manos): "
           f"{c.range_text['rfi.' + pos]}. {where}")
    if pos == "SB":
        exp += " Desde SB solo queda la BB por hablar: sube o foldea, no completes."
    return Question("", 0, 1, "preflop", "l1_rfi",
                    "Todos foldean hasta ti. ¿Qué haces?",
                    [("fold", "Fold"), ("raise", f"Abrir ({c.config['sizing']['open_bb']} bb)")], ans, exp,
                    situation=[("Posición", pos_label(pos)), ("Stacks", "100 bb")],
                    cards=[("Tu mano", hand)])


def _group_of(groups: dict, pos: str) -> str:
    for g, members in groups.items():
        if pos in members:
            return g
    raise KeyError(pos)


def gen_vs_open(rng, c) -> Question:
    openers = ["UTG", "UTG1", "MP", "LJ", "HJ", "CO", "BTN", "SB"]
    opener = rng.choice(openers)
    after = POSITIONS_9[POSITIONS_9.index(opener) + 1:]
    hero = rng.choice(after)
    kind = hero if hero in ("SB", "BB") else "IP"
    spot = f"{kind}_vs_{_group_of(c.vs_open_groups, opener)}"
    r = c.vs_open[spot]
    focus = set(r["3bet"] | r["call"]) | set(c.rfi["CO"])
    hc = _pick_hand(rng, focus, 0.8)
    hand = concrete_combo(rng, hc)
    ans = "3bet" if hc in r["3bet"] else ("call" if hc in r["call"] else "fold")
    sb, bb = rng.choice(STAKES)
    open_bb = c.config["sizing"]["open_bb"]
    open_amt = open_bb * bb
    x = c.config["sizing"]["threebet_ip_x" if kind == "IP" else "threebet_oop_x"]
    label = {"3bet": "3-bet", "call": "Call", "fold": "Fold"}[ans]
    exp = (f"Contra un open de {pos_label(opener)} desde {pos_label(hero)}: "
           f"3-bet con {c.range_text[f'vs_open.{spot}.3bet']}; call con {c.range_text[f'vs_open.{spot}.call']}. "
           f"{hc} → {label}. Tamaño de 3-bet {'en posición' if kind == 'IP' else 'fuera de posición'}: "
           f"{x}x = {money(open_amt * x)}.")
    if hero == "BB" and ans == "fold":
        exp += " Ya tienes la ciega puesta, pero contra un open de 5 bb el precio no compensa con esta mano."
    return Question("", 0, 1, "preflop", "l1_vs_open",
                    f"{pos_label(opener)} abre a {money(open_amt)} y todos foldean hasta ti. ¿Qué haces?",
                    [("fold", "Fold"), ("call", "Call"), ("3bet", "3-bet")], ans, exp,
                    situation=[("Mesa", f"${sb}/${bb} en vivo"), ("Tu posición", pos_label(hero)),
                               ("Abre", f"{pos_label(opener)} a {money(open_amt)}"), ("Stacks", "100 bb")],
                    cards=[("Tu mano", hand)])


def iso_size_bb(c, limpers: int, from_blind: bool) -> int:
    s = c.config["sizing"]
    if limpers == 0:
        return s["open_bb"]
    return s["open_bb"] + s["per_limper_bb"] * limpers + (s["oop_extra_bb"] if from_blind else 0)


def gen_vs_limpers(rng, c) -> Question:
    hero = rng.choice(["UTG1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"])
    before = POSITIONS_9[:POSITIONS_9.index(hero)]
    n = rng.randint(1, min(3, len(before)))
    limpers = sorted(rng.sample(before, n), key=POSITIONS_9.index)
    grp = _group_of(c.vs_limpers_groups, hero)
    r = c.vs_limpers[grp]
    hc = _pick_hand(rng, set(r["iso"] | r["overlimp"]) | set(c.rfi["HJ"]), 0.8)
    hand = concrete_combo(rng, hc)
    blind = hero in ("SB", "BB")
    size = iso_size_bb(c, n, blind)
    sb, bb = rng.choice(STAKES)
    if hero == "BB":
        options = [("check", "Pasar"), ("iso", f"Subir a {size} bb")]
        ans = "iso" if hc in r["iso"] else "check"
    else:
        options = [("fold", "Fold"), ("overlimp", "Completar" if hero == "SB" else "Limp detrás"),
                   ("iso", f"Subir a {size} bb")]
        ans = "iso" if hc in r["iso"] else ("overlimp" if hc in r["overlimp"] else "fold")
    label = dict(options)[ans]
    exp = (f"Desde {pos_label(hero)} con limpers: aísla con {c.range_text[f'vs_limpers.{grp}.iso']}")
    if hero != "BB":
        exp += f"; limp detrás con {c.range_text[f'vs_limpers.{grp}.overlimp']}"
    exp += (f". {hc} → {label}. Tamaño de iso: {c.config['sizing']['open_bb']} bb + {n} por limper"
            + (" + 1 por estar en ciega" if blind else "") + f" = {size} bb ({money(size * bb)}).")
    return Question("", 0, 1, "preflop", "l1_limpers", "Nadie ha subido. ¿Qué haces?",
                    options, ans, exp,
                    situation=[("Mesa", f"${sb}/${bb} en vivo"), ("Tu posición", pos_label(hero)),
                               ("Limpers", ", ".join(pos_label(p) for p in limpers))],
                    cards=[("Tu mano", hand)])


def gen_sizing(rng, c) -> Question:
    sb, bb = rng.choice(STAKES)
    s = c.config["sizing"]
    if rng.random() < 0.55:
        n = rng.randint(0, 3)
        blind = rng.random() < 0.25 and n > 0
        size = iso_size_bb(c, n, blind)
        correct = size * bb
        distract = [(s["open_bb"]) * bb, (3 + n) * bb, (size + 3) * bb, 3 * bb]
        prompt = "Vas a subir. ¿De cuánto?"
        sit = [("Mesa", f"${sb}/${bb} en vivo"), ("Limpers delante", str(n)),
               ("Tu posición", "una ciega (fuera de posición)" if blind else "en posición")]
        exp = (f"{s['open_bb']} bb + {s['per_limper_bb']} bb × {n} limper(s)"
               + (f" + {s['oop_extra_bb']} bb por jugar fuera de posición" if blind else "")
               + f" = {size} bb = {money(correct)}.")
        concept = "l1_limpers" if n else "l1_sizing"
    else:
        open_amt = rng.choice([4, 5, 6]) * bb
        ip = rng.random() < 0.5
        x = s["threebet_ip_x" if ip else "threebet_oop_x"]
        correct = open_amt * x
        other = s["threebet_oop_x" if ip else "threebet_ip_x"]
        distract = [open_amt * other, open_amt * 2, open_amt * 5]
        prompt = "Vas a hacer 3-bet. ¿De cuánto?"
        sit = [("Mesa", f"${sb}/${bb} en vivo"), ("Open del rival", money(open_amt)),
               ("Tú", "en posición" if ip else "fuera de posición (ciegas)")]
        exp = (f"3-bet {'en posición' if ip else 'fuera de posición'}: {x}x el open = {money(correct)}. "
               "Fuera de posición sube más para cobrar más y que te paguen menos.")
        concept = "l1_4bet"
    opts, ans = numeric_options(rng, correct, distract, lambda v: money(v), min_gap=bb)
    return Question("", 0, 1, "preflop", concept, prompt, opts, ans, exp, situation=sit)


GENERATORS = {
    "rfi": (1, gen_rfi),
    "vs_open": (1, gen_vs_open),
    "vs_limpers": (1, gen_vs_limpers),
    "sizing": (1, gen_sizing),
}
