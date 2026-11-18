import "server-only";
import { getModels } from "./knowledge";

export function modelNameMap(): Record<string, string> {
  try {
    return Object.fromEntries(getModels().map((m) => [m.id, m.nombre]));
  } catch {
    return {};
  }
}
