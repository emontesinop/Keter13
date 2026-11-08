import { deleteOrder, updateIcloud, updateOrder } from "@/app/actions";
import { OrderFields } from "@/components/OrderFields";
import { PhotoGallery } from "@/components/PhotoGallery";
import { StatePicker } from "@/components/StatePicker";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";
import { getModels, getPhysical, getSafety, getSymptoms } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";
import { docTypeLabel, documentsForModel } from "@/lib/documents";
import { DocLink } from "@/components/DocLink";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { dateTime, money, splitList } from "@/lib/format";

export const dynamic = "force-dynamic";

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col border-b border-bench-line py-2 sm:flex-row sm:gap-4">
      <dt className="w-48 shrink-0 text-bench-muted">{k}</dt>
      <dd className={mono ? "font-mono" : ""}>{v || "—"}</dd>
    </div>
  );
}

export default async function OrderSummary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, settings] = await Promise.all([getOrder(id), getSettings()]);
  const models = getModels();
  const symptoms = getSymptoms();
  const physical = getPhysical();
  const safety = getSafety();
  const label = (arr: { key: string; label: string }[], keys: string[]) => keys.map((k) => arr.find((a) => a.key === k)?.label ?? k).join(", ");
  const update = updateOrder.bind(null, o.id);
  const icloud = updateIcloud.bind(null, o.id);
  const del = deleteOrder.bind(null, o.id);
  const docs = await documentsForModel(o.modelo);

  return (
    <div className="space-y-6">
      <section className="panel space-y-3">
        <h2 className="h2">Estado de la orden</h2>
        <StatePicker orderId={o.id} current={o.estado} />
      </section>

      <section className="panel">
        <h2 className="h2 mb-2">Datos</h2>
        <dl className="text-lg">
          <Row k="Recibido" v={dateTime(o.createdAt)} />
          <Row k="Falla reportada" v={o.fallaReportada} />
          <Row k="Síntomas" v={label(symptoms, splitList(o.sintomas))} />
          <Row k="Estado físico" v={[label(physical, splitList(o.estadoFisico)), o.estadoFisicoNota].filter(Boolean).join(" · ")} />
          <Row k="IMEI" v={o.imei} mono />
          <Row k="Serie" v={o.serie} mono />
          <Row k="Código del equipo" v={o.codigoDesbloqueo} mono />
          <Row k="Presupuesto" v={money(o.presupuesto, settings.moneda)} />
          <Row k="Costo final" v={money(o.costoFinal, settings.moneda)} />
          <Row
            k="Boardview local"
            v={
              o.boardviewPath && (
                <span className="flex flex-wrap items-center gap-3">
                  <span className="break-all font-mono text-base">{o.boardviewPath}</span>
                  <CopyButton text={o.boardviewPath} />
                </span>
              )
            }
          />
          <Row k="Notas" v={o.notas} />
        </dl>
      </section>

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Esquemáticos del modelo</h2>
          <Link href={`/esquematicos?modelo=${o.modelo}`} className="text-bench-info underline">Biblioteca →</Link>
        </div>
        {docs.length === 0 ? (
          <p className="muted">No tienes archivos para este modelo. Añádelos en la biblioteca de esquemáticos.</p>
        ) : (
          docs.map((d) => <DocLink key={d.id} d={d} typeLabel={docTypeLabel(d.tipo)} />)
        )}
      </section>

      <section className="panel space-y-3">
        <h2 className="h2">Fotos de entrada</h2>
        <PhotoGallery orderId={o.id} etapa="ENTRADA" photos={o.photos.filter((p) => p.etapa === "ENTRADA")} />
      </section>

      <section className="panel space-y-3">
        <h2 className="h2">Fotos durante la reparación</h2>
        <PhotoGallery orderId={o.id} etapa="PROCESO" photos={o.photos.filter((p) => p.etapa === "PROCESO")} />
      </section>

      <form action={update} className="panel space-y-4">
        <h2 className="h2">Cierre del caso</h2>
        <p className="muted">Lo que anotes aquí alimenta el historial de casos similares (por modelo, síntoma y consumo).</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="causaRaiz">Causa raíz / componente</label>
            <input id="causaRaiz" name="causaRaiz" className="input" defaultValue={o.causaRaiz ?? ""} placeholder="ej. U2 / Tristar, condensador en VDD_MAIN…" />
          </div>
          <div>
            <label className="label" htmlFor="costoFinal">Costo final ({settings.moneda})</label>
            <input id="costoFinal" name="costoFinal" inputMode="decimal" className="input" defaultValue={o.costoFinal ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="diagnosticoFinal">Diagnóstico final / trabajo realizado</label>
            <textarea id="diagnosticoFinal" name="diagnosticoFinal" rows={3} className="input" defaultValue={o.diagnosticoFinal ?? ""} />
          </div>
        </div>
        <SubmitButton>Guardar cierre</SubmitButton>
      </form>

      <form action={icloud} className="panel space-y-4" id="icloud">
        <h2 className="h2">Bloqueo de activación (iCloud)</h2>
        <label className="flex min-h-touch cursor-pointer items-center gap-4 rounded-xl border-2 border-bench-line px-4 py-3 has-[:checked]:border-red-500 has-[:checked]:bg-red-950/50">
          <input type="checkbox" name="icloudBloqueado" defaultChecked={o.icloudBloqueado} className="h-8 w-8 accent-red-500" />
          <span className="text-lg font-bold">Tiene bloqueo de iCloud / Buscar activado</span>
        </label>
        <div>
          <label className="label" htmlFor="pruebaPropiedad">Prueba de propiedad presentada</label>
          <textarea id="pruebaPropiedad" name="pruebaPropiedad" rows={2} className="input" defaultValue={o.pruebaPropiedad ?? ""} placeholder="Factura original n.º…, caja con IMEI coincidente, etc. Adjunta foto en 'Fotos de entrada'." />
        </div>
        <label className="flex min-h-touch cursor-pointer items-center gap-4 rounded-xl border-2 border-bench-line px-4 py-3 has-[:checked]:border-green-600 has-[:checked]:bg-green-950/50">
          <input type="checkbox" name="pruebaVerificada" defaultChecked={o.pruebaVerificada} className="h-8 w-8 accent-green-500" />
          <span className="text-lg font-bold">Verifiqué la prueba de propiedad (coincide IMEI/serie)</span>
        </label>
        <p className="text-sm text-bench-muted">
          El desbloqueo lo debe hacer el propietario desde su cuenta o Apple con la prueba de compra. Esta app no ofrece métodos para saltar bloqueos.
        </p>
        <SubmitButton>Guardar</SubmitButton>
      </form>

      <details className="panel">
        <summary className="h2 cursor-pointer">Editar datos de la orden</summary>
        <form action={update} className="mt-4 space-y-6">
          <OrderFields
            models={models}
            symptoms={symptoms}
            physical={physical}
            safety={safety}
            currency={settings.moneda}
            d={{
              cliente_nombre: o.customer.nombre,
              cliente_telefono: o.customer.telefono,
              cliente_email: o.customer.email,
              modelo: o.modelo,
              imei: o.imei,
              serie: o.serie,
              codigoDesbloqueo: o.codigoDesbloqueo,
              fallaReportada: o.fallaReportada,
              sintomas: splitList(o.sintomas),
              estadoFisico: splitList(o.estadoFisico),
              estadoFisicoNota: o.estadoFisicoNota,
              presupuesto: o.presupuesto,
              boardviewPath: o.boardviewPath,
              notas: o.notas,
            }}
          />
          <SubmitButton className="btn-primary btn-xl w-full">Guardar cambios</SubmitButton>
        </form>
      </details>

      <details className="panel border-red-900">
        <summary className="cursor-pointer text-lg font-semibold text-red-400">Zona peligrosa</summary>
        <form action={del} className="mt-4">
          <SubmitButton className="btn-danger" confirm="¿Eliminar definitivamente esta orden y todas sus fotos?">Eliminar orden y sus fotos</SubmitButton>
        </form>
      </details>
    </div>
  );
}
