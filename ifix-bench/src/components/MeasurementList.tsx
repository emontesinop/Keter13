import { deleteMeasurement } from "@/app/actions";
import { cn, dateTime } from "@/lib/format";
import { DEVIATION_WARN, fmtVal, modeLabel, refKey, type RefStat } from "@/lib/measure";
import { DeleteButton } from "./DeleteButton";

type M = { id: string; linea: string; modo: string; valor: number; unidad: string; placaBuena: boolean; nota: string | null; createdAt: Date };

export function MeasurementList({ items, lineNames, stats }: { items: M[]; lineNames: Record<string, string>; stats: Record<string, RefStat> }) {
  if (!items.length) return <p className="muted panel">Sin mediciones.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-bench-line">
      <table className="w-full text-left text-lg">
        <thead className="bg-bench-panel text-base text-bench-muted">
          <tr>
            <th className="p-3">Línea</th>
            <th className="p-3">Modo</th>
            <th className="p-3">Valor</th>
            <th className="p-3">Placa buena</th>
            <th className="p-3">Diferencia</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const ref = stats[refKey(m.linea, m.modo)];
            const dev = ref && !m.placaBuena && ref.avg !== 0 ? (m.valor - ref.avg) / Math.abs(ref.avg) : null;
            return (
              <tr key={m.id} className="border-t border-bench-line">
                <td className="p-3">
                  <b>{lineNames[m.linea] ?? m.linea}</b>
                  {m.nota && <p className="text-sm text-bench-muted">{m.nota}</p>}
                  <p className="text-xs text-bench-muted">{dateTime(m.createdAt)}</p>
                </td>
                <td className="p-3">{modeLabel(m.modo)}</td>
                <td className="p-3 font-mono font-bold">
                  {fmtVal(m.valor)} {m.unidad}
                </td>
                <td className="p-3">{m.placaBuena ? <span className="font-bold text-bench-ok">✔ Referencia</span> : ref ? `${fmtVal(ref.avg)} ${m.unidad}` : "—"}</td>
                <td className={cn("p-3 font-bold", dev != null && (Math.abs(dev) > DEVIATION_WARN ? "text-bench-bad" : "text-bench-ok"))}>
                  {dev != null ? `${dev >= 0 ? "+" : ""}${(dev * 100).toFixed(0)} %` : "—"}
                </td>
                <td className="p-3 text-right">
                  <DeleteButton action={deleteMeasurement.bind(null, m.id)} label="" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
