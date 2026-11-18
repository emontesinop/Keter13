import Link from "next/link";
import { DcConsumption } from "@/components/DcConsumption";
import { KnowledgeErrorBox, SafetyBanner } from "@/components/ui";
import { db } from "@/lib/db";
import { getDcPatterns, getSafety } from "@/lib/knowledge";
import { modelNameMap } from "@/lib/order-helpers";
import { dcHistoryByPattern } from "@/lib/similar";

export const dynamic = "force-dynamic";

export default async function DcPage({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const { orden } = await searchParams;
  const order = orden ? await db.order.findUnique({ where: { id: orden } }) : null;
  let dc, safety;
  try {
    dc = getDcPatterns();
    safety = getSafety();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  const names = modelNameMap();
  const history = await dcHistoryByPattern(order?.modelo ?? null, order?.id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Consumo en fuente DC</h1>
          {order && (
            <p className="muted text-lg">
              Orden <b className="font-mono text-bench-accent">{order.codigo}</b> · {names[order.modelo] ?? order.modelo}
            </p>
          )}
        </div>
        <Link href={order ? `/ordenes/${order.id}/diagnostico` : "/diagnostico"} className="btn-secondary text-base">
          Volver
        </Link>
      </div>
      {safety.inyeccion && <SafetyBanner aviso={safety.inyeccion} open />}
      <DcConsumption dc={dc} orderId={order?.id ?? null} history={history} modelNames={names} />
    </div>
  );
}
