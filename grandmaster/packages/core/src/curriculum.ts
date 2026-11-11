import type { TrainingDomain } from "./types";

export interface Stage {
  id: number;
  range: [number, number];
  title: { es: string; en: string };
  goals: { es: string; en: string }[];
  /** emphasis weights per domain used by the plan generator when no game data exists */
  emphasis: Partial<Record<TrainingDomain, number>>;
}

export const STAGES: Stage[] = [
  { id: 1, range: [1600, 1800], title: { es: "Eliminar descuidos tácticos", en: "Eliminate tactical oversights" }, emphasis: { tactics: 3, threat_awareness: 3, calculation: 2, endgames: 2, openings: 1 },
    goals: [
      { es: "Verificar amenazas del rival antes de cada jugada", en: "Check opponent threats before every move" },
      { es: "Disciplina de cálculo: jaques, capturas y amenazas", en: "Calculation discipline: checks, captures, threats" },
      { es: "Desequilibrios posicionales básicos", en: "Basic positional imbalances" },
      { es: "Principios de apertura sólidos", en: "Sound opening principles" },
      { es: "Finales de torres esenciales (Lucena, Philidor)", en: "Essential rook endings (Lucena, Philidor)" },
    ] },
  { id: 2, range: [1800, 2000], title: { es: "Candidatas, estructuras y profilaxis", en: "Candidates, structures, prophylaxis" }, emphasis: { calculation: 3, positional: 3, openings: 2, endgames: 2, tactics: 2 },
    goals: [
      { es: "Generar jugadas candidatas de forma sistemática", en: "Generate candidate moves systematically" },
      { es: "Cálculo más profundo (3–5 jugadas)", en: "Deeper calculation (3–5 moves)" },
      { es: "Estructuras de peones típicas de tu repertorio", en: "Typical pawn structures of your repertoire" },
      { es: "Profilaxis y cambios posicionales", en: "Prophylaxis and positional exchanges" },
      { es: "Conversión técnica de ventajas", en: "Technical conversion of advantages" },
    ] },
  { id: 3, range: [2000, 2200], title: { es: "Planificación estratégica y dinámica", en: "Strategic planning & dynamics" }, emphasis: { positional: 3, calculation: 3, endgames: 2, openings: 2 },
    goals: [
      { es: "Comprensión posicional avanzada", en: "Advanced positional understanding" },
      { es: "Desequilibrios dinámicos y compensación", en: "Dynamic imbalances & compensation" },
      { es: "Cálculo complejo", en: "Complex calculation" },
      { es: "Finales avanzados", en: "Advanced endgames" },
      { es: "Técnica práctica de torneo", en: "Practical tournament technique" },
    ] },
  { id: 4, range: [2200, 2400], title: { es: "Preparación profunda", en: "Deep preparation" }, emphasis: { openings: 3, calculation: 3, endgames: 2, positional: 2 },
    goals: [
      { es: "Preparación de aperturas en profundidad", en: "In-depth opening preparation" },
      { es: "Teoría de finales compleja", en: "Complex endgame theory" },
      { es: "Cálculo bajo presión", en: "Calculation under pressure" },
      { es: "Análisis de partidas magistrales", en: "Master game analysis" },
    ] },
  { id: 5, range: [2400, 2900], title: { es: "Preparación profesional", en: "Professional preparation" }, emphasis: { openings: 3, calculation: 3, positional: 2, endgames: 2 },
    goals: [
      { es: "Preparación específica por rival", en: "Opponent-specific preparation" },
      { es: "Novedades teóricas", en: "Opening novelties" },
      { es: "Rutinas profesionales de torneo", en: "Professional tournament routines" },
    ] },
];

export function stageFor(rating: number): Stage {
  return STAGES.find((s) => rating >= s.range[0] && rating < s.range[1]) ?? (rating < 1600 ? STAGES[0] : STAGES[STAGES.length - 1]);
}

export interface DiagnosticItemSpec { domain: TrainingDomain; label: { es: string; en: string }; target: number; unit: "%" | "moves" | "count"; }
export interface MilestoneDiagnostic { milestone: number; items: DiagnosticItemSpec[]; }

