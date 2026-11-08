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
