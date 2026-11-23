import { useEffect, useState } from "react";
import { t } from "../../content/es";
import { localDate } from "../../data/db";
import type { Checkin, Lapse } from "../../data/types";
import { db } from "../store";
import { Btn, Chips, Label, Scale, Screen } from "../kit";

type Field = keyof typeof t.checkin.fields;
const FIELDS = Object.keys(t.checkin.fields) as Field[];

export function CheckinForm({ onExit, onLapse }: { onExit: () => void; onLapse: (id?: number) => void }) {
  const date = localDate();
  const [v, setV] = useState<Partial<Checkin>>({});
  useEffect(() => {
    void db.checkins.get(date).then((c) => c && setV(c));
  }, [date]);

  const complete = FIELDS.every((f) => typeof v[f] === "number") && typeof v.used === "boolean";

  const save = async () => {
    await db.checkins.put({ ...(v as Checkin), date, at: Date.now() });
    if (v.used) {
      const start = new Date(`${date}T00:00:00`).getTime();
      const existing = await db.lapses.where("at").aboveOrEqual(start).first();
      const id = existing?.id ?? (await db.lapses.add({ at: Date.now(), triggers: [] }));
      onLapse(id);
    } else onExit();
  };

  return (
    <Screen
      title={t.checkin.title}
      onBack={onExit}
      footer={
        <Btn onClick={save} disabled={!complete}>
          {t.checkin.save}
        </Btn>
      }
    >
      <p className="text-mute -mt-2">{t.checkin.sub}</p>
      {FIELDS.map((f) => {
        const [label, low, high] = t.checkin.fields[f];
        return (
          <div key={f}>
            <Label>{label}</Label>
            <Scale value={v[f] as number | undefined} onChange={(n) => setV({ ...v, [f]: n })} low={low} high={high} />
          </div>
        );
      })}
      <div>
        <Label>{t.checkin.used}</Label>
        <div className="grid grid-cols-2 gap-2">
          {[false, true].map((u) => (
            <button
              key={String(u)}
              onClick={() => setV({ ...v, used: u })}
              className={`h-14 rounded-2xl border text-lg ${v.used === u ? "bg-calm text-bg border-calm font-semibold" : "bg-card border-line"}`}
            >
              {u ? "Sí" : "No"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>{t.checkin.note}</Label>
        <textarea value={v.note ?? ""} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </div>
    </Screen>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function LapseForm({ lapseId, onExit }: { lapseId?: number; onExit: () => void }) {
  const [v, setV] = useState<Lapse>({ at: Date.now(), triggers: [] });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (lapseId) void db.lapses.get(lapseId).then((l) => l && setV(l));
  }, [lapseId]);

  const save = async () => {
    if (v.id) await db.lapses.put(v);
    else await db.lapses.add(v);
    setSaved(true);
  };

  if (saved)
    return (
      <Screen title={t.lapse.title}>
        <p className="text-2xl leading-snug pt-6">{t.lapse.saved}</p>
        <Btn onClick={onExit}>{t.crisis.back}</Btn>
      </Screen>
    );

  const text = (k: "amount" | "before" | "during" | "after" | "learned" | "ifThen", label: string, ph?: string) => (
    <div>
      <Label>{label}</Label>
      <textarea value={v[k] ?? ""} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );

  return (
    <Screen title={t.lapse.title} onBack={onExit} footer={<Btn onClick={save}>{t.lapse.save}</Btn>}>
      <p className="text-mute -mt-2">{t.lapse.sub}</p>
      <div>
        <Label>{t.lapse.when}</Label>
        <input
          type="datetime-local"
          value={toLocalInput(v.at)}
          max={toLocalInput(Date.now())}
          onChange={(e) => e.target.value && setV({ ...v, at: Math.min(Date.now(), new Date(e.target.value).getTime()) })}
        />
      </div>
      {text("before", t.lapse.before)}
      {text("during", t.lapse.during)}
      {text("after", t.lapse.after)}
      <div>
        <Label>{t.lapse.triggers}</Label>
        <Chips options={[...t.emotions, ...t.contexts]} value={v.triggers} onChange={(x) => setV({ ...v, triggers: x })} />
      </div>
      {text("ifThen", t.lapse.ifThen, t.lapse.ifThenPh)}
      {text("amount", t.lapse.amount)}
    </Screen>
  );
}
