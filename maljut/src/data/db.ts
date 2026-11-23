import Dexie, { type Table } from "dexie";
import type { Assessment, Checkin, Craving, KV, Lapse, Profile, Reason } from "./types";

export class MaljutDB extends Dexie {
  profile!: Table<Profile, string>;
  assessments!: Table<Assessment, number>;
  reasons!: Table<Reason, number>;
  cravings!: Table<Craving, number>;
  checkins!: Table<Checkin, string>;
  lapses!: Table<Lapse, number>;
  kv!: Table<KV, string>;

  constructor(name = "maljut") {
    super(name);
    this.version(1).stores({
      profile: "id",
      assessments: "++id, at",
      reasons: "++id, at",
      cravings: "++id, at",
      checkins: "date, at",
      lapses: "++id, at",
      kv: "key",
    });
  }
}

export const TABLES = ["profile", "assessments", "reasons", "cravings", "checkins", "lapses", "kv"] as const;
export type Snapshot = { app: "maljut"; schema: 1; exportedAt: number; data: Record<(typeof TABLES)[number], unknown[]> };

export async function exportAll(db: MaljutDB): Promise<Snapshot> {
  const data = {} as Snapshot["data"];
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return { app: "maljut", schema: 1, exportedAt: Date.now(), data };
}

export async function importAll(db: MaljutDB, snap: Snapshot): Promise<void> {
  if (snap?.app !== "maljut" || !snap.data) throw new Error("El archivo no es una copia de Maljut");
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd((snap.data[t] ?? []) as object[]);
    }
  });
}

export async function wipeAll(db: MaljutDB): Promise<void> {
  await db.delete();
}

export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
