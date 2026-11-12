// Projects are stored on the device in IndexedDB (photos, settings, results, build progress).
import type { Result, Settings } from "./engine/types";
import type { StoredImage } from "./framing";

export type Project = {
  id: string; name: string; created: number; updated: number;
  settings: Settings; image: Blob | StoredImage | null; thumb: string; result: Result | null; buildStep: number;
};

const DB = "stringart-studio", STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const listProjects = async () => ((await tx<Project[]>("readonly", (s) => s.getAll())) ?? []).sort((a, b) => b.updated - a.updated);
export const getProject = (id: string) => tx<Project | undefined>("readonly", (s) => s.get(id));
export const saveProject = (p: Project) => tx("readwrite", (s) => s.put({ ...p, updated: Date.now() }));
/** Merge fields into the stored project (never overwrites fields it is not given, e.g. the photo). */
export async function updateProject(id: string, patch: Partial<Project>): Promise<Project | undefined> {
  const cur = await getProject(id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch, id };
  await saveProject(next);
  return next;
}
export const deleteProject = (id: string) => tx("readwrite", (s) => s.delete(id));
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Ask iOS to keep our data (not evicted under storage pressure). */
export function requestPersistence() {
  (navigator as any).storage?.persist?.().catch(() => {});
}
