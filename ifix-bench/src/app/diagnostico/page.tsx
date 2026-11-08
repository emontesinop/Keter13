import Link from "next/link";
import { Zap } from "lucide-react";
import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { getSymptoms, getTrees } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function DiagnosticIndex({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const { orden } = await searchParams;
  const order = orden ? await db.order.findUnique({ where: { id: orden } }) : null;
  let trees, symptoms;
  try {
    trees = getTrees();
    symptoms = getSymptoms();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const q = order ? `?orden=${order.id}` : "";
  const sinArbol = symptoms.filter((s) => !s.arbol || !trees.some((t) => t.id === s.arbol));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Asistente de diagnóstico</h1>
        <p className="muted text-lg">
          {order ? (
            <>
              Para la orden <b className="font-mono text-bench-accent">{order.codigo}</b>
            </>
          ) : (
            "Sin orden asociada (diagnóstico rápido). Para guardar en una orden, ábrelo desde la pestaña Diagnóstico de la orden."
          )}
        </p>
      </div>
      <Link href={`/diagnostico/consumo${q}`} className="card flex items-center gap-4 border-bench-accent hover:bg-bench-panel">
        <Zap className="h-12 w-12 text-bench-accent" />
        <div>
          <p className="text-2xl font-bold">Consumo en fuente DC</p>
          <p className="muted">Registra el comportamiento del amperaje y ve las causas probables y tus casos anteriores.</p>
        </div>
      </Link>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trees.map((t) => (
          <Link key={t.id} href={`/diagnostico/${t.id}${q}`} className="card min-h-[9rem] hover:border-bench-accent">
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xl font-bold">{t.titulo}</p>
              <VerifyBadge show={t.estado === "verificar"} />
            </div>
            {t.descripcion && <p className="muted mt-2">{t.descripcion}</p>}
            <p className="mt-2 text-sm text-bench-muted">{Object.keys(t.nodos).length} pasos</p>
          </Link>
        ))}
      </div>
      {sinArbol.length > 0 && (
        <div className="panel">
          <p className="font-semibold">Síntomas sin árbol todavía</p>
          <p className="muted text-base">
            {sinArbol.map((s) => s.label).join(" · ")}. Puedes crearlos tú en <code>knowledge/diagnostics/</code> (se añadirán más en la Fase 2).
          </p>
        </div>
      )}
    </div>
  );
}
