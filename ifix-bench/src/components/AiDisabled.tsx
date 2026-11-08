import Link from "next/link";
import { KeyRound } from "lucide-react";

export function AiDisabled() {
  return (
    <div className="panel flex flex-wrap items-center gap-4">
      <KeyRound className="h-10 w-10 text-bench-muted" />
      <div className="flex-1">
        <p className="text-xl font-bold">Módulo de IA desactivado</p>
        <p className="muted">Configura tu API key de Claude en Ajustes para analizar fotos y usar el chat de diagnóstico. El resto de la app funciona igual sin ella.</p>
      </div>
      <Link href="/ajustes" className="btn-primary">Ir a Ajustes</Link>
    </div>
  );
}
