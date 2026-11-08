import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { AI_MODEL, CHAT_SYSTEM, aiErrorMessage, buildOrderContext, getAiClient } from "@/lib/ai";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 40;

/** Chat de diagnóstico con el contexto de la orden. Devuelve el texto en streaming. */
export async function POST(req: Request) {
  const { orderId, message } = (await req.json().catch(() => ({}))) as { orderId?: string; message?: string };
  if (!orderId || !message?.trim()) return new Response("Faltan datos", { status: 400 });
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return new Response("Orden no encontrada", { status: 404 });
  const client = await getAiClient();
  if (!client) return new Response("Módulo de IA desactivado: configura la API key en Ajustes.", { status: 503 });

  const previous = await db.chatMessage.findMany({ where: { orderId }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT });
  await db.chatMessage.create({ data: { orderId, rol: "user", contenido: message.trim() } });

  const history: Anthropic.Beta.BetaMessageParam[] = previous
    .reverse()
    .map((m) => ({ role: m.rol === "assistant" ? ("assistant" as const) : ("user" as const), content: m.contenido }));
  // La conversación debe empezar con un mensaje del usuario.
  while (history.length && history[0].role !== "user") history.shift();
  history.push({ role: "user", content: message.trim() });

  const context = await buildOrderContext(orderId);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const stream = client.beta.messages.stream({
          model: AI_MODEL,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [
            // Instrucciones fijas primero (cacheables); el contexto de la orden cambia más a menudo.
            { type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: `Contexto actual de la orden:\n${context}` },
          ],
          messages: history,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_(El modelo no pudo responder a esta consulta. Reformúlala.)_";
          text += note;
          controller.enqueue(encoder.encode(note));
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n_(Respuesta cortada por longitud.)_";
          text += note;
          controller.enqueue(encoder.encode(note));
        }
      } catch (e) {
        const note = `${text ? "\n\n" : ""}⚠ ${aiErrorMessage(e)}`;
        text += note;
        controller.enqueue(encoder.encode(note));
      } finally {
        if (text.trim()) await db.chatMessage.create({ data: { orderId, rol: "assistant", contenido: text } });
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
