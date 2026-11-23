import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { t, type Step } from "../content/es";
import type { InterventionId } from "../core/engine/interventions";
import type { Reason } from "../data/types";
import { cue, unlockAudio } from "../platform/cue";
import { speak, stopSpeaking } from "../platform/tts";
import { Btn } from "./kit";

interface Phase { label: string; sec: number; scale: number; cue: "in" | "out" | "hold" }

const PATTERNS: Record<"sigh" | "box", { phases: Phase[]; minutes: number }> = {
  sigh: {
    minutes: 3,
    phases: [
      { label: t.breath.inhale, sec: 2.5, scale: 0.85, cue: "in" },
      { label: t.breath.inhale2, sec: 1, scale: 1, cue: "in" },
      { label: t.breath.exhale, sec: 6, scale: 0.4, cue: "out" },
    ],
  },
  box: {
    minutes: 4,
    phases: [
      { label: t.breath.inhale, sec: 4, scale: 1, cue: "in" },
      { label: t.breath.hold, sec: 4, scale: 1, cue: "hold" },
      { label: t.breath.exhale, sec: 4, scale: 0.4, cue: "out" },
      { label: t.breath.hold, sec: 4, scale: 0.4, cue: "hold" },
    ],
  },
};

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return s;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

function Breath({ kind, onDone }: { kind: "sigh" | "box"; onDone: () => void }) {
  const { phases, minutes } = PATTERNS[kind];
  const [i, setI] = useState(0);
  const elapsed = useElapsed(true);
  const total = minutes * 60;
  const p = phases[i % phases.length];

  useEffect(() => {
    cue(p.cue);
    const id = setTimeout(() => setI((x) => x + 1), p.sec * 1000);
    return () => clearTimeout(id);
  }, [i, p]);

  useEffect(() => {
    if (elapsed >= total) {
      cue("done");
      onDone();
    }
  }, [elapsed, total, onDone]);

  return (
    <div className="flex flex-col items-center gap-8 pt-6">
      <div className="relative h-72 w-72 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-line" />
        <motion.div
          className="absolute rounded-full bg-calm/25 border-2 border-calm"
          style={{ width: "100%", height: "100%" }}
          animate={{ scale: p.scale }}
          transition={{ duration: p.sec, ease: p.cue === "hold" ? "linear" : "easeInOut" }}
          initial={{ scale: 0.4 }}
        />
        <span className="relative text-2xl font-medium">{p.label}</span>
      </div>
      <p className="text-mute tabular-nums">{mmss(total - elapsed)}</p>
    </div>
  );
}

function Steps({ steps, auto, onDone }: { steps: Step[]; auto: boolean; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = steps[i];
  const last = i === steps.length - 1;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    speak(step.text);
  }, [step]);

  useEffect(() => {
    if (!auto || paused) return;
    const id = setTimeout(() => (last ? doneRef.current() : setI((x) => x + 1)), step.seconds * 1000);
    return () => clearTimeout(id);
  }, [i, paused, auto, step, last]);

  useEffect(() => () => stopSpeaking(), []);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex gap-1">
        {steps.map((_, k) => (
          <div key={k} className={`h-1 flex-1 rounded-full ${k <= i ? "bg-calm" : "bg-line"}`} />
        ))}
      </div>
      <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-2xl leading-snug min-h-48">
        {step.text}
      </motion.p>
      {auto ? (
        <Btn variant="soft" onClick={() => setPaused((x) => !x)}>
          {paused ? "Seguir" : "Pausa"}
        </Btn>
      ) : (
        <Btn onClick={() => (last ? onDone() : setI((x) => x + 1))}>{last ? "Terminar" : "Listo"}</Btn>
      )}
    </div>
  );
}

function Reasons({ reasons, onDone }: { reasons: Reason[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const r = reasons[i % Math.max(1, reasons.length)];
  return (
    <div className="flex flex-col gap-5 pt-4">
      {r?.photo && <img src={r.photo} alt="" className="w-full max-h-80 object-cover rounded-3xl" />}
      {r?.text && <p className="text-2xl leading-snug">{r.text}</p>}
      <p className="text-mute">{t.crisis.passes}</p>
      {reasons.length > 1 && i < reasons.length - 1 ? (
        <Btn variant="soft" onClick={() => setI((x) => x + 1)}>
          Siguiente ({i + 1}/{reasons.length})
        </Btn>
      ) : (
        <Btn onClick={onDone}>Terminar</Btn>
      )}
    </div>
  );
}

/** Reproduce una intervención. Muestra la intro y arranca con un toque (necesario en iOS para audio y voz). */
export function InterventionPlayer({ id, reasons, onDone }: { id: InterventionId; reasons: Reason[]; onDone: () => void }) {
  const info = t.interventions[id];
  const [started, setStarted] = useState(false);
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopSpeaking();
    onDone();
  };

  if (!started) {
    return (
      <div className="space-y-5 pt-2">
        <h2 className="text-3xl font-semibold">{info.title}</h2>
        <p className="text-lg text-mute">{info.subtitle}</p>
        <p className="text-lg">{info.intro}</p>
        <Btn
          onClick={() => {
            unlockAudio();
            setStarted(true);
          }}
        >
          {t.crisis.start}
        </Btn>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg text-mute">{info.title}</h2>
      {id === "sigh" || id === "box" ? <Breath kind={id} onDone={finish} /> : null}
      {id === "urge_surf" && <Steps steps={t.urgeSurfSteps} auto onDone={finish} />}
      {id === "grounding" && <Steps steps={t.groundingSteps} auto={false} onDone={finish} />}
      {id === "reasons" && <Reasons reasons={reasons} onDone={finish} />}
      {(id === "sigh" || id === "box" || id === "urge_surf") && (
        <button onClick={finish} className="mt-6 w-full min-h-12 text-mute">
          {t.crisis.finish}
        </button>
      )}
    </div>
  );
}
