import { useState } from "react";
import { t } from "../content/es";
import { contextKey, rewardFrom, updateStats, type Helped } from "../core/engine/bandit";
import { INTERVENTION_IDS, type InterventionId } from "../core/engine/interventions";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getArmStats, setArmStats, useProfile, useSettings } from "./store";
import { Btn, Card, Screen } from "./kit";
import { InterventionPlayer } from "./players";
import Onboarding from "./screens/Onboarding";
import Today from "./screens/Today";
import Crisis from "./screens/Crisis";
import Journal from "./screens/Journal";
import Settings from "./screens/Settings";
import { CheckinForm, LapseForm } from "./screens/Forms";

type Tab = "today" | "tools" | "journal" | "settings";
type Route =
  | { name: "tabs" }
  | { name: "crisis" }
  | { name: "checkin" }
  | { name: "lapse"; id?: number }
  | { name: "tool"; id: InterventionId };

const TABS: [Tab, string, string][] = [
  ["today", "Hoy", "◐"],
  ["tools", "Herramientas", "◇"],
  ["journal", "Bitácora", "≡"],
  ["settings", "Ajustes", "⚙"],
];

function Tools({ onOpen }: { onOpen: (id: InterventionId) => void }) {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold pt-2">Herramientas</h1>
      {INTERVENTION_IDS.map((id) => (
        <button key={id} onClick={() => onOpen(id)} className="w-full text-left">
          <Card className="!p-4">
            <p className="font-medium">{t.interventions[id].title}</p>
            <p className="text-sm text-mute">{t.interventions[id].subtitle}</p>
          </Card>
        </button>
      ))}
      <p className="text-sm text-mute pt-2">Más respiraciones, meditaciones, TCC y el kit de sueño llegan en la fase 2.</p>
    </div>
  );
}

function ToolRun({ id, onExit }: { id: InterventionId; onExit: () => void }) {
  const reasons = useLiveQuery(() => db.reasons.toArray(), []) ?? [];
  const [done, setDone] = useState(false);
  const rate = async (h: Helped) => {
    await setArmStats(updateStats(await getArmStats(), id, contextKey(new Date(), 5), rewardFrom(h, 5)));
    onExit();
  };
  return (
    <Screen onBack={onExit}>
      {!done ? (
        id === "reasons" && !reasons.length ? (
          <p className="text-lg">Todavía no tienes porqués guardados. Añádelos en Ajustes.</p>
        ) : (
          <InterventionPlayer id={id} reasons={reasons} onDone={() => setDone(true)} />
        )
      ) : (
        <div className="space-y-3 pt-6">
          <p className="text-2xl">{t.crisis.helped}</p>
          {(["yes", "some", "no"] as Helped[]).map((h) => (
            <Btn key={h} variant="soft" onClick={() => rate(h)}>
              {t.crisis[h]}
            </Btn>
          ))}
        </div>
      )}
    </Screen>
  );
}

export default function App() {
  const profile = useProfile();
  useSettings();
  const [tab, setTab] = useState<Tab>("today");
  const [route, setRoute] = useState<Route>({ name: "tabs" });
  const home = () => setRoute({ name: "tabs" });
  const lapse = (id?: number) => setRoute({ name: "lapse", id });

  if (profile === undefined) return <div className="min-h-full bg-bg" />;
  if (!profile?.onboarded) return <Onboarding />;

  if (route.name === "crisis") return <Crisis onExit={home} onLapse={lapse} />;
  if (route.name === "checkin") return <CheckinForm onExit={home} onLapse={lapse} />;
  if (route.name === "lapse") return <LapseForm lapseId={route.id} onExit={home} />;
  if (route.name === "tool") return <ToolRun id={route.id} onExit={home} />;

  return (
    <div className="min-h-full flex flex-col">
      <div className="flex-1 px-4 safe-top pb-48">
        {tab === "today" && <Today profile={profile} onCheckin={() => setRoute({ name: "checkin" })} />}
        {tab === "tools" && <Tools onOpen={(id) => setRoute({ name: "tool", id })} />}
        {tab === "journal" && <Journal onLapse={lapse} />}
        {tab === "settings" && <Settings profile={profile} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-bg/0 pt-6">
        <div className="px-4 pb-3">
          <button
            onClick={() => setRoute({ name: "crisis" })}
            className="w-full h-20 rounded-3xl bg-warm text-bg text-2xl font-semibold shadow-lg shadow-warm/20 active:scale-[0.98] transition"
          >
            Tengo antojo
          </button>
        </div>
        <nav className="grid grid-cols-4 border-t border-line bg-bg safe-bottom">
          {TABS.map(([k, l, icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`pt-2 h-16 flex flex-col items-center gap-0.5 ${tab === k ? "text-calm" : "text-mute"}`}>
              <span className="text-xl leading-none">{icon}</span>
              <span className="text-[11px]">{l}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
