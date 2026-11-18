"use client";
import { useRef, useState, useTransition } from "react";
import { Camera, Sparkles } from "lucide-react";
import { analyzePhotoAction } from "@/app/ia-actions";
import type { Analysis } from "@/lib/ai";
import { cn } from "@/lib/format";
import { AnalysisView } from "./AnalysisView";
import { resizeToDataUrl } from "./imageResize";

const TIPOS = [
  { id: "PLACA", label: "Placa (microscopio)" },
  { id: "CARCASA", label: "Carcasa" },
  { id: "PANTALLA", label: "Pantalla" },
  { id: "OTRO", label: "Otro" },
];

export function AiAnalyzer({ orderId, photos }: { orderId: string | null; photos: { id: string; ruta: string }[] }) {
  const [tipo, setTipo] = useState("PLACA");
  const [pregunta, setPregunta] = useState("");
  const [sel, setSel] = useState<{ photoId: string | null; preview: string; dataUrl: string | null } | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File) => {
    setError(null);
    setResult(null);
    try {
      const dataUrl = await resizeToDataUrl(f);
      setSel({ photoId: null, preview: dataUrl, dataUrl });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = () =>
    start(async () => {
      if (!sel) return;
      setError(null);
      setResult(null);
      try {
        const dataUrl = sel.dataUrl ?? (await resizeToDataUrl(sel.preview));
        const r = await analyzePhotoAction({ orderId, photoId: sel.photoId, tipoFoto: tipo, pregunta: pregunta.trim() || null, dataUrl });
        if (r.ok) setResult(r.analysis);
        else setError(r.error);
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTipo(t.id)} className={cn("chip", tipo === t.id && "chip-on")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bench-line text-bench-muted hover:border-bench-accent hover:text-bench-accent"
        >
          <Camera className="h-10 w-10" />
          <span className="text-sm font-semibold">Nueva foto</span>
        </button>
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setResult(null);
              setError(null);
              setSel({ photoId: p.id, preview: `/api/uploads/${p.ruta}`, dataUrl: null });
            }}
            className={cn("aspect-square overflow-hidden rounded-xl border-4", sel?.photoId === p.id ? "border-bench-accent" : "border-transparent")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/uploads/${p.ruta}`} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />

      {sel && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sel.preview} alt="Imagen seleccionada" className="max-h-80 rounded-xl border border-bench-line" />
      )}
      <input className="input" placeholder="Pregunta opcional (ej. ¿hay corrosión cerca del conector de batería?)" value={pregunta} onChange={(e) => setPregunta(e.target.value)} />
      <button type="button" disabled={!sel || pending} onClick={run} className="btn-primary btn-xl w-full">
        <Sparkles className="h-6 w-6" /> {pending ? "Analizando… (puede tardar un poco)" : "Analizar con IA"}
      </button>
      {error && <p className="rounded-xl border-2 border-red-500 bg-red-950/60 p-3 text-lg font-semibold" role="alert">{error}</p>}
      {result && (
        <div className="card border-bench-info">
          <AnalysisView a={result} />
        </div>
      )}
    </div>
  );
}
