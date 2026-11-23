import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { t } from "../../content/es";
import { computeCounters, dayIndex } from "../../core/domain/counters";
import { withdrawalIntensity, withdrawalPhase } from "../../core/domain/withdrawal";
import { localDate } from "../../data/db";
import type { Checkin, Profile } from "../../data/types";
import { dailyCost, db, money } from "../store";
import { Btn, Card } from "../kit";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Índice de malestar 0-1 a partir del check-in (síntomas de abstinencia). */
export function felt(c: Checkin): number {
  const parts = [c.anxiety, c.irritability, 6 - c.sleep, 6 - c.appetite, c.cravings, 6 - c.mood];
  return parts.reduce((s, x) => s + (x - 1) / 4, 0) / parts.length;
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-mute mb-1">
        <span>{label}</span>
        <span>{Math.round(value * 10)}/10</span>
      </div>
      <div className="h-2 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
    </div>
  );
}

export default function Today({ profile, onCheckin }: { profile: Profile; onCheckin: () => void }) {
  const now = useNow();
  const lapses = useLiveQuery(() => db.lapses.toArray(), []) ?? [];
  const today = useLiveQuery(() => db.checkins.get(localDate(now)), [localDate(now)]);
  const surfed = useLiveQuery(() => db.cravings.filter((c) => !c.used && c.helped !== undefined).count(), []) ?? 0;

  const quitAt = new Date(profile.quitAt);
  const c = computeCounters(quitAt, lapses.map((l) => ({ at: new Date(l.at) })), now, dailyCost(profile));
  const notStarted = quitAt > now;
  const day = dayIndex(quitAt, now);
  const phase = withdrawalPhase(day);
  const info = t.withdrawal[phase];
  const expected = withdrawalIntensity(day);
  const mine = today ? felt(today) : null;
  const hours = Math.floor(c.msThisAttempt / 3_600_000);

  return (
    <div className="space-y-4">
      <div className="pt-2">
        {notStarted ? (
          <>
            <p className="text-mute">Empiezas</p>
            <p className="text-4xl font-semibold">{quitAt.toLocaleString("es-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}</p>
          </>
        ) : (
          <>
            <p className="text-mute">{c.daysThisAttempt === 0 ? "Sin consumir" : "Días sin consumir"}</p>
            <p className="text-6xl font-semibold tabular-nums">
              {c.daysThisAttempt === 0 ? `${hours} h` : c.daysThisAttempt}
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          [money(c.moneySaved, profile.currency), "ahorrados"],
          [String(c.cleanDaysTotal), "días limpios en total"],
          [String(surfed), "antojos surfeados"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-card border border-line p-3">
            <p className="text-lg font-semibold tabular-nums">{v}</p>
            <p className="text-xs text-mute leading-tight">{l}</p>
          </div>
        ))}
      </div>

      {!notStarted && (
        <Card className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-calm">Día {day + 1} · {info.title}</p>
          <p className="leading-relaxed">{info.expect}</p>
          <div className="space-y-2 pt-1">
            <Bar value={expected} color="bg-soft" label="Lo típico hoy" />
            {mine !== null && <Bar value={mine} color="bg-warm" label="Lo que reportaste" />}
          </div>
          {mine !== null && (
            <p className="text-sm text-mute">
              {mine > expected + 0.25
                ? "Hoy está más pesado de lo típico. Bájale la exigencia. Si se mantiene así varios días, vale la pena hablarlo con un profesional."
                : "Lo que sientes está dentro de lo esperado para esta etapa. Va a pasar."}
            </p>
          )}
          <p className="text-sm border-t border-line pt-3">💡 {info.tip}</p>
        </Card>
      )}

      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{today ? t.checkin.done : t.checkin.title}</p>
          <p className="text-sm text-mute">{today ? "Puedes editarlo cuando quieras" : t.checkin.sub}</p>
        </div>
        <Btn variant={today ? "soft" : "primary"} className="!w-auto !min-h-12 shrink-0" onClick={onCheckin}>
          {today ? "Editar" : "Hacer"}
        </Btn>
      </Card>

      {c.cleanPct !== null && c.cleanPct < 1 && (
        <p className="text-sm text-mute text-center">{Math.round(c.cleanPct * 100)}% de tus días desde que empezaste han sido limpios.</p>
      )}
    </div>
  );
}
