import { useState } from "react";
import { CUDIT_ITEMS, scoreCudit, type CuditBand } from "../../core/domain/cudit";
import type { Profile } from "../../data/types";
import { db } from "../store";
import { Btn, Chips, Label, Screen } from "../kit";
import { ReasonsEditor } from "./Reasons";
import { HelpLines } from "./Settings";

const FORMS = ["Porro", "Vape", "Pipa o bong", "Comestibles"];
const SLOTS = ["Muy temprano", "Antes del trabajo", "Después del trabajo", "Después de las 6 pm", "Antes de dormir", "Fines de semana"];
const TRIGGERS = ["Estrés", "Aburrimiento", "Ansiedad", "Ciertos amigos", "Música", "Eventos", "Soledad", "Después de comer"];

export const CUDIT_TEXT: Record<CuditBand, string> = {
  low: "Consumo de menor riesgo según la prueba.",
  hazardous: "La prueba indica un consumo de riesgo.",
  possible_cud:
    "La prueba sugiere un posible trastorno por consumo de cannabis. No es un diagnóstico: es tu línea base para ver el cambio. Un profesional puede ayudarte, y no hace falta estar mal para buscarlo.",
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [age, setAge] = useState(false);
  const [consent, setConsent] = useState(false);
  const [jointsPerDay, setJoints] = useState("2");
  const [years, setYears] = useState("10");
  const [forms, setForms] = useState<string[]>(["Porro", "Vape"]);
  const [weekly, setWeekly] = useState("45");
  const [startNow, setStartNow] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [cudit, setCudit] = useState<number[]>([]);
  const [slots, setSlots] = useState<string[]>(["Muy temprano", "Antes del trabajo", "Después del trabajo", "Antes de dormir"]);
  const [triggers, setTriggers] = useState<string[]>(["Estrés", "Aburrimiento", "Ansiedad", "Ciertos amigos", "Música", "Eventos"]);

  const cuditIdx = step - 4;
  const inCudit = cuditIdx >= 0 && cuditIdx < CUDIT_ITEMS.length;
  const afterCudit = 4 + CUDIT_ITEMS.length;
  const result = cudit.length === CUDIT_ITEMS.length ? scoreCudit(cudit) : null;
  const next = () => setStep((s) => s + 1);
  const back = step > 0 ? () => setStep((s) => (s === afterCudit && cudit.length < CUDIT_ITEMS.length ? 3 : s - 1)) : undefined;

  const finish = async () => {
    const now = Date.now();
    const quitAt = startNow || !startAt ? now : new Date(startAt).getTime();
    const profile: Profile = {
      id: "me",
      createdAt: now,
      onboarded: true,
      ageConfirmed: true,
      consentAt: now,
      locale: "es",
      quitAt,
      strategy: "cold_turkey",
      weeklySpend: Math.max(0, Number(weekly) || 0),
      currency: "USD",
      jointsPerDay: Number(jointsPerDay) || 0,
      years: Number(years) || 0,
      forms,
      riskSlots: slots,
      triggers,
    };
    if (result) await db.assessments.add({ at: now, type: "cudit_r", answers: cudit, ...result });
    await db.profile.put(profile);
  };

  if (step === 0)
    return (
      <Screen footer={<Btn onClick={next}>Empezar</Btn>}>
        <div className="pt-16 space-y-5">
          <h1 className="text-4xl font-semibold">Maljut</h1>
          <p className="text-xl leading-relaxed">
            Un compañero práctico para dejar el cannabis. Sin sermones ni culpa: si un día consumes, eso es un dato, no un fracaso.
          </p>
          <p className="text-mute">Todo lo que anotes se queda en este teléfono. No hay cuentas ni servidores.</p>
        </div>
      </Screen>
    );

  if (step === 1)
    return (
      <Screen title="Antes de empezar" onBack={back} footer={<Btn onClick={next} disabled={!age || !consent}>Seguir</Btn>}>
        {[
          [age, setAge, "Tengo 21 años o más."],
          [consent, setConsent, "Entiendo que mis datos se guardan solo en este dispositivo y que Maljut no sustituye la atención médica o psicológica."],
        ].map(([v, set, label]) => (
          <button
            key={label as string}
            onClick={() => (set as (b: boolean) => void)(!v)}
            className={`w-full text-left flex gap-3 items-start rounded-2xl border p-4 ${v ? "border-calm bg-calm/10" : "border-line bg-card"}`}
          >
            <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-md border flex items-center justify-center ${v ? "bg-calm border-calm text-bg" : "border-mute"}`}>
              {v ? "✓" : ""}
            </span>
            <span>{label as string}</span>
          </button>
        ))}
      </Screen>
    );

  if (step === 2)
    return (
      <Screen title="Tu consumo" onBack={back} footer={<Btn onClick={next}>Seguir</Btn>}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Porros al día (aprox.)</Label>
            <input inputMode="decimal" value={jointsPerDay} onChange={(e) => setJoints(e.target.value)} />
          </div>
          <div>
            <Label>Años consumiendo</Label>
            <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Cómo consumes</Label>
          <Chips options={FORMS} value={forms} onChange={setForms} />
        </div>
        <div>
          <Label>Gasto aproximado por semana (USD)</Label>
          <input inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
          <p className="text-xs text-mute mt-1">Sirve para calcular lo que ahorras. Lo puedes cambiar luego.</p>
        </div>
      </Screen>
    );

  if (step === 3)
    return (
      <Screen
        title="¿Cuándo empiezas?"
        onBack={back}
        footer={
          <>
            <Btn onClick={next} disabled={!startNow && !startAt}>
              Seguir
            </Btn>
          </>
        }
      >
        <Btn variant={startNow ? "primary" : "soft"} onClick={() => setStartNow(true)}>
          Ya, desde ahora
        </Btn>
        <Btn variant={!startNow ? "primary" : "soft"} onClick={() => setStartNow(false)}>
          Elegir día y hora
        </Btn>
        {!startNow && <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />}
        <p className="text-mute text-sm">
          Si te queda el último, puedes poner la hora en que piensas terminarlo. Despedirte con intención también cuenta.
        </p>
      </Screen>
    );

  if (inCudit) {
    const item = CUDIT_ITEMS[cuditIdx];
    return (
      <Screen
        title={`Línea base · ${cuditIdx + 1}/8`}
        onBack={back}
        footer={
          <Btn variant="ghost" onClick={() => setStep(afterCudit)}>
            Saltar la prueba
          </Btn>
        }
      >
        <p className="text-sm text-mute -mt-2">Prueba CUDIT-R. Piensa en los últimos 6 meses.</p>
        <p className="text-2xl leading-snug">{item.text}</p>
        <div className="space-y-2">
          {item.options.map((o) => (
            <Btn
              key={o.label}
              variant={cudit[cuditIdx] === o.value ? "primary" : "soft"}
              className="text-left"
              onClick={() => {
                const a = [...cudit];
                a[cuditIdx] = o.value;
                setCudit(a);
                next();
              }}
            >
              {o.label}
            </Btn>
          ))}
        </div>
      </Screen>
    );
  }

  if (step === afterCudit)
    return (
      <Screen title="Tus porqués" onBack={back} footer={<Btn onClick={next}>Seguir</Btn>}>
        <p className="text-mute -mt-2">
          Escribe o fotografía lo que te importa de dejarlo. Te lo voy a mostrar en los momentos difíciles. Puedes añadir más después.
        </p>
        <ReasonsEditor />
      </Screen>
    );

  if (step === afterCudit + 1)
    return (
      <Screen title="Tus momentos" onBack={back} footer={<Btn onClick={next}>Seguir</Btn>}>
        <div>
          <Label>¿Cuándo sueles consumir más?</Label>
          <Chips options={SLOTS} value={slots} onChange={setSlots} />
        </div>
        <div>
          <Label>¿Qué te dispara el antojo?</Label>
          <Chips options={TRIGGERS} value={triggers} onChange={setTriggers} />
        </div>
        <p className="text-sm text-mute">Con el uso, la app va a aprender tus horas reales de riesgo.</p>
      </Screen>
    );

  return (
    <Screen title="Listo" onBack={back} footer={<Btn onClick={finish}>Entrar</Btn>}>
      {result && (
        <div className="rounded-3xl bg-card border border-line p-5 space-y-2">
          <p className="text-sm text-mute">Tu línea base (CUDIT-R)</p>
          <p className="text-3xl font-semibold">{result.score}/32</p>
          <p>{CUDIT_TEXT[result.band]}</p>
        </div>
      )}
      <p className="text-lg leading-relaxed">
        Cuando llegue el antojo, toca <span className="text-warm font-semibold">Tengo antojo</span>. En menos de 10 segundos
        tienes algo que hacer con él. Y cada vez que me digas si te sirvió, aprendo qué te funciona.
      </p>
      <HelpLines />
    </Screen>
  );
}
