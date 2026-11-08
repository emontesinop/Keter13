"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveDcReading } from "@/app/actions";
import { cn } from "@/lib/format";
import type { DcPatterns } from "@/lib/knowledge-schemas";
import type { DcCase } from "@/lib/similar";
import { VerifyBadge } from "./ui";

const MOMENTOS = ["Al conectar (sin pulsar)", "Al pulsar encendido", "Tras unos segundos", "Con cargador conectado"];

export function DcConsumption({
  dc,
  orderId,
  history,
  modelNames,
  onSaved,
  compact,
}: {
  dc: DcPatterns;
  orderId: string | null;
  history: Record<string, DcCase[]>;
  modelNames: Record<string, string>;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const [patron, setPatron] = useState<string | null>(null);
  const [voltaje, setVoltaje] = useState("");
  const [mA, setMA] = useState("");
  const [momento, setMomento] = useState(MOMENTOS[1]);
  const [nota, setNota] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const p = dc.patrones.find((x) => x.id === patron);
  const cases = (patron && history[patron]) || [];
  const tally = Object.entries(
    cases.reduce<Record<string, number>>((acc, c) => ((acc[c.causaRaiz] = (acc[c.causaRaiz] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  const dest = (s?: { arbol?: string; nodo?: string; modulo?: string }) => {
    if (!s) return null;
    if (s.arbol) {
      const q = new URLSearchParams({ ...(orderId ? { orden: orderId } : {}), ...(s.nodo ? { nodo: s.nodo } : {}) });
      return { href: `/diagnostico/${s.arbol}?${q}`, label: "Seguir con el árbol de diagnóstico →" };
    }
    if (s.modulo === "cortos") return { href: null, label: "Siguiente: localización de cortocircuitos (Fase 2)" };
    return null;
  };
  const next = dest(p?.siguiente);

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="panel space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="h3">Cómo conectar</h3>
            <VerifyBadge show={dc.estado === "verificar"} />
          </div>
          <p>{dc.como_conectar}</p>
          {dc.campos_usuario?.map((c) => (
            <p key={c} className="text-sm text-bench-muted">• {c}</p>
          ))}
        </div>
      )}

      <div>
        <p className="label">¿Qué hace el amperímetro?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {dc.patrones.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setPatron(x.id);
                setSaved(false);
              }}
              className={cn("btn min-h-[4rem] justify-start text-left", patron === x.id ? "bg-bench-accent text-black" : "border-2 border-bench-line bg-bench-panel")}
            >
              {x.nombre}
            </button>
          ))}
        </div>
      </div>

      {p && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="h3">{p.nombre}</h3>
              <VerifyBadge show={!p.verificado} />
            </div>
            <p className="muted">{p.descripcion}</p>
            <p className="font-semibold">Causas probables:</p>
            <ul className="list-disc space-y-1 pl-6 text-lg">
              {p.causas.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="card space-y-3 border-bench-info">
            <h3 className="h3">Tus casos anteriores con este patrón</h3>
            {cases.length === 0 ? (
              <p className="muted">Aún no hay casos cerrados con causa raíz para este patrón en este modelo o su familia. Se irán sumando cuando completes “Cierre del caso”.</p>
            ) : (
              <>
                <ul className="space-y-1 text-lg">
                  {tally.slice(0, 5).map(([causa, count]) => (
                    <li key={causa}>
                      <b>{causa}</b> — {count} de {cases.length} caso(s)
                    </li>
                  ))}
                </ul>
                <p className="text-base text-bench-muted">
                  Último:{" "}
                  <Link className="text-bench-info underline" href={`/ordenes/${cases[0].orderId}`}>
                    {cases[0].codigo}
                  </Link>{" "}
                  · {modelNames[cases[0].modelo] ?? cases[0].modelo}
                  {cases[0].mA != null ? ` · ${cases[0].mA} mA` : ""} · {cases[0].causaRaiz}
                </p>
              </>
            )}
          </div>

          <div className="card grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Voltaje de la fuente (V)</label>
              <input className="input" inputMode="decimal" value={voltaje} onChange={(e) => setVoltaje(e.target.value)} />
            </div>
            <div>
              <label className="label">Corriente observada (mA)</label>
              <input className="input" inputMode="decimal" value={mA} onChange={(e) => setMA(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Momento</label>
              <div className="flex flex-wrap gap-2">
                {MOMENTOS.map((m) => (
                  <button key={m} type="button" onClick={() => setMomento(m)} className={cn("chip", momento === m && "chip-on")}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="label">Nota</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. sube a X mA y cae a los 2 s" />
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="button"
                disabled={pending || saved}
                className="btn-primary btn-xl flex-1"
                onClick={() =>
                  start(async () => {
                    await saveDcReading({ orderId, patron: p.id, voltaje: n(voltaje), mA: n(mA), momento, nota: nota.trim() || null });
                    setSaved(true);
                    onSaved?.();
                  })
                }
              >
                {saved ? "✔ Registrado" : orderId ? "Registrar en la orden" : "Registrar (sin orden)"}
              </button>
              {next &&
                (next.href ? (
                  <Link href={next.href} className="btn-secondary btn-xl flex-1">
                    {next.label}
                  </Link>
                ) : (
                  <span className="btn-secondary btn-xl flex-1 opacity-60">{next.label}</span>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
