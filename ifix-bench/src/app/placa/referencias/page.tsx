import { MeasurementForm } from "@/components/MeasurementForm";
import { MeasurementList } from "@/components/MeasurementList";
import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { getModels, getReferenceLines } from "@/lib/knowledge";
import { fmtVal, MODES, refKey } from "@/lib/measure";
import { referenceStats } from "@/lib/reference";

export const dynamic = "force-dynamic";

export default async function References({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  const { modelo: qModelo } = await searchParams;
  let models, ref;
  try {
    models = getModels();
    ref = getReferenceLines();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const modelo = models.some((m) => m.id === qModelo) ? qModelo! : models.find((m) => m.id === "iphone-12")?.id ?? models[0].id;
  const [stats, good, counts] = await Promise.all([
    referenceStats(modelo),
    db.measurement.findMany({ where: { modelo, placaBuena: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.measurement.groupBy({ by: ["modelo"], where: { placaBuena: true }, _count: true }),
  ]);
  const lineNames = Object.fromEntries(ref.lineas.map((l) => [l.id, l.nombre]));
  const extra = [...new Set(good.map((g) => g.linea).filter((l) => !lineNames[l]))];
  const rows = [...ref.lineas.map((l) => ({ id: l.id, nombre: l.nombre, nominal: l.voltaje_nominal })), ...extra.map((id) => ({ id, nombre: id, nominal: null }))];
  const countFor = (id: string) => counts.find((c) => c.modelo === id)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">Valores de referencia</h1>
        <VerifyBadge show={ref.estado === "verificar"} />
      </div>
      <p className="muted text-lg">
        Tu propia base: cada medición marcada como “placa buena” se promedia aquí y se usa para comparar en diagnóstico y cortos.
      </p>
      <form className="flex flex-wrap gap-3">
        <select name="modelo" defaultValue={modelo} className="input max-w-md flex-1">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} {countFor(m.id) ? `(${countFor(m.id)})` : ""}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Ver modelo</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-bench-line">
        <table className="w-full text-left text-lg">
          <thead className="bg-bench-panel text-base text-bench-muted">
            <tr>
              <th className="p-3">Línea</th>
              {MODES.map((m) => (
                <th key={m.id} className="p-3">
                  {m.label} ({m.canon})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-bench-line">
                <td className="p-3 font-semibold">
                  {r.nombre}
                  {r.nominal != null && <span className="ml-2 text-sm text-bench-muted">nominal {r.nominal} V</span>}
                </td>
                {MODES.map((m) => {
                  const s = stats[refKey(r.id, m.id)];
                  return (
                    <td key={m.id} className="p-3 font-mono">
                      {s ? (
                        <>
                          <b>{fmtVal(s.avg)}</b>
                          <span className="block text-sm text-bench-muted">
                            {fmtVal(s.min)}–{fmtVal(s.max)} · n={s.count}
                          </span>
                        </>
                      ) : (
                        <span className="text-bench-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel space-y-3">
        <h2 className="h2">Añadir medición de placa buena</h2>
        <MeasurementForm key={modelo} orderId={null} modelo={modelo} lines={ref.lineas} stats={stats} defaultPlacaBuena />
      </section>

      <section className="space-y-3">
        <h2 className="h2">Mediciones de placas buenas ({good.length})</h2>
        <MeasurementList items={good} lineNames={lineNames} stats={stats} />
      </section>
    </div>
  );
}
