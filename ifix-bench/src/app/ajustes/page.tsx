import { saveSettings } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { KNOWLEDGE_DIR, validateKnowledge } from "@/lib/knowledge";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const CURRENCIES = ["MXN", "USD", "EUR", "COP", "ARS", "CLP", "PEN", "GTQ", "DOP", "BOB", "UYU", "VES", "CRC", "PYG", "HNL", "NIO"];

export default async function Settings() {
  const s = await getSettings();
  const report = validateKnowledge();
  const hasKey = s.anthropic_api_key.length > 0;
  return (
    <div className="space-y-6">
      <h1 className="h1">Ajustes</h1>
      <form action={saveSettings} className="space-y-6">
        <fieldset className="panel grid gap-4 md:grid-cols-2">
          <legend className="h3 px-2">Taller</legend>
          <div>
            <label className="label" htmlFor="nombre_taller">Nombre del taller</label>
            <input id="nombre_taller" name="nombre_taller" className="input" defaultValue={s.nombre_taller} />
          </div>
          <div>
            <label className="label" htmlFor="telefono_taller">Teléfono</label>
            <input id="telefono_taller" name="telefono_taller" className="input" defaultValue={s.telefono_taller} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="direccion_taller">Dirección</label>
            <input id="direccion_taller" name="direccion_taller" className="input" defaultValue={s.direccion_taller} />
          </div>
          <div>
            <label className="label" htmlFor="moneda">Moneda</label>
            <select id="moneda" name="moneda" className="input" defaultValue={s.moneda}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="garantia_dias">Garantía por defecto (días)</label>
            <input id="garantia_dias" name="garantia_dias" inputMode="numeric" className="input" defaultValue={s.garantia_dias} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="condiciones_garantia">Condiciones de garantía (se imprimen en la nota de entrega)</label>
            <textarea id="condiciones_garantia" name="condiciones_garantia" rows={4} className="input" defaultValue={s.condiciones_garantia} />
          </div>
        </fieldset>

        <fieldset className="panel space-y-3">
          <legend className="h3 px-2">Análisis con IA (Claude)</legend>
          <p className={hasKey ? "text-bench-ok" : "text-bench-muted"}>
            {hasKey ? `✔ API key configurada (…${s.anthropic_api_key.slice(-4)})` : "Sin API key: el análisis de fotos y el chat quedan desactivados; el resto de la app funciona igual."}
          </p>
          <input name="anthropic_api_key" type="password" autoComplete="off" className="input font-mono" placeholder={hasKey ? "Escribe una nueva para reemplazarla" : "sk-ant-…"} />
          {hasKey && (
            <label className="flex items-center gap-3 text-base">
              <input type="checkbox" name="borrar_api_key" className="h-6 w-6" /> Borrar la API key guardada
            </label>
          )}
          <p className="text-sm text-bench-muted">Se guarda solo en la base de datos local (data/ifix.db). Consíguela en console.anthropic.com. Modelo usado: Claude Opus 5.5.</p>
        </fieldset>
        <SubmitButton className="btn-primary btn-xl w-full">Guardar ajustes</SubmitButton>
      </form>

      <section className="panel space-y-3">
        <h2 className="h2">Base de conocimiento</h2>
        <p className="muted break-all">
          Carpeta: <code className="font-mono">{KNOWLEDGE_DIR}</code>. Edita los YAML y recarga la página.
        </p>
        <div className="space-y-2">
          {report.map((r) => (
            <div key={r.file} className={`rounded-xl border-2 p-3 ${r.ok ? "border-bench-line" : "border-red-500 bg-red-950/40"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-base">{r.file}</span>
                <span className={r.ok ? "font-bold text-bench-ok" : "font-bold text-bench-bad"}>
                  {r.ok ? "✔ OK" : "✖ Error"}
                  {r.pendientes > 0 && <span className="ml-3 text-yellow-300">{r.pendientes} paso(s) por verificar</span>}
                </span>
              </div>
              {r.problems.length > 0 && (
                <ul className="mt-2 list-disc pl-6 font-mono text-sm text-red-200">
                  {r.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
