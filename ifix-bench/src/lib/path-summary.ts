import type { PathStep } from "@/app/actions";
import type { Tree } from "./knowledge-schemas";

export function parsePath(json: string): PathStep[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function nodeTitle(trees: Record<string, Tree>, arbol: string, nodo: string) {
  return trees[arbol]?.nodos[nodo]?.titulo ?? `${arbol}:${nodo}`;
}
