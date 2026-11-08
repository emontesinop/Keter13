import "server-only";
import { getChecklist, getModel } from "./knowledge";

/** Grupos del checklist filtrados por la biometría del modelo. */
export function checklistFor(modelo: string) {
  const model = getModel(modelo);
  return getChecklist().grupos.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    items: g.items.filter((i) => !i.solo_biometria || !model || i.solo_biometria === model.biometria),
  }));
}
