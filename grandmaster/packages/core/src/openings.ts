import { Chess } from "chess.js";

export interface Txt { es: string; en: string; }
export interface OpeningNode { san: string; name?: string; idea?: Txt; children?: OpeningNode[]; }
export interface Repertoire {
  id: string;
  side: "w" | "b";
  name: Txt;
  summary: Txt;
  principles: Txt[];
  structures: Txt[];
  plans: Txt[];
  typicalMistakes: Txt[];
  tree: OpeningNode[];
  /** where it fits in a full repertoire */
  group: "white" | "black_e4" | "black_d4";
  /** character of the positions it leads to */
  style: Txt;
  /** 1 = understanding-based, little forcing theory · 3 = heavy, concrete theory */
  theoryLoad: 1 | 2 | 3;
  /** ids of PAWN_STRUCTURES this opening leads to */
  structureIds: string[];
}

export const t = (es: string, en: string): Txt => ({ es, en });

export interface RepLine { sans: string[]; name?: string; ideas?: Record<number, Txt>; }

/** Merge annotated SAN lines into a tree (shared prefixes become shared nodes). */
export function buildTree(lines: RepLine[]): OpeningNode[] {
  const root: OpeningNode[] = [];
  for (const l of lines) {
    let nodes = root;
    l.sans.forEach((san, i) => {
      let n = nodes.find((x) => x.san === san);
      if (!n) { n = { san }; nodes.push(n); }
      if (l.ideas?.[i] && !n.idea) n.idea = l.ideas[i];
      if (i === l.sans.length - 1 && l.name && !n.name) n.name = l.name;
      n.children = n.children ?? [];
      nodes = n.children;
    });
  }
  const prune = (ns: OpeningNode[]) => ns.forEach((n) => { if (n.children && !n.children.length) delete n.children; else if (n.children) prune(n.children); });
  prune(root);
  return root;
}

export const sp = (s: string) => s.trim().split(/\s+/);

