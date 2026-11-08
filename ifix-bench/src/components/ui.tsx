import { AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { stateInfo } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { Safety } from "@/lib/knowledge-schemas";

export function VerifyBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      title="Contenido inicial sin verificar. Revísalo y marca verificado: true en el YAML."
      className="inline-flex items-center rounded-md bg-yellow-400 px-2 py-0.5 text-xs font-black tracking-wider text-black"
    >
      VERIFICAR
    </span>
  );
}

export function StateBadge({ estado, big }: { estado: string; big?: boolean }) {
  const s = stateInfo(estado);
  return (
    <span className={cn("inline-flex items-center rounded-lg font-bold text-white", s.color, big ? "px-4 py-2 text-lg" : "px-2.5 py-1 text-sm")}>
      {s.label}
    </span>
  );
}

const levelStyle = {
  peligro: { box: "border-red-500 bg-red-950/70", icon: ShieldAlert, text: "text-red-300" },
  precaucion: { box: "border-amber-500 bg-amber-950/60", icon: AlertTriangle, text: "text-amber-300" },
  info: { box: "border-sky-500 bg-sky-950/60", icon: Info, text: "text-sky-300" },
};

export function SafetyBanner({ aviso, open = false }: { aviso: Safety["avisos"][string]; open?: boolean }) {
  const st = levelStyle[aviso.nivel];
  const Icon = st.icon;
  return (
    <details open={open} className={cn("group rounded-xl border-2 px-4 py-3", st.box)}>
      <summary className={cn("flex min-h-[2.5rem] cursor-pointer list-none items-center gap-3 text-lg font-bold", st.text)}>
        <Icon className="h-7 w-7 shrink-0" />
        <span className="flex-1">{aviso.titulo}</span>
        <span className="text-sm font-medium opacity-70 group-open:hidden">Ver</span>
      </summary>
      <p className="mt-2 text-base leading-relaxed text-bench-text">{aviso.texto}</p>
      {aviso.campos_usuario?.length ? (
        <ul className="mt-2 list-disc pl-6 text-sm text-bench-muted">
          {aviso.campos_usuario.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

export function SafetyList({ ids, safety, open }: { ids: string[]; safety: Safety["avisos"]; open?: boolean }) {
  const list = ids.map((id) => safety[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      {list.map((a) => (
        <SafetyBanner key={a.titulo} aviso={a} open={open} />
      ))}
    </div>
  );
}

export function KnowledgeErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-950/60 p-4">
      <p className="text-lg font-bold text-red-300">Error en la base de conocimiento</p>
      <p className="mt-1 font-mono text-sm">{msg}</p>
      <p className="mt-2 text-sm text-bench-muted">Corrige el archivo YAML y recarga. Detalle en Ajustes → Base de conocimiento.</p>
    </div>
  );
}
