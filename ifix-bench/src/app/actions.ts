"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CHECK_RESULTS, ICLOUD_BLOCKED_STATES, ORDER_STATES, PHOTO_STAGES, type OrderState } from "@/lib/constants";
import { setSetting, SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/paths";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const list = (fd: FormData, k: string) =>
  fd
    .getAll(k)
    .filter((v): v is string => typeof v === "string" && v !== "")
    .join(",");

async function nextOrderCode() {
  const year = new Date().getFullYear();
  const prefix = `IFB-${year}-`;
  const last = await db.order.findFirst({ where: { codigo: { startsWith: prefix } }, orderBy: { codigo: "desc" } });
  const n = last ? parseInt(last.codigo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// ─── Órdenes ────────────────────────────────────────────────────────────────

export async function createOrder(fd: FormData) {
  const nombre = str(fd, "cliente_nombre");
  const modelo = str(fd, "modelo");
  const falla = str(fd, "fallaReportada");
  if (!nombre || !modelo || !falla) throw new Error("Faltan datos obligatorios: cliente, modelo y falla.");

  const telefono = str(fd, "cliente_telefono");
  let customer = telefono ? await db.customer.findFirst({ where: { telefono } }) : null;
  if (!customer) {
    customer = await db.customer.create({
      data: { nombre, telefono, email: str(fd, "cliente_email") },
    });
  }

  const icloud = fd.get("icloudBloqueado") === "on";
  const order = await db.order.create({
    data: {
      codigo: await nextOrderCode(),
      customerId: customer.id,
      modelo,
      imei: str(fd, "imei"),
      serie: str(fd, "serie"),
      codigoDesbloqueo: str(fd, "codigoDesbloqueo"),
      fallaReportada: falla,
      sintomas: list(fd, "sintomas"),
      estadoFisico: list(fd, "estadoFisico"),
      estadoFisicoNota: str(fd, "estadoFisicoNota"),
      presupuesto: num(fd, "presupuesto"),
      icloudBloqueado: icloud,
      boardviewPath: str(fd, "boardviewPath"),
      notas: str(fd, "notas"),
    },
  });

  const files = fd.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  await savePhotos(order.id, "ENTRADA", files);

  revalidatePath("/");
  redirect(`/ordenes/${order.id}/checklist?nueva=1`);
}

/** Actualiza solo los campos presentes en el formulario (permite formularios parciales). */
export async function updateOrder(id: string, fd: FormData) {
  const has = (k: string) => fd.has(k);
  const textFields = ["imei", "serie", "codigoDesbloqueo", "estadoFisicoNota", "boardviewPath", "diagnosticoFinal", "causaRaiz", "notas"] as const;
  const data: Prisma.OrderUpdateInput = {};
  for (const k of textFields) if (has(k)) data[k] = str(fd, k);
  if (str(fd, "modelo")) data.modelo = str(fd, "modelo")!;
  if (str(fd, "fallaReportada")) data.fallaReportada = str(fd, "fallaReportada")!;
  if (has("presupuesto")) data.presupuesto = num(fd, "presupuesto");
  if (has("costoFinal")) data.costoFinal = num(fd, "costoFinal");
  // Los ChipPicker envían un campo oculto "<nombre>__present" para poder vaciar la lista.
  if (has("sintomas__present")) data.sintomas = list(fd, "sintomas");
  if (has("estadoFisico__present")) data.estadoFisico = list(fd, "estadoFisico");
  const order = await db.order.update({ where: { id }, data });

  if (has("cliente_nombre")) {
    await db.customer.update({
      where: { id: order.customerId },
      data: {
        nombre: str(fd, "cliente_nombre") ?? undefined,
        telefono: str(fd, "cliente_telefono"),
        email: str(fd, "cliente_email"),
      },
    });
  }
  revalidatePath(`/ordenes/${id}`, "layout");
}

export async function setOrderState(id: string, estado: string): Promise<ActionResult> {
  if (!ORDER_STATES.some((s) => s.id === estado)) return { ok: false, error: "Estado inválido." };
  const order = await db.order.findUniqueOrThrow({ where: { id } });
  if (order.icloudBloqueado && !order.pruebaVerificada && ICLOUD_BLOCKED_STATES.includes(estado as OrderState)) {
    return {
      ok: false,
      error: "Equipo con bloqueo de iCloud: registra y verifica la prueba de propiedad del cliente antes de reparar o entregar.",
    };
  }
  await db.order.update({
    where: { id },
    data: { estado, deliveredAt: estado === "ENTREGADO" ? new Date() : order.deliveredAt },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateIcloud(id: string, fd: FormData) {
  const bloqueado = fd.get("icloudBloqueado") === "on";
  await db.order.update({
    where: { id },
    data: {
      icloudBloqueado: bloqueado,
      pruebaPropiedad: str(fd, "pruebaPropiedad"),
      pruebaVerificada: bloqueado ? fd.get("pruebaVerificada") === "on" : false,
    },
  });
  revalidatePath("/", "layout");
}

export async function deleteOrder(id: string) {
  const photos = await db.photo.findMany({ where: { orderId: id } });
  for (const p of photos) await unlink(join(UPLOAD_DIR, p.ruta)).catch(() => {});
  await db.order.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/ordenes");
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"]);

async function savePhotos(orderId: string, etapa: string, files: File[]) {
  if (!files.length) return;
  const dir = join(UPLOAD_DIR, orderId);
  await mkdir(dir, { recursive: true });
  for (const f of files) {
    let ext = extname(f.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) ext = f.type === "image/png" ? ".png" : ".jpg";
    const name = `${etapa.toLowerCase()}-${randomUUID()}${ext}`;
    await writeFile(join(dir, name), Buffer.from(await f.arrayBuffer()));
    await db.photo.create({ data: { orderId, etapa, ruta: `${orderId}/${name}` } });
  }
}

export async function uploadPhotos(orderId: string, etapa: string, fd: FormData) {
  if (!(PHOTO_STAGES as readonly string[]).includes(etapa)) throw new Error("Etapa inválida");
  const files = fd.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  await savePhotos(orderId, etapa, files);
  revalidatePath(`/ordenes/${orderId}`, "layout");
}

export async function deletePhoto(photoId: string) {
  const p = await db.photo.delete({ where: { id: photoId } });
  await unlink(join(UPLOAD_DIR, p.ruta)).catch(() => {});
  revalidatePath(`/ordenes/${p.orderId}`, "layout");
}

// ─── Checklist ──────────────────────────────────────────────────────────────

export async function saveChecklistItem(orderId: string, fase: string, itemKey: string, resultado: string, nota?: string | null) {
  if (!["ENTRADA", "SALIDA"].includes(fase)) throw new Error("Fase inválida");
  if (!CHECK_RESULTS.some((r) => r.id === resultado)) throw new Error("Resultado inválido");
  await db.checklistResult.upsert({
    where: { orderId_fase_itemKey: { orderId, fase, itemKey } },
    create: { orderId, fase, itemKey, resultado, nota: nota ?? null },
    update: { resultado, ...(nota !== undefined ? { nota } : {}) },
  });
  revalidatePath(`/ordenes/${orderId}`, "layout");
}

export async function fillPendingChecklist(orderId: string, fase: string, keys: string[], resultado: string) {
  const existing = await db.checklistResult.findMany({ where: { orderId, fase } });
  const done = new Set(existing.map((e) => e.itemKey));
  for (const k of keys.filter((k) => !done.has(k))) {
    await db.checklistResult.create({ data: { orderId, fase, itemKey: k, resultado } });
  }
  revalidatePath(`/ordenes/${orderId}`, "layout");
}

// ─── Diagnóstico ────────────────────────────────────────────────────────────

export type PathStep = { arbol: string; nodo: string; opcion?: string; valor?: string; nota?: string };

export async function saveDiagnosticSession(input: {
  orderId: string | null;
  arbol: string;
  ruta: PathStep[];
  conclusion: string | null;
  resumen: string | null;
}) {
  const s = await db.diagnosticSession.create({
    data: {
      orderId: input.orderId,
      arbol: input.arbol,
      ruta: JSON.stringify(input.ruta),
      conclusion: input.conclusion,
      resumen: input.resumen,
    },
  });
  if (input.orderId) {
    const o = await db.order.findUnique({ where: { id: input.orderId } });
    if (o?.estado === "RECIBIDO") await db.order.update({ where: { id: o.id }, data: { estado: "DIAGNOSTICO" } });
    revalidatePath(`/ordenes/${input.orderId}`, "layout");
  }
  return s.id;
}

export async function deleteDiagnosticSession(id: string) {
  const s = await db.diagnosticSession.delete({ where: { id } });
  if (s.orderId) revalidatePath(`/ordenes/${s.orderId}`, "layout");
}

export async function saveDcReading(input: {
  orderId: string | null;
  patron: string;
  voltaje: number | null;
  mA: number | null;
  momento: string | null;
  nota: string | null;
}) {
  await db.dcReading.create({ data: input });
  if (input.orderId) revalidatePath(`/ordenes/${input.orderId}`, "layout");
}

export async function deleteDcReading(id: string) {
  const r = await db.dcReading.delete({ where: { id } });
  if (r.orderId) revalidatePath(`/ordenes/${r.orderId}`, "layout");
}

// ─── Ajustes ────────────────────────────────────────────────────────────────

export async function saveSettings(fd: FormData) {
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    if (key === "anthropic_api_key") continue;
    const v = fd.get(key);
    if (typeof v === "string") await setSetting(key, v.trim());
  }
  const apiKey = fd.get("anthropic_api_key");
  if (typeof apiKey === "string" && apiKey.trim() !== "") await setSetting("anthropic_api_key", apiKey.trim());
  if (fd.get("borrar_api_key") === "on") await setSetting("anthropic_api_key", "");
  revalidatePath("/", "layout");
}
