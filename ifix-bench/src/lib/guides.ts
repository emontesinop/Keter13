import "server-only";
import { getGuides } from "./knowledge";

export function guidesForModel(modelo: string) {
  return getGuides().filter((g) => g.modelos.includes("todos") || g.modelos.includes(modelo));
}
