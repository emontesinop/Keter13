import { Lock } from "lucide-react";
import { Tabs } from "@/components/Tabs";
import { SafetyBanner, StateBadge } from "@/components/ui";
import { getModel, getSafety } from "@/lib/knowledge";
import { getOrder } from "@/lib/orders";
import { splitList } from "@/lib/format";

export default async function OrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getOrder(id);
  let model, safety;
  try {
    model = getModel(o.modelo);
    safety = getSafety();
  } catch {}
  const entrada = o.checklist.filter((c) => c.fase === "ENTRADA").length;
  const salida = o.checklist.filter((c) => c.fase === "SALIDA").length;
  const litio = splitList(o.estadoFisico).includes("bateria_hinchada");
  const base = `/ordenes/${o.id}`;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xl font-bold text-bench-accent">{o.codigo}</p>
          <h1 className="h1">{model?.nombre ?? o.modelo}</h1>
          <p className="muted text-lg">
            {o.customer.nombre}
            {o.customer.telefono ? ` · ${o.customer.telefono}` : ""}
          </p>
        </div>
        <StateBadge estado={o.estado} big />
      </header>

      {o.icloudBloqueado && (
        <div className={`flex items-center gap-3 rounded-xl border-2 p-4 ${o.pruebaVerificada ? "border-green-600 bg-green-950/50" : "border-red-500 bg-red-950/70"}`}>
          <Lock className="h-8 w-8 shrink-0" />
          <div>
            <p className="text-lg font-bold">{o.pruebaVerificada ? "Bloqueo de iCloud · propiedad verificada" : "BLOQUEO DE iCLOUD · falta prueba de propiedad"}</p>
            <p className="text-sm">
              {o.pruebaVerificada
                ? `Prueba registrada: ${o.pruebaPropiedad ?? "—"}`
                : "No se puede pasar a reparación ni entregar hasta que el cliente presente prueba de propiedad (Resumen → Bloqueo de activación)."}
            </p>
          </div>
        </div>
      )}
      {litio && safety?.litio && <SafetyBanner aviso={safety.litio} open />}
      {safety?.esd && <SafetyBanner aviso={safety.esd} />}

      <Tabs
        tabs={[
          { href: base, label: "Resumen" },
          { href: `${base}/checklist`, label: "Checklist", badge: entrada ? String(entrada) : undefined },
          { href: `${base}/diagnostico`, label: "Diagnóstico", badge: o.diagnostics.length + o.dcReadings.length ? String(o.diagnostics.length + o.dcReadings.length) : undefined },
          { href: `${base}/mediciones`, label: "Mediciones", badge: o.measurements.length + o.shortHunts.length ? String(o.measurements.length + o.shortHunts.length) : undefined },
          { href: `${base}/reparacion`, label: "Reparación", badge: o.partUsages.length ? String(o.partUsages.length) : undefined },
          { href: `${base}/ia`, label: "IA" },
          { href: `${base}/entrega`, label: "Entrega", badge: salida ? `${salida}` : undefined },
        ]}
      />
      {children}
    </div>
  );
}
