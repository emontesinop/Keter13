/** Reduce una imagen en el navegador a JPEG (lado mayor ≤ maxSide) y devuelve un data URL. */
export async function resizeToDataUrl(src: Blob | string, maxSide = 1600, quality = 0.85): Promise<string> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen (¿formato HEIC? usa JPG o PNG)."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
