import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../store";
import { Btn } from "../kit";

/** Reduce la foto a 1080 px de lado mayor en JPEG para no llenar el teléfono. */
async function resize(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, 1080 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ReasonsEditor() {
  const reasons = useLiveQuery(() => db.reasons.toArray(), []) ?? [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const addText = async () => {
    if (!text.trim()) return;
    await db.reasons.add({ at: Date.now(), text: text.trim() });
    setText("");
  };

  const addPhoto = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      await db.reasons.add({ at: Date.now(), photo: await resize(f), text: text.trim() || undefined });
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quiero despertar con la cabeza clara. Quiero que mi plata vaya a…"
      />
      <div className="grid grid-cols-2 gap-2">
        <Btn variant="soft" onClick={addText} disabled={!text.trim()}>
          Añadir texto
        </Btn>
        <label className="min-h-14 rounded-2xl bg-card border border-line flex items-center justify-center text-lg active:scale-[0.98]">
          {busy ? "…" : "Añadir foto"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0])} />
        </label>
      </div>
      {reasons.map((r) => (
        <div key={r.id} className="flex gap-3 items-start rounded-2xl bg-card border border-line p-3">
          {r.photo && <img src={r.photo} alt="" className="h-16 w-16 rounded-xl object-cover" />}
          <p className="flex-1 text-sm">{r.text}</p>
          <button className="text-mute px-2 h-10" onClick={() => r.id && db.reasons.delete(r.id)} aria-label="Borrar">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
