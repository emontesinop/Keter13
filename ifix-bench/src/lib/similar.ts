import "server-only";
import { db } from "./db";
import { getModels } from "./knowledge";

function familyModels(modelo: string): { same: string[]; family: string[] } {
  try {
    const models = getModels();
    const fam = models.find((m) => m.id === modelo)?.familia;
    return { same: [modelo], family: fam ? models.filter((m) => m.familia === fam).map((m) => m.id) : [modelo] };
  } catch {
    return { same: [modelo], family: [modelo] };
  }
}

export type DcCase = { orderId: string; codigo: string; modelo: string; causaRaiz: string; mA: number | null; fecha: string; mismoModelo: boolean };

/** Para cada patrón DC, casos anteriores (mismo modelo o familia) con causa raíz registrada. */
export async function dcHistoryByPattern(modelo: string | null, excludeOrderId?: string | null): Promise<Record<string, DcCase[]>> {
  const fm = modelo ? familyModels(modelo) : null;
  const rows = await db.dcReading.findMany({
    where: {
      order: {
        causaRaiz: { not: null },
        ...(fm ? { modelo: { in: fm.family } } : {}),
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    },
    include: { order: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const out: Record<string, DcCase[]> = {};
  for (const r of rows) {
    if (!r.order?.causaRaiz) continue;
    (out[r.patron] ??= []).push({
      orderId: r.order.id,
      codigo: r.order.codigo,
      modelo: r.order.modelo,
      causaRaiz: r.order.causaRaiz,
      mA: r.mA,
      fecha: r.createdAt.toISOString(),
      mismoModelo: r.order.modelo === modelo,
    });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => Number(b.mismoModelo) - Number(a.mismoModelo));
  return out;
}

export function modelsInFamily(modelo: string) {
  return familyModels(modelo).family;
}

export type SimilarOrder = { id: string; codigo: string; modelo: string; causaRaiz: string; fecha: string; comunes: string[]; mismoModelo: boolean; score: number };

/** Órdenes anteriores con causa raíz, de la misma familia y con síntomas o consumo en común. */
export async function similarOrders(order: { id: string; modelo: string; sintomas: string }, dcPatterns: string[]): Promise<SimilarOrder[]> {
  const sint = order.sintomas.split(",").filter(Boolean);
  if (!sint.length && !dcPatterns.length) return [];
  const rows = await db.order.findMany({
    where: {
      id: { not: order.id },
      causaRaiz: { not: null },
      modelo: { in: familyModels(order.modelo).family },
      OR: [...sint.map((s) => ({ sintomas: { contains: s } })), ...(dcPatterns.length ? [{ dcReadings: { some: { patron: { in: dcPatterns } } } }] : [])],
    },
    include: { dcReadings: { select: { patron: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows
    .map((r) => {
      const rs = r.sintomas.split(",").filter(Boolean);
      const comunes = sint.filter((s) => rs.includes(s));
      const dcMatch = r.dcReadings.some((d) => dcPatterns.includes(d.patron));
      const mismoModelo = r.modelo === order.modelo;
      return {
        id: r.id,
        codigo: r.codigo,
        modelo: r.modelo,
        causaRaiz: r.causaRaiz!,
        fecha: r.updatedAt.toISOString(),
        comunes: [...comunes, ...(dcMatch ? ["consumo DC"] : [])],
        mismoModelo,
        score: comunes.length * 2 + (dcMatch ? 3 : 0) + (mismoModelo ? 1 : 0),
      };
    })
    .filter((r) => r.comunes.length)
    .sort((a, b) => b.score - a.score || b.fecha.localeCompare(a.fecha))
    .slice(0, 8);
}
