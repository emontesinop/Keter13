import Link from "next/link";
import { PlusCircle, Stethoscope, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { ACTIVE_STATES, ORDER_STATES } from "@/lib/constants";
import { OrderCard } from "@/components/OrderCard";
import { modelNameMap } from "@/lib/order-helpers";
import { getSafety } from "@/lib/knowledge";
import { SafetyBanner } from "@/components/ui";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [orders, counts, settings] = await Promise.all([
    db.order.findMany({ where: { estado: { in: ACTIVE_STATES } }, include: { customer: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.order.groupBy({ by: ["estado"], _count: true }),
    getSettings(),
  ]);
  const names = modelNameMap();
  const icloudPending = orders.filter((o) => o.icloudBloqueado && !o.pruebaVerificada);
  let esd = null;
  try {
    esd = getSafety().esd;
  } catch {}
  const count = (id: string) => counts.find((c) => c.estado === id)?._count ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="muted text-lg">{settings.nombre_taller}</p>
          <h1 className="h1">Mesa de trabajo</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/ordenes/nueva" className="btn-primary btn-xl">
            <PlusCircle className="h-7 w-7" /> Recibir equipo
          </Link>
          <Link href="/diagnostico" className="btn-secondary btn-xl">
            <Stethoscope className="h-7 w-7" /> Diagnóstico rápido
          </Link>
        </div>
      </header>

      {esd && <SafetyBanner aviso={esd} />}

      {icloudPending.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-950/60 p-4">
          <p className="flex items-center gap-2 text-lg font-bold text-red-300">
            <Lock className="h-6 w-6" /> {icloudPending.length} orden(es) con bloqueo de iCloud sin prueba de propiedad
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {icloudPending.map((o) => (
              <Link key={o.id} href={`/ordenes/${o.id}`} className="chip border-red-500 font-mono">
                {o.codigo}
              </Link>
            ))}
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {ORDER_STATES.filter((s) => ACTIVE_STATES.includes(s.id)).map((s) => (
          <Link key={s.id} href={`/ordenes?estado=${s.id}`} className="panel text-center hover:border-bench-accent">
            <p className="text-4xl font-black">{count(s.id)}</p>
            <p className="mt-1 text-sm font-semibold text-bench-muted">{s.label}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="h2 mb-4">Órdenes activas</h2>
        {orders.length === 0 ? (
          <div className="panel text-center">
            <p className="muted text-lg">No hay órdenes activas.</p>
            <Link href="/ordenes/nueva" className="btn-primary mt-4">
              Recibir el primer equipo
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => (
              <OrderCard key={o.id} o={o} modelName={names[o.modelo] ?? o.modelo} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
