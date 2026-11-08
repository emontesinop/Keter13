import Link from "next/link";
import { removePartUsage } from "@/app/actions";
import { DeleteButton } from "@/components/DeleteButton";
import { PartPicker } from "@/components/PartPicker";
import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { guidesForModel } from "@/lib/guides";
import { getGuides, programmingForModel } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { fmtTime, money, splitList } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OrderRepair({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, settings, parts] = await Promise.all([getOrder(id), getSettings(), db.part.findMany({ orderBy: { nombre: "asc" } })]);
  let guides, allGuides;
  try {
    guides = guidesForModel(o.modelo);
    allGuides = getGuides();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  let progParts: { nombre: string }[] = [];
  try {
    progParts = programmingForModel(o.modelo);
  } catch {}
  const progress = Object.fromEntries(o.guideProgress.map((g) => [g.guiaId, g]));
  const otherInProgress = o.guideProgress.filter((g) => !guides.some((x) => x.id === g.guiaId));
  const partsCost = o.partUsages.reduce((a, u) => a + (u.costoUnit ?? 0) * u.cantidad, 0);
  const price = o.costoFinal ?? o.presupuesto;
  const m = (n: number | null) => money(n, settings.moneda);
  const doneCount = (s: string) => {
    try {
      return JSON.parse(s).length as number;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="h2">Guías para este modelo</h2>
        {guides.length === 0 ? (
          <p className="muted panel">
            No hay guías para este modelo. <Link className="text-bench-info underline" href={`/guias?orden=${o.id}`}>Ver todas las guías</Link>
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {guides.map((g) => {
              const p = progress[g.id];
              return (
                <Link key={g.id} href={`/guias/${g.id}?orden=${o.id}`} className="card space-y-2 hover:border-bench-accent">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xl font-bold">{g.titulo}</p>
                    <VerifyBadge show={g.estado === "verificar"} />
                  </div>
                  <p className="muted">{g.pasos.length} pasos · ~{g.tiempo_estimado_min ?? "?"} min</p>
                  {p ? (
                    <p className={p.terminada ? "font-bold text-bench-ok" : "font-bold text-bench-accent"}>
                      {p.terminada ? "✔ Terminada" : `En curso: ${doneCount(p.pasosHechos)}/${g.pasos.length}`} · {fmtTime(p.segundos)}
                    </p>
                  ) : (
                    <p className="font-semibold text-bench-info">Empezar →</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {otherInProgress.map((p) => (
          <Link key={p.id} href={`/guias/${p.guiaId}?orden=${o.id}`} className="card block">
            {allGuides.find((g) => g.id === p.guiaId)?.titulo ?? p.guiaId} · {fmtTime(p.segundos)}
          </Link>
        ))}
      </section>

      {progParts.length > 0 && (
        <section className="card space-y-2 border-bench-info">
          <h2 className="h3">Piezas que pueden requerir programación en este modelo</h2>
          <p>{progParts.map((p) => p.nombre).join(" · ")}</p>
          <Link href={`/programacion?modelo=${o.modelo}`} className="font-semibold text-bench-info underline">Ver guía de programación →</Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="h2">Piezas usadas</h2>
        {o.partUsages.length === 0 ? (
          <p className="muted panel">Ninguna pieza usada todavía.</p>
        ) : (
          o.partUsages.map((u) => (
            <div key={u.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href={`/inventario/${u.partId}`} className="text-xl font-bold hover:underline">{u.part.nombre}</Link>
                <p className="muted">
                  {u.cantidad} × {m(u.costoUnit)} = <b>{m((u.costoUnit ?? 0) * u.cantidad)}</b>
                </p>
              </div>
              <DeleteButton action={removePartUsage.bind(null, u.id)} label="Quitar (devuelve al stock)" />
            </div>
          ))
        )}
        <div className="panel grid grid-cols-3 gap-3 text-center">
          <div><p className="text-2xl font-black">{m(partsCost)}</p><p className="muted text-sm">Costo de piezas</p></div>
          <div><p className="text-2xl font-black">{m(price)}</p><p className="muted text-sm">{o.costoFinal != null ? "Precio final" : "Presupuesto"}</p></div>
          <div><p className={`text-2xl font-black ${price != null && price - partsCost < 0 ? "text-bench-bad" : "text-bench-ok"}`}>{price != null ? m(price - partsCost) : "—"}</p><p className="muted text-sm">Margen</p></div>
        </div>
      </section>

      <section className="panel space-y-3">
        <h2 className="h2">Añadir pieza del inventario</h2>
        <PartPicker
          orderId={o.id}
          parts={parts.map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, stock: p.stock, costo: p.costo, calidad: p.calidad, compatible: splitList(p.modelos).includes(o.modelo) }))}
          currencyFmt={Object.fromEntries(parts.map((p) => [p.id, money(p.costo, settings.moneda)]))}
        />
      </section>
    </div>
  );
}
