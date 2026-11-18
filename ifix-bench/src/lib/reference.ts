import "server-only";
import { db } from "./db";
import { refKey, type RefStat } from "./measure";

/** Estadísticas de tus mediciones de placas buenas para un modelo. */
export async function referenceStats(modelo: string): Promise<Record<string, RefStat>> {
  const rows = await db.measurement.groupBy({
    by: ["linea", "modo"],
    where: { modelo, placaBuena: true },
    _count: true,
    _avg: { valor: true },
    _min: { valor: true },
    _max: { valor: true },
  });
  return Object.fromEntries(
    rows.map((r) => [refKey(r.linea, r.modo), { count: r._count, avg: r._avg.valor ?? 0, min: r._min.valor ?? 0, max: r._max.valor ?? 0 }]),
  );
}
