import "server-only";
import { db } from "./db";

export const DOC_TYPES = [
  { id: "ESQUEMATICO", label: "Esquemático" },
  { id: "BOARDVIEW", label: "Boardview" },
  { id: "DATASHEET", label: "Datasheet" },
  { id: "OTRO", label: "Otro" },
] as const;
export const docTypeLabel = (id: string) => DOC_TYPES.find((t) => t.id === id)?.label ?? id;

/** Documentos asociados al modelo (o generales, sin modelos). */
export async function documentsForModel(modelo: string) {
  const docs = await db.document.findMany({ orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
  return docs.filter((d) => !d.modelos || d.modelos.split(",").includes(modelo));
}