/** Skill targets a player should demonstrate before the next rating milestone. These are coaching heuristics, not FIDE norms. */
export function milestoneDiagnostic(milestone: number): MilestoneDiagnostic {
  const k = Math.max(0, (milestone - 1700) / 100); // 0 for 1700, 3 for 2000, ...
  const pct = (base: number, step: number, cap = 95) => Math.min(cap, Math.round(base + step * k));
  return {
    milestone,
    items: [
      { domain: "tactics", label: { es: "Táctica (problemas de tu nivel objetivo)", en: "Tactics (puzzles at target level)" }, target: pct(70, 2), unit: "%" },
      { domain: "threat_awareness", label: { es: "Identificación de amenazas", en: "Threat identification" }, target: pct(80, 2), unit: "%" },
      { domain: "calculation", label: { es: "Profundidad de cálculo correcta", en: "Correct calculation depth" }, target: Math.min(8, 3 + Math.floor(k / 2)), unit: "moves" },
      { domain: "endgames", label: { es: "Finales teóricos superados", en: "Theoretical endgames passed" }, target: Math.min(20, 4 + Math.round(k * 2)), unit: "count" },
      { domain: "openings", label: { es: "Repertorio recordado con su idea", en: "Repertoire recalled with ideas" }, target: pct(75, 2), unit: "%" },
      { domain: "positional", label: { es: "Evaluación posicional (plan correcto)", en: "Positional evaluation (correct plan)" }, target: pct(55, 3, 90), unit: "%" },
    ],
  };
}

export function evaluateDiagnostic(spec: MilestoneDiagnostic, results: Partial<Record<TrainingDomain, number>>) {
  const items = spec.items.map((it) => {
    const v = results[it.domain];
    return { ...it, value: v ?? null, passed: v !== undefined && v >= it.target };
  });
  const passed = items.filter((i) => i.passed).length;
  return { milestone: spec.milestone, items, passed, total: items.length, ready: passed === items.length, gaps: items.filter((i) => !i.passed).map((i) => i.domain) };
}

/** Long-term roadmap. FIDE requirements summarised; always verify against the current FIDE Handbook. */
export const GM_ROADMAP = {
  es: [
    "Ratings online (Chess.com, Lichess) y FIDE son sistemas distintos con poblaciones distintas: no son intercambiables.",
    "Para tener rating FIDE necesitas un FIDE ID (a través de tu federación nacional) y jugar torneos válidos para rating FIDE.",
    "El título de Gran Maestro (GM) lo otorga la FIDE según su Reglamento de Títulos (Handbook B.01): en esencia exige alcanzar un rating FIDE de 2500 en algún momento y obtener normas de GM.",
    "Una norma de GM requiere, entre otras condiciones, una actuación (performance) de al menos 2600 en un torneo que cumpla requisitos de número de partidas, proporción de titulados, GMs entre los rivales y diversidad de federaciones; las normas deben sumar un mínimo de partidas.",
    "Títulos intermedios: Candidato a Maestro (CM), Maestro FIDE (FM, 2300), Maestro Internacional (IM, 2400 + normas de IM).",
    "Las reglas cambian periódicamente: consulta siempre la versión vigente del FIDE Handbook antes de planificar normas.",
    "Ningún software garantiza un título. La app maximiza la calidad de tu entrenamiento; los resultados dependen de práctica, competición y años de trabajo.",
  ],
  en: [
    "Online ratings (Chess.com, Lichess) and FIDE ratings are different systems with different pools: they are not interchangeable.",
    "To get a FIDE rating you need a FIDE ID (via your national federation) and must play FIDE-rated tournaments.",
    "The Grandmaster (GM) title is awarded by FIDE under its Title Regulations (Handbook B.01): essentially reaching a FIDE rating of 2500 at some point and earning GM norms.",
    "A GM norm requires, among other conditions, a performance of at least 2600 in an event meeting requirements on number of games, share of titled players, GMs among opponents and federation diversity; norms must add up to a minimum number of games.",
    "Intermediate titles: Candidate Master (CM), FIDE Master (FM, 2300), International Master (IM, 2400 + IM norms).",
    "Rules change periodically: always check the current FIDE Handbook before planning norms.",
    "No software guarantees a title. The app maximises your training quality; results depend on practice, competition and years of work.",
  ],
};
