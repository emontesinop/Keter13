import type { TrainingDomain } from "./types";
import type { Weakness } from "./weakness";
import type { Lang } from "./explain";

export interface PlanBlock {
  domain: TrainingDomain;
  minutes: number;
  activity: string; // route / mode key in the app
  objective: string;
  measurable: string;
  linkedWeakness?: string;
}

export interface DailyPlan { date: string; totalMinutes: number; recovery: boolean; objective: string; blocks: PlanBlock[]; rationale: string[]; }

export interface PlanInput {
  date: string; // YYYY-MM-DD
  minutes: number;
  weaknesses: Weakness[];
  dueReviews: number;
  /** consecutive training days up to yesterday */
  streak: number;
  /** recent accuracy of training sessions (0..100) to detect fatigue */
  recentSessionScores?: number[];
  lang?: Lang;
}

const ACT: Record<TrainingDomain, { activity: string; es: string; en: string; mes: string; men: string }> = {
  tactics: { activity: "tactics", es: "Patrones tácticos de tus partidas y de la base curada", en: "Tactical patterns from your games and the curated set", mes: "≥80% de aciertos al primer intento", men: "≥80% first-try accuracy" },
  calculation: { activity: "calculation", es: "Calcular sin mover: escribe la variante completa antes de mover", en: "Calculation without moving: write the full line before moving", mes: "Variantes correctas hasta la jugada 3", men: "Lines correct to move 3" },
  threat_awareness: { activity: "blunder-prevention", es: "Prevención de errores: identifica la amenaza del rival antes de cada jugada", en: "Blunder prevention: identify the opponent's threat before each move", mes: "Amenaza identificada en ≥90% de posiciones", men: "Threat identified in ≥90% of positions" },
  openings: { activity: "openings", es: "Repertorio (Londres / Caro-Kann): ideas, planes y líneas donde fallas", en: "Repertoire (London / Caro-Kann): ideas, plans and lines where you fail", mes: "Repetir sin error las líneas pendientes", men: "Repeat due lines without error" },
  positional: { activity: "think-like-gm", es: "Piensa como un GM: evalúa desequilibrios y propone un plan antes del motor", en: "Think like a GM: evaluate imbalances and propose a plan before the engine", mes: "Plan coincide con las 3 primeras del motor en ≥2/3 posiciones", men: "Plan matches engine top-3 in ≥2/3 positions" },
  endgames: { activity: "endgames", es: "Laboratorio de finales: técnica contra el motor/tablebase", en: "Endgame lab: technique vs engine/tablebase", mes: "Lograr el resultado teórico", men: "Achieve the theoretical result" },
  review: { activity: "review", es: "Repaso espaciado de tus errores anteriores", en: "Spaced review of your previous mistakes", mes: "Todas las tarjetas vencidas repasadas", men: "All due cards reviewed" },
  time_management: { activity: "tournament", es: "Partida de entrenamiento con control realista y rutina de verificación", en: "Training game with realistic clock and blunder-check routine", mes: "Sin errores graves por apuro de tiempo", men: "No blunders in time trouble" },
};

/**
 * Adaptive daily plan. Baseline (60 min): tactics 10, weakness 15, opening/positional 15, endgame 10, review 10.
 * Minutes are redistributed toward the domains of the most damaging recent weaknesses.
 */
