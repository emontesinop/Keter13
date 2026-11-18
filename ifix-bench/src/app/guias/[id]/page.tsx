import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideRunner } from "@/components/GuideRunner";
import { KnowledgeErrorBox, SafetyList, VerifyBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { getGuide, getModels, getSafety } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ orden?: string }> }) {
  const { id } = await params;
  const { orden } = await searchParams;
  let guide, safety, models;
  try {
    guide = getGuide(id);
    safety = getSafety();
    models = getModels();
  } catch (e) {
    return <KnowledgeErrorBox error={e} />;
  }
  if (!guide) notFound();
  const order = orden ? await db.order.findUnique({ where: { id: orden } }) : null;
  const prog = order ? await db.guideProgress.findUnique({ where: { orderId_guiaId: { orderId: order.id, guiaId: guide.id } } }) : null;
  const parse = <T,>(s: string, d: T): T => {
    try {
      return JSON.parse(s);
    } catch {
      return d;
    }
  };
  const names = Object.fromEntries(models.map((m) => [m.id, m.nombre]));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {order && <p className="font-mono text-lg font-bold text-bench-accent">{order.codigo}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="h1">{guide.titulo}</h1>
            <VerifyBadge show={guide.estado === "verificar"} />
          </div>
          <p className="muted text-lg">{guide.modelos.map((m) => names[m] ?? m).join(", ")}</p>
        </div>
        <Link href={order ? `/ordenes/${order.id}/reparacion` : "/guias"} className="btn-secondary">Volver</Link>
      </div>
      {order && !guide.modelos.includes(order.modelo) && !guide.modelos.includes("todos") && (
        <p className="rounded-xl border-2 border-amber-500 bg-amber-950/60 p-3 text-lg font-semibold">⚠ Esta guía no está marcada para el modelo de la orden.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel">
          <h2 className="h3 mb-2">Herramientas</h2>
          <ul className="list-disc space-y-1 pl-6 text-lg">{guide.herramientas.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
        <div className="space-y-2">
          <SafetyList ids={guide.seguridad} safety={safety} />
          {guide.notas && <p className="panel text-base text-bench-muted">{guide.notas}</p>}
        </div>
      </div>
      <GuideRunner
        guide={guide}
        safety={safety}
        orderId={order?.id ?? null}
        initial={prog ? { pasosHechos: parse(prog.pasosHechos, []), checks: parse(prog.checks, {}), segundos: prog.segundos, terminada: prog.terminada } : null}
      />
    </div>
  );
}
