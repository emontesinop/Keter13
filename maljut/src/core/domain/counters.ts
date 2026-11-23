export const DAY_MS = 86_400_000;

export interface Counters {
  /** Días completos desde el inicio o la última recaída. */
  daysThisAttempt: number;
  /** Milisegundos desde el inicio del intento actual (para mostrar horas el primer día). */
  msThisAttempt: number;
  /** Días completos sin consumo desde la fecha de inicio. Nunca se reinicia. */
  cleanDaysTotal: number;
  /** Días completos desde la fecha de inicio. */
  totalDays: number;
  /** cleanDaysTotal / totalDays; null si aún no se completa el primer día. */
  cleanPct: number | null;
  moneySaved: number;
}

/**
 * Las recaídas se agrupan por "día del proceso" (bloques de 24 h desde la fecha de inicio),
 * así varias en el mismo día cuentan como una sola.
 */
export function computeCounters(
  quitAt: Date,
  lapses: { at: Date }[],
  now: Date,
  dailyCost: number,
): Counters {
  const q = quitAt.getTime();
  const elapsed = Math.max(0, now.getTime() - q);
  const totalDays = Math.floor(elapsed / DAY_MS);

  const valid = lapses.map((l) => l.at.getTime()).filter((t) => t >= q && t <= now.getTime());
  const lapseDayIdx = new Set(valid.map((t) => Math.floor((t - q) / DAY_MS)));
  const pastLapseDays = [...lapseDayIdx].filter((i) => i < totalDays).length;

  const cleanDaysTotal = Math.max(0, totalDays - pastLapseDays);
  const attemptStart = Math.max(q, ...valid);
  const msThisAttempt = Math.max(0, now.getTime() - attemptStart);
  const moneyDays = Math.max(0, elapsed / DAY_MS - lapseDayIdx.size);

  return {
    daysThisAttempt: Math.floor(msThisAttempt / DAY_MS),
    msThisAttempt,
    cleanDaysTotal,
    totalDays,
    cleanPct: totalDays > 0 ? cleanDaysTotal / totalDays : null,
    moneySaved: Math.max(0, dailyCost) * moneyDays,
  };
}

/** Día del proceso (0 = primeras 24 h) para la línea de tiempo. */
export function dayIndex(quitAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - quitAt.getTime()) / DAY_MS));
}
