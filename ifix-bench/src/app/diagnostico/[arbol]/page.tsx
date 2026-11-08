import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosticWizard } from "@/components/DiagnosticWizard";
import { KnowledgeErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { getDcPatterns, getSafety, getTree, getTrees } from "@/lib/knowledge";
import { modelNameMap } from "@/lib/order-helpers";
import { dcHistoryByPattern } from "@/lib/similar";

export const dynamic = "force-dynamic";

export default async function TreePage({ params, searchParams }: { params: Promise<{ arbol: string }>; searchParams: Promise<{ orden?: string; nodo?: string }> }) {
  const { arbol } = await params;
  const { orden, nodo } = await searchParams;
  let tree, trees, safety, dc;
  try {
    tree = getTree(arbol);
    if (!tree) notFound();
    trees = Object.fromEntries(getTrees().map((t) => [t.id, t]));
    trees[tree.id] = tree;
    safety = getSafety();
    dc = getDcPatterns();
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_")) throw e;
    return <KnowledgeErrorBox error={e} />;
  }
  const order = orden ? await db.order.findUnique({ where: { id: orden } }) : null;
  const history = await dcHistoryByPattern(order?.modelo ?? null, order?.id);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="h2">Diagnóstico: {tree.titulo}</h1>
        <Link href={order ? `/ordenes/${order.id}/diagnostico` : "/diagnostico"} className="btn-secondary text-base">
          Salir
        </Link>
      </div>
      <DiagnosticWizard
        key={`${arbol}-${nodo ?? ""}`}
        trees={trees}
        startTree={tree.id}
        startNode={nodo}
        safety={safety}
        orderId={order?.id ?? null}
        orderLabel={order?.codigo ?? null}
        dc={dc}
        dcHistory={history}
        modelNames={modelNameMap()}
      />
    </div>
  );
}
