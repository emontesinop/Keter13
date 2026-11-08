// Normalización de unidades: se guarda siempre en la unidad canónica de cada modo.
export const MODES = [
  { id: "DIODO", label: "Modo diodo", units: ["mV", "V"], canon: "mV" },
  { id: "RESISTENCIA", label: "Resistencia", units: ["Ω", "kΩ", "MΩ"], canon: "Ω" },
  { id: "VOLTAJE", label: "Voltaje", units: ["V", "mV"], canon: "V" },
] as const;
export type ModeId = (typeof MODES)[number]["id"];

const FACTOR: Record<string, number> = { mV: 1e-3, V: 1, "Ω": 1, "kΩ": 1e3, "MΩ": 1e6 };

export function toCanonical(modo: string, valor: number, unidad: string) {
  const m = MODES.find((x) => x.id === modo);
  if (!m) throw new Error("Modo inválido");
  const f = FACTOR[unidad];
  if (!f) throw new Error("Unidad inválida");
  return { valor: (valor * f) / FACTOR[m.canon], unidad: m.canon };
}

export const modeLabel = (id: string) => MODES.find((m) => m.id === id)?.label ?? id;
export const canonUnit = (id: string) => MODES.find((m) => m.id === id)?.canon ?? "";

export type RefStat = { count: number; avg: number; min: number; max: number };
export const refKey = (linea: string, modo: string) => `${linea}|${modo}`;

/** Umbral orientativo para resaltar diferencias con la placa buena. */
export const DEVIATION_WARN = 0.1;

export function fmtVal(v: number) {
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 3;
  return String(Number(v.toFixed(d)));
}
