import Link from "next/link";
import { notFound } from "next/navigation";
import { ShortHuntPanel } from "@/components/ShortHuntPanel";
import { MeasurementForm } from "@/components/MeasurementForm";
import { KnowledgeErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { getReferenceLines, getSafety, getShortFlow } from "@/lib/knowledge";
import { modelNameMap } from "@/lib/order-helpers";
import { referenceStats } from "@/lib/reference";
import { splitList } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await db.shortHunt.findUnique({ where: { id }, include: { order: true } });
  if (!h) notFound();
  let lines, flow, safety;
  try {
    lines = getReferenceLines().lineas;
    flow = getShortFlow();
    safety = getSafety();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const line = lines.find((l) => l.id === h.linea) ?? null;
  const stats = h.order ? await referenceStats(h.order.modelo) : {};
  const names = modelNameMap();
  let pasos: string[] = [];
  try {
    pasos = JSON.parse(h.pasosHechos);
  } catch {}
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="muted text-lg">Localización de cortocircuito</p>
          <h1 className="h1">{line?.nombre ?? h.linea}</h1>
          {h.order && (
            <p className="text-lg">
              <Link href={`/ordenes/${h.order.id}/mediciones`} className="font-mono font-bold text-bench-accent underline">{h.order.codigo}</Link> · {names[h.order.modelo] ?? h.order.modelo}
            </p>
          )}
        </div>
        <Link href={h.order ? `/ordenes/${h.order.id}/mediciones` : "/placa"} className="btn-secondary">Volver</Link>
      </div>
      <ShortHuntPanel
        hunt={{
          id: h.id,
          resistencia: h.resistencia,
          voltajeInyectado: h.voltajeInyectado,
          corrienteMax: h.corrienteMax,
          metodo: splitList(h.metodo),
          pasosHechos: pasos,
          componenteHallado: h.componenteHallado,
          resuelto: h.resuelto,
          notas: h.notas,
        }}
        line={line}
        flow={flow}
        safety={safety}
        measureSlot={
          h.order ? (
            <MeasurementForm orderId={h.order.id} modelo={h.order.modelo} lines={lines} stats={stats} defaultLinea={h.linea} lockLinea />
          ) : (
            <p className="muted">Asocia la búsqueda a una orden para registrar mediciones con comparación.</p>
          )
        }
      />
    </div>
  );
}
