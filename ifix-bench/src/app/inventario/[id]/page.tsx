import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePart } from "@/app/actions";
import { PartForm } from "@/components/PartForm";
import { DeletePartButton, StockControls } from "@/components/StockControls";
import { db } from "@/lib/db";
import { getModels } from "@/lib/knowledge";
import { getSettings } from "@/lib/settings";
import { date, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditPart({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.part.findUnique({ where: { id }, include: { usages: { include: { order: true }, orderBy: { createdAt: "desc" }, take: 30 } } });
  if (!p) notFound();
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="h1">{p.nombre}</h1>
        <StockControls id={p.id} stock={p.stock} />
      </div>
      <PartForm action={updatePart.bind(null, p.id)} models={getModels()} currency={s.moneda} p={p} />
      <section className="space-y-2">
        <h2 className="h2">Usada en órdenes</h2>
        {p.usages.length === 0 ? (
          <p className="muted panel">Todavía no se ha usado.</p>
        ) : (
          p.usages.map((u) => (
            <Link key={u.id} href={`/ordenes/${u.orderId}/reparacion`} className="card flex justify-between hover:border-bench-accent">
              <span className="font-mono font-bold text-bench-accent">{u.order.codigo}</span>
              <span>{u.cantidad} × {money(u.costoUnit, s.moneda)} · {date(u.createdAt)}</span>
            </Link>
          ))
        )}
      </section>
      <DeletePartButton id={p.id} />
    </div>
  );
}
