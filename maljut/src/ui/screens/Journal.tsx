import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { t } from "../../content/es";
import { db } from "../store";
import { Btn, Card } from "../kit";

const fmt = (ms: number) => new Date(ms).toLocaleString("es-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
type Tab = "cravings" | "checkins" | "lapses";

export default function Journal({ onLapse }: { onLapse: (id?: number) => void }) {
  const [tab, setTab] = useState<Tab>("cravings");
  const cravings = useLiveQuery(() => db.cravings.orderBy("at").reverse().limit(100).toArray(), []) ?? [];
  const checkins = useLiveQuery(() => db.checkins.orderBy("at").reverse().limit(60).toArray(), []) ?? [];
  const lapses = useLiveQuery(() => db.lapses.orderBy("at").reverse().toArray(), []) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold pt-2">Bitácora</h1>
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-card border border-line p-1">
        {(
          [
            ["cravings", "Antojos"],
            ["checkins", "Check-ins"],
            ["lapses", "Consumos"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`h-11 rounded-xl ${tab === k ? "bg-line text-ink" : "text-mute"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "cravings" &&
        (cravings.length ? (
          cravings.map((c) => (
            <Card key={c.id} className="!p-4">
              <div className="flex justify-between text-sm text-mute">
                <span>{fmt(c.at)}</span>
                <span>{c.used ? "consumí" : c.helped ? "surfeado" : ""}</span>
              </div>
              <p className="mt-1">
                Intensidad <b>{c.intensity}</b>
                {c.after !== undefined && <> → <b>{c.after}</b></>}
                {c.emotion && <> · {c.emotion}</>}
              </p>
              {c.intervention && (
                <p className="text-sm text-mute">
                  {t.interventions[c.intervention].title}
                  {c.helped && ` · ${t.crisis[c.helped]}`}
                </p>
              )}
              {c.context?.length ? <p className="text-xs text-mute mt-1">{c.context.join(" · ")}</p> : null}
            </Card>
          ))
        ) : (
          <p className="text-mute">Aquí aparecerá cada antojo que registres. Cada uno le enseña algo a la app.</p>
        ))}

      {tab === "checkins" &&
        (checkins.length ? (
          checkins.map((c) => (
            <Card key={c.date} className="!p-4">
              <p className="text-sm text-mute">{c.date}{c.used ? " · consumí" : ""}</p>
              <p className="text-sm mt-1">
                Ánimo {c.mood} · Sueño {c.sleep} · Ansiedad {c.anxiety} · Irritabilidad {c.irritability} · Apetito {c.appetite} · Antojos {c.cravings}
              </p>
              {c.note && <p className="text-sm text-mute mt-1">{c.note}</p>}
            </Card>
          ))
        ) : (
          <p className="text-mute">Todavía no hay check-ins.</p>
        ))}

      {tab === "lapses" && (
        <>
          <Btn variant="soft" onClick={() => onLapse()}>
            Registrar un consumo
          </Btn>
          {lapses.map((l) => (
            <button key={l.id} onClick={() => onLapse(l.id)} className="w-full text-left">
              <Card className="!p-4">
                <p className="text-sm text-mute">{fmt(l.at)}</p>
                {l.before && <p className="text-sm mt-1">Antes: {l.before}</p>}
                {l.ifThen && <p className="text-sm text-calm mt-1">Plan: {l.ifThen}</p>}
                {!l.before && !l.ifThen && <p className="text-sm text-mute mt-1">Toca para anotar qué pasó</p>}
              </Card>
            </button>
          ))}
          <p className="text-xs text-mute">Registrar un consumo reinicia el contador de este intento, pero nunca tus días limpios totales.</p>
        </>
      )}
    </div>
  );
}
