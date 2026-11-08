import type { Analysis } from "@/lib/ai";
import { cn } from "@/lib/format";

const TIPO: Record<string, string> = {
  corrosion: "Corrosión", quemado: "Quemado", componente_faltante: "Componente faltante", componente_danado: "Componente dañado",
  flex_roto: "Flex roto", conector_danado: "Conector dañado", soldadura: "Soldadura", danio_fisico: "Daño físico",
  liquido: "Líquido", pantalla_no_original: "Pantalla no original", pieza_no_original: "Pieza no original", otro: "Otro",
};
const SEV = { alta: "border-red-500 bg-red-950/50", media: "border-amber-500 bg-amber-950/40", baja: "border-bench-line bg-bench-bg" };

export function AnalysisView({ a }: { a: Analysis }) {
  return (
    <div className="space-y-3">
      <p className="text-lg">{a.resumen}</p>
      <p className="text-sm text-bench-muted">
        Imagen: {a.tipo_imagen} · calidad {a.calidad_imagen}
      </p>
      {a.hallazgos.length === 0 ? (
        <p className="rounded-xl border-2 border-green-700 bg-green-950/40 p-3 font-semibold">Sin daños visibles.</p>
      ) : (
        <ul className="space-y-2">
          {a.hallazgos.map((h, i) => (
            <li key={i} className={cn("rounded-xl border-2 p-3", SEV[h.severidad])}>
              <p className="text-lg font-bold">
                {TIPO[h.tipo] ?? h.tipo} <span className="text-sm font-normal text-bench-muted">· severidad {h.severidad} · confianza {h.confianza}</span>
              </p>
              <p>{h.descripcion}</p>
              <p className="text-sm text-bench-muted">📍 {h.ubicacion}</p>
            </li>
          ))}
        </ul>
      )}
      {a.recomendaciones.length > 0 && (
        <div>
          <p className="font-semibold">Recomendaciones</p>
          <ol className="list-decimal space-y-1 pl-6">{a.recomendaciones.map((r) => <li key={r}>{r}</li>)}</ol>
        </div>
      )}
      {a.limitaciones && <p className="text-sm text-bench-muted">Limitaciones: {a.limitaciones}</p>}
      <p className="text-xs text-yellow-300">Sugerencia generada por IA: confírmala con el microscopio antes de actuar.</p>
    </div>
  );
}
