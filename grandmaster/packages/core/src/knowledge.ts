import type { Txt } from "./openings";
import { PAWN_STRUCTURES } from "./structures";

export interface SourceRef { title: string; author?: string; note?: string; tier: 1 | 2 | 3 | 4 | 5 | 6; }
export interface Concept {
  id: string;
  title: Txt;
  body: Txt;
  tags: string[];
  level: 1 | 2 | 3 | 4 | 5; // matches curriculum stage
  sources?: SourceRef[];
}
const t = (es: string, en: string): Txt => ({ es, en });

/**
 * Source-quality tiers: 1 federation resources · 2 established literature · 3 GM instructional material ·
 * 4 research · 5 databases · 6 reputable educational sites. Attributions are limited to what those works
 * are widely known to cover; the explanatory text itself is original.
 */
export const CONCEPTS: Concept[] = [
  { id: "threat-check", level: 1, tags: ["threat", "blunder", "habit", "amenaza"], title: t("¿Qué amenaza mi rival?", "What does my opponent threaten?"),
    body: t("Antes de cada jugada, imagina que tu rival pudiera mover otra vez: ¿qué capturaría, qué jaque daría, qué pieza atacaría? La mayoría de las derrotas entre 1500 y 1900 empiezan por no hacerse esta pregunta.",
      "Before every move, imagine your opponent could move again: what would they capture, which check would they give, which piece would they attack? Most losses between 1500 and 1900 start by skipping this question.") },
  { id: "cct", level: 1, tags: ["calculation", "checks", "captures", "threats", "blunder"], title: t("Jaques, capturas y amenazas", "Checks, captures, threats"),
    body: t("Orden de búsqueda de candidatas forzadas: primero jaques, luego capturas, luego amenazas — para ti y para tu rival. Es una lista de verificación, no un sustituto de la evaluación.",
      "Search order for forcing candidates: checks first, then captures, then threats — for you and your opponent. It's a checklist, not a substitute for evaluation.") },
  { id: "candidate-moves", level: 2, tags: ["calculation", "candidates", "tree", "kotov"], title: t("Jugadas candidatas y árbol de análisis", "Candidate moves and the analysis tree"),
    body: t("Enumera primero todas las candidatas razonables y calcula cada rama una sola vez, en lugar de saltar de una variante a otra. Al final, compara las evaluaciones de las hojas.",
      "List all reasonable candidates first and calculate each branch once, instead of jumping between lines. Then compare the evaluations at the leaves."),
    sources: [{ title: "Think Like a Grandmaster", author: "Alexander Kotov", note: "candidate moves / analysis tree method", tier: 2 }] },
  { id: "loose-pieces", level: 1, tags: ["hanging", "loose", "tactics", "lpdo"], title: t("Piezas sueltas", "Loose pieces"),
    body: t("Una pieza sin defensa es un objetivo para ataques dobles. 'Loose pieces drop off' (LPDO), acrónimo popularizado por John Nunn, resume la idea: revisa qué piezas tuyas no están protegidas.",
      "An undefended piece is a target for double attacks. 'Loose pieces drop off' (LPDO), an acronym popularised by John Nunn, sums it up: check which of your pieces are unprotected."),
    sources: [{ title: "Secrets of Practical Chess", author: "John Nunn", tier: 3 }] },
  { id: "imbalances", level: 2, tags: ["positional", "imbalance", "plan", "silman"], title: t("Desequilibrios", "Imbalances"),
    body: t("Planifica a partir de las diferencias de la posición: piezas menores, estructura de peones, espacio, material, desarrollo, columnas y casillas débiles, iniciativa y seguridad del rey.",
      "Plan from the differences in the position: minor pieces, pawn structure, space, material, development, files and weak squares, initiative and king safety."),
    sources: [{ title: "How to Reassess Your Chess", author: "Jeremy Silman", tier: 2 }, { title: "The Amateur's Mind", author: "Jeremy Silman", tier: 2 }] },
  { id: "prophylaxis", level: 2, tags: ["prophylaxis", "positional", "nimzowitsch"], title: t("Profilaxis", "Prophylaxis"),
    body: t("Pregúntate qué quiere jugar tu rival y si puedes impedirlo antes de ejecutar tu propio plan. La profilaxis convierte la pregunta de las amenazas en un hábito estratégico.",
      "Ask what your opponent wants to play and whether you can prevent it before executing your own plan. Prophylaxis turns the threat question into a strategic habit."),
    sources: [{ title: "My System", author: "Aron Nimzowitsch", tier: 2 }] },
  { id: "outposts", level: 2, tags: ["outpost", "knight", "squares"], title: t("Puestos avanzados", "Outposts"),
    body: t("Una casilla en campo rival, protegida por tu peón y que ningún peón enemigo puede atacar, es ideal para un caballo. Crear y ocupar outposts es un plan concreto.",
      "A square in enemy territory, protected by your pawn and unattackable by enemy pawns, is ideal for a knight. Creating and occupying outposts is a concrete plan."),
    sources: [{ title: "My System", author: "Aron Nimzowitsch", tier: 2 }] },
  { id: "pawn-weaknesses", level: 2, tags: ["pawn", "isolated", "doubled", "backward", "structure"], title: t("Debilidades de peones", "Pawn weaknesses"),
    body: t("Peones aislados, doblados y retrasados son objetivos a largo plazo. No los evites a cualquier precio: a veces dan columnas abiertas o actividad. Evalúa qué recibes a cambio.",
      "Isolated, doubled and backward pawns are long-term targets. Don't avoid them at any price: sometimes they bring open files or activity. Evaluate what you get in return."),
    sources: [{ title: "Chess Structures: A Grandmaster Guide", author: "Mauricio Flores Rios", tier: 2 }] },
  { id: "iqp", level: 3, tags: ["iqp", "isolated", "panov", "structure"], title: t("Peón de dama aislado", "Isolated queen's pawn"),
    body: t("El bando con PDA busca actividad y ataque (ruptura d5); el defensor bloquea la casilla delante del peón, cambia piezas menores y busca el final.",
      "The IQP side seeks activity and attack (the d5 break); the defender blockades the square in front of the pawn, trades minor pieces and heads for the endgame."),
    sources: [{ title: "Chess Structures: A Grandmaster Guide", author: "Mauricio Flores Rios", tier: 2 }] },
  { id: "king-safety", level: 1, tags: ["king", "attack", "shield"], title: t("Seguridad del rey", "King safety"),
    body: t("Cada avance de los peones del enroque crea casillas débiles permanentes. Antes de mover un peón delante de tu rey, cuenta los atacantes y defensores de esa zona.",
      "Every advance of the castling pawns creates permanent weak squares. Before moving a pawn in front of your king, count attackers and defenders in that zone.") },
  { id: "piece-activity", level: 1, tags: ["activity", "mobility", "worst piece"], title: t("Actividad y la peor pieza", "Activity and the worst piece"),
    body: t("Cuando no hay táctica, mejora tu peor pieza. La movilidad de las piezas suele ser más importante que pequeñas diferencias de material.",
      "When there's no tactic, improve your worst piece. Piece mobility is often more important than small material differences.") },
  { id: "opposition", level: 1, tags: ["endgame", "king", "pawn", "opposition"], title: t("La oposición", "The opposition"),
    body: t("Dos reyes enfrentados con una casilla de por medio: quien NO tiene que mover tiene la oposición. Es la clave de casi todos los finales de rey y peón.",
      "Two kings facing each other with one square between: the side that does NOT have to move has the opposition. It's the key to almost all king and pawn endings."),
    sources: [{ title: "100 Endgames You Must Know", author: "Jesús de la Villa", tier: 2 }] },
  { id: "triangulation", level: 3, tags: ["endgame", "triangulation", "zugzwang"], title: t("Triangulación", "Triangulation"),
    body: t("Perder un tiempo moviendo el rey en triángulo para trasladar el turno al rival y ponerlo en zugzwang.",
      "Losing a tempo by moving the king in a triangle to pass the move to the opponent and put them in zugzwang."),
    sources: [{ title: "Dvoretsky's Endgame Manual", author: "Mark Dvoretsky", tier: 2 }] },
  { id: "lucena", level: 2, tags: ["rook endgame", "lucena", "bridge"], title: t("Lucena", "Lucena"),
    body: t("Rey delante de su peón en séptima, rey rival cortado: se gana 'construyendo el puente' con la torre en la cuarta fila para tapar los jaques.",
      "King in front of its pawn on the 7th, enemy king cut off: win by 'building a bridge' with the rook on the fourth rank to block checks."),
    sources: [{ title: "100 Endgames You Must Know", author: "Jesús de la Villa", tier: 2 }] },
  { id: "philidor", level: 2, tags: ["rook endgame", "philidor", "defense", "draw"], title: t("Philidor", "Philidor"),
    body: t("Defensa básica de torre contra torre y peón: la torre en la tercera fila propia impide que el rey avance; cuando el peón llega a ella, jaques desde atrás.",
      "Basic rook vs rook-and-pawn defence: the rook on your own third rank stops the king advancing; once the pawn reaches it, check from behind."),
    sources: [{ title: "100 Endgames You Must Know", author: "Jesús de la Villa", tier: 2 }] },
  { id: "wrong-bishop", level: 2, tags: ["endgame", "bishop", "rook pawn"], title: t("Alfil del color equivocado", "Wrong-coloured bishop"),
    body: t("Alfil y peón de torre no ganan si el alfil no controla la casilla de coronación y el rey defensor llega a la esquina.",
      "Bishop and rook pawn don't win if the bishop doesn't control the promotion square and the defending king reaches the corner.") },
  { id: "queen-vs-pawn", level: 3, tags: ["endgame", "queen", "pawn"], title: t("Dama contra peón en séptima", "Queen vs pawn on the 7th"),
    body: t("Contra peones centrales y de caballo, la dama gana forzando al rey delante del peón y acercando el propio rey. Peones de alfil y torre suelen ser tablas si el rey atacante está lejos (ahogado).",
      "Against central and knight pawns the queen wins by forcing the king in front of the pawn and bringing her own king. Bishop and rook pawns are often drawn if the attacking king is far (stalemate)."),
    sources: [{ title: "Dvoretsky's Endgame Manual", author: "Mark Dvoretsky", tier: 2 }] },
  { id: "basic-mates", level: 1, tags: ["mate", "endgame", "basic"], title: t("Mates básicos", "Basic mates"),
    body: t("Dama o torre más rey contra rey: restringe, acerca el rey, evita el ahogado.", "Queen or rook plus king vs king: restrict, approach with the king, avoid stalemate.") },
  { id: "woodpecker", level: 2, tags: ["method", "tactics", "repetition", "patterns"], title: t("Método Woodpecker", "Woodpecker Method"),
    body: t("Resolver el mismo conjunto de problemas en ciclos cada vez más rápidos para automatizar patrones. Aquí se aplica con tus propios errores y repetición espaciada.",
      "Solve the same puzzle set in increasingly fast cycles to automate patterns. Here it's applied to your own mistakes with spaced repetition."),
    sources: [{ title: "The Woodpecker Method", author: "Axel Smith & Hans Tikkanen", tier: 2 }] },
  { id: "self-analysis", level: 1, tags: ["method", "analysis", "engine"], title: t("Autoanálisis antes del motor", "Self-analysis before the engine"),
    body: t("Analiza tu partida sin motor primero: anota tus dudas, tus candidatas y lo que temías. Después compara con el motor. Así entrenas tu juicio, no tu memoria. Botvinnik es conocido por el análisis riguroso de sus propias partidas.",
      "Analyse your game without an engine first: note your doubts, candidates and fears. Then compare with the engine. This trains judgment, not memory. Botvinnik is known for rigorously analysing his own games.") },
  { id: "deliberate-practice", level: 1, tags: ["method", "practice", "ericsson"], title: t("Práctica deliberada", "Deliberate practice"),
    body: t("Entrenamiento enfocado en debilidades concretas, con objetivos medibles, retroalimentación inmediata y dificultad ligeramente por encima de tu nivel actual.",
      "Training focused on specific weaknesses, with measurable goals, immediate feedback and difficulty slightly above your current level."),
    sources: [{ title: "Deliberate practice research (Ericsson et al., 1993)", author: "K. A. Ericsson, R. Krampe, C. Tesch-Römer", tier: 4 }] },
  { id: "spaced-repetition", level: 1, tags: ["method", "memory", "review"], title: t("Repetición espaciada", "Spaced repetition"),
    body: t("Repasar justo antes de olvidar fortalece la memoria a largo plazo. La app programa tus errores y conceptos con un algoritmo de la familia SM-2.",
      "Reviewing just before forgetting strengthens long-term memory. The app schedules your mistakes and concepts with an SM-2-family algorithm."),
    sources: [{ title: "Spacing effect literature (Ebbinghaus; Cepeda et al., 2006)", tier: 4 }] },
  { id: "motif-fork", level: 1, tags: ["fork", "double attack", "tactics"], title: t("Ataque doble", "Fork"), body: t("Una pieza ataca dos objetivos a la vez. Busca reyes, damas y piezas sueltas a un salto de caballo o en la misma línea.", "One piece attacks two targets at once. Look for kings, queens and loose pieces a knight's jump apart or on the same line.") },
  { id: "motif-pin", level: 1, tags: ["pin", "tactics"], title: t("Clavada", "Pin"), body: t("Una pieza no puede (o no debe) moverse porque expondría otra más valiosa detrás. Ataca la pieza clavada con piezas de menor valor.", "A piece can't (or shouldn't) move because it would expose a more valuable piece behind. Attack the pinned piece with lesser pieces.") },
  { id: "motif-skewer", level: 1, tags: ["skewer", "tactics"], title: t("Enfilada", "Skewer"), body: t("Como la clavada pero al revés: la pieza valiosa está delante y, al apartarse, cae la de detrás.", "Like a pin in reverse: the valuable piece is in front and, when it moves, the one behind falls.") },
  { id: "motif-discovered_attack", level: 2, tags: ["discovered", "tactics"], title: t("Ataque a la descubierta", "Discovered attack"), body: t("Al mover una pieza se destapa la línea de otra. La pieza que se mueve puede crear una segunda amenaza.", "Moving one piece uncovers another's line. The moving piece can create a second threat.") },
  { id: "motif-back_rank_mate", level: 1, tags: ["back rank", "mate"], title: t("Mate en la última fila", "Back-rank mate"), body: t("Un rey encerrado por sus propios peones es vulnerable a jaques en la primera/última fila. Crear 'luft' (h3/h6) a tiempo previene el problema.", "A king boxed in by its own pawns is vulnerable on the back rank. Making luft (h3/h6) in time prevents it.") },
  { id: "motif-sacrifice", level: 2, tags: ["sacrifice", "tactics"], title: t("Sacrificio", "Sacrifice"), body: t("Entregar material a cambio de algo calculable: mate, recuperar más material o una ventaja posicional duradera.", "Giving material for something calculable: mate, regaining more material, or a lasting positional edge.") },
  { id: "motif-quiet_move", level: 3, tags: ["quiet move", "calculation"], title: t("Jugada tranquila", "Quiet move"), body: t("Una jugada sin jaque ni captura que crea una amenaza imparable. Son difíciles de ver porque no están en la lista de forzadas.", "A move without check or capture that creates an unstoppable threat. Hard to see because they're not on the forcing list.") },
];

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const tokenize = (s: string) => strip(s).split(/[^a-z0-9#+]+/).filter((w) => w.length > 1);

export interface Doc { id: string; text: string; meta?: unknown; }

/** Okapi BM25 index (k1=1.2, b=0.75). Used for RAG retrieval before LLM calls. */
export class Bm25 {
  private docs: { id: string; tf: Map<string, number>; len: number; meta?: unknown }[] = [];
  private df = new Map<string, number>();
  private avg = 0;
  constructor(docs: Doc[]) {
    for (const d of docs) {
      const toks = tokenize(d.text);
      const tf = new Map<string, number>();
      for (const w of toks) tf.set(w, (tf.get(w) ?? 0) + 1);
      for (const w of tf.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
      this.docs.push({ id: d.id, tf, len: toks.length, meta: d.meta });
    }
    this.avg = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }
  search(q: string, k = 5) {
    const qs = tokenize(q);
    const N = this.docs.length;
    return this.docs
      .map((d) => {
        let score = 0;
        for (const w of qs) {
          const f = d.tf.get(w);
          if (!f) continue;
          const idf = Math.log(1 + (N - (this.df.get(w) ?? 0) + 0.5) / ((this.df.get(w) ?? 0) + 0.5));
          score += idf * ((f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * d.len) / this.avg)));
        }
        return { id: d.id, score, meta: d.meta };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

/** Pawn-structure cards exposed as retrievable concepts (opening understanding for the coach). */
export function structureConcepts(): Concept[] {
  return PAWN_STRUCTURES.map((st) => ({
    id: `structure-${st.id}`, level: 2, tags: ["structure", "opening", "plan", "estructura", "apertura", "plan", st.id.replace(/-/g, " ")],
    title: st.name,
    body: {
      es: `${st.description.es} Blancas: ${st.plans.white.map((p) => p.es).join(" ")} Negras: ${st.plans.black.map((p) => p.es).join(" ")}`,
      en: `${st.description.en} White: ${st.plans.white.map((p) => p.en).join(" ")} Black: ${st.plans.black.map((p) => p.en).join(" ")}`,
    },
  }));
}

export function conceptDocs(): Doc[] {
  return [...CONCEPTS, ...structureConcepts()].map((c) => ({ id: c.id, text: [c.title.es, c.title.en, c.body.es, c.body.en, c.tags.join(" ")].join(" "), meta: c }));
}

let _idx: Bm25 | null = null;
export function searchConcepts(q: string, k = 4): Concept[] {
  _idx = _idx ?? new Bm25(conceptDocs());
  return _idx.search(q, k).map((r) => r.meta as Concept);
}
export const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id) ?? structureConcepts().find((c) => c.id === id);
