"use client";
import { useState, useTransition } from "react";
import { setOrderState } from "@/app/actions";
import { ORDER_STATES } from "@/lib/constants";
import { cn } from "@/lib/format";

export function StatePicker({ orderId, current }: { orderId: string; current: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ORDER_STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await setOrderState(orderId, s.id);
                if (!r.ok) setError(r.error);
              })
            }
            className={cn("btn min-h-[3.5rem] text-base text-white", s.color, current === s.id ? "ring-4 ring-bench-accent" : "opacity-60 hover:opacity-100")}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl border-2 border-red-500 bg-red-950/70 p-3 text-lg font-bold text-red-200" role="alert">{error}</p>}
    </div>
  );
}
