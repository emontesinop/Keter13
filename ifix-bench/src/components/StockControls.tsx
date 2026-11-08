"use client";
import { useState, useTransition } from "react";
import { adjustStock, deletePart } from "@/app/actions";

export function StockControls({ id, stock }: { id: string; stock: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const adj = (d: number) =>
    start(async () => {
      const r = await adjustStock(id, d);
      setErr(r.ok ? null : r.error);
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending || stock <= 0} onClick={() => adj(-1)} className="btn-secondary h-14 w-14 px-0 text-3xl" aria-label="Restar uno">−</button>
        <span className="w-14 text-center text-3xl font-black tabular-nums">{stock}</span>
        <button type="button" disabled={pending} onClick={() => adj(1)} className="btn-secondary h-14 w-14 px-0 text-3xl" aria-label="Sumar uno">+</button>
      </div>
      {err && <p className="text-sm text-bench-bad">{err}</p>}
    </div>
  );
}

export function DeletePartButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="btn-danger"
        onClick={() =>
          confirm("¿Borrar esta pieza del inventario?") &&
          start(async () => {
            const r = await deletePart(id);
            if (r.ok) window.location.href = "/inventario";
            else setErr(r.error);
          })
        }
      >
        Borrar pieza
      </button>
      {err && <p className="mt-2 text-bench-bad">{err}</p>}
    </div>
  );
}
