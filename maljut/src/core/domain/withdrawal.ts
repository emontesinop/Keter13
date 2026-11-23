/**
 * Curva orientativa de intensidad de la abstinencia de cannabis (0-1).
 * Basada en Budney et al. y Bonnet & Preuss (2017): inicio 24-72 h, pico días 2-6,
 * mejora en 2-4 semanas; alteraciones del sueño y sueños vívidos pueden durar más.
 */
const POINTS: [number, number][] = [
  [0, 0.3], [1, 0.6], [2, 0.85], [3, 1], [4, 1], [5, 0.9], [6, 0.8], [7, 0.7],
  [10, 0.5], [14, 0.35], [21, 0.22], [28, 0.15], [45, 0.08], [60, 0.03],
];

export function withdrawalIntensity(day: number): number {
  const d = Math.max(0, day);
  if (d >= POINTS[POINTS.length - 1][0]) return POINTS[POINTS.length - 1][1];
  for (let i = 1; i < POINTS.length; i++) {
    const [x1, y1] = POINTS[i];
    if (d <= x1) {
      const [x0, y0] = POINTS[i - 1];
      return y0 + ((d - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 0;
}

export type WithdrawalPhase = "start" | "peak" | "easing" | "settling" | "sleep_tail" | "beyond";

export function withdrawalPhase(day: number): WithdrawalPhase {
  if (day < 2) return "start";
  if (day < 7) return "peak";
  if (day < 14) return "easing";
  if (day < 30) return "settling";
  if (day < 60) return "sleep_tail";
  return "beyond";
}
