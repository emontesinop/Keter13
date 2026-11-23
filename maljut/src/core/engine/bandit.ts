import { INTERVENTION_IDS, type InterventionId } from "./interventions";

/** Éxitos (s) y fracasos (f) fraccionarios por clave "contexto|brazo"; "*|brazo" es el global. */
export type ArmStats = Record<string, { s: number; f: number; n: number }>;
export type Helped = "yes" | "some" | "no";
type Rng = () => number;

/** Peso del global como prior cuando hay pocos datos en el contexto. */
const GLOBAL_WEIGHT = 0.5;

export function contextKey(date: Date, intensity: number): string {
  const h = date.getHours();
  const slot = h < 6 ? "madrugada" : h < 12 ? "manana" : h < 18 ? "tarde" : "noche";
  const level = intensity >= 8 ? "alta" : intensity >= 5 ? "media" : "baja";
  return `${slot}:${level}`;
}

export function rewardFrom(helped: Helped, before: number, after?: number): number {
  const base = helped === "yes" ? 1 : helped === "some" ? 0.5 : 0;
  if (after === undefined) return base;
  const drop = Math.min(1, Math.max(0, (before - after) / Math.max(before, 1)));
  return Math.min(1, Math.max(0, 0.7 * base + 0.3 * drop));
}

export function updateStats(stats: ArmStats, arm: InterventionId, ctx: string, reward: number): ArmStats {
  const r = Math.min(1, Math.max(0, reward));
  const next = { ...stats };
  for (const key of [`${ctx}|${arm}`, `*|${arm}`]) {
    const cur = next[key] ?? { s: 0, f: 0, n: 0 };
    next[key] = { s: cur.s + r, f: cur.f + (1 - r), n: cur.n + 1 };
  }
  return next;
}

export function chooseIntervention(
  stats: ArmStats,
  ctx: string,
  rng: Rng = Math.random,
  available: readonly InterventionId[] = INTERVENTION_IDS,
): InterventionId {
  const arms = available.length ? available : INTERVENTION_IDS;
  let best = arms[0];
  let bestDraw = -1;
  for (const arm of arms) {
    const c = stats[`${ctx}|${arm}`] ?? { s: 0, f: 0 };
    const g = stats[`*|${arm}`] ?? { s: 0, f: 0 };
    const a = 1 + c.s + GLOBAL_WEIGHT * (g.s - c.s);
    const b = 1 + c.f + GLOBAL_WEIGHT * (g.f - c.f);
    const draw = sampleBeta(a, b, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = arm;
    }
  }
  return best;
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}

/** Marsaglia & Tsang (2000). */
function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normal(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** RNG determinista para tests. */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