export const LONDON: Repertoire = {
  id: "london",
  side: "w",
  group: "white",
  style: t("Sólido y de sistema: mismo esquema contra casi todo; ataque en el flanco de rey con Ce5/f4.", "Solid system play: the same setup against almost everything; kingside attack with Ne5/f4."),
  theoryLoad: 1,
  structureIds: ["london-triangle"],
  name: t("Sistema Londres", "London System"),
  summary: t(
    "Esquema sólido con d4, Af4, e3, c3, Cf3/Cbd2 y Ad3. La prioridad no es memorizar, sino entender cuándo atacar con Ce5 y f4, y cuándo jugar en el flanco de dama.",
    "Solid setup with d4, Bf4, e3, c3, Nf3/Nbd2 and Bd3. The point is not memorisation but understanding when to attack with Ne5 and f4, and when to play on the queenside."),
  principles: [
    t("Saca el alfil de casillas negras (Af4) ANTES de e3, para que no quede encerrado.", "Develop the dark-squared bishop (Bf4) BEFORE e3 so it isn't locked in."),
    t("Si las negras juegan ...Ad6, responde a menudo con Ag3: mantienes tu estructura y, si cambian, la columna h puede abrirse a tu favor.", "If Black plays ...Bd6, often answer Bg3: you keep your structure and, if they exchange, the h-file may open in your favour."),
    t("Contra ...c5 y ...Db6, vigila b2: Db3 o Dc1 son recursos típicos.", "Against ...c5 and ...Qb6 watch b2: Qb3 or Qc1 are typical resources."),
    t("No cambies piezas sin motivo: el Londres gana con maniobras, no con simplificaciones prematuras.", "Don't trade pieces without reason: the London wins through manoeuvring, not premature simplification."),
  ],
  structures: [
    t("Triángulo de peones c3-d4-e3: sólido, controla e5 y c5.", "c3-d4-e3 pawn triangle: solid, controls e5 and c5."),
    t("Con Ce5 + f4 se forma una estructura tipo 'Stonewall' que apoya un ataque en el flanco de rey.", "With Ne5 + f4 you get a Stonewall-type structure supporting a kingside attack."),
  ],
  plans: [
    t("Ataque en el flanco de rey: Ce5, f4, Tf3-h3 o Dh5 cuando el enroque negro está débil.", "Kingside attack: Ne5, f4, Rf3-h3 or Qh5 when Black's king is weakened."),
    t("Juego central: e4 en el momento justo (cuando Cbd2 y Ad3 lo apoyan) para abrir líneas.", "Central break: e4 at the right moment (supported by Nbd2 and Bd3) to open lines."),
    t("Flanco de dama: a4 y Ca3-b5 si las negras avanzan ...c4.", "Queenside: a4 and Na3-b5 if Black advances ...c4."),
  ],
  typicalMistakes: [
    t("Jugar e3 antes de Af4 (el alfil queda encerrado).", "Playing e3 before Bf4 (the bishop gets locked in)."),
    t("Dejar b2 indefenso frente a ...Db6.", "Leaving b2 undefended against ...Qb6."),
    t("Jugar en piloto automático contra ...g6/...d6 (esquemas tipo India de Rey): conviene h3 para guardar el alfil.", "Playing on autopilot against ...g6/...d6 (King's Indian setups): h3 to keep the bishop is useful."),
  ],
  tree: buildTree([
    { sans: sp("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3"), name: "London: main setup vs ...e6/...c5", ideas: {
      2: t("El alfil sale antes de e3.", "The bishop develops before e3."),
      12: t("Ag3: si ...Axg3 hxg3, la columna h semiabierta apoya el ataque.", "Bg3: if ...Bxg3 hxg3, the half-open h-file supports an attack."),
      14: t("Esquema completo. Planes: Ce5+f4, o la ruptura central e4.", "Full setup. Plans: Ne5+f4, or the central e4 break.") } },
    { sans: sp("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Qb6 Qb3"), name: "London: early ...Qb6", ideas: { 10: t("Db3 defiende b2 y ofrece el cambio de damas (que abre la columna a para ti).", "Qb3 defends b2 and offers a queen trade (which opens the a-file for you).") } },
    { sans: sp("d4 d5 Bf4 Nf6 e3 Bf5 c4 e6 Nc3"), name: "London: ...Bf5 mirror", ideas: { 6: t("Contra el alfil simétrico, c4 ataca d5 y pregunta por b7.", "Against the mirrored bishop, c4 hits d5 and asks about b7.") } },
    { sans: sp("d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3"), name: "London: early ...c5", ideas: { 8: t("Db3: tras ...c4 la dama vuelve a c2 con tempo sobre la estructura.", "Qb3: after ...c4 the queen returns to c2.") } },
    { sans: sp("d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3"), name: "London vs King's Indian setup", ideas: { 10: t("h3 da al alfil la retirada h2 frente a ...Ch5.", "h3 gives the bishop the h2 retreat against ...Nh5.") } },
    { sans: sp("d4 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nd2"), name: "London vs ...e6/...c5", ideas: { 8: t("Cd2 (no Cc3): mantiene c3 para el peón y apoya e4.", "Nd2 (not Nc3): keeps c3 for the pawn and supports e4.") } },
  ]),
};

