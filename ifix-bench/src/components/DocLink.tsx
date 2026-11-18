import { ExternalLink, FileText } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function DocLink({ d, typeLabel }: { d: { id: string; nombre: string; archivo: string | null; rutaLocal: string | null }; typeLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FileText className="h-7 w-7 shrink-0 text-bench-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{d.nombre}</p>
        <p className="text-sm text-bench-muted">
          {typeLabel}
          {d.rutaLocal && <span className="ml-2 break-all font-mono">{d.rutaLocal}</span>}
        </p>
      </div>
      {d.archivo && (
        <a href={`/api/library/${d.id}`} target="_blank" rel="noreferrer" className="btn-primary min-h-[3rem] text-base">
          <ExternalLink className="h-5 w-5" /> Abrir
        </a>
      )}
      {d.rutaLocal && <CopyButton text={d.rutaLocal} />}
    </div>
  );
}
