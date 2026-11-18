export type CheckRow = { itemKey: string; resultado: string; nota: string | null };
export type CompareItem = { key: string; label: string; entrada?: string; salida?: string };

/** Compara checklist de entrada y salida ítem por ítem. */
export function compareChecklists(items: { key: string; label: string }[], entrada: CheckRow[], salida: CheckRow[]) {
  const e = Object.fromEntries(entrada.map((r) => [r.itemKey, r.resultado]));
  const s = Object.fromEntries(salida.map((r) => [r.itemKey, r.resultado]));
  const all = items.map((i) => ({ key: i.key, label: i.label, entrada: e[i.key], salida: s[i.key] }));
  return {
    all,
    empeoro: all.filter((i) => i.salida === "FALLA" && i.entrada !== "FALLA"),
    mejoro: all.filter((i) => i.entrada === "FALLA" && i.salida === "OK"),
    sigueFallando: all.filter((i) => i.entrada === "FALLA" && i.salida === "FALLA"),
    pendientes: all.filter((i) => !i.salida),
  };
}
