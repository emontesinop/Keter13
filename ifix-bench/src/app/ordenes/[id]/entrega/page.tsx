import { FileDown } from "lucide-react";
import { updateOrder } from "@/app/actions";
import { ChecklistBoard } from "@/components/ChecklistBoard";
import { DeliverButton } from "@/components/DeliverButton";
import { PhotoGallery } from "@/components/PhotoGallery";
import { SubmitButton } from "@/components/SubmitButton";
import { KnowledgeErrorBox } from "@/components/ui";
import { CHECK_RESULTS } from "@/lib/constants";
import { checklistFor } from "@/lib/checklist";
import { compareChecklists } from "@/lib/compare";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/format";

export const dynamic = "force-dynamic";

const label = (r?: string) => (r ? CHECK_RESULTS.find((c) => c.id === r)?.label ?? r : "—");

export default async function Delivery({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, settings] = await Promise.all([getOrder(id), getSettings()]);
  let groups;
  try {
    groups = checklistFor(o.modelo);
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const entrada = o.checklist.filter((c) => c.fase === "ENTRADA");
  const salida = o.checklist.filter((c) => c.fase === "SALIDA");
  const cmp = compareChecklists(groups.flatMap((g) => g.items), entrada, salida);
  const update = updateOrder.bind(null, o.id);
  const warnings = [
    ...(cmp.pendientes.length ? [`${cmp.pendientes.length} ítem(s) del checklist de salida sin revisar`] : []),
    ...cmp.empeoro.map((i) => `${i.label}: funcionaba al recibirlo y ahora falla`),
    ...(o.photos.some((p) => p.etapa === "SALIDA") ? [] : ["No hay fotos de salida"]),
  ];

  return (
    <div className="space-y-6">
      {cmp.empeoro.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-950/70 p-4" role="alert">
          <p className="text-xl font-bold">⚠ {cmp.empeoro.length} función(es) que funcionaban al recibir el equipo ahora fallan</p>
          <p className="text-lg">{cmp.empeoro.map((i) => i.label).join(" · ")}</p>
        </div>
      )}

      <section className="panel space-y-3">
        <h2 className="h2">Antes y después</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-green-950/50 p-3 text-center"><p className="text-3xl font-black text-bench-ok">{cmp.mejoro.length}</p><p className="text-sm">Reparado (Falla → OK)</p></div>
          <div className="rounded-xl bg-red-950/50 p-3 text-center"><p className="text-3xl font-black text-bench-bad">{cmp.empeoro.length}</p><p className="text-sm">Empeoró</p></div>
          <div className="rounded-xl bg-amber-950/50 p-3 text-center"><p className="text-3xl font-black text-amber-300">{cmp.sigueFallando.length}</p><p className="text-sm">Sigue fallando</p></div>
          <div className="rounded-xl bg-bench-bg p-3 text-center"><p className="text-3xl font-black">{cmp.pendientes.length}</p><p className="text-sm">Sin revisar en salida</p></div>
        </div>
        <details>
          <summary className="cursor-pointer font-semibold text-bench-info">Ver tabla completa</summary>
          <table className="mt-2 w-full text-left">
            <thead className="text-bench-muted"><tr><th className="p-2">Función</th><th className="p-2">Entrada</th><th className="p-2">Salida</th></tr></thead>
            <tbody>
              {cmp.all.map((i) => (
                <tr key={i.key} className={cn("border-t border-bench-line", i.entrada !== i.salida && i.salida && "bg-sky-950/40")}>
                  <td className="p-2">{i.label}</td><td className="p-2">{label(i.entrada)}</td><td className="p-2 font-semibold">{label(i.salida)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="h2">Checklist de salida</h2>
        <p className="muted">Mismo checklist que la entrada. Los ítems que cambian respecto a la entrada se marcan en azul.</p>
        <ChecklistBoard orderId={o.id} fase="SALIDA" groups={groups} results={salida} compareWith={entrada} />
      </section>

      <section className="panel space-y-3">
        <h2 className="h2">Fotos de salida</h2>
        <PhotoGallery orderId={o.id} etapa="SALIDA" photos={o.photos.filter((p) => p.etapa === "SALIDA")} />
      </section>

      <form action={update} className="panel space-y-4">
        <h2 className="h2">Datos de entrega</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="costoFinal">Total a cobrar ({settings.moneda})</label>
            <input id="costoFinal" name="costoFinal" inputMode="decimal" className="input" defaultValue={o.costoFinal ?? o.presupuesto ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="garantiaDias">Garantía (días)</label>
            <input id="garantiaDias" name="garantiaDias" inputMode="numeric" className="input" defaultValue={o.garantiaDias ?? settings.garantia_dias} />
          </div>
          <div>
            <label className="label" htmlFor="recibidoPor">Recibe el equipo</label>
            <input id="recibidoPor" name="recibidoPor" className="input" defaultValue={o.recibidoPor ?? o.customer.nombre} />
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="diagnosticoFinal">Trabajo realizado</label>
            <textarea id="diagnosticoFinal" name="diagnosticoFinal" rows={3} className="input" defaultValue={o.diagnosticoFinal ?? ""} />
          </div>
          <div className="md:col-span-3">
            <label className="label" htmlFor="notaEntrega">Observaciones para el cliente</label>
            <textarea id="notaEntrega" name="notaEntrega" rows={2} className="input" defaultValue={o.notaEntrega ?? ""} placeholder="ej. Face ID no disponible desde antes de la reparación." />
          </div>
        </div>
        <SubmitButton>Guardar datos de entrega</SubmitButton>
      </form>

      <section className="panel space-y-3">
        <h2 className="h2">Nota de entrega</h2>
        <a href={`/api/ordenes/${o.id}/nota-entrega`} target="_blank" rel="noreferrer" className="btn-secondary btn-xl w-full">
          <FileDown className="h-7 w-7" /> Ver / imprimir nota de entrega (PDF)
        </a>
        <DeliverButton orderId={o.id} warnings={warnings} delivered={o.estado === "ENTREGADO"} />
      </section>
    </div>
  );
}
