import "server-only";
import { db } from "./db";

export const SETTING_DEFAULTS = {
  nombre_taller: "iFix Bench",
  telefono_taller: "",
  direccion_taller: "",
  moneda: "USD",
  garantia_dias: "90",
  anthropic_api_key: "",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.setting.findMany();
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSetting(key: SettingKey, value: string) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
