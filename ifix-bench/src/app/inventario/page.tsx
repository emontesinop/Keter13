import Link from "next/link";
import { Search } from "lucide-react";
import { StockControls } from "@/components/StockControls";
import { db } from "@/lib/db";
import { PART_CATEGORIES, partCategoryLabel } from "@/lib/constants";
import { cn, money, splitList } from "@/lib/format";
import { modelNameMap } from "@/lib/order-helpers";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function Inventory({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; bajo?: string; modelo?: string }> }) {
  const { q = "", cat = "", bajo, modelo = "" } = await searchParams;
  const term = q.trim();
  const where: Prisma.PartWhereInput = {
    ...(cat ? { categoria: cat } : {}),
    ...(modelo ? { modelos: { contains: modelo } } : {}),
    ...(term ? { OR: [{ nombre: { contains: term } }, { sku: { contains: term } }, { proveedor: { contains: term } }, { ubicacion: { contains: term } }] } : {}),
  };
  const [all, settings] = await Promise.all([db.part.findMany({ where, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] }), getSettings()]);
  const parts = bajo ? all.filter((p) => p.stock <= p.stockMinimo) : all;
  const lowCount = all.filter((p) => p.stock <= p.stockMinimo).length;
  const value = all.reduce((a, p) => a + (p.costo ?? 0) * p.stock, 0);
  const names = modelNameMap();
  const href = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ ...(term ? { q: term } : {}), ...(cat ? { cat } : {}), ...(bajo ? { bajo } : {}), ...(modelo ? { modelo } : {}), ...patch });
    for (const [k, v] of [...sp]) if (!v) sp.delete(k);
    return `/inventario?${sp}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Inventario</h1>
        <Link href="/inventario/nueva" className="btn-primary">+ Nueva pieza</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="panel"><p className="text-4xl font-black">{all.length}</p><p className="muted">Piezas</p></div>
        <Link href={href({ bajo: bajo ? "" : "1" })} className={cn("panel", lowCount > 0 && "border-bench-bad")}>
          <p className={cn("text-4xl font-black", lowCount > 0 && "text-bench-bad")}>{lowCount}</p><p className="muted">Stock bajo {bajo && "(filtrando)"}</p>
        </Link>
        <div className="panel"><p className="text-3xl font-black">{money(value, settings.moneda)}</p><p className="muted">Valor a costo</p></div>
      </div>
      <form className="flex gap-3">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-bench-muted" />
          <input name="q" defaultValue={term} className="input pl-12" placeholder="Nombre, SKU, proveedor, ubicación…" />
        </div>
        <button className="btn-secondary">Buscar</button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link href={href({ cat: "" })} className={cn("chip", !cat && "chip-on")}>Todas</Link>
        {PART_CATEGORIES.map((c) => (
          <Link key={c.id} href={href({ cat: c.id })} className={cn("chip", cat === c.id && "chip-on")}>{c.label}</Link>
        ))}
      </div>
      {parts.length === 0 ? (
        <p className="muted panel text-center text-lg">Sin piezas. Añade la primera con “+ Nueva pieza”.</p>
      ) : (
        <div className="space-y-2">
          {parts.map((p) => {
            const low = p.stock <= p.stockMinimo;
            return (
              <div key={p.id} className={cn("card flex flex-wrap items-center gap-4", low && "border-bench-bad")}>
                <Link href={`/inventario/${p.id}`} className="min-w-0 flex-1">
                  <p className="text-xl font-bold">{p.nombre}</p>
                  <p className="muted text-base">
                    {partCategoryLabel(p.categoria)}
                    {p.calidad ? ` · ${p.calidad}` : ""}
                    {p.proveedor ? ` · ${p.proveedor}` : ""}
                    {p.ubicacion ? ` · 📍 ${p.ubicacion}` : ""}
                  </p>
                  <p className="text-sm text-bench-muted">{splitList(p.modelos).map((m) => names[m] ?? m).join(", ") || "Sin modelos asignados"}</p>
                  <p className="text-base">
                    Costo {money(p.costo, settings.moneda)} {p.precioVenta != null && `· Venta ${money(p.precioVenta, settings.moneda)}`}
                    {low && <b className="ml-2 text-bench-bad">· Stock bajo (mín. {p.stockMinimo})</b>}
                  </p>
                </Link>
                <StockControls id={p.id} stock={p.stock} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
