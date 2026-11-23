import { useRef, useState } from "react";
import { t } from "../../content/es";
import { exportAll, importAll, localDate, wipeAll, type Snapshot } from "../../data/db";
import type { Profile } from "../../data/types";
import { decryptJSON, encryptJSON, WrongPassword } from "../../platform/crypto";
import { db, saveSettings, useSettings } from "../store";
import { Btn, Card, Label } from "../kit";
import { ReasonsEditor } from "./Reasons";

export function HelpLines() {
  return (
    <Card className="space-y-3">
      <p className="font-medium">{t.help.title}</p>
      {t.help.lines.map((l) => (
        <a key={l.tel} href={`tel:${l.tel}`} className="block rounded-2xl bg-bg border border-line p-3">
          <p className="font-medium text-calm">{l.name}</p>
          <p className="text-sm text-mute">{l.detail}</p>
        </a>
      ))}
      <p className="text-xs text-mute">{t.help.note}</p>
    </Card>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="w-full flex items-center justify-between min-h-12">
      <span>{label}</span>
      <span className={`h-8 w-14 rounded-full p-1 transition ${on ? "bg-calm" : "bg-line"}`}>
        <span className={`block h-6 w-6 rounded-full bg-ink transition ${on ? "translate-x-6" : ""}`} />
      </span>
    </button>
  );
}

export default function Settings({ profile }: { profile: Profile }) {
  const settings = useSettings();
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    if (pass.length < 6) return setMsg("Usa una contraseña de al menos 6 caracteres.");
    const payload = await encryptJSON(await exportAll(db), pass);
    const file = new File([payload], `maljut-${localDate()}.maljut`, { type: "application/octet-stream" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Copia de Maljut" });
      } catch {
        /* cancelado */
      }
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setMsg("Copia cifrada creada. Guárdala junto con tu contraseña: sin ella no se puede abrir.");
  };

  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      const snap = await decryptJSON<Snapshot>(await f.text(), pass);
      if (!confirm("Esto reemplaza todos los datos de este teléfono por los de la copia. ¿Seguir?")) return;
      await importAll(db, snap);
      setMsg("Copia restaurada.");
    } catch (e) {
      setMsg(e instanceof WrongPassword ? "Contraseña incorrecta. No se cambió nada." : (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const wipe = async () => {
    if (!confirm("Se borrará todo: perfil, bitácora, porqués y fotos. No se puede deshacer. ¿Borrar?")) return;
    await wipeAll(db);
    location.reload();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold pt-2">Ajustes</h1>

      <Card className="space-y-4">
        <div>
          <Label>Inicio del corte</Label>
          <input
            type="datetime-local"
            value={toLocalInput(profile.quitAt)}
            onChange={(e) => e.target.value && db.profile.update("me", { quitAt: new Date(e.target.value).getTime() })}
          />
        </div>
        <div>
          <Label>Gasto por semana (USD)</Label>
          <input
            inputMode="decimal"
            defaultValue={profile.weeklySpend}
            onBlur={(e) => db.profile.update("me", { weeklySpend: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </Card>

      <Card className="space-y-1">
        <Toggle on={settings.tts} onChange={(v) => saveSettings({ tts: v })} label="Voz en las meditaciones" />
        <Toggle on={settings.cues} onChange={(v) => saveSettings({ cues: v })} label="Tonos y vibración en la respiración" />
        <p className="text-xs text-mute">En iPhone la web no puede vibrar; por eso usamos un tono suave.</p>
      </Card>

      <Card className="space-y-3">
        <p className="font-medium">Mis porqués</p>
        <ReasonsEditor />
      </Card>

      <Card className="space-y-3">
        <p className="font-medium">Copia de seguridad cifrada</p>
        <p className="text-sm text-mute">Tus datos solo viven en este teléfono. Si lo pierdes o borras la app, se pierden. Haz una copia de vez en cuando.</p>
        <input type="password" placeholder="Contraseña de la copia" value={pass} onChange={(e) => setPass(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="soft" onClick={doExport}>
            Exportar
          </Btn>
          <label className={`min-h-14 rounded-2xl bg-card border border-line flex items-center justify-center text-lg ${pass ? "" : "opacity-40 pointer-events-none"}`}>
            Importar
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
          </label>
        </div>
        {msg && <p className="text-sm text-warm">{msg}</p>}
      </Card>

      <HelpLines />

      <Btn variant="danger" onClick={wipe}>
        Borrar todos mis datos
      </Btn>
      <p className="text-xs text-mute text-center pb-4">Maljut v0.1 · sin analítica · sin cuentas</p>
    </div>
  );
}
