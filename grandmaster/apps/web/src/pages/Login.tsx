import { useState } from "react";
import { api } from "../api";
import { useApp, useT } from "../state";

export function Login() {
  const { refresh } = useApp();
  const tr = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { await api(`/auth/${mode}`, { body: { email, password } }); await refresh(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "12vh 20px" }}>
      <h1 style={{ color: "var(--gold-2)", fontSize: "2.1rem" }}>Grandmaster AI</h1>
      <p>{tr("Tu entrenador personal: de tus partidas reales a tus debilidades, de tus debilidades a un entrenamiento medible.", "Your personal coach: from your real games to your weaknesses, from weaknesses to measurable training.")}</p>
      <form className="card" onSubmit={submit} style={{ marginTop: 24 }}>
        <label htmlFor="em">Email</label>
        <input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="pw">{tr("Contraseña (mín. 8)", "Password (min 8)")}</label>
        <input id="pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="error">{err}</p>}
        <button className="btn primary" style={{ width: "100%", marginTop: 14 }}>{mode === "login" ? tr("Entrar", "Sign in") : tr("Crear cuenta", "Create account")}</button>
        <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 6 }} onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? tr("¿Nuevo? Crear cuenta", "New? Create account") : tr("Ya tengo cuenta", "I have an account")}
        </button>
      </form>
      <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Perfil inicial: 1650 Elo aprox., objetivo 2000+, Londres con blancas, Caro-Kann con negras, 60 min/día. Todo es editable.", "Initial profile: ~1650, goal 2000+, London as White, Caro-Kann as Black, 60 min/day. Everything is editable.")}</p>
    </div>
  );
}