export const CARO_KANN: Repertoire = {
  id: "caro-kann",
  side: "b",
  group: "black_e4",
  style: t("Sólida y estratégica: estructura sana, buenos finales, contrajuego con ...c5.", "Solid and strategic: healthy structure, good endgames, counterplay with ...c5."),
  theoryLoad: 2,
  structureIds: ["caro-advance", "caro-classical", "iqp", "carlsbad"],
  name: t("Defensa Caro-Kann", "Caro-Kann Defence"),
  summary: t(
    "1.e4 c6 2.d4 d5: estructura sólida que permite sacar el alfil de casillas blancas antes de ...e6. Las ideas clave son la ruptura ...c5, el control de e4 y los finales favorables.",
    "1.e4 c6 2.d4 d5: a solid structure that lets the light-squared bishop out before ...e6. Key ideas are the ...c5 break, control of e4 and favourable endgames."),
  principles: [
    t("Saca el alfil de casillas blancas (…Af5/…Ag4) antes de jugar ...e6.", "Develop the light-squared bishop (...Bf5/...Bg4) before playing ...e6."),
    t("En la Avanzada, la ruptura ...c5 es tu principal contrajuego contra la cadena d4-e5.", "In the Advance, the ...c5 break is your main counterplay against the d4-e5 chain."),
    t("Contra h4-h5 en la Clásica, no dejes que el alfil quede atrapado: ...h6 y ...Ah7 a tiempo.", "Against h4-h5 in the Classical, don't let the bishop get trapped: ...h6 and ...Bh7 in time."),
    t("Saber cuándo cambiar tu alfil de casillas blancas es una decisión estratégica: tras el cambio, tus peones en casillas blancas pueden quedar más débiles.", "Knowing when to trade your light-squared bishop is strategic: afterwards your light-square pawns may become weaker."),
  ],
  structures: [
    t("Avanzada: cadena blanca d4-e5 vs ...c6/d5/e6. Ataca la base (d4) con ...c5 y ...Cc6/...Db6.", "Advance: White chain d4-e5 vs ...c6/d5/e6. Attack the base (d4) with ...c5 and ...Nc6/...Qb6."),
    t("Clásica: estructura 'Caro-Kann sana' sin peón e; casilla e4/e5 clave, enroque largo blanco frecuente.", "Classical: healthy Caro structure without e-pawns; e4/e5 squares key, White often castles long."),
    t("Panov: peón aislado en d (blancas) o negro según cambios — juega contra el PDA bloqueando d5.", "Panov: isolated d-pawn (usually White) — play against the IQP by blockading d5."),
    t("Cambio: estructura de Carlsbad invertida; ataque de minorías de las blancas posible (b4-b5).", "Exchange: reversed Carlsbad structure; White may launch a minority attack (b4-b5)."),
  ],
  plans: [
    t("Avanzada: ...c5, ...Cc6, ...Db6 presionando d4; a veces ...Ce7-f5.", "Advance: ...c5, ...Nc6, ...Qb6 pressuring d4; sometimes ...Ne7-f5."),
    t("Clásica: desarrollo armónico ...Cd7, ...Cgf6, ...e6, ...Ae7/…Ad6 y ruptura ...c5.", "Classical: harmonious ...Nd7, ...Ngf6, ...e6, ...Be7/...Bd6 and the ...c5 break."),
    t("Contra el PDA (Panov): bloquear en d5, cambiar piezas menores y llegar a finales favorables.", "Against the IQP (Panov): blockade on d5, trade minor pieces, reach favourable endgames."),
  ],
  typicalMistakes: [
    t("Jugar ...e6 antes de sacar el alfil (Defensa Francesa mala).", "Playing ...e6 before developing the bishop (a bad French)."),
    t("En la Avanzada, retrasar ...c5 y quedar sin contrajuego.", "In the Advance, delaying ...c5 and having no counterplay."),
    t("Permitir h4-h5 atrapando el alfil en g6.", "Allowing h4-h5 trapping the bishop on g6."),
  ],
  tree: buildTree([
    { sans: sp("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3"), name: "Advance: Short system", ideas: {
      4: t("Avanzada: gana espacio; tu plan es ...Af5, ...e6 y ...c5.", "Advance: gains space; your plan is ...Bf5, ...e6 and ...c5."),
      5: t("El alfil sale ANTES de ...e6.", "The bishop comes out BEFORE ...e6."),
      9: t("...c5: ataca la base de la cadena (d4).", "...c5: hit the base of the chain (d4).") } },
    { sans: sp("e4 c6 d4 d5 e5 Bf5 Nc3 e6 g4 Bg6 Nge2 c5"), name: "Advance: 4.Nc3", ideas: { 11: t("Contra g4, ...c5 sigue siendo el contrajuego principal.", "Against g4, ...c5 is still the main counterplay.") } },
    { sans: sp("e4 c6 d4 d5 e5 Bf5 h4 h5"), name: "Advance: 4.h4", ideas: { 7: t("...h5 frena h5 y protege el alfil.", "...h5 stops h5 and protects the bishop.") } },
    { sans: sp("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bd2 Ngf6 O-O-O Be7"), name: "Classical main line", ideas: {
      11: t("...h6: prepara ...Ah7 si h5.", "...h6: prepares ...Bh7 if h5."),
      15: t("El alfil se retira a h7; el peón h5 puede volverse debilidad en el final.", "The bishop retreats to h7; the h5 pawn can become an endgame weakness."),
      23: t("Desarrollo completo: luego ...Dc7/...c5 y a menudo enroque corto.", "Development complete: next ...Qc7/...c5 and often short castling.") } },
    { sans: sp("e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5 Ng3 Bg6"), name: "Classical (3.Nd2)" },
    { sans: sp("e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7"), name: "Exchange Variation", ideas: { 11: t("...Ag4 activa el alfil antes de ...e6.", "...Bg4 activates the bishop before ...e6.") } },
    { sans: sp("e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7"), name: "Panov Attack", ideas: { 9: t("Estructura de peón aislado: bloquea d5 y cambia piezas menores.", "IQP structure: blockade d5 and trade minor pieces.") } },
    { sans: sp("e4 c6 d4 d5 f3 e6 Nc3 Bb4"), name: "Fantasy Variation", ideas: { 5: t("...e6 refuerza d5; ...Ab4 presiona e4.", "...e6 reinforces d5; ...Bb4 pressures e4.") } },
    { sans: sp("e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6"), name: "Two Knights", ideas: { 5: t("...Ag4 clava el caballo; el cambio en f3 da una estructura sólida.", "...Bg4 pins the knight; trading on f3 gives a solid structure.") } },
    { sans: sp("e4 c6 d3 d5 Nd2 e5 Ngf3 Bd6"), name: "King's Indian Attack setup" },
    { sans: sp("e4 c6 c4 d5 exd5 cxd5 cxd5 Nf6"), name: "Accelerated Panov" },
  ]),
};


