"use client";
import { useState, useTransition } from "react";
import { addMeasurement } from "@/app/actions";
import { cn } from "@/lib/format";
import { DEVIATION_WARN, fmtVal, MODES, refKey, toCanonical, type RefStat } from "@/lib/measure";

type Line = { id: string; nombre: string; grupo: string; donde_medir?: string };

export function MeasurementForm({
  orderId,
  modelo,
  lines,
  stats,
  defaultPlacaBuena = false,
  defaultLinea,
  lockLinea,
}: {
  orderId: string | null;
  modelo: string;
  lines: Line[];
  stats: Record<string, RefStat>;
  defaultPlacaBuena?: boolean;
  defaultLinea?: string;
  lockLinea?: boolean;
}) {
  const known = defaultLinea ? lines.some((l) => l.id === defaultLinea) : true;
  const [linea, setLinea] = useState(defaultLinea && known ? defaultLinea : lines[0]?.id ?? "");
  const [libre, setLibre] = useState(defaultLinea && !known ? defaultLinea : "");
  const [modo, setModo] = useState<(typeof MODES)[number]["id"]>("DIODO");
  const mode = MODES.find((m) => m.id === modo)!;
  const [unidad, setUnidad] = useState<string>(mode.units[0]);
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [buena, setBuena] = useState(defaultPlacaBuena);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const lineId = linea === "__otra" ? libre.trim() : linea;
  const ref = stats[refKey(lineId, modo)];
  const v = Number(valor.replace(",", "."));
  let cmp: { canon: number; dev: number } | null = null;
  if (valor.trim() !== "" && Number.isFinite(v) && ref && ref.avg !== 0) {
    const canon = toCanonical(modo, v, unidad).valor;
    cmp = { canon, dev: (canon - ref.avg) / Math.abs(ref.avg) };
  }
  const groups = [...new Set(lines.map((l) => l.grupo))];

  return (
    <div className="space-y-4">
      {!lockLinea && (
        <div>
          <label className="label">Línea</label>
          <select className="input" value={linea} onChange={(e) => setLinea(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {lines.filter((l) => l.grupo === g).map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </optgroup>
            ))}
            <option value="__otra">Otra (escribir)…</option>
          </select>
          {linea === "__otra" && <input className="input mt-2" placeholder="Nombre de la línea (ej. PP1V8_ALWAYS)" value={libre} onChange={(e) => setLibre(e.target.value)} />}
          {lines.find((l) => l.id === linea)?.donde_medir && <p className="mt-1 text-sm text-bench-muted">Dónde: {lines.find((l) => l.id === linea)!.donde_medir}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={cn("chip", modo === m.id && "chip-on")}
            onClick={() => {
              setModo(m.id);
              setUnidad(m.units[0]);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1 text-2xl font-bold" inputMode="decimal" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
        <select className="input w-28" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
          {mode.units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className={cn("rounded-xl border-2 p-3", !ref ? "border-bench-line" : cmp && Math.abs(cmp.dev) > DEVIATION_WARN ? "border-bench-bad bg-red-950/40" : "border-bench-line")}>
        {ref ? (
          <p className="text-lg">
            Tu placa buena ({ref.count} medición{ref.count > 1 ? "es" : ""}): <b>{fmtVal(ref.avg)} {mode.canon}</b>
            <span className="text-bench-muted"> (mín {fmtVal(ref.min)} · máx {fmtVal(ref.max)})</span>
            {cmp && (
              <b className={cn("ml-2", Math.abs(cmp.dev) > DEVIATION_WARN ? "text-bench-bad" : "text-bench-ok")}>
                {cmp.dev >= 0 ? "+" : ""}
                {(cmp.dev * 100).toFixed(0)} %
              </b>
            )}
          </p>
        ) : (
          <p className="text-base text-yellow-300">Sin valor de referencia para esta línea y modo en este modelo. Mide una placa buena y márcala como “placa buena”.</p>
        )}
      </div>

      <input className="input" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-xl border-2 border-bench-line px-4 has-[:checked]:border-bench-ok has-[:checked]:bg-green-950/40">
        <input type="checkbox" className="h-7 w-7 accent-green-500" checked={buena} onChange={(e) => setBuena(e.target.checked)} />
        <span className="text-lg font-semibold">Es de una placa buena (usar como referencia)</span>
      </label>
      <button
        type="button"
        disabled={pending || !valor.trim() || !lineId}
        className="btn-primary btn-xl w-full"
        onClick={() =>
          start(async () => {
            const r = await addMeasurement({ orderId, modelo, linea: lineId, modo, valor: v, unidad, placaBuena: buena, nota: nota.trim() || null });
            setMsg(r.ok ? { ok: true, text: "✔ Medición guardada" } : { ok: false, text: r.error });
            if (r.ok) {
              setValor("");
              setNota("");
            }
          })
        }
      >
        Guardar medición
      </button>
      {msg && <p className={cn("text-lg font-semibold", msg.ok ? "text-bench-ok" : "text-bench-bad")}>{msg.text}</p>}
    </div>
  );
}
