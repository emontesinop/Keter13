import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { db } from "./db";
import { getSettings } from "./settings";
import { getDcPatterns, getModel, getReferenceLines, getSymptoms, getTrees } from "./knowledge";
import { checklistFor } from "./checklist";
import { fmtVal, modeLabel, refKey } from "./measure";
import { referenceStats } from "./reference";
import { similarOrders } from "./similar";
import { parsePath, nodeTitle } from "./path-summary";

export const AI_MODEL = "claude-opus-5-5";
// Si un clasificador de seguridad rechaza la petición, la API la reintenta en otro modelo.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Cliente de Claude con la API key guardada en Ajustes, o null si no hay key (módulo desactivado). */
export async function getAiClient(): Promise<Anthropic | null> {
  const { anthropic_api_key } = await getSettings();
  if (!anthropic_api_key) return null;
  return new Anthropic({ apiKey: anthropic_api_key });
}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La API key no es válida. Revísala en Ajustes.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La API key no tiene permiso para este modelo.";
  if (e instanceof Anthropic.RateLimitError) return "Límite de uso alcanzado. Espera un momento y vuelve a intentar.";
  if (e instanceof Anthropic.BadRequestError) return `Petición rechazada por la API: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Sin conexión con la API de Claude. Revisa internet.";
  if (e instanceof Anthropic.APIError) return `Error de la API (${e.status ?? "?"}): ${e.message}`;
  return (e as Error)?.message ?? "Error desconocido";
}

const POLICY = `Normas fijas:
- Nunca des instrucciones para saltar o eliminar el bloqueo de activación de iCloud, bloqueos de operador o de cuenta, ni para modificar IMEI o números de serie. Si te lo piden, explica que el propietario debe gestionarlo con Apple o su operador con prueba de compra.
- No inventes valores de medición exactos (voltajes, modo diodo, consumos). Si no hay un valor de referencia registrado por el técnico, dilo y sugiere compararlo con una placa buena del mismo modelo.
- Recuerda las precauciones de seguridad cuando correspondan: ESD, baterías de litio hinchadas o perforadas, límites al inyectar voltaje, calor cerca de la batería.
- Responde siempre en español, de forma concreta y práctica para un técnico con las manos ocupadas.`;

// ─── Análisis de imágenes ───────────────────────────────────────────────────

export const AnalysisSchema = z.object({
  tipo_imagen: z.enum(["placa", "carcasa", "pantalla", "otro"]),
  calidad_imagen: z.enum(["buena", "regular", "insuficiente"]),
  resumen: z.string(),
  hallazgos: z.array(
    z.object({
      tipo: z.enum([
        "corrosion",
        "quemado",
        "componente_faltante",
        "componente_danado",
        "flex_roto",
        "conector_danado",
        "soldadura",
        "danio_fisico",
        "liquido",
        "pantalla_no_original",
        "pieza_no_original",
        "otro",
      ]),
      descripcion: z.string(),
      ubicacion: z.string(),
      severidad: z.enum(["baja", "media", "alta"]),
      confianza: z.enum(["baja", "media", "alta"]),
    }),
  ),
  recomendaciones: z.array(z.string()),
  limitaciones: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const VISION_SYSTEM = `Eres un asistente para un técnico de reparación de iPhone (modular y microsoldadura). Analizas fotos tomadas en el taller: placas bajo microscopio, carcasas y pantallas.

Describe solo lo que se ve en la imagen. Busca: corrosión u óxido, residuos de líquido, componentes quemados, faltantes o desplazados, soldaduras frías o puentes, flexores rotos o doblados, conectores con pines dañados, golpes o deformaciones, y señales de pantalla o piezas no originales (bordes, marcos, flex, serigrafía, calidad del panel).
- Nombra componentes por su designador solo si se lee en la imagen; si no, describe la zona.
- Indica tu confianza en cada hallazgo. Si la imagen no permite ver algo con claridad, dilo en "limitaciones" y pide otra foto (ángulo, enfoque, iluminación).
- Si no ves daños, devuelve "hallazgos" vacío y dilo en el resumen.
- Las recomendaciones deben ser pasos concretos de verificación en el banco.

