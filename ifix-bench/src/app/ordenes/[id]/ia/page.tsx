import { deleteAnalysis } from "@/app/ia-actions";
import { AiAnalyzer } from "@/components/AiAnalyzer";
import { AiDisabled } from "@/components/AiDisabled";
import { AnalysisView } from "@/components/AnalysisView";
import { ChatPanel } from "@/components/ChatPanel";
import { DeleteButton } from "@/components/DeleteButton";
import { db } from "@/lib/db";
import type { Analysis } from "@/lib/ai";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TIPO_LABEL: Record<string, string> = { PLACA: "Placa", CARCASA: "Carcasa", PANTALLA: "Pantalla", OTRO: "Otro" };

export default async function OrderAi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, settings] = await Promise.all([getOrder(id), getSettings()]);
  const enabled = settings.anthropic_api_key.length > 0;
  const [analyses, chat] = await Promise.all([
    db.aiAnalysis.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "desc" } }),
    db.chatMessage.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const photoById = Object.fromEntries(o.photos.map((p) => [p.id, p]));
  return (
    <div className="space-y-6">
      {!enabled && <AiDisabled />}
      {enabled && (
        <>
          <section className="panel space-y-3">
            <h2 className="h2">Análisis de fotos con IA</h2>
            <p className="muted">Elige una foto de la orden o toma una nueva. Detecta corrosión, componentes quemados o faltantes, flexores rotos y piezas no originales.</p>
            <AiAnalyzer orderId={o.id} photos={o.photos.filter((p) => p.etapa !== "IA").concat(o.photos.filter((p) => p.etapa === "IA"))} />
          </section>
          <section className="panel space-y-3">
            <h2 className="h2">Chat de diagnóstico</h2>
            <ChatPanel orderId={o.id} initial={chat.map((m) => ({ id: m.id, rol: m.rol, contenido: m.contenido }))} />
          </section>
        </>
      )}
      <section className="space-y-3">
        <h2 className="h2">Análisis guardados ({analyses.length})</h2>
        {analyses.length === 0 && <p className="muted panel">Todavía no hay análisis.</p>}
        {analyses.map((a) => {
          let parsed: Analysis | null = null;
          try {
            parsed = JSON.parse(a.resultado);
          } catch {}
          const photo = a.photoId ? photoById[a.photoId] : null;
          return (
            <div key={a.id} className="card grid gap-4 md:grid-cols-[12rem_1fr]">
              {photo ? (
                <a href={`/api/uploads/${photo.ruta}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/uploads/${photo.ruta}`} alt="" className="w-full rounded-xl" />
                </a>
              ) : (
                <div />
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-bench-muted">
                    {TIPO_LABEL[a.tipoFoto] ?? a.tipoFoto} · {dateTime(a.createdAt)}
                    {a.pregunta ? ` · “${a.pregunta}”` : ""}
                  </p>
                  <DeleteButton action={deleteAnalysis.bind(null, a.id)} />
                </div>
                {parsed ? <AnalysisView a={parsed} /> : <p className="text-bench-bad">Resultado ilegible.</p>}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
