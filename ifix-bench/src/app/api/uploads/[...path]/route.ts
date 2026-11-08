import { readFile } from "node:fs/promises";
import { extname, normalize, join, sep } from "node:path";
import { UPLOAD_DIR } from "@/lib/paths";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const full = normalize(join(UPLOAD_DIR, ...path));
  if (!full.startsWith(UPLOAD_DIR + sep)) return new Response("No permitido", { status: 403 });
  try {
    const buf = await readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": TYPES[extname(full).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
