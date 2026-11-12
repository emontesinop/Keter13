// Photo loading and framing (shared by the live preview and generation, so both match exactly).
import type { Settings } from "./engine/types";

export type Source = HTMLCanvasElement;

/** Decode a photo (EXIF orientation honoured by Safari) and downscale to <= maxSide px. */
export async function loadPhoto(blob: Blob, maxSide = 1600): Promise<Source> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function toBlob(c: HTMLCanvasElement, type = "image/jpeg", q = 0.9): Promise<Blob> {
  return new Promise((res) => c.toBlob((b) => res(b!), type, q));
}

/** Draw the source cropped/zoomed/rotated into a square of `size` px. */
export function drawFramed(ctx: CanvasRenderingContext2D, src: Source, size: number, f: Settings["frame"]) {
  const iw = src.width, ih = src.height;
  const scale = (size / Math.min(iw, ih)) * f.zoom;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate((f.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.translate(-iw / 2 - f.x * iw, -ih / 2 - f.y * ih);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

export function framedPixels(src: Source, res: number, f: Settings["frame"]): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = c.height = res;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  drawFramed(ctx, src, res, f);
  return ctx.getImageData(0, 0, res, res).data;
}

/** Convert a screen-space pan (preview pixels) into a frame offset change. */
export function panFrame(f: Settings["frame"], src: Source, previewSize: number, dx: number, dy: number): Settings["frame"] {
  const scale = (previewSize / Math.min(src.width, src.height)) * f.zoom;
  const r = (-f.rotation * Math.PI) / 180;
  const ix = (dx * Math.cos(r) - dy * Math.sin(r)) / scale;
  const iy = (dx * Math.sin(r) + dy * Math.cos(r)) / scale;
  return { ...f, x: f.x - ix / src.width, y: f.y - iy / src.height };
}

export async function thumbnail(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 240): Promise<string> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  return c.toDataURL("image/jpeg", 0.8);
}