${POLICY}`;

export async function analyzeImage(input: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  tipoFoto: string;
  pregunta: string | null;
  contexto: string | null;
}): Promise<{ ok: true; analysis: Analysis; model: string } | { ok: false; error: string }> {
  const client = await getAiClient();
  if (!client) return { ok: false, error: "Módulo de IA desactivado: configura la API key en Ajustes." };
  try {
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
      system: VISION_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            {
              type: "text",
              text: [
                `Tipo de foto indicado por el técnico: ${input.tipoFoto}.`,
                input.contexto ? `Contexto de la orden:\n${input.contexto}` : null,
                input.pregunta ? `Pregunta del técnico: ${input.pregunta}` : "Analiza la imagen.",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "El modelo no pudo analizar esta imagen (rechazo de seguridad). Prueba con otra foto." };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, error: "La respuesta llegó incompleta. Vuelve a intentarlo." };
    }
    return { ok: true, analysis: response.parsed_output, model: response.model };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}

// ─── Contexto de la orden para el chat ──────────────────────────────────────

const RES_LABEL: Record<string, string> = { OK: "OK", FALLA: "FALLA", NO_PROBADO: "no probado", NA: "N/A" };

export async function buildOrderContext(orderId: string): Promise<string> {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      checklist: true,
      diagnostics: { orderBy: { createdAt: "asc" } },
      dcReadings: { orderBy: { createdAt: "asc" } },
      measurements: { orderBy: { createdAt: "asc" } },
      shortHunts: true,
      partUsages: { include: { part: true } },
      aiAnalyses: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  const L: string[] = [];
  const safe = <T,>(fn: () => T, d: T) => {
    try {
      return fn();
    } catch {
      return d;
    }
  };
  const model = safe(() => getModel(o.modelo), undefined);
  const symptoms = safe(() => getSymptoms(), []);
  const trees = safe(() => Object.fromEntries(getTrees().map((t) => [t.id, t])), {} as Record<string, ReturnType<typeof getTrees>[number]>);
  const dc = safe(() => getDcPatterns().patrones, []);
  const lines = safe(() => getReferenceLines().lineas, []);
  const lineName = (id: string) => lines.find((l) => l.id === id)?.nombre ?? id;

  L.push(`ORDEN ${o.codigo} · estado ${o.estado}`);
  L.push(
    `Equipo: ${model ? `${model.nombre} (${model.anio}, conector ${model.conector}, pantalla ${model.pantalla}, ${model.biometria === "face_id" ? "Face ID" : "Touch ID"})` : o.modelo}`,
  );
  if (o.icloudBloqueado) L.push(`Bloqueo de iCloud: SÍ (${o.pruebaVerificada ? "prueba de propiedad verificada" : "SIN prueba de propiedad"})`);
  L.push(`Falla reportada: ${o.fallaReportada}`);
  const sint = o.sintomas.split(",").filter(Boolean);
  if (sint.length) L.push(`Síntomas: ${sint.map((k) => symptoms.find((s) => s.key === k)?.label ?? k).join(", ")}`);
  if (o.estadoFisico || o.estadoFisicoNota) L.push(`Estado físico: ${[o.estadoFisico.replaceAll(",", ", "), o.estadoFisicoNota].filter(Boolean).join(" · ")}`);

  const items = safe(() => checklistFor(o.modelo).flatMap((g) => g.items), []);
  for (const fase of ["ENTRADA", "SALIDA"]) {
    const rows = o.checklist.filter((c) => c.fase === fase && (c.resultado === "FALLA" || c.nota));
    if (rows.length)
      L.push(
        `Checklist de ${fase.toLowerCase()} (fallas y notas): ` +
          rows.map((c) => `${items.find((i) => i.key === c.itemKey)?.label ?? c.itemKey}: ${RES_LABEL[c.resultado]}${c.nota ? ` (${c.nota})` : ""}`).join("; "),
      );
  }
  for (const d of o.diagnostics) {
    const steps = parsePath(d.ruta)
      .map((s) => `${nodeTitle(trees, s.arbol, s.nodo)}${s.opcion ? ` → ${s.opcion}` : ""}${s.valor ? ` [medido: ${s.valor}]` : ""}${s.nota ? ` (${s.nota})` : ""}`)
      .join(" | ");
    L.push(`Diagnóstico guiado (${trees[d.arbol]?.titulo ?? d.arbol}): ${steps}${d.resumen ? ` ⇒ ${d.resumen}` : ""}`);
  }
  for (const r of o.dcReadings)
    L.push(
      `Consumo en fuente DC: ${dc.find((p) => p.id === r.patron)?.nombre ?? r.patron}` +
        `${r.voltaje != null ? `, ${r.voltaje} V` : ""}${r.mA != null ? `, ${r.mA} mA` : ""}${r.momento ? `, ${r.momento}` : ""}${r.nota ? ` (${r.nota})` : ""}`,
    );
  if (o.measurements.length) {
    const stats = await referenceStats(o.modelo);
    for (const m of o.measurements) {
      const ref = stats[refKey(m.linea, m.modo)];
      L.push(
        `Medición ${lineName(m.linea)} · ${modeLabel(m.modo)}: ${fmtVal(m.valor)} ${m.unidad}` +
          (m.placaBuena ? " (placa buena)" : ref ? ` — referencia del técnico ${fmtVal(ref.avg)} ${m.unidad} (n=${ref.count})` : " — sin referencia registrada"),
      );
    }
  }
  for (const h of o.shortHunts)
    L.push(
      `Cortocircuito en ${lineName(h.linea)}: ${h.resuelto ? "resuelto" : "en curso"}${h.resistencia != null ? `, ${h.resistencia} Ω a tierra` : ""}` +
        `${h.voltajeInyectado != null ? `, inyectado ${h.voltajeInyectado} V/${h.corrienteMax ?? "?"} A` : ""}${h.metodo ? `, métodos: ${h.metodo}` : ""}` +
        `${h.componenteHallado ? `, hallado: ${h.componenteHallado}` : ""}`,
    );
  if (o.partUsages.length) L.push(`Piezas usadas: ${o.partUsages.map((u) => `${u.cantidad}× ${u.part.nombre}`).join(", ")}`);
  for (const a of o.aiAnalyses) {
    try {
      L.push(`Análisis de foto (${a.tipoFoto}): ${(JSON.parse(a.resultado) as Analysis).resumen}`);
    } catch {}
  }
  if (o.diagnosticoFinal) L.push(`Diagnóstico final: ${o.diagnosticoFinal}`);
  if (o.causaRaiz) L.push(`Causa raíz registrada: ${o.causaRaiz}`);

  const similar = await similarOrders(o, [...new Set(o.dcReadings.map((r) => r.patron))]);
  if (similar.length)
    L.push(
      "Casos anteriores parecidos del propio taller: " +
        similar.slice(0, 5).map((c) => `${c.codigo} (${getModel(c.modelo)?.nombre ?? c.modelo}, en común: ${c.comunes.join("/")}) → ${c.causaRaiz}`).join("; "),
    );
  return L.join("\n");
}

export const CHAT_SYSTEM = `Eres el asistente de diagnóstico de iFix Bench, una app de taller para reparación de iPhone (del 8 al 17), tanto modular como microsoldadura a nivel de placa.

Trabajas sobre UNA orden concreta: más abajo tienes su contexto (modelo, síntomas, checklist, recorridos del diagnóstico guiado, consumo en fuente DC, mediciones y casos anteriores del taller). Úsalo para:
- Proponer el siguiente paso de diagnóstico más útil, con qué herramienta y qué observar.
- Interpretar las mediciones registradas comparándolas con las referencias del técnico.
- Ordenar las causas probables y explicar por qué; cita los casos anteriores del taller cuando apliquen.
- Redactar explicaciones claras para el cliente si te lo piden.
Si te falta un dato para avanzar, pide la medición concreta. Sé breve: listas cortas y pasos numerados.

${POLICY}`;
