import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { ORDER_STATES } from "@/lib/constants";
import { OrderCard } from "@/components/OrderCard";
import { modelNameMap } from "@/lib/order-helpers";
import { cn } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function Orders({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const { q = "", estado = "" } = await searchParams;
  const names = modelNameMap();
  const term = q.trim();
  const matchingModels = term ? Object.entries(names).filter(([, n]) => n.toLowerCase().includes(term.toLowerCase())).map(([id]) => id) : [];
  const where: Prisma.OrderWhereInput = {
    ...(estado ? { estado } : {}),
    ...(term
      ? {
          OR: [
            { codigo: { contains: term } },
            { imei: { contains: term } },
            { serie: { contains: term } },
            { fallaReportada: { contains: term } },
            { causaRaiz: { contains: term } },
            { customer: { nombre: { contains: term } } },
            { customer: { telefono: { contains: term } } },
            { modelo: { in: matchingModels } },
          ],
        }
      : {}),
  };
  const orders = await db.order.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const href = (e: string) => `/ordenes?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(e ? { estado: e } : {}) })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Órdenes</h1>
        <Link href="/ordenes/nueva" className="btn-primary">
          + Recibir equipo
        </Link>
      </div>
      <form className="flex gap-3">
        {estado && <input type="hidden" name="estado" value={estado} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-bench-muted" />
          <input name="q" defaultValue={term} className="input pl-12" placeholder="Código, cliente, teléfono, IMEI, modelo, falla…" />
        </div>
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link href={href("")} className={cn("chip", !estado && "chip-on")}>
          Todas
        </Link>
        {ORDER_STATES.map((s) => (
          <Link key={s.id} href={href(s.id)} className={cn("chip", estado === s.id && "chip-on")}>
            {s.label}
          </Link>
        ))}
      </div>
      {orders.length === 0 ? (
        <p className="muted panel text-center text-lg">Sin resultados.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((o) => (
            <OrderCard key={o.id} o={o} modelName={names[o.modelo] ?? o.modelo} />
          ))}
        </div>
      )}
    </div>
  );
}
