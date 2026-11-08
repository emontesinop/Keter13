"use client";
import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateShortHunt } from "@/app/actions";
import { TOOLS } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { ReferenceLine, Safety, ShortFlow } from "@/lib/knowledge-schemas";
import { SafetyBanner, VerifyBadge } from "./ui";

type Hunt = {
  id: string;
  resistencia: number | null;
  voltajeInyectado: number | null;
  corrienteMax: number | null;
  metodo: string[];
  pasosHechos: string[];
  componenteHallado: string | null;
  resuelto: boolean;
  notas: string | null;
};

const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const s = (v: number | null) => (v == null ? "" : String(v));

export function ShortHuntPanel({
  hunt,
  line,
  flow,
  safety,
  measureSlot,
}: {
  hunt: Hunt;
  line: ReferenceLine | null;
  flow: ShortFlow;
  safety: Safety["avisos"];
  measureSlot: React.ReactNode;
}) {
  const [pasos, setPasos] = useState(hunt.pasosHechos);
  const [metodos, setMetodos] = useState(hunt.metodo);
  const [res, setRes] = useState(s(hunt.resistencia));
  const [volt, setVolt] = useState(s(hunt.voltajeInyectado));
  const [amp, setAmp] = useState(s(hunt.corrienteMax));
  const [comp, setComp] = useState(hunt.componenteHallado ?? "");
  const [notas, setNotas] = useState(hunt.notas ?? "");
  const [resuelto, setResuelto] = useState(hunt.resuelto);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  const save = (patch: Parameters<typeof updateShortHunt>[1], okText = "✔ Guardado") =>
    start(async () => {
      const r = await updateShortHunt(hunt.id, patch);
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    });

  const togglePaso = (id: string, metodo?: string) => {
    const next = pasos.includes(id) ? pasos.filter((x) => x !== id) : [...pasos, id];
    setPasos(next);
    let nextM = metodos;
    if (metodo && !pasos.includes(id) && !metodos.includes(metodo)) {
      nextM = [...metodos, metodo];
      setMetodos(nextM);
    }
    save({ pasosHechos: next, metodo: nextM });
  };

  const v = n(volt);
  const a = n(amp);
  const overV = line?.inyeccion_max_v != null && v != null && v > line.inyeccion_max_v;
  const overA = line?.inyeccion_max_a != null && a != null && a > line.inyeccion_max_a;
  const overNominal = line?.voltaje_nominal != null && v != null && v > line.voltaje_nominal;
  const firstPending = flow.pasos.find((p) => !pasos.includes(p.id))?.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-bench-line">
          <div className="h-full bg-bench-accent transition-all" style={{ width: `${(pasos.length / flow.pasos.length) * 100}%` }} />
        </div>
        <span className="font-semibold">
          {pasos.length}/{flow.pasos.length} pasos
        </span>
        <VerifyBadge show={flow.estado === "verificar"} />
      </div>

      {/* Límites de la línea */}
      <div className="panel grid gap-3 md:grid-cols-3">
        <div>
          <p className="text-sm font-semibold uppercase text-bench-muted">Voltaje nominal</p>
          <p className="text-2xl font-bold">{line?.voltaje_nominal != null ? `${line.voltaje_nominal} V` : "—"}</p>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase text-bench-muted">Tu límite de inyección</p>
          <p className="text-2xl font-bold">
            {line?.inyeccion_max_v != null ? `${line.inyeccion_max_v} V` : "—"} / {line?.inyeccion_max_a != null ? `${line.inyeccion_max_a} A` : "—"}
          </p>
        </div>
        <div>
          {line?.inyeccion_max_v == null && (
            <p className="text-base text-yellow-300">
              No hay límite registrado para esta línea. Llénalo en <code>knowledge/reference-lines.yaml</code> según tu esquemático para que la app te frene.
            </p>
          )}
          {line?.descripcion && <p className="text-base text-bench-muted">{line.descripcion}</p>}
        </div>
      </div>

      <ol className="space-y-3">
        {flow.pasos.map((p, i) => {
          const done = pasos.includes(p.id);
          const current = p.id === firstPending;
          const tool = p.herramienta ? TOOLS[p.herramienta] : null;
          return (
            <li key={p.id} className={cn("card space-y-3", done && "opacity-70", current && "border-bench-accent ring-2 ring-bench-accent/40")}>
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  aria-label={done ? "Marcar como pendiente" : "Marcar como hecho"}
                  onClick={() => togglePaso(p.id, p.metodo)}
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 text-xl font-bold",
                    done ? "border-bench-ok bg-bench-ok text-black" : "border-bench-line bg-bench-bg",
                  )}
                >
                  {done ? <Check className="h-8 w-8" /> : i + 1}
                </button>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-bold">{p.titulo}</h3>
                    {tool && (
                      <span className="rounded-lg bg-bench-bg px-3 py-1 font-semibold">
                        {tool.emoji} {tool.label}
                      </span>
                    )}
                    <VerifyBadge show={!p.verificado} />
                  </div>
                  {(current || !done) && <p className="text-lg leading-relaxed">{p.texto}</p>}
                  {(current || !done) && p.seguridad?.map((sid) => safety[sid] && <SafetyBanner key={sid} aviso={safety[sid]} open={sid === "inyeccion" && current} />)}
                  {p.registra_medicion && !done && (
                    <a href="#medicion" className="inline-block font-semibold text-bench-info underline">
                      Registrar medición ↓
                    </a>
                  )}
                  {p.pide_inyeccion && !done && (
                    <div className="grid gap-3 rounded-xl bg-bench-bg p-3 md:grid-cols-3">
                      <div>
                        <label className="label">Voltaje inyectado (V)</label>
                        <input className={cn("input", (overV || overNominal) && "border-bench-bad")} inputMode="decimal" value={volt} onChange={(e) => setVolt(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Corriente máx. (A)</label>
                        <input className={cn("input", overA && "border-bench-bad")} inputMode="decimal" value={amp} onChange={(e) => setAmp(e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={pending || overV || overA}
                          className="btn-primary w-full"
                          onClick={() => save({ voltajeInyectado: v, corrienteMax: a }, "✔ Inyección registrada")}
                        >
                          Registrar inyección
                        </button>
                      </div>
                      {(overV || overA) && (
                        <p className="rounded-lg bg-red-950 p-3 text-lg font-bold text-red-300 md:col-span-3" role="alert">
                          ⛔ Supera TU límite para esta línea. Baja el {overV ? "voltaje" : "límite de corriente"} antes de inyectar.
                        </p>
                      )}
                      {!overV && overNominal && (
                        <p className="rounded-lg bg-red-950 p-3 text-lg font-bold text-red-300 md:col-span-3" role="alert">
                          ⚠ Por encima del voltaje nominal de la línea.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section id="medicion" className="panel scroll-mt-4 space-y-3">
        <h2 className="h2">Registrar medición de esta línea</h2>
        {measureSlot}
      </section>

      <section className="panel space-y-4">
        <h2 className="h2">Resultado</h2>
        <div>
          <p className="label">Métodos usados</p>
          <div className="flex flex-wrap gap-2">
            {flow.metodos.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn("chip", metodos.includes(m.id) && "chip-on")}
                onClick={() => {
                  const next = metodos.includes(m.id) ? metodos.filter((x) => x !== m.id) : [...metodos, m.id];
                  setMetodos(next);
                  save({ metodo: next });
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Resistencia a tierra (Ω)</label>
            <input className="input" inputMode="decimal" value={res} onChange={(e) => setRes(e.target.value)} />
          </div>
          <div>
            <label className="label">Componente hallado</label>
            <input className="input" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="ej. C1234 (condensador en VDD_MAIN)" />
          </div>
        </div>
        <textarea className="input" rows={2} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border-2 border-bench-line px-4 has-[:checked]:border-bench-ok has-[:checked]:bg-green-950/40">
          <input type="checkbox" className="h-7 w-7 accent-green-500" checked={resuelto} onChange={(e) => setResuelto(e.target.checked)} />
          <span className="text-lg font-semibold">Corto resuelto</span>
        </label>
        <button
          type="button"
          disabled={pending}
          className="btn-primary btn-xl w-full"
          onClick={() => save({ resistencia: n(res), componenteHallado: comp.trim() || null, notas: notas.trim() || null, resuelto })}
        >
          Guardar resultado
        </button>
      </section>
      {msg && (
        <p className={cn("sticky bottom-24 rounded-xl p-3 text-center text-lg font-bold md:bottom-4", msg.ok ? "bg-green-900 text-green-100" : "bg-red-900 text-red-100")} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
