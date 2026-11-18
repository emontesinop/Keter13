"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { AI_MODEL, analyzeImage, buildOrderContext, type Analysis } from "@/lib/ai";
import { UPLOAD_DIR } from "@/lib/paths";

const TIPOS = ["PLACA", "CARCASA", "PANTALLA", "OTRO"];
const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_BYTES = 5 * 1024 * 1024; // límite por imagen de la API

/**
 * Analiza una imagen (ya reducida en el navegador). Si viene de una orden, guarda la
 * foto como etapa IA y el resultado en la orden.
 */
export async function analyzePhotoAction(input: {
  orderId: string | null;
  photoId: string | null;
  tipoFoto: string;
  pregunta: string | null;
  dataUrl: string;
}): Promise<{ ok: true; id: string | null; analysis: Analysis } | { ok: false; error: string }> {
  if (!TIPOS.includes(input.tipoFoto)) return { ok: false, error: "Tipo de foto inválido." };
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(input.dataUrl);
  if (!m || !(MEDIA as readonly string[]).includes(m[1])) return { ok: false, error: "Formato de imagen no soportado (usa JPG o PNG)." };
  const mediaType = m[1] as (typeof MEDIA)[number];
  const b64 = m[2];
  if ((b64.length * 3) / 4 > MAX_BYTES) return { ok: false, error: "La imagen es demasiado grande (máx. 5 MB)." };

  const contexto = input.orderId ? await buildOrderContext(input.orderId).catch(() => null) : null;
  const r = await analyzeImage({ imageBase64: b64, mediaType, tipoFoto: input.tipoFoto.toLowerCase(), pregunta: input.pregunta, contexto });
  if (!r.ok) return r;

  if (!input.orderId) return { ok: true, id: null, analysis: r.analysis };

  let photoId = input.photoId;
  if (!photoId) {
    const dir = join(UPLOAD_DIR, input.orderId);
    await mkdir(dir, { recursive: true });
    const name = `ia-${randomUUID()}.${mediaType === "image/png" ? "png" : "jpg"}`;
    await writeFile(join(dir, name), Buffer.from(b64, "base64"));
    photoId = (await db.photo.create({ data: { orderId: input.orderId, etapa: "IA", ruta: `${input.orderId}/${name}` } })).id;
  }
  const saved = await db.aiAnalysis.create({
    data: {
      orderId: input.orderId,
      photoId,
      tipoFoto: input.tipoFoto,
      pregunta: input.pregunta,
      resultado: JSON.stringify(r.analysis),
      modelo: r.model ?? AI_MODEL,
    },
  });
  revalidatePath(`/ordenes/${input.orderId}`, "layout");
  return { ok: true, id: saved.id, analysis: r.analysis };
}

export async function deleteAnalysis(id: string) {
  const a = await db.aiAnalysis.delete({ where: { id } });
  if (a.orderId) revalidatePath(`/ordenes/${a.orderId}`, "layout");
}

export async function clearChat(orderId: string) {
  await db.chatMessage.deleteMany({ where: { orderId } });
  revalidatePath(`/ordenes/${orderId}`, "layout");
}
