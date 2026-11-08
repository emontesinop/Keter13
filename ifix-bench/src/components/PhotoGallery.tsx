"use client";
import { useRef, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { deletePhoto, uploadPhotos } from "@/app/actions";

export function PhotoGallery({ orderId, etapa, photos }: { orderId: string; etapa: string; photos: { id: string; ruta: string }[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-bench-line bg-black">
            <a href={`/api/uploads/${p.ruta}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/uploads/${p.ruta}`} alt="" className="h-full w-full object-cover" />
            </a>
            <button
              type="button"
              aria-label="Borrar foto"
              onClick={() => confirm("¿Borrar esta foto?") && start(() => deletePhoto(p.id))}
              className="absolute right-1 top-1 rounded-lg bg-black/70 p-2 text-red-400"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bench-line text-bench-muted hover:border-bench-accent hover:text-bench-accent"
        >
          <Camera className="h-10 w-10" />
          <span className="text-sm font-semibold">{pending ? "Subiendo…" : "Añadir foto"}</span>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (!files?.length) return;
          const fd = new FormData();
          for (const f of Array.from(files)) fd.append("fotos", f);
          start(() => uploadPhotos(orderId, etapa, fd));
          e.target.value = "";
        }}
      />
    </div>
  );
}
