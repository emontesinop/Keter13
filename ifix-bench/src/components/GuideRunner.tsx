"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Hand, Pause, Play, Thermometer, Timer, X } from "lucide-react";
import { saveGuideProgress } from "@/app/actions";
import { cn, fmtTime } from "@/lib/format";
import type { Guide, Safety } from "@/lib/knowledge-schemas";
import { SafetyBanner, VerifyBadge } from "./ui";

type Step = Guide["pasos"][number];


function Screws({ step, big }: { step: Step; big?: boolean }) {
  if (!step.tornillos?.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-bench-line">
      <table className={cn("w-full text-left", big ? "text-2xl" : "text-base")}>
        <thead className="bg-bench-panel text-bench-muted">
          <tr>
            <th className="p-2">🔩 Tornillo</th>
            <th className="p-2">Ubicación</th>
            <th className="p-2">Cant.</th>
            <th className="p-2">Largo</th>
          </tr>
        </thead>
        <tbody>
          {step.tornillos.map((t, i) => (
            <tr key={i} className="border-t border-bench-line">
              <td className="p-2 font-bold">{t.tipo}</td>
              <td className="p-2">{t.ubicacion}</td>
              <td className="p-2">{t.cantidad ?? "—"}</td>
              <td className="p-2">{t.largo || <span className="text-yellow-300">anotar</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Warnings({ step, safety, big }: { step: Step; safety: Safety["avisos"]; big?: boolean }) {
  return (
    <>
      {step.advertencias?.map((a) => (
        <p key={a} className={cn("rounded-xl border-2 border-amber-500 bg-amber-950/60 p-3 font-semibold text-amber-200", big ? "text-2xl" : "text-lg")}>
          ⚠ {a}
        </p>
      ))}
      {step.temperatura && (
        <p className={cn("flex items-center gap-2 rounded-xl bg-orange-950/60 p-3 font-semibold text-orange-200", big ? "text-2xl" : "text-lg")}>
          <Thermometer className="h-7 w-7" /> {step.temperatura}
        </p>
      )}
      {step.seguridad?.map(
        (s) =>
          safety[s] && (
            <div key={s} onClick={(e) => big && e.stopPropagation()}>
              <SafetyBanner aviso={safety[s]} open={big} />
            </div>
          ),
      )}
    </>
  );
}

export function GuideRunner({
  guide,
  safety,
  orderId,
  initial,
}: {
  guide: Guide;
  safety: Safety["avisos"];
  orderId: string | null;
  initial: { pasosHechos: number[]; checks: Record<string, boolean>; segundos: number; terminada: boolean } | null;
}) {
  const [done, setDone] = useState<number[]>(initial?.pasosHechos ?? []);
  const [checks, setChecks] = useState<Record<string, boolean>>(initial?.checks ?? {});
  const [secs, setSecs] = useState(initial?.segundos ?? 0);
  const [running, setRunning] = useState(false);
  const [hands, setHands] = useState(false);
  const firstPending = guide.pasos.findIndex((_, i) => !(initial?.pasosHechos ?? []).includes(i));
  const [cur, setCur] = useState(firstPending === -1 ? 0 : firstPending);
  const [saved, setSaved] = useState<string | null>(null);
  const state = useRef({ done, checks, secs });
  state.current = { done, checks, secs };
  const total = guide.pasos.length;
  const finished = done.length === total;

  // Cronómetro
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const persist = useCallback(async () => {
    if (!orderId) return;
    const { done, checks, secs } = state.current;
    await saveGuideProgress(orderId, guide.id, { pasosHechos: done, checks, segundos: secs, terminada: done.length === total });
    setSaved(new Date().toLocaleTimeString("es"));
  }, [orderId, guide.id, total]);

  // Guardado automático cada 20 s mientras corre el cronómetro, y al cambiar pasos
  useEffect(() => {
    if (!running || !orderId) return;
    const t = setInterval(persist, 20000);
    return () => clearInterval(t);
  }, [running, orderId, persist]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    persist();
  }, [done, checks, persist]);

  // Mantener la pantalla encendida en manos libres
  useEffect(() => {
    if (!hands) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [hands]);

  const toggleDone = (i: number) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));
  const next = useCallback(() => {
    setDone((d) => (d.includes(cur) ? d : [...d, cur].sort((a, b) => a - b)));
    setCur((c) => Math.min(c + 1, total));
    if (!running) setRunning(true);
  }, [cur, total, running]);
  const prev = useCallback(() => setCur((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    if (!hands) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") setHands(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [hands, next, prev]);

  const enterHands = () => {
    setHands(true);
    if (cur >= total) setCur(0);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const exitHands = () => {
    setHands(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const checkKey = (i: number, c: string) => `${i}:${c}`;
  const CheckList = ({ i, big }: { i: number; big?: boolean }) =>
    guide.pasos[i].checks?.length ? (
      <div className="flex flex-wrap gap-2">
        {guide.pasos[i].checks!.map((c) => {
          const k = checkKey(i, c);
          return (
            <button
              key={c}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setChecks((s) => ({ ...s, [k]: !s[k] }));
              }}
              className={cn("chip", big && "min-h-[4rem] px-6 text-2xl", checks[k] && "border-bench-ok bg-green-950/60 text-bench-ok")}
            >
              {checks[k] ? "☑" : "☐"} {c}
            </button>
          );
        })}
      </div>
    ) : null;

  const estimated = guide.tiempo_estimado_min ?? guide.pasos.reduce((a, p) => a + (p.tiempo_min ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Barra de control */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-bench-line bg-bench-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 text-3xl font-black tabular-nums">
          <Timer className="h-8 w-8 text-bench-accent" /> {fmtTime(secs)}
        </div>
        <span className="text-bench-muted">/ ~{estimated} min</span>
        <button type="button" className="btn-secondary" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />} {running ? "Pausar" : "Iniciar"}
        </button>
        <span className="flex-1 text-right font-semibold">
          {done.length}/{total} pasos {saved && orderId && <span className="text-sm text-bench-muted">· guardado {saved}</span>}
        </span>
        <button type="button" className="btn-primary" onClick={enterHands}>
          <Hand className="h-6 w-6" /> Manos libres
        </button>
      </div>
      {!orderId && <p className="rounded-xl border border-bench-line p-3 text-bench-muted">Abre la guía desde la pestaña Reparación de una orden para guardar el progreso y el tiempo.</p>}

      <ol className="space-y-3">
        {guide.pasos.map((p, i) => (
          <li key={i} className={cn("card space-y-3", done.includes(i) && "opacity-60", i === cur && !done.includes(i) && "border-bench-accent")}>
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => toggleDone(i)}
                aria-label={done.includes(i) ? "Marcar pendiente" : "Marcar hecho"}
                className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 text-xl font-bold", done.includes(i) ? "border-bench-ok bg-bench-ok text-black" : "border-bench-line bg-bench-bg")}
              >
                {done.includes(i) ? <Check className="h-8 w-8" /> : i + 1}
              </button>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl font-bold">{p.titulo}</h3>
                  {p.tiempo_min && <span className="text-bench-muted">~{p.tiempo_min} min</span>}
                  <VerifyBadge show={!p.verificado} />
                </div>
                <p className="text-lg leading-relaxed">{p.texto}</p>
                <Screws step={p} />
                <Warnings step={p} safety={safety} />
                <CheckList i={i} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Modo manos libres */}
      {hands && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bench-bg" role="dialog" aria-label="Modo manos libres">
          <div className="flex items-center gap-4 border-b border-bench-line px-6 py-3">
            <span className="text-2xl font-bold">
              {Math.min(cur + 1, total)} / {total}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-bench-line">
              <div className="h-full bg-bench-accent" style={{ width: `${(done.length / total) * 100}%` }} />
            </div>
            <button type="button" onClick={() => setRunning((r) => !r)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-4xl font-black tabular-nums hover:bg-bench-panel">
              {running ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 text-bench-accent" />}
              {fmtTime(secs)}
            </button>
            <button type="button" onClick={exitHands} className="btn-secondary" aria-label="Salir de manos libres">
              <X className="h-7 w-7" /> Salir
            </button>
          </div>

          {cur >= total ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
              <Check className="h-32 w-32 text-bench-ok" />
              <p className="text-5xl font-black">Guía terminada</p>
              <p className="text-3xl text-bench-muted">Tiempo: {fmtTime(secs)}</p>
              <div className="flex gap-4">
                <button type="button" className="btn-secondary btn-xl" onClick={prev}>
                  <ChevronLeft className="h-8 w-8" /> Último paso
                </button>
                <button type="button" className="btn-ok btn-xl" onClick={() => { setRunning(false); exitHands(); }}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex-1 cursor-pointer overflow-y-auto"
              onClick={(e) => (e.clientX < window.innerWidth * 0.25 ? prev() : next())}
              title="Toca a la derecha para avanzar, a la izquierda para volver"
            >
              <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-10">
                <div className="flex items-center gap-4">
                  <h2 className="text-5xl font-black leading-tight md:text-6xl">{guide.pasos[cur].titulo}</h2>
                  {done.includes(cur) && <Check className="h-12 w-12 shrink-0 text-bench-ok" />}
                </div>
                <p className="text-3xl leading-snug md:text-4xl">{guide.pasos[cur].texto}</p>
                <Screws step={guide.pasos[cur]} big />
                <Warnings step={guide.pasos[cur]} safety={safety} big />
                <CheckList i={cur} big />
              </div>
            </div>
          )}

          <div className="grid grid-cols-[1fr_3fr] gap-3 border-t border-bench-line p-3">
            <button type="button" onClick={prev} disabled={cur === 0} className="btn-secondary btn-xl">
              <ChevronLeft className="h-8 w-8" /> Atrás
            </button>
            <button type="button" onClick={next} disabled={cur >= total} className="btn-primary btn-xl text-2xl">
              Siguiente <ChevronRight className="h-8 w-8" /> <span className="text-base font-normal opacity-70">(Espacio)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
