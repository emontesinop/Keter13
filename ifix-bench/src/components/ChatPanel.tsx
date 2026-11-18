"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { clearChat } from "@/app/ia-actions";
import { cn } from "@/lib/format";

type Msg = { id: string; rol: string; contenido: string };

const QUICK = [
  "¿Cuál es el siguiente paso de diagnóstico?",
  "Interpreta mis mediciones registradas",
  "¿Qué causas son más probables con este consumo?",
  "Redacta una explicación breve para el cliente",
];

export function ChatPanel({ orderId, initial }: { orderId: string; initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const send = async (q: string) => {
    const message = q.trim();
    if (!message || busy) return;
    setBusy(true);
    setText("");
    const aid = `a-${Date.now()}`;
    setMsgs((m) => [...m, { id: `u-${Date.now()}`, rol: "user", contenido: message }, { id: aid, rol: "assistant", contenido: "" }]);
    const append = (t: string) => setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, contenido: x.contenido + t } : x)));
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, message }) });
      if (!res.ok || !res.body) {
        append(`⚠ ${await res.text()}`);
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          append(dec.decode(value, { stream: true }));
        }
      }
    } catch {
      append("⚠ Se perdió la conexión con la app.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-bench-line bg-bench-bg p-3">
        {msgs.length === 0 && <p className="muted p-2">Pregunta lo que necesites sobre esta orden. El asistente ve el modelo, los síntomas, el checklist, el diagnóstico, el consumo DC, tus mediciones y tus casos anteriores.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn("max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-lg", m.rol === "user" ? "ml-auto bg-bench-accent text-black" : "bg-bench-card")}>
            {m.contenido || (busy ? "…" : "")}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={busy} className="chip text-sm" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          className="input min-h-[3.5rem] flex-1"
          rows={2}
          placeholder="Escribe tu pregunta…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary px-6" aria-label="Enviar">
          <Send className="h-6 w-6" />
        </button>
      </form>
      {msgs.length > 0 && (
        <button
          type="button"
          className="text-sm text-bench-muted hover:text-red-400"
          onClick={async () => {
            if (!confirm("¿Borrar la conversación de esta orden?")) return;
            await clearChat(orderId);
            setMsgs([]);
          }}
        >
          <Trash2 className="mr-1 inline h-4 w-4" /> Borrar conversación
        </button>
      )}
    </div>
  );
}
