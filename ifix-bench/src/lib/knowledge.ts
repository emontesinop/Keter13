import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  ChecklistFile,
  DcFile,
  ModelsFile,
  PhysicalFile,
  SafetyFile,
  SymptomsFile,
  TreeFile,
  type Tree,
} from "./knowledge-schemas";

export const KNOWLEDGE_DIR = join(process.cwd(), "knowledge");

export class KnowledgeError extends Error {
  constructor(
    public file: string,
    public details: string[],
  ) {
    super(`Error en knowledge/${file}: ${details.join("; ")}`);
  }
}

// Se lee en cada petición: así los cambios en los YAML se ven al recargar.
function load<T extends z.ZodTypeAny>(file: string, schema: T): z.infer<T> {
  const path = join(KNOWLEDGE_DIR, file);
  if (!existsSync(path)) throw new KnowledgeError(file, ["el archivo no existe"]);
  let raw: unknown;
  try {
    raw = YAML.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new KnowledgeError(file, [`YAML inválido: ${(e as Error).message}`]);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new KnowledgeError(
      file,
      parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

export const getModels = () => load("models.yaml", ModelsFile).modelos;
export const getModel = (id: string) => getModels().find((m) => m.id === id);
export const getChecklist = () => load("checklist.yaml", ChecklistFile);
export const getPhysical = () => load("physical.yaml", PhysicalFile).opciones;
export const getSymptoms = () => load("symptoms.yaml", SymptomsFile).sintomas;
export const getSafety = () => load("safety.yaml", SafetyFile).avisos;
export const getDcPatterns = () => load("dc-consumption.yaml", DcFile);

export function listTreeIds(): string[] {
  const dir = join(KNOWLEDGE_DIR, "diagnostics");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

export function getTree(id: string): Tree | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const file = ["yaml", "yml"].map((e) => `diagnostics/${id}.${e}`).find((f) => existsSync(join(KNOWLEDGE_DIR, f)));
  if (!file) return null;
  return load(file, TreeFile);
}

export function getTrees(): Tree[] {
  return listTreeIds()
    .map((id) => {
      try {
        return getTree(id);
      } catch {
        return null;
      }
    })
    .filter((t): t is Tree => t !== null);
}

/** Valida todos los archivos y las referencias cruzadas. Devuelve lista de problemas. */
export function validateKnowledge(): { file: string; ok: boolean; problems: string[]; pendientes: number }[] {
  const report: { file: string; ok: boolean; problems: string[]; pendientes: number }[] = [];
  const check = (file: string, fn: () => { problems?: string[]; pendientes?: number } | void) => {
    try {
      const r = fn() || {};
      report.push({ file, ok: !(r.problems?.length), problems: r.problems ?? [], pendientes: r.pendientes ?? 0 });
    } catch (e) {
      const details = e instanceof KnowledgeError ? e.details : [(e as Error).message];
      report.push({ file, ok: false, problems: details, pendientes: 0 });
    }
  };
  const treeIds = new Set(listTreeIds());
  check("models.yaml", () => {
    const ids = getModels().map((m) => m.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    return { problems: dup.map((d) => `id duplicado: ${d}`) };
  });
  check("checklist.yaml", () => {
    const keys = getChecklist().grupos.flatMap((g) => g.items.map((i) => i.key));
    return { problems: keys.filter((k, i) => keys.indexOf(k) !== i).map((k) => `key duplicada: ${k}`) };
  });
  const safetyIds = (() => {
    try {
      return new Set(Object.keys(getSafety()));
    } catch {
      return new Set<string>();
    }
  })();
  check("safety.yaml", () => void getSafety());
  check("physical.yaml", () => ({
    problems: getPhysical()
      .filter((o) => o.aviso && !safetyIds.has(o.aviso))
      .map((o) => `${o.key}: aviso "${o.aviso}" no existe en safety.yaml`),
  }));
  check("symptoms.yaml", () => ({
    problems: getSymptoms()
      .filter((s) => s.arbol && !treeIds.has(s.arbol))
      .map((s) => `${s.key}: árbol "${s.arbol}" no existe (aparecerá sin botón)`),
  }));
  check("dc-consumption.yaml", () => {
    const dc = getDcPatterns();
    return {
      problems: dc.patrones
        .filter((p) => p.siguiente?.arbol && !treeIds.has(p.siguiente.arbol))
        .map((p) => `${p.id}: árbol "${p.siguiente!.arbol}" no existe`),
      pendientes: dc.patrones.filter((p) => !p.verificado).length,
    };
  });
  for (const id of treeIds) {
    check(`diagnostics/${id}.yaml`, () => {
      const t = getTree(id)!;
      const problems: string[] = [];
      if (t.id !== id) problems.push(`id "${t.id}" no coincide con el nombre del archivo`);
      if (!t.nodos[t.inicio]) problems.push(`nodo de inicio "${t.inicio}" no existe`);
      for (const [nid, n] of Object.entries(t.nodos)) {
        if (n.tipo !== "conclusion" && !n.opciones?.length) problems.push(`${nid}: no tiene opciones`);
        for (const o of n.opciones ?? []) {
          if (o.siguiente && !t.nodos[o.siguiente]) problems.push(`${nid}: "${o.texto}" apunta a nodo inexistente "${o.siguiente}"`);
          if (o.arbol && !treeIds.has(o.arbol)) problems.push(`${nid}: "${o.texto}" apunta a árbol inexistente "${o.arbol}"`);
          if (!o.siguiente && !o.arbol) problems.push(`${nid}: "${o.texto}" no tiene destino`);
        }
        for (const s of n.seguridad ?? []) if (!safetyIds.has(s)) problems.push(`${nid}: aviso "${s}" no existe`);
      }
      const pendientes = Object.values(t.nodos).filter((n) => !n.verificado && n.tipo !== "conclusion").length;
      return { problems, pendientes };
    });
  }
  return report;
}
