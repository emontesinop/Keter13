/** Lectura en voz alta con la Web Speech API. Prefiere voces en español de EE. UU./México. */
let enabled = true;

export function setTtsEnabled(v: boolean) {
  enabled = v;
  if (!v) stopSpeaking();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const pref = ["es-US", "es-MX", "es-419", "es-ES"];
  for (const p of pref) {
    const v = voices.find((x) => x.lang.replace("_", "-") === p);
    if (v) return v;
  }
  return voices.find((x) => x.lang.startsWith("es"));
}

export function speak(text: string) {
  if (!enabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? "es-US";
  u.rate = 0.92;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
