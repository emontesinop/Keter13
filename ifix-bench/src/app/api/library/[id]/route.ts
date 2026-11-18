import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { db } from "@/lib/db";
import { LIBRARY_DIR } from "@/lib/paths";

const INLINE: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".txt": "text/plain; charset=utf-8",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc?.archivo) return new Response("No encontrado", { status: 404 });
  try {
    const buf = await readFile(join(LIBRARY_DIR, doc.archivo));
    const ext = extname(doc.archivo).toLowerCase();
    const type = INLINE[ext];
    const safeName = encodeURIComponent(doc.nombre.endsWith(ext) ? doc.nombre : doc.nombre + ext);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type ?? "application/octet-stream",
        "Content-Disposition": `${type ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`,
      },
    });
  } catch {
    return new Response("Archivo no disponible", { status: 404 });
  }
}
