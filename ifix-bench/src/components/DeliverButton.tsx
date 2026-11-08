"use client";
import { useState, useTransition } from "react";
import { setOrderState } from "@/app/actions";

export function DeliverButton({ orderId, warnings, delivered }: { orderId: string; warnings: string[]; delivered: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (delivered) return <p className="rounded-xl border-2 border-green-600 bg-green-950/50 p-4 text-xl font-bold">✔ Equipo entregado</p>;
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className="btn-ok btn-xl w-full"
        onClick={() => {
          if (warnings.length && !confirm(`Antes de entregar:\n\n• ${warnings.join("\n• ")}\n\n¿Marcar como entregado de todos modos?`)) return;
          start(async () => {
            const r = await setOrderState(orderId, "ENTREGADO");
            setErr(r.ok ? null : r.error);
          });
        }}
      >
        Marcar como entregado
      </button>
      {err && <p className="rounded-xl border-2 border-red-500 bg-red-950/70 p-3 text-lg font-bold" role="alert">{err}</p>}
    </div>
  );
}
