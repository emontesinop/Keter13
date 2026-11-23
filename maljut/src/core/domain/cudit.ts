export interface CuditItem {
  id: number;
  text: string;
  options: { label: string; value: number }[];
}

const FREQ = [
  { label: "Nunca", value: 0 },
  { label: "Menos de una vez al mes", value: 1 },
  { label: "Una vez al mes", value: 2 },
  { label: "Una vez a la semana", value: 3 },
  { label: "Diario o casi diario", value: 4 },
];

/** CUDIT-R (Adamson et al., 2010). Periodo de referencia: últimos 6 meses. */
export const CUDIT_ITEMS: CuditItem[] = [
  {
    id: 1,
    text: "¿Con qué frecuencia consumes cannabis?",
    options: [
      { label: "Nunca", value: 0 },
      { label: "Una vez al mes o menos", value: 1 },
      { label: "2 a 4 veces al mes", value: 2 },
      { label: "2 a 3 veces por semana", value: 3 },
      { label: "4 o más veces por semana", value: 4 },
    ],
  },
  {
    id: 2,
    text: "En un día típico de consumo, ¿cuántas horas estás colocado/a?",
    options: [
      { label: "Menos de 1", value: 0 },
      { label: "1 o 2", value: 1 },
      { label: "3 o 4", value: 2 },
      { label: "5 o 6", value: 3 },
      { label: "7 o más", value: 4 },
    ],
  },
  { id: 3, text: "¿Con qué frecuencia no pudiste parar una vez que empezaste?", options: FREQ },
  { id: 4, text: "¿Con qué frecuencia dejaste de hacer lo que se esperaba de ti por consumir?", options: FREQ },
  { id: 5, text: "¿Con qué frecuencia dedicaste mucho tiempo a conseguir, consumir o recuperarte del cannabis?", options: FREQ },
  { id: 6, text: "¿Con qué frecuencia tuviste problemas de memoria o concentración después de consumir?", options: FREQ },
  {
    id: 7,
    text: "¿Con qué frecuencia consumes en situaciones de riesgo físico (manejar, usar máquinas, cuidar niños)?",
    options: FREQ,
  },
  {
    id: 8,
    text: "¿Alguna vez has pensado en reducir o dejar el cannabis?",
    options: [
      { label: "Nunca", value: 0 },
      { label: "Sí, pero no en los últimos 6 meses", value: 2 },
      { label: "Sí, en los últimos 6 meses", value: 4 },
    ],
  },
];

export type CuditBand = "low" | "hazardous" | "possible_cud";

export function scoreCudit(answers: number[]): { score: number; band: CuditBand } {
  if (answers.length !== CUDIT_ITEMS.length) throw new Error("CUDIT-R requiere 8 respuestas");
  answers.forEach((a, i) => {
    if (!CUDIT_ITEMS[i].options.some((o) => o.value === a)) throw new Error(`Respuesta inválida en ítem ${i + 1}`);
  });
  const score = answers.reduce((s, a) => s + a, 0);
  const band: CuditBand = score >= 12 ? "possible_cud" : score >= 8 ? "hazardous" : "low";
  return { score, band };
}
