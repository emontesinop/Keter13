export const ORDER_STATES = [
  { id: "RECIBIDO", label: "Recibido", color: "bg-slate-600" },
  { id: "DIAGNOSTICO", label: "En diagnóstico", color: "bg-sky-700" },
  { id: "ESPERA_APROBACION", label: "Espera aprobación", color: "bg-violet-700" },
  { id: "ESPERA_PIEZA", label: "Espera pieza", color: "bg-orange-700" },
  { id: "REPARANDO", label: "Reparando", color: "bg-amber-600" },
  { id: "PRUEBAS", label: "Pruebas finales", color: "bg-teal-700" },
  { id: "LISTO", label: "Listo para entregar", color: "bg-green-700" },
  { id: "ENTREGADO", label: "Entregado", color: "bg-zinc-700" },
  { id: "CANCELADO", label: "Cancelado", color: "bg-red-900" },
] as const;
export type OrderState = (typeof ORDER_STATES)[number]["id"];
export const ACTIVE_STATES: OrderState[] = ["RECIBIDO", "DIAGNOSTICO", "ESPERA_APROBACION", "ESPERA_PIEZA", "REPARANDO", "PRUEBAS", "LISTO"];
/** Estados que no se permiten con bloqueo de iCloud sin prueba de propiedad verificada. */
export const ICLOUD_BLOCKED_STATES: OrderState[] = ["REPARANDO", "PRUEBAS", "LISTO", "ENTREGADO"];

export const stateInfo = (id: string) => ORDER_STATES.find((s) => s.id === id) ?? ORDER_STATES[0];

export const CHECK_RESULTS = [
  { id: "OK", label: "OK", cls: "bg-bench-ok text-black" },
  { id: "FALLA", label: "Falla", cls: "bg-bench-bad text-white" },
  { id: "NO_PROBADO", label: "No probado", cls: "bg-slate-500 text-white" },
  { id: "NA", label: "N/A", cls: "bg-zinc-700 text-white" },
] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number]["id"];

export const TOOLS: Record<string, { label: string; emoji: string }> = {
  multimetro: { label: "Multímetro", emoji: "🔌" },
  fuente_dc: { label: "Fuente DC", emoji: "⚡" },
  camara_termica: { label: "Cámara térmica", emoji: "🌡️" },
  microscopio: { label: "Microscopio", emoji: "🔬" },
  medidor_usb: { label: "Medidor USB", emoji: "🔋" },
  visual: { label: "Inspección / prueba", emoji: "👁️" },
  pc: { label: "PC (Finder / iTunes)", emoji: "💻" },
  ninguna: { label: "Sin herramienta", emoji: "📋" },
};

export const PHOTO_STAGES = ["ENTRADA", "PROCESO", "SALIDA", "IA"] as const;
