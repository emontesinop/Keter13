/**
 * Señales físicas. En iPhone la web no puede vibrar, así que usamos un tono suave
 * (Web Audio) y la animación visual. En Android también vibra.
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setCuesEnabled(v: boolean) {
  enabled = v;
}

/** Llamar dentro de un toque del usuario (iOS exige un gesto para activar el audio). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function cue(kind: "in" | "out" | "hold" | "done" = "in") {
  if (!enabled) return;
  try {
    navigator.vibrate?.(kind === "done" ? [40, 60, 40] : 25);
  } catch {
    /* sin vibración */
  }
  if (!ctx) return;
  const freq = { in: 396, out: 264, hold: 330, done: 528 }[kind];
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.65);
}