export function buildDailyPlan(i: PlanInput): DailyPlan {
  const lang = i.lang ?? "es";
  const es = lang === "es";
  const rationale: string[] = [];
  const recent = i.recentSessionScores ?? [];
  const fatigue = recent.length >= 3 && recent.slice(-3).every((s, k, arr) => k === 0 || s < arr[k - 1]) && recent[recent.length - 1] < 60;
  const recovery = i.streak >= 6 || fatigue;
  const total = recovery ? Math.max(20, Math.round(i.minutes / 2)) : i.minutes;
  if (recovery) rationale.push(es ? (fatigue ? "Tus últimas sesiones muestran fatiga (rendimiento descendente): hoy sesión ligera de recuperación." : `Llevas ${i.streak} días seguidos: sesión ligera para consolidar sin saturarte.`) : (fatigue ? "Recent sessions show fatigue (declining scores): light recovery session today." : `${i.streak} days in a row: light session to consolidate without burnout.`));

  const weights: Record<TrainingDomain, number> = { tactics: 10, calculation: 0, threat_awareness: 0, openings: 7.5, positional: 7.5, endgames: 10, review: 10, time_management: 0 };
  const top = i.weaknesses.slice(0, 3);
  const totalScore = top.reduce((s, w) => s + w.score, 0) || 1;
  // 15 "weakness" minutes distributed by score share
  for (const w of top) weights[w.domain] = (weights[w.domain] ?? 0) + (15 * w.score) / totalScore;
  if (!top.length) { weights.calculation += 15; rationale.push(es ? "Aún no hay partidas analizadas: el bloque de debilidades se dedica a cálculo general." : "No analysed games yet: the weakness block goes to general calculation."); }
  else rationale.push(es ? `Prioridades según tus partidas: ${top.map((w) => w.label.es).join("; ")}.` : `Priorities from your games: ${top.map((w) => w.label.en).join("; ")}.`);
  if (i.dueReviews === 0) { weights.tactics += weights.review / 2; weights.calculation += weights.review / 2; weights.review = 0; }
  else if (i.dueReviews > 30) { weights.review += 5; rationale.push(es ? `${i.dueReviews} repasos pendientes: se amplía el bloque de repaso.` : `${i.dueReviews} reviews due: review block enlarged.`); }
  if (recovery) { weights.review += 10; weights.time_management = 0; }

  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  let blocks: PlanBlock[] = (Object.keys(weights) as TrainingDomain[])
    .filter((d) => weights[d] > 0)
    .map((d) => ({ domain: d, minutes: Math.max(5, Math.round(((weights[d] / sum) * total) / 5) * 5), activity: ACT[d].activity, objective: es ? ACT[d].es : ACT[d].en, measurable: es ? ACT[d].mes : ACT[d].men, linkedWeakness: top.find((w) => w.domain === d)?.id }));
  // fix rounding drift
  let drift = total - blocks.reduce((s, b) => s + b.minutes, 0);
  blocks.sort((a, b) => b.minutes - a.minutes);
  while (drift !== 0 && blocks.length) { const step = drift > 0 ? 5 : -5; const target = blocks.find((b) => b.minutes + step >= 5); if (!target) break; target.minutes += step; drift -= step; if (Math.abs(drift) < 5) break; }
  blocks = blocks.filter((b) => b.minutes > 0);
  const order: TrainingDomain[] = ["tactics", "calculation", "threat_awareness", "positional", "openings", "endgames", "time_management", "review"];
  blocks.sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));
  const objective = top[0]
    ? (es ? `Objetivo del día: reducir "${top[0].label.es}".` : `Today's goal: reduce "${top[0].label.en}".`)
    : (es ? "Objetivo del día: construir la rutina de cálculo y verificación de amenazas." : "Today's goal: build the calculation and threat-check routine.");
  return { date: i.date, totalMinutes: blocks.reduce((s, b) => s + b.minutes, 0), recovery, objective, blocks, rationale };
}

/** Weekly plan: interleaves domains so the same skill isn't massed on one day (interleaved practice). */
export function buildWeeklyThemes(weaknesses: Weakness[], lang: Lang = "es") {
  const es = lang === "es";
  const top = weaknesses.slice(0, 3).map((w) => (es ? w.label.es : w.label.en));
  const themes = es
    ? ["Táctica + amenazas", "Estructuras de la Caro-Kann", "Finales de torres", "Planes del Sistema Londres", "Cálculo profundo", "Partida de torneo + autoanálisis", "Repaso y descanso activo"]
    : ["Tactics + threats", "Caro-Kann structures", "Rook endgames", "London System plans", "Deep calculation", "Tournament game + self-analysis", "Review & active rest"];
  return themes.map((t, i) => ({ day: i + 1, theme: t, focusWeakness: top[i % Math.max(1, top.length)] ?? null }));
}
