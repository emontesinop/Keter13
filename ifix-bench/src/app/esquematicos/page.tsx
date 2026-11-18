import { addDocument, deleteDocument } from "@/app/actions";
import { ChipPicker } from "@/components/ChipPicker";
import { DeleteButton } from "@/components/DeleteButton";
import { DocLink } from "@/components/DocLink";
import { SubmitButton } from "@/components/SubmitButton";
import { db } from "@/lib/db";
import { DOC_TYPES, docTypeLabel } from "@/lib/documents";
import { getModels } from "@/lib/knowledge";
import { splitList } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Library({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  const { modelo = "" } = await searchParams;
  const models = getModels();
  const names = Object.fromEntries(models.map((m) => [m.id, m.nombre]));
  const all = await db.document.findMany({ orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
  const docs = modelo ? all.filter((d) => !d.modelos || splitList(d.modelos).includes(modelo)) : all;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Esquemáticos y boardviews</h1>
        <p className="muted text-lg">
          Tu biblioteca personal: sube los archivos que tienes o enlaza su ruta en el disco. Se guardan solo en esta computadora
          (<code>data/library/</code>) y cada orden muestra los de su modelo. iFix Bench no incluye ni descarga esquemáticos.
        </p>
      </div>

      <form className="flex flex-wrap gap-3">
        <select name="modelo" defaultValue={modelo} className="input max-w-md flex-1">
          <option value="">Todos los modelos</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <section className="space-y-2">
        {docs.length === 0 ? (
          <p className="muted panel">No hay archivos {modelo ? "para este modelo" : "todavía"}.</p>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="card space-y-2">
              <DocLink d={d} typeLabel={docTypeLabel(d.tipo)} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-bench-muted">
                  {splitList(d.modelos).map((m) => names[m] ?? m).join(", ") || "General (todos los modelos)"}
                  {d.tamano ? ` · ${(d.tamano / 1024 / 1024).toFixed(1)} MB` : ""}
                  {d.nota ? ` · ${d.nota}` : ""}
                </p>
                <DeleteButton action={deleteDocument.bind(null, d.id)} />
              </div>
            </div>
          ))
        )}
      </section>

      <form action={addDocument} className="panel space-y-4">
        <h2 className="h2">Añadir archivo</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="archivo">Subir archivo (PDF, imagen, boardview…)</label>
            <input id="archivo" type="file" name="archivo" className="input py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-bench-accent file:px-4 file:py-2 file:font-semibold file:text-black" />
          </div>
          <div>
            <label className="label" htmlFor="rutaLocal">…o ruta a un archivo en tu disco</label>
            <input id="rutaLocal" name="rutaLocal" className="input font-mono text-base" placeholder="/Users/yo/Esquemas/iPhone12.pdf" />
          </div>
          <div>
            <label className="label" htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" className="input" placeholder="Por defecto, el nombre del archivo" />
          </div>
          <div>
            <label className="label" htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" className="input" defaultValue="ESQUEMATICO">
              {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <span className="label">Modelos (ninguno = general)</span>
            <ChipPicker name="modelos" options={models.map((m) => ({ key: m.id, label: m.nombre.replace("iPhone ", "") }))} defaultValue={modelo ? [modelo] : []} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="nota">Nota</label>
            <input id="nota" name="nota" className="input" />
          </div>
        </div>
        <p className="text-sm text-bench-muted">Los PDF e imágenes se abren en el navegador; los boardviews se descargan para abrirlos con tu visor.</p>
        <SubmitButton className="btn-primary btn-xl w-full">Guardar en la biblioteca</SubmitButton>
      </form>
    </div>
  );
}
