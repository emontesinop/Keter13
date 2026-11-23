import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { t } from "../../content/es";
import { chooseIntervention, contextKey, rewardFrom, updateStats, type Helped } from "../../core/engine/bandit";
import { INTERVENTION_IDS, type InterventionId } from "../../core/engine/interventions";
import { db, getArmStats, setArmStats } from "../store";
import { Btn, Chips, Label, Scale, Screen } from "../kit";
import { InterventionPlayer } from "../players";

type Step = "intensity" | "emotion" | "context" | "propose" | "play" | "rate" | "done";

export default function Crisis({ onExit, onLapse }: { onExit: () => void; onLapse: (lapseId?: number) => void }) {
  const reasons = useLiveQuery(() => db.reasons.toArray(), []) ?? [];
  const [step, setStep] = useState<Step>("intensity");
  const [cravingId, setCravingId] = useState<number>();
  const [intensity, setIntensity] = useState(0);
  const [emotion, setEmotion] = useState<string[]>([]);
  const [context, setContext] = useState<string[]>([]);
  const [arm, setArm] = useState<InterventionId>("sigh");
  const [showAlts, setShowAlts] = useState(false);
  const [after, setAfter] = useState<number>();
  const [helped, setHelped] = useState<Helped>();
  const [startedAt, setStartedAt] = useState(0);
  const [used, setUsed] = useState(false);
  const [lapseId, setLapseId] = useState<number>();

  const available = INTERVENTION_IDS.filter((id) => id !== "reasons" || reasons.length > 0);
  const ctxKey = contextKey(new Date(), intensity || 5);

  const pickIntensity = async (v: number) => {
    setIntensity(v);
    const id = await db.cravings.add({ at: Date.now(), intensity: v, ctxKey: contextKey(new Date(), v), used: false });
    setCravingId(id);
    setStep("emotion");
  };

  useEffect(() => {
    if (step !== "propose") return;
    void getArmStats().then((s) => setArm(chooseIntervention(s, ctxKey, Math.random, available)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const saveContext = async (next: Step) => {
    if (cravingId) await db.cravings.update(cravingId, { emotion: emotion[0], context });
    setStep(next);
  };

  const finishRating = async (didUse: boolean) => {
    setUsed(didUse);
    if (cravingId) {
      await db.cravings.update(cravingId, {
        intervention: arm,
        after,
        helped,
        used: didUse,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      });
    }
    if (didUse) setLapseId(await db.lapses.add({ at: Date.now(), triggers: [...emotion, ...context] }));
    if (helped) await setArmStats(updateStats(await getArmStats(), arm, ctxKey, rewardFrom(helped, intensity, after)));
    setStep("done");
  };

  return (
    <Screen onBack={step === "play" ? undefined : onExit} title={step === "play" ? undefined : "Tengo antojo"}>
      {step === "intensity" && (
        <>
          <p className="text-2xl">{t.crisis.howStrong}</p>
          <Scale n={10} onChange={pickIntensity} low="Leve" high="Muy fuerte" />
          <p className="text-mute pt-4">{t.crisis.passes}</p>
        </>
      )}

      {step === "emotion" && (
        <>
          <p className="text-2xl">{t.crisis.whatFeel}</p>
          <Chips options={t.emotions} value={emotion} onChange={(v) => setEmotion(v.slice(-1))} multi={false} />
          <div className="pt-4 space-y-2">
            <Btn onClick={() => setStep("context")} disabled={!emotion.length}>
              Seguir
            </Btn>
            <Btn variant="ghost" onClick={() => setStep("context")}>
              {t.crisis.skip}
            </Btn>
          </div>
        </>
      )}

      {step === "context" && (
        <>
          <p className="text-2xl">{t.crisis.where}</p>
          <Label>{t.crisis.optional}</Label>
          <Chips options={t.contexts} value={context} onChange={setContext} />
          <div className="pt-4">
            <Btn onClick={() => saveContext("propose")}>{context.length ? "Seguir" : t.crisis.skip}</Btn>
          </div>
        </>
      )}

      {step === "propose" && (
        <>
          <Label>{t.crisis.proposal}</Label>
          <button
            onClick={() => {
              setStartedAt(Date.now());
              setStep("play");
            }}
            className="w-full text-left rounded-3xl bg-calm/15 border border-calm p-6 active:scale-[0.99]"
          >
            <p className="text-2xl font-semibold">{t.interventions[arm].title}</p>
            <p className="text-mute mt-1">{t.interventions[arm].subtitle}</p>
          </button>
          {!showAlts ? (
            <Btn variant="ghost" onClick={() => setShowAlts(true)}>
              {t.crisis.another}
            </Btn>
          ) : (
            <div className="space-y-2">
              {available
                .filter((id) => id !== arm)
                .map((id) => (
                  <Btn
                    key={id}
                    variant="soft"
                    className="text-left"
                    onClick={() => {
                      setArm(id);
                      setStartedAt(Date.now());
                      setStep("play");
                    }}
                  >
                    {t.interventions[id].title}
                  </Btn>
                ))}
            </div>
          )}
        </>
      )}

      {step === "play" && <InterventionPlayer id={arm} reasons={reasons} onDone={() => setStep("rate")} />}

      {step === "rate" && (
        <>
          <p className="text-2xl">{t.crisis.howNow}</p>
          <Scale n={10} value={after} onChange={setAfter} low="Leve" high="Muy fuerte" />
          <p className="text-2xl pt-2">{t.crisis.helped}</p>
          <div className="grid grid-cols-3 gap-2">
            {(["yes", "some", "no"] as Helped[]).map((h) => (
              <button
                key={h}
                onClick={() => setHelped(h)}
                className={`h-14 rounded-2xl border text-lg ${helped === h ? "bg-calm text-bg border-calm font-semibold" : "bg-card border-line"}`}
              >
                {t.crisis[h]}
              </button>
            ))}
          </div>
          <div className="pt-4 space-y-2">
            <Btn onClick={() => finishRating(false)}>{t.crisis.usedNo}</Btn>
            <Btn variant="soft" onClick={() => finishRating(true)}>
              {t.crisis.usedYes}
            </Btn>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <p className="text-2xl leading-snug pt-6">{used ? t.crisis.doneUsed : t.crisis.doneGood}</p>
          <div className="pt-6 space-y-2">
            {used && <Btn onClick={() => onLapse(lapseId)}>{t.crisis.logLapse}</Btn>}
            <Btn variant={used ? "soft" : "primary"} onClick={onExit}>
              {t.crisis.back}
            </Btn>
          </div>
        </>
      )}
    </Screen>
  );
}
