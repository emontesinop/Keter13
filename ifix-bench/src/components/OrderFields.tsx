import type { Model, Safety } from "@/lib/knowledge-schemas";
import { ChipPicker } from "./ChipPicker";

type Defaults = Partial<{
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  modelo: string;
  imei: string | null;
  serie: string | null;
  codigoDesbloqueo: string | null;
  fallaReportada: string;
  sintomas: string[];
  estadoFisico: string[];
  estadoFisicoNota: string | null;
  presupuesto: number | null;
  boardviewPath: string | null;
  notas: string | null;
}>;

export function OrderFields({
  models,
  symptoms,
  physical,
  safety,
  currency,
  d = {},
}: {
  models: Model[];
  symptoms: { key: string; label: string }[];
  physical: { key: string; label: string; aviso?: string }[];
  safety: Safety["avisos"];
  currency: string;
  d?: Defaults;
}) {
  const years = [...new Set(models.map((m) => m.anio))].sort((a, b) => b - a);
  return (
    <>
      <fieldset className="panel grid gap-4 md:grid-cols-3">
        <legend className="h3 px-2">Cliente</legend>
        <div className="md:col-span-1">
          <label className="label" htmlFor="cliente_nombre">Nombre *</label>
          <input id="cliente_nombre" name="cliente_nombre" required className="input" defaultValue={d.cliente_nombre} autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="cliente_telefono">Teléfono</label>
          <input id="cliente_telefono" name="cliente_telefono" type="tel" inputMode="tel" className="input" defaultValue={d.cliente_telefono ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="cliente_email">Email</label>
          <input id="cliente_email" name="cliente_email" type="email" className="input" defaultValue={d.cliente_email ?? ""} />
        </div>
      </fieldset>

      <fieldset className="panel grid gap-4 md:grid-cols-2">
        <legend className="h3 px-2">Equipo</legend>
        <div className="md:col-span-2">
          <label className="label" htmlFor="modelo">Modelo *</label>
          <select id="modelo" name="modelo" required className="input" defaultValue={d.modelo ?? ""}>
            <option value="" disabled>Elige el modelo…</option>
            {years.map((y) => (
              <optgroup key={y} label={String(y)}>
                {models.filter((m) => m.anio === y).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="imei">IMEI</label>
          <input id="imei" name="imei" inputMode="numeric" className="input font-mono" defaultValue={d.imei ?? ""} placeholder="*#06#" />
        </div>
        <div>
          <label className="label" htmlFor="serie">Número de serie</label>
          <input id="serie" name="serie" className="input font-mono uppercase" defaultValue={d.serie ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="codigoDesbloqueo">Código del equipo (desbloqueo)</label>
          <input id="codigoDesbloqueo" name="codigoDesbloqueo" className="input font-mono" defaultValue={d.codigoDesbloqueo ?? ""} placeholder="Opcional" autoComplete="off" />
          <p className="mt-1 text-sm text-bench-muted">Se guarda solo en esta computadora.</p>
        </div>
        <div>
          <label className="label" htmlFor="presupuesto">Presupuesto ({currency})</label>
          <input id="presupuesto" name="presupuesto" inputMode="decimal" className="input" defaultValue={d.presupuesto ?? ""} />
        </div>
      </fieldset>

      <fieldset className="panel space-y-4">
        <legend className="h3 px-2">Falla</legend>
        <div>
          <label className="label" htmlFor="fallaReportada">Falla reportada por el cliente *</label>
          <textarea id="fallaReportada" name="fallaReportada" required rows={3} className="input" defaultValue={d.fallaReportada} />
        </div>
        <div>
          <span className="label">Síntomas</span>
          <ChipPicker name="sintomas" options={symptoms} defaultValue={d.sintomas} />
        </div>
      </fieldset>

      <fieldset className="panel space-y-4">
        <legend className="h3 px-2">Estado físico</legend>
        <ChipPicker name="estadoFisico" options={physical} defaultValue={d.estadoFisico} safety={safety} />
        <div>
          <label className="label" htmlFor="estadoFisicoNota">Observaciones del estado físico</label>
          <textarea id="estadoFisicoNota" name="estadoFisicoNota" rows={2} className="input" defaultValue={d.estadoFisicoNota ?? ""} placeholder="Rayones, marcas, piezas que faltan…" />
        </div>
      </fieldset>

      <fieldset className="panel grid gap-4 md:grid-cols-2">
        <legend className="h3 px-2">Otros</legend>
        <div>
          <label className="label" htmlFor="boardviewPath">Esquemático / boardview local</label>
          <input id="boardviewPath" name="boardviewPath" className="input font-mono text-base" defaultValue={d.boardviewPath ?? ""} placeholder="/ruta/a/tu/archivo (opcional)" />
          <p className="mt-1 text-sm text-bench-muted">Solo se guarda la ruta a un archivo tuyo. La app no incluye esquemáticos.</p>
        </div>
        <div>
          <label className="label" htmlFor="notas">Notas internas</label>
          <textarea id="notas" name="notas" rows={2} className="input" defaultValue={d.notas ?? ""} />
        </div>
      </fieldset>
    </>
  );
}
