import { useLiveQuery } from "dexie-react-hooks";
import { MaljutDB } from "../data/db";
import type { ArmStats, Profile } from "../data/types";
import { setTtsEnabled } from "../platform/tts";
import { setCuesEnabled } from "../platform/cue";

export const db = new MaljutDB();

export interface Settings { tts: boolean; cues: boolean }
export const DEFAULT_SETTINGS: Settings = { tts: true, cues: true };

export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => (await db.profile.get("me")) ?? null, []);
}

export function useSettings(): Settings {
  const s = useLiveQuery(async () => (await db.kv.get("settings"))?.value as Settings | undefined, []);
  const merged = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  setTtsEnabled(merged.tts);
  setCuesEnabled(merged.cues);
  return merged;
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = ((await db.kv.get("settings"))?.value as Settings | undefined) ?? DEFAULT_SETTINGS;
  await db.kv.put({ key: "settings", value: { ...cur, ...patch } });
}

export async function getArmStats(): Promise<ArmStats> {
  return ((await db.kv.get("armStats"))?.value as ArmStats | undefined) ?? {};
}

export async function setArmStats(stats: ArmStats) {
  await db.kv.put({ key: "armStats", value: stats });
}

export const dailyCost = (p: Profile) => p.weeklySpend / 7;

export function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("es-US", { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);
}
