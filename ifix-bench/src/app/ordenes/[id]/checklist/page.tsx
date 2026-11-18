import Link from "next/link";
import { ChecklistBoard } from "@/components/ChecklistBoard";
import { KnowledgeErrorBox, VerifyBadge } from "@/components/ui";
import { checklistFor } from "@/lib/checklist";
import { getChecklist } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export default async function ChecklistPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const o = await getOrder(id);
  let groups;
  try {
    groups = checklistFor(o.modelo);
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const results = o.checklist.filter((c) => c.fase === "ENTRADA");
  return (
    <div className="space-y-4">
      {nueva && (
        <div className="rounded-xl border-2 border-green-600 bg-green-950/50 p-4 text-lg">
          ✔ Orden <b className="font-mono">{o.codigo}</b> creada. Haz el checklist <b>antes de abrir el equipo</b>.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="h2">Checklist de entrada</h2>
        <VerifyBadge show={getChecklist().estado === "verificar"} />
      </div>
      <p className="muted">Se guarda al instante. Si el equipo no enciende, usa “Pendientes → No probado” para dejar constancia.</p>
      <ChecklistBoard orderId={o.id} fase="ENTRADA" groups={groups} results={results} />
      <Link href={`/ordenes/${o.id}/diagnostico`} className="btn-primary btn-xl w-full">
        Continuar al diagnóstico →
      </Link>
    </div>
  );
}
