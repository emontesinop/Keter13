import Link from "next/link";
import { Lock } from "lucide-react";
import { StateBadge } from "./ui";
import { dateTime } from "@/lib/format";

export function OrderCard({
  o,
  modelName,
}: {
  o: { id: string; codigo: string; modelo: string; fallaReportada: string; estado: string; createdAt: Date; icloudBloqueado: boolean; pruebaVerificada: boolean; customer: { nombre: string } };
  modelName: string;
}) {
  return (
    <Link href={`/ordenes/${o.id}`} className="card block transition hover:border-bench-accent active:scale-[0.99]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-lg font-bold text-bench-accent">{o.codigo}</span>
        <StateBadge estado={o.estado} />
      </div>
      <p className="mt-2 text-xl font-bold">{modelName}</p>
      <p className="muted">{o.customer.nombre}</p>
      <p className="mt-2 line-clamp-2">{o.fallaReportada}</p>
      <div className="mt-3 flex items-center justify-between text-sm text-bench-muted">
        <span>{dateTime(o.createdAt)}</span>
        {o.icloudBloqueado && (
          <span className={`flex items-center gap-1 font-bold ${o.pruebaVerificada ? "text-bench-ok" : "text-bench-bad"}`}>
            <Lock className="h-4 w-4" /> iCloud {o.pruebaVerificada ? "· propiedad verificada" : "· falta prueba"}
          </span>
        )}
      </div>
    </Link>
  );
}
