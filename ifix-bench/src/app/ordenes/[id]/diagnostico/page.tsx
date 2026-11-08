import Link from "next/link";
import { Zap } from "lucide-react";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteDcReading, deleteDiagnosticSession } from "@/app/actions";
import { getDcPatterns, getSymptoms, getTrees } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";
import { nodeTitle, parsePath } from "@/lib/path-summary";
import { dateTime, splitList } from "@/lib/format";
import { dcHistoryByPattern } from "@/lib/similar";
import { modelNameMap } from "@/lib/order-helpers";

export const dynamic = "force-dynamic";

export default async function OrderDiagnostics({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  const { id } = await params;
  const { guardado } = await searchParams;
  const o = await getOrder(id);
  const trees = Object.fromEntries(getTrees().map((t) => [t.id, t]));
  const symptoms = getSymptoms();
  const dc = getDcPatterns();
  const names = modelNameMap();
  const orderSymptoms = splitList(o.sintomas).map((k) => symptoms.find((s) => s.key === k) ?? { key: k, label: k, arbol: undefined });
  const history = await dcHistoryByPattern(o.modelo, o.id);
  const patterns = new Set(o.dcReadings.map((r) => r.patron));
  const suggestions = [...patterns].flatMap((p) => (history[p] ?? []).map((c) => ({ ...c, patron: p })));

  return (
    <div className="space-y-6">
      {guardado && <div className="rounded-xl border-2 border-green-600 bg-green-950/50 p-4 text-lg">✔ Diagnóstico guardado en la orden.</div>}

      <section className="panel space-y-4">
        <h2 className="h2">Empezar diagnóstico</h2>
        {orderSymptoms.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {orderSymptoms.map((s) =>
              s.arbol && trees[s.arbol] ? (
                <Link key={s.key} href={`/diagnostico/${s.arbol}?orden=${o.id}`} className="btn-primary btn-xl">
                  {s.label} →
                </Link>
              ) : (
                <span key={s.key} className="btn-secondary btn-xl opacity-50" title="Este síntoma aún no tiene árbol">
                  {s.label} (sin árbol)
                </span>
              ),
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/diagnostico/consumo?orden=${o.id}`} className="btn-secondary btn-xl">
            <Zap className="h-6 w-6 text-bench-accent" /> Registrar consumo DC
          </Link>
          <Link href={`/diagnostico?orden=${o.id}`} className="btn-secondary btn-xl">
            Otros árboles…
          </Link>
        </div>
      </section>

      {suggestions.length > 0 && (
        <section className="card space-y-2 border-bench-info">
          <h2 className="h2">Casos similares (tu historial)</h2>
          <ul className="space-y-1 text-lg">
            {suggestions.slice(0, 6).map((c, i) => (
              <li key={i}>
                En <b>{names[c.modelo] ?? c.modelo}</b> con “{dc.patrones.find((p) => p.id === c.patron)?.nombre}”
                {c.mA != null ? ` (${c.mA} mA)` : ""}, fue <b className="text-bench-accent">{c.causaRaiz}</b> ·{" "}
                <Link href={`/ordenes/${c.orderId}`} className="font-mono text-bench-info underline">{c.codigo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="h2">Consumo DC registrado</h2>
        {o.dcReadings.length === 0 ? (
          <p className="muted panel">Sin lecturas.</p>
        ) : (
          <div className="space-y-2">
            {o.dcReadings.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold">{dc.patrones.find((p) => p.id === r.patron)?.nombre ?? r.patron}</p>
                  <p className="muted">
                    {[r.voltaje != null && `${r.voltaje} V`, r.mA != null && `${r.mA} mA`, r.momento, r.nota].filter(Boolean).join(" · ")} · {dateTime(r.createdAt)}
                  </p>
                </div>
                <DeleteButton action={deleteDcReading.bind(null, r.id)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="h2">Diagnósticos guardados</h2>
        {o.diagnostics.length === 0 ? (
          <p className="muted panel">Aún no hay diagnósticos.</p>
        ) : (
          o.diagnostics.map((d) => {
            const steps = parsePath(d.ruta);
            const [ca, cn] = d.conclusion?.split(":") ?? [];
            return (
              <div key={d.id} className="card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-bench-muted">{trees[d.arbol]?.titulo ?? d.arbol} · {dateTime(d.createdAt)}</p>
                    <p className={`text-xl font-bold ${d.conclusion ? "text-bench-ok" : "text-bench-accent"}`}>{d.resumen}</p>
                  </div>
                  <DeleteButton action={deleteDiagnosticSession.bind(null, d.id)} />
                </div>
                <ol className="list-decimal space-y-1 pl-6">
                  {steps.map((s, i) => (
                    <li key={i}>
                      <b>{nodeTitle(trees, s.arbol, s.nodo)}</b>
                      {s.opcion && <> → {s.opcion}</>}
                      {s.valor && <span className="ml-2 rounded bg-bench-line px-2 font-mono">{s.valor}</span>}
                      {s.nota && <span className="ml-2 text-bench-muted">({s.nota})</span>}
                    </li>
                  ))}
                </ol>
                {ca && trees[ca]?.nodos[cn]?.causas && (
                  <p className="text-base text-bench-muted">Causas probables: {trees[ca].nodos[cn].causas!.join(" · ")}</p>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
