import Link from "next/link";
import { createShortHunt } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { KnowledgeErrorBox, SafetyBanner } from "@/components/ui";
import { db } from "@/lib/db";
import { ACTIVE_STATES } from "@/lib/constants";
import { getReferenceLines, getSafety } from "@/lib/knowledge";
import { modelNameMap } from "@/lib/order-helpers";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Placa({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const { orden } = await searchParams;
  let lines, safety;
  try {
    lines = getReferenceLines().lineas;
    safety = getSafety();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const [orders, hunts] = await Promise.all([
    db.order.findMany({ where: { estado: { in: ACTIVE_STATES } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.shortHunt.findMany({ include: { order: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const names = modelNameMap();
  const lineName = (id: string) => lines.find((l) => l.id === id)?.nombre ?? id;
  const groups = [...new Set(lines.map((l) => l.grupo))];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Placa: cortos y mediciones</h1>
        <Link href="/placa/referencias" className="btn-secondary">Valores de referencia →</Link>
      </div>
      <div className="space-y-2">
        {safety.esd && <SafetyBanner aviso={safety.esd} />}
        {safety.inyeccion && <SafetyBanner aviso={safety.inyeccion} open />}
      </div>

      <form action={createShortHunt} className="panel space-y-4">
        <h2 className="h2">Localizar un cortocircuito</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="orderId">Orden</label>
            <select id="orderId" name="orderId" className="input" defaultValue={orden ?? ""}>
              <option value="">Sin orden</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo} · {names[o.modelo] ?? o.modelo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="linea">Línea en corto</label>
            <select id="linea" name="linea" className="input" defaultValue="vdd_main">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {lines.filter((l) => l.grupo === g).map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </optgroup>
              ))}
              <option value="">Otra (escribir abajo)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="linea_libre">Otra línea</label>
            <input id="linea_libre" name="linea_libre" className="input" placeholder="Solo si elegiste “Otra”" />
          </div>
          <div>
            <label className="label" htmlFor="resistencia">Resistencia a tierra medida (Ω)</label>
            <input id="resistencia" name="resistencia" inputMode="decimal" className="input" />
          </div>
        </div>
        <SubmitButton className="btn-primary btn-xl w-full">Empezar flujo guiado</SubmitButton>
      </form>

      <section className="space-y-3">
        <h2 className="h2">Búsquedas recientes</h2>
        {hunts.length === 0 ? (
          <p className="muted panel">Aún no hay búsquedas.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {hunts.map((h) => (
              <Link key={h.id} href={`/placa/cortos/${h.id}`} className="card hover:border-bench-accent">
                <div className="flex items-center justify-between">
                  <b className="text-xl">{lineName(h.linea)}</b>
                  <span className={h.resuelto ? "font-bold text-bench-ok" : "font-bold text-bench-accent"}>{h.resuelto ? "Resuelto" : "En curso"}</span>
                </div>
                <p className="muted">
                  {h.order ? `${h.order.codigo} · ${names[h.order.modelo] ?? h.order.modelo}` : "Sin orden"} · {dateTime(h.updatedAt)}
                </p>
                {h.componenteHallado && <p>Hallado: <b>{h.componenteHallado}</b></p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
