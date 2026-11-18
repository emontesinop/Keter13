import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { getModels, getProgramming, programmingForModel } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function ProgrammingPage({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  const { modelo = "" } = await searchParams;
  let prog, models;
  try {
    prog = getProgramming();
    models = getModels();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const piezas = modelo ? programmingForModel(modelo) : prog.piezas;
  const tool = (id: string) => prog.herramientas.find((h) => h.id === id)?.label ?? id;
  const famNames = (fams: string[]) =>
    fams.map((f) => models.filter((m) => m.familia === f).map((m) => m.nombre.replace("iPhone ", "")).join("/")).join(" · ");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">Programación de piezas</h1>
        <VerifyBadge show={prog.estado === "verificar"} />
      </div>
      <p className="rounded-xl border-2 border-sky-600 bg-sky-950/50 p-4 text-base">{prog.aviso_legal}</p>
      <p className="rounded-xl border-2 border-red-600 bg-red-950/50 p-4 text-base font-semibold">
        iFix Bench no incluye métodos para saltar el bloqueo de activación de iCloud, eliminar bloqueos de operador o de cuenta, ni modificar IMEI o números de serie. Si una orden tiene bloqueo de iCloud, solicita la prueba de propiedad al cliente.
      </p>
      <form className="flex flex-wrap gap-3">
        <select name="modelo" defaultValue={modelo} className="input max-w-md flex-1">
          <option value="">Todas las piezas</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <button className="btn-secondary">Ver modelo</button>
      </form>
      {piezas.length === 0 && <p className="muted panel">No hay piezas registradas para este modelo.</p>}
      <div className="space-y-4">
        {piezas.map((p) => (
          <section key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">{p.nombre}</h2>
              <VerifyBadge show={!p.verificado} />
            </div>
            <p className="text-sm text-bench-muted">Modelos: {famNames(p.familias) || "—"}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-bench-bg p-3">
                <p className="text-sm font-semibold uppercase text-bench-muted">¿Requiere programación?</p>
                <p className="text-lg font-bold">{p.requiere}</p>
              </div>
              <div className="rounded-xl bg-bench-bg p-3">
                <p className="text-sm font-semibold uppercase text-bench-muted">Mensaje si no se programa</p>
                <p className="text-lg">{p.mensaje}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold">Pasos generales</p>
              <ol className="list-decimal space-y-1 pl-6 text-lg">{p.pasos.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
            {p.herramientas.length > 0 && <p className="text-base">🧰 {p.herramientas.map(tool).join(" · ")}</p>}
            {p.notas && <p className="text-base text-bench-muted">{p.notas}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
