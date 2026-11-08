import Link from "next/link";
import { createShortHunt, deleteShortHunt } from "@/app/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { MeasurementForm } from "@/components/MeasurementForm";
import { MeasurementList } from "@/components/MeasurementList";
import { SubmitButton } from "@/components/SubmitButton";
import { KnowledgeErrorBox } from "@/components/ui";
import { getReferenceLines, getShortFlow } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";
import { referenceStats } from "@/lib/reference";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrderMeasurements({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getOrder(id);
  let lines, flow;
  try {
    lines = getReferenceLines().lineas;
    flow = getShortFlow();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const stats = await referenceStats(o.modelo);
  const lineNames = Object.fromEntries(lines.map((l) => [l.id, l.nombre]));
  const groups = [...new Set(lines.map((l) => l.grupo))];
  return (
    <div className="space-y-6">
      <section className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Registrar medición</h2>
          <Link href={`/placa/referencias?modelo=${o.modelo}`} className="text-bench-info underline">Ver referencias del modelo →</Link>
        </div>
        <MeasurementForm orderId={o.id} modelo={o.modelo} lines={lines} stats={stats} />
      </section>

      <section className="space-y-3">
        <h2 className="h2">Mediciones de esta orden</h2>
        <MeasurementList items={o.measurements} lineNames={lineNames} stats={stats} />
      </section>

      <section className="space-y-3">
        <h2 className="h2">Cortocircuitos</h2>
        <form action={createShortHunt} className="panel flex flex-wrap items-end gap-3">
          <input type="hidden" name="orderId" value={o.id} />
          <div className="min-w-[14rem] flex-1">
            <label className="label" htmlFor="linea">Línea en corto</label>
            <select id="linea" name="linea" className="input" defaultValue="vdd_main">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {lines.filter((l) => l.grupo === g).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="w-48">
            <label className="label" htmlFor="resistencia">Resistencia (Ω)</label>
            <input id="resistencia" name="resistencia" inputMode="decimal" className="input" />
          </div>
          <SubmitButton>Localizar corto →</SubmitButton>
        </form>
        {o.shortHunts.map((h) => {
          let n = 0;
          try {
            n = JSON.parse(h.pasosHechos).length;
          } catch {}
          return (
            <div key={h.id} className="card flex flex-wrap items-center justify-between gap-3">
              <Link href={`/placa/cortos/${h.id}`} className="flex-1">
                <p className="text-xl font-bold">{lineNames[h.linea] ?? h.linea}</p>
                <p className="muted">
                  {h.resuelto ? <b className="text-bench-ok">Resuelto</b> : <b className="text-bench-accent">En curso</b>} · {n}/{flow.pasos.length} pasos
                  {h.resistencia != null && ` · ${h.resistencia} Ω`}
                  {h.voltajeInyectado != null && ` · inyectado ${h.voltajeInyectado} V / ${h.corrienteMax ?? "?"} A`}
                  {` · ${dateTime(h.updatedAt)}`}
                </p>
                {h.componenteHallado && <p>Hallado: <b>{h.componenteHallado}</b></p>}
              </Link>
              <DeleteButton action={deleteShortHunt.bind(null, h.id)} />
            </div>
          );
        })}
      </section>
    </div>
  );
}
