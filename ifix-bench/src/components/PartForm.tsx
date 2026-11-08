import { PART_CATEGORIES } from "@/lib/constants";
import type { Model } from "@/lib/knowledge-schemas";
import { ChipPicker } from "./ChipPicker";
import { SubmitButton } from "./SubmitButton";

type P = Partial<{
  nombre: string; sku: string | null; categoria: string; modelos: string; calidad: string | null; stock: number; stockMinimo: number;
  costo: number | null; precioVenta: number | null; proveedor: string | null; ubicacion: string | null; notas: string | null;
}>;

export function PartForm({ action, models, currency, p = {}, isNew }: { action: (fd: FormData) => Promise<void>; models: Model[]; currency: string; p?: P; isNew?: boolean }) {
  return (
    <form action={action} className="space-y-6">
      <div className="panel grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="nombre">Nombre *</label>
          <input id="nombre" name="nombre" required className="input" defaultValue={p.nombre} placeholder="ej. Batería iPhone 12 / 12 Pro" />
        </div>
        <div>
          <label className="label" htmlFor="categoria">Categoría</label>
          <select id="categoria" name="categoria" className="input" defaultValue={p.categoria ?? "OTRO"}>
            {PART_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="calidad">Calidad</label>
          <input id="calidad" name="calidad" className="input" defaultValue={p.calidad ?? ""} list="calidades" placeholder="Original, OEM, Compatible…" />
          <datalist id="calidades">
            <option value="Original" /><option value="OEM / Service pack" /><option value="Compatible" /><option value="Recuperada" />
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="sku">SKU / código</label>
          <input id="sku" name="sku" className="input font-mono" defaultValue={p.sku ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="proveedor">Proveedor</label>
          <input id="proveedor" name="proveedor" className="input" defaultValue={p.proveedor ?? ""} />
        </div>
        {isNew && (
          <div>
            <label className="label" htmlFor="stock">Stock inicial</label>
            <input id="stock" name="stock" inputMode="numeric" className="input" defaultValue={p.stock ?? 0} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="stockMinimo">Stock mínimo (alerta)</label>
          <input id="stockMinimo" name="stockMinimo" inputMode="numeric" className="input" defaultValue={p.stockMinimo ?? 1} />
        </div>
        <div>
          <label className="label" htmlFor="costo">Costo unitario ({currency})</label>
          <input id="costo" name="costo" inputMode="decimal" className="input" defaultValue={p.costo ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="precioVenta">Precio de venta ({currency})</label>
          <input id="precioVenta" name="precioVenta" inputMode="decimal" className="input" defaultValue={p.precioVenta ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="ubicacion">Ubicación en el taller</label>
          <input id="ubicacion" name="ubicacion" className="input" defaultValue={p.ubicacion ?? ""} placeholder="Cajón A3" />
        </div>
        <div className="md:col-span-2">
          <span className="label">Modelos compatibles</span>
          <ChipPicker name="modelos" options={models.map((m) => ({ key: m.id, label: m.nombre.replace("iPhone ", "") }))} defaultValue={p.modelos ? p.modelos.split(",").filter(Boolean) : []} />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="notas">Notas</label>
          <textarea id="notas" name="notas" rows={2} className="input" defaultValue={p.notas ?? ""} />
        </div>
      </div>
      <SubmitButton className="btn-primary btn-xl w-full">{isNew ? "Añadir al inventario" : "Guardar cambios"}</SubmitButton>
    </form>
  );
}
