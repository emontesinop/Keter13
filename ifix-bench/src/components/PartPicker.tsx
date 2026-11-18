"use client";
import { useMemo, useState, useTransition } from "react";
import { usePart } from "@/app/actions";
import { cn } from "@/lib/format";

type Part = { id: string; nombre: string; categoria: string; stock: number; costo: number | null; compatible: boolean; calidad: string | null };

export function PartPicker({ orderId, parts, currencyFmt }: { orderId: string; parts: Part[]; currencyFmt: Record<string, string> }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const list = useMemo(
    () =>
      parts
        .filter((p) => (all || p.compatible) && p.nombre.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => Number(b.compatible) - Number(a.compatible) || a.nombre.localeCompare(b.nombre)),
    [parts, q, all],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input className="input flex-1" placeholder="Buscar pieza…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={cn("chip", all && "chip-on")} onClick={() => setAll((v) => !v)}>
          {all ? "Mostrando todas" : "Solo compatibles con el modelo"}
        </button>
      </div>
      {list.length === 0 && <p className="muted">No hay piezas {all ? "" : "compatibles "}en inventario.</p>}
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-bench-line bg-bench-bg p-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{p.nombre}</p>
              <p className="text-sm text-bench-muted">
                Stock: <b className={p.stock === 0 ? "text-bench-bad" : "text-bench-text"}>{p.stock}</b> · {currencyFmt[p.id]}
                {p.calidad ? ` · ${p.calidad}` : ""}
                {!p.compatible && " · no marcada para este modelo"}
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={Math.max(p.stock, 1)}
              className="input w-20 text-center"
              value={qty[p.id] ?? 1}
              onChange={(e) => setQty((s) => ({ ...s, [p.id]: Math.max(1, Number(e.target.value) || 1) }))}
              aria-label="Cantidad"
            />
            <button
              type="button"
              disabled={pending || p.stock < (qty[p.id] ?? 1)}
              className="btn-primary"
              onClick={() =>
                start(async () => {
                  const r = await usePart(orderId, p.id, qty[p.id] ?? 1);
                  setMsg(r.ok ? { ok: true, text: `✔ ${p.nombre} añadida; stock descontado.` } : { ok: false, text: r.error });
                })
              }
            >
              Usar
            </button>
          </div>
        ))}
      </div>
      {msg && <p className={cn("text-lg font-semibold", msg.ok ? "text-bench-ok" : "text-bench-bad")}>{msg.text}</p>}
    </div>
  );
}
