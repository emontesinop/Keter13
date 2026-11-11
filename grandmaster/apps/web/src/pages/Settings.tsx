import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp, useData, useT } from "../state";

export function Settings() {
  const tr = useT();
  const { me, refresh } = useApp();
  const [params] = useSearchParams();
  const integ = useData<any>("/integrations");
  const [p, setP] = useState<any>(me!.profile);
  const [saved, setSaved] = useState<string | null>(null);
  const [cc, setCc] = useState(""); const [li, setLi] = useState(""); const [study, setStudy] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [fide, setFide] = useState({ rating: "", at: new Date().toISOString().slice(0, 10) });
  useEffect(() => { if (params.get("lichess")) setMsg((m) => ({ ...m, lichess: params.get("lichess") === "connected" ? tr("Lichess conectado mediante OAuth.", "Lichess connected via OAuth.") : tr("Autorización denegada.", "Authorisation denied.") })); }, [params]);
  const set = (k: string, v: any) => setP((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaved(null);
    try {
      const body: any = {}; for (const k of ["display_name", "rating_estimate", "goal_rating", "long_term_goal", "minutes_per_day", "primary_platform", "secondary_platform", "language", "secondary_language", "learning_preference", "training_style", "thresholds", "engine_depth", "sync_frequency", "fide_id"]) body[k] = p[k];
      await api("/profile", { method: "PUT", body }); await refresh(); setSaved(tr("Guardado", "Saved"));
    } catch (e) { setSaved((e as Error).message); }
  };
  const act = async (key: string, fn: () => Promise<any>, ok: (r: any) => string) => { setMsg((m) => ({ ...m, [key]: "…" })); try { const r = await fn(); setMsg((m) => ({ ...m, [key]: ok(r) })); integ.reload(); } catch (e) { setMsg((m) => ({ ...m, [key]: "⚠ " + (e as Error).message })); } };
  const acc = (pl: string) => integ.data?.accounts?.find((a: any) => a.platform === pl);
  const num = (k: string) => (e: any) => set(k, Number(e.target.value));
  return (
    <div>
      <h1>{tr("Ajustes e integraciones", "Settings & integrations")}</h1>
      <div className="card">
        <h3>Chess.com</h3>
        {acc("chesscom") ? <p>{tr("Conectado", "Connected")}: <b>{acc("chesscom").username}</b> · {acc("chesscom").games_imported} {tr("partidas", "games")} · {acc("chesscom").status}{acc("chesscom").last_error ? ` · ⚠ ${acc("chesscom").last_error}` : ""}</p>
          : <div className="row" style={{ flexWrap: "nowrap" }}><input placeholder={tr("usuario de Chess.com", "Chess.com username")} value={cc} onChange={(e) => setCc(e.target.value)} /><button className="btn primary sm" onClick={() => void act("cc", () => api("/integrations/chesscom", { body: { username: cc } }), (r) => tr(`Conectado: ${r.username}`, `Connected: ${r.username}`))}>{tr("Conectar", "Connect")}</button></div>}
        {acc("chesscom") && <div className="row"><button className="btn sm" onClick={() => void act("cc", () => api("/integrations/chesscom/sync", { body: {} }), (r) => tr(`+${r.imported} partidas, ${r.ratingPoints} puntos de rating, ${r.archivesChecked} meses revisados`, `+${r.imported} games, ${r.ratingPoints} rating points, ${r.archivesChecked} months checked`))}>{tr("Importar / sincronizar", "Import / sync")}</button><button className="btn sm danger" onClick={() => void act("cc", () => api("/integrations/chesscom", { method: "DELETE" }), () => tr("Desconectado", "Disconnected"))}>{tr("Desconectar", "Disconnect")}</button></div>}
        {msg.cc && <p className="muted">{msg.cc}</p>}
        <p className="muted" style={{ fontSize: ".78rem" }}>{tr("Usa la API pública oficial (Published-Data API): solo datos públicos, sin contraseña. Los meses completos se descargan una vez; el mes actual se revisa con ETag.", "Uses the official public Published-Data API: public data only, no password. Complete months are downloaded once; the current month is checked with ETag.")}</p>
      </div>
      <div className="card">
        <h3>Lichess</h3>
        {acc("lichess") ? <p>{tr("Conectado", "Connected")}: <b>{acc("lichess").username}</b> {acc("lichess").has_token ? <span className="badge good">OAuth</span> : <span className="badge">{tr("público", "public")}</span>} · {acc("lichess").games_imported} {tr("partidas", "games")}{acc("lichess").last_error ? ` · ⚠ ${acc("lichess").last_error}` : ""}</p>
          : <div className="row" style={{ flexWrap: "nowrap" }}><input placeholder={tr("usuario de Lichess", "Lichess username")} value={li} onChange={(e) => setLi(e.target.value)} /><button className="btn sm" onClick={() => void act("li", () => api("/integrations/lichess", { body: { username: li } }), (r) => tr(`Conectado (público): ${r.username}`, `Connected (public): ${r.username}`))}>{tr("Conectar (público)", "Connect (public)")}</button></div>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn sm primary" onClick={() => void act("li", async () => { const r = await api("/integrations/lichess/oauth/start"); window.location.href = r.url; }, () => "…")}>{tr("Conectar con OAuth (estudios, explorador)", "Connect with OAuth (studies, explorer)")}</button>
          {acc("lichess") && <button className="btn sm" onClick={() => void act("li", () => api("/integrations/lichess/sync", { body: {} }), (r) => tr(`+${r.imported} partidas, ${r.ratingPoints} puntos de rating`, `+${r.imported} games, ${r.ratingPoints} rating points`))}>{tr("Importar / sincronizar", "Import / sync")}</button>}
          {acc("lichess") && <button className="btn sm danger" onClick={() => void act("li", () => api("/integrations/lichess", { method: "DELETE" }), () => tr("Desconectado", "Disconnected"))}>{tr("Desconectar", "Disconnect")}</button>}
        </div>
        {acc("lichess")?.has_token && <div className="row" style={{ marginTop: 6, flexWrap: "nowrap" }}><input placeholder={tr("ID de estudio (8 caracteres)", "Study ID (8 chars)")} value={study} onChange={(e) => setStudy(e.target.value)} /><button className="btn sm" onClick={() => void act("li", () => api("/integrations/lichess/study", { body: { studyId: study } }), (r) => tr(`${r.imported} capítulos importados`, `${r.imported} chapters imported`))}>{tr("Importar estudio", "Import study")}</button></div>}
        {msg.li && <p className="muted">{msg.li}</p>}{msg.lichess && <p className="ok">{msg.lichess}</p>}
      </div>
      <div className="card">
        <h3>{tr("Sincronización automática", "Automatic sync")}</h3>
        <select value={p.sync_frequency} onChange={(e) => set("sync_frequency", e.target.value)}><option value="manual">{tr("Manual", "Manual")}</option><option value="hourly">{tr("Cada hora", "Hourly")}</option><option value="daily">{tr("Diaria", "Daily")}</option></select>
      </div>
      <div className="card">
        <h3>{tr("Perfil de entrenamiento", "Training profile")}</h3>
        <div className="grid two">
          <div><label>{tr("Nombre", "Name")}</label><input value={p.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} /></div>
          <div><label>{tr("Rating aproximado", "Approx. rating")}</label><input type="number" value={p.rating_estimate} onChange={num("rating_estimate")} /></div>
          <div><label>{tr("Objetivo", "Goal")}</label><input type="number" value={p.goal_rating} onChange={num("goal_rating")} /></div>
          <div><label>{tr("Objetivo a largo plazo", "Long-term goal")}</label><input type="number" value={p.long_term_goal} onChange={num("long_term_goal")} /></div>
          <div><label>{tr("Minutos al día", "Minutes per day")}</label><input type="number" value={p.minutes_per_day} onChange={num("minutes_per_day")} /></div>
          <div><label>{tr("Plataforma principal", "Primary platform")}</label><select value={p.primary_platform} onChange={(e) => set("primary_platform", e.target.value)}><option value="chesscom">Chess.com</option><option value="lichess">Lichess</option></select></div>
          <div><label>{tr("Repertorio", "Repertoire")}</label><a className="btn sm" href="/openings">★ {(p.repertoire_ids ?? []).length} {tr("módulos — editar en Aperturas", "modules — edit in Openings")}</a></div>
          <div><label>{tr("Idioma", "Language")}</label><select value={p.language} onChange={(e) => set("language", e.target.value)}><option value="es">Español</option><option value="en">English</option></select></div>
          <div><label>{tr("Profundidad de análisis (servidor)", "Analysis depth (server)")}</label><input type="number" min={8} max={30} value={p.engine_depth} onChange={num("engine_depth")} /></div>
          <div><label>FIDE ID</label><input value={p.fide_id ?? ""} onChange={(e) => set("fide_id", e.target.value || null)} /></div>
        </div>
        <h3 style={{ marginTop: 14 }}>{tr("Umbrales de clasificación (puntos de % de victoria)", "Classification thresholds (win% points)")}</h3>
        <div className="grid stats">
          {(["inaccuracy", "mistake", "blunder"] as const).map((k) => <div key={k}><label>{k}</label><input type="number" value={p.thresholds[k]} onChange={(e) => set("thresholds", { ...p.thresholds, [k]: Number(e.target.value) })} /></div>)}
        </div>
        <p className="muted" style={{ fontSize: ".78rem" }}>{tr("La pérdida de probabilidad de victoria (modelo del motor) no captura todo: riesgo práctico, tiempo y complejidad también cuentan.", "Win-probability loss (an engine model) doesn't capture everything: practical risk, time and complexity matter too.")}</p>
        <button className="btn primary" onClick={() => void save()}>{tr("Guardar", "Save")}</button> {saved && <span className="muted">{saved}</span>}
      </div>
      <div className="card">
        <h3>{tr("Rating FIDE (manual)", "FIDE rating (manual)")}</h3>
        <div className="row" style={{ flexWrap: "nowrap" }}><input type="number" placeholder="1700" value={fide.rating} onChange={(e) => setFide({ ...fide, rating: e.target.value })} /><input type="date" value={fide.at} onChange={(e) => setFide({ ...fide, at: e.target.value })} /><button className="btn sm" onClick={() => void act("fide", () => api("/ratings/manual", { body: { pool: "fide_standard", rating: Number(fide.rating), at: fide.at } }), () => tr("Añadido", "Added"))}>+</button></div>
        {msg.fide && <p className="muted">{msg.fide}</p>}
        <p className="muted" style={{ fontSize: ".78rem" }}>{tr("FIDE no ofrece una API pública para esto: introduce tu rating oficial publicado.", "FIDE offers no public API for this: enter your published official rating.")}</p>
      </div>
      <div className="card">
        <h3>{tr("Tus datos", "Your data")}</h3>
        <div className="row">
          <a className="btn sm" href="/api/export">{tr("Exportar todo (JSON)", "Export everything (JSON)")}</a>
          <button className="btn sm" onClick={async () => { await api("/auth/logout", { body: {} }); await refresh(); }}>{tr("Cerrar sesión", "Sign out")}</button>
          <button className="btn sm danger" onClick={async () => { if (prompt(tr("Escribe DELETE para borrar tu cuenta y todos tus datos", "Type DELETE to erase your account and all data")) === "DELETE") { await api("/account", { method: "DELETE", body: { confirm: "DELETE" } }); await refresh(); } }}>{tr("Borrar cuenta", "Delete account")}</button>
        </div>
        <p className="muted" style={{ fontSize: ".78rem" }}>{tr("Motor", "Engine")}: {me!.engine} · IA: {me!.llm ?? tr("no configurada (modo motor verificado)", "not configured (verified engine mode)")}</p>
      </div>
    </div>
  );
}
