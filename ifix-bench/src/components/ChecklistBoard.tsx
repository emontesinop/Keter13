"use client";
import { useOptimistic, useState, useTransition } from "react";
import { fillPendingChecklist, saveChecklistItem } from "@/app/actions";
import { CHECK_RESULTS } from "@/lib/constants";
import { cn } from "@/lib/format";

type Item = { key: string; label: string; ayuda?: string };
type Group = { id: string; titulo: string; items: Item[] };
type Res = { itemKey: string; resultado: string; nota: string | null };

export function ChecklistBoard({
  orderId,
  fase,
  groups,
  results,
  compareWith,
}: {
  orderId: string;
  fase: "ENTRADA" | "SALIDA";
  groups: Group[];
  results: Res[];
  compareWith?: Res[];
}) {
  const [optimistic, setOpt] = useOptimistic(
    Object.fromEntries(results.map((r) => [r.itemKey, r])) as Record<string, Res>,
    (state, upd: Res) => ({ ...state, [upd.itemKey]: { ...state[upd.itemKey], ...upd } }),
  );
  const [, start] = useTransition();
  const [notes, setNotes] = useState<Record<string, boolean>>({});
  const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const done = allKeys.filter((k) => optimistic[k]).length;
  const fails = allKeys.filter((k) => optimistic[k]?.resultado === "FALLA").length;
  const prev = Object.fromEntries((compareWith ?? []).map((r) => [r.itemKey, r]));

  const set = (key: string, resultado: string) =>
    start(async () => {
      setOpt({ itemKey: key, resultado, nota: optimistic[key]?.nota ?? null });
      await saveChecklistItem(orderId, fase, key, resultado);
    });

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-4 border-b border-bench-line bg-bench-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex-1">
          <div className="h-3 overflow-hidden rounded-full bg-bench-line">
            <div className="h-full bg-bench-accent transition-all" style={{ width: `${(done / Math.max(allKeys.length, 1)) * 100}%` }} />
          </div>
          <p className="mt-1 text-base font-semibold">
            {done} / {allKeys.length} revisados {fails > 0 && <span className="text-bench-bad">· {fails} con falla</span>}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary text-base"
          onClick={() => {
            if (!confirm("¿Marcar todos los ítems pendientes como 'No probado'? Útil si el equipo no enciende.")) return;
            start(async () => {
              for (const k of allKeys) if (!optimistic[k]) setOpt({ itemKey: k, resultado: "NO_PROBADO", nota: null });
              await fillPendingChecklist(orderId, fase, allKeys, "NO_PROBADO");
            });
          }}
        >
          Pendientes → No probado
        </button>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="space-y-3">
          <h2 className="h2">{g.titulo}</h2>
          {g.items.map((item) => {
            const r = optimistic[item.key];
            const p = prev[item.key];
            const changed = p && r && p.resultado !== r.resultado;
            return (
              <div key={item.key} className={cn("card space-y-3", r?.resultado === "FALLA" && "border-bench-bad", changed && "ring-2 ring-bench-info")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{item.label}</p>
                    {item.ayuda && <p className="text-base text-bench-muted">{item.ayuda}</p>}
                  </div>
                  {p && (
                    <span className="rounded-lg bg-bench-line px-3 py-1 text-sm">
                      Entrada: <b>{CHECK_RESULTS.find((c) => c.id === p.resultado)?.label}</b>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {CHECK_RESULTS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set(item.key, c.id)}
                      aria-pressed={r?.resultado === c.id}
                      className={cn("btn min-h-[3.75rem] px-2 text-lg", r?.resultado === c.id ? c.cls : "border-2 border-bench-line bg-bench-panel text-bench-muted")}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {notes[item.key] || r?.nota ? (
                  <input
                    className="input"
                    placeholder="Nota (ej. 'Face ID no disponible', '86% salud')"
                    defaultValue={r?.nota ?? ""}
                    onBlur={(e) => {
                      const nota = e.target.value.trim() || null;
                      if (nota === (r?.nota ?? null)) return;
                      start(async () => {
                        setOpt({ itemKey: item.key, resultado: r?.resultado ?? "NO_PROBADO", nota });
                        await saveChecklistItem(orderId, fase, item.key, r?.resultado ?? "NO_PROBADO", nota);
                      });
                    }}
                  />
                ) : (
                  <button type="button" className="text-base font-semibold text-bench-info" onClick={() => setNotes((n) => ({ ...n, [item.key]: true }))}>
                    + Añadir nota
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