/** Flatten a repertoire tree into lines of SAN (for drilling and tests). */
export function repertoireLines(rep: Repertoire): string[][] {
  const out: string[][] = [];
  const walk = (nodes: OpeningNode[], path: string[]) => {
    for (const n of nodes) {
      const p = [...path, n.san];
      if (!n.children?.length) out.push(p); else walk(n.children, p);
    }
  };
  walk(rep.tree, []);
  return out;
}

export interface RepertoireMatch {
  matchedPlies: number;
  deviation?: { ply: number; by: "user" | "opponent"; played: string; expected: string[] };
  lineName?: string;
  lastIdea?: Txt;
  endOfBook: boolean;
}

/** Compare a game's SAN moves with the repertoire tree from the user's perspective. */
export function matchRepertoire(rep: Repertoire, sans: string[], userColor: "w" | "b"): RepertoireMatch {
  let nodes = rep.tree;
  let lineName: string | undefined;
  let lastIdea: Txt | undefined;
  for (let i = 0; i < sans.length; i++) {
    if (!nodes?.length) return { matchedPlies: i, lineName, lastIdea, endOfBook: true };
    const node = nodes.find((n) => n.san === sans[i]);
    const mover = i % 2 === 0 ? "w" : "b";
    if (!node) {
      return { matchedPlies: i, lineName, lastIdea, endOfBook: false, deviation: { ply: i + 1, by: mover === userColor ? "user" : "opponent", played: sans[i], expected: nodes.map((n) => n.san) } };
    }
    if (node.name) lineName = node.name;
    if (node.idea) lastIdea = node.idea;
    nodes = node.children ?? [];
  }
  return { matchedPlies: sans.length, lineName, lastIdea, endOfBook: !nodes?.length };
}

/** Validate every line of a repertoire is legal chess. Returns list of problems. */
export function validateRepertoire(rep: Repertoire): string[] {
  const problems: string[] = [];
  for (const l of repertoireLines(rep)) {
    const c = new Chess();
    for (const s of l) { try { c.move(s); } catch { problems.push(`${rep.id}: illegal ${s} in ${l.join(" ")}`); break; } }
  }
  return problems;
}

export interface OpeningGameStat { opening: string; result: "win" | "loss" | "draw"; evalAtMove15?: number; deviationBy?: "user" | "opponent"; deviationSan?: string; }

export function openingStats(games: OpeningGameStat[]) {
  const map = new Map<string, { n: number; w: number; d: number; l: number; evals: number[]; userDev: Record<string, number>; oppDev: Record<string, number> }>();
  for (const g of games) {
    const s = map.get(g.opening) ?? { n: 0, w: 0, d: 0, l: 0, evals: [], userDev: {}, oppDev: {} };
    s.n++; s[g.result === "win" ? "w" : g.result === "draw" ? "d" : "l"]++;
    if (g.evalAtMove15 !== undefined) s.evals.push(g.evalAtMove15);
    if (g.deviationSan) { const bucket = g.deviationBy === "user" ? s.userDev : s.oppDev; bucket[g.deviationSan] = (bucket[g.deviationSan] ?? 0) + 1; }
    map.set(g.opening, s);
  }
  return [...map.entries()].map(([opening, s]) => ({
    opening, games: s.n,
    winPct: Math.round((s.w / s.n) * 1000) / 10, drawPct: Math.round((s.d / s.n) * 1000) / 10, lossPct: Math.round((s.l / s.n) * 1000) / 10,
    avgEvalAt15: s.evals.length ? Math.round(s.evals.reduce((a, b) => a + b, 0) / s.evals.length) : null,
    userDeviations: s.userDev, opponentDeviations: s.oppDev,
  })).sort((a, b) => b.games - a.games);
}
