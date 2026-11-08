import Link from "next/link";
import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { getGuides, getModels } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function Guides({ searchParams }: { searchParams: Promise<{ modelo?: string; orden?: string }> }) {
  const { modelo = "", orden } = await searchParams;
  let guides, models;
  try {
    guides = getGuides();
    models = getModels();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const names = Object.fromEntries(models.map((m) => [m.id, m.nombre]));
  const list = modelo ? guides.filter((g) => g.modelos.includes(modelo) || g.modelos.includes("todos")) : guides;
  return (
    <div className="space-y-6">
      <h1 className="h1">Guías de reparación</h1>
      <form className="flex flex-wrap gap-3">
        <select name="modelo" defaultValue={modelo} className="input max-w-md flex-1">
          <option value="">Todos los modelos</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>
      {list.length === 0 ? (
        <p className="muted panel">
          No hay guías para este modelo todavía. Crea una en <code>knowledge/guides/</code> copiando una existente.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((g) => (
            <Link key={g.id} href={`/guias/${g.id}${orden ? `?orden=${orden}` : ""}`} className="card space-y-2 hover:border-bench-accent">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-bold">{g.titulo}</p>
                <VerifyBadge show={g.estado === "verificar"} />
              </div>
              <p className="muted">{g.modelos.map((m) => names[m] ?? m).join(", ")}</p>
              <p>
                {g.pasos.length} pasos · ~{g.tiempo_estimado_min ?? "?"} min {g.dificultad ? `· ${g.dificultad}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
