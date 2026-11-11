import { Link } from "react-router-dom";
import { useApp, useData, useT } from "../state";
import { api } from "../api";
import { useState } from "react";

export function Dashboard() {
  const tr = useT();
  const { me, lang } = useApp();
  const welcome = useData<any>("/coach/welcome");
  const plan = useData<any>("/training/plan");
  const ratings = useData<any>("/analytics/ratings?window=90d");
  const weak = useData<any>("/training/weaknesses");
  const integ = useData<any>("/integrations");
  const [busy, setBusy] = useState<string | null>(null);
  const p = me!.profile;
  const syncAll = async () => {
    setBusy(tr("Sincronizando…", "Syncing…"));
    for (const a of integ.data?.accounts ?? []) { try { await api(`/integrations/${a.platform}/sync`, { body: {} }); } catch { /* shown in settings */ } }
    try { await api("/games/analyze-recent", { body: { n: 10 } }); } catch { /* ignore */ }
    setBusy(null); ratings.reload(); integ.reload();
  };
  const blocks = plan.data?.plan?.blocks ?? [];
  const done: number[] = plan.data?.completed_blocks ?? [];
  return (
    <div>
      <h1>{tr("Hola", "Hello")}{p.display_name ? `, ${p.display_name}` : ""}</h1>
      <div className="card gold">
        <h3>{tr("Tu entrenador", "Your coach")}</h3>
        <p style={{ color: "var(--text)" }}>{welcome.data?.message ?? "…"}</p>
        <div className="row"><Link className="btn primary sm" to="/coach">{tr("Hablar con el coach", "Talk to the coach")}</Link><Link className="btn sm" to="/academy">{tr("Plan completo", "Full plan")}</Link></div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="row between"><h3>{tr("Entrenamiento de hoy", "Today's training")}</h3><span className="muted">{plan.data?.plan?.totalMinutes ?? "—"} min</span></div>
          {plan.data?.plan?.recovery && <span className="badge info">{tr("Día de recuperación", "Recovery day")}</span>}
          <p style={{ color: "var(--text)" }}>{plan.data?.plan?.objective}</p>
          <ul className="list">
            {blocks.map((b: any, i: number) => (
              <li key={i} className="row between">
                <Link to={`/${routeFor(b.activity)}`} style={{ color: done.includes(i) ? "var(--muted)" : "var(--text)", textDecoration: done.includes(i) ? "line-through" : "none" }}>{b.minutes}′ · {b.objective}</Link>
                {done.includes(i) ? <span className="badge good">✓</span> : <span className="badge">{domainLabel(b.domain, lang)}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>{tr("Debilidades principales", "Top weaknesses")}</h3>
          {weak.data?.weaknesses?.length ? (
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {weak.data.weaknesses.slice(0, 3).map((w: any) => <li key={w.id} style={{ margin: "6px 0" }}>{w.label[lang]} <small className="muted">({w.occurrences}× · {tr("índice", "score")} {w.score})</small></li>)}
            </ol>
          ) : <p>{tr("Aún no hay partidas analizadas. Conecta Chess.com/Lichess o sube un PGN.", "No analysed games yet. Connect Chess.com/Lichess or upload a PGN.")}</p>}
          <p className="muted" style={{ fontSize: ".78rem" }}>{tr(`Basado en ${weak.data?.gamesAnalysed ?? 0} partidas analizadas (90 días).`, `Based on ${weak.data?.gamesAnalysed ?? 0} analysed games (90 days).`)}</p>
          <Link className="btn sm" to="/tactics?mode=weakness">{tr("Cazador de debilidades", "Weakness hunter")}</Link>
        </div>
      </div>

      <div className="card">
        <div className="row between"><h3>{tr("Ratings (por sistema y ritmo)", "Ratings (by system & time control)")}</h3><Link to="/analytics" className="muted" style={{ fontSize: ".8rem" }}>{tr("Ver analítica", "Analytics")} →</Link></div>
        <div className="grid stats">
          {(ratings.data?.summaries ?? []).map((s: any) => (
            <div className="stat" key={s.pool}><div className="k">{s.label}</div><div className="v">{s.current ?? "—"}</div><div className="s">{tr("máx.", "peak")} {s.peak ?? "—"}{s.trend?.significant ? ` · ${s.trend.slopePer30d > 0 ? "▲" : "▼"} ${Math.abs(s.trend.slopePer30d)}/30d` : ""}</div></div>
          ))}
          <div className="stat"><div className="k">{tr("Objetivo", "Goal")}</div><div className="v" style={{ color: "var(--gold-2)" }}>{p.goal_rating}</div><div className="s">{tr("estimación actual", "current estimate")} {p.rating_estimate}</div></div>
        </div>
        {!ratings.data?.summaries?.length && <p>{tr("Sin datos de rating todavía.", "No rating data yet.")}</p>}
      </div>

      <div className="card">
        <div className="row between">
          <h3>{tr("Sincronización", "Sync")}</h3>
          <button className="btn sm" disabled={!!busy || !integ.data?.accounts?.length} onClick={syncAll}>{busy ?? tr("Sincronizar y analizar", "Sync & analyse")}</button>
        </div>
        {(integ.data?.accounts ?? []).map((a: any) => <p key={a.platform} style={{ margin: "2px 0" }}>{a.platform === "chesscom" ? "Chess.com" : "Lichess"}: <b>{a.username}</b> · {a.games_imported} {tr("partidas", "games")} · {a.last_sync_at ? new Date(a.last_sync_at).toLocaleString() : tr("nunca", "never")}</p>)}
        {!integ.data?.accounts?.length && <Link className="btn sm" to="/settings">{tr("Conectar cuentas", "Connect accounts")}</Link>}
      </div>
    </div>
  );
}

export function routeFor(activity: string) {
  return ({ tactics: "tactics", calculation: "tactics?mode=calculation", "blunder-prevention": "tactics?mode=threats", openings: "openings", "think-like-gm": "coach?socratic=1", endgames: "endgames", review: "tactics?mode=review", tournament: "play" } as Record<string, string>)[activity] ?? "academy";
}
export function domainLabel(d: string, lang: "es" | "en") {
  const m: Record<string, [string, string]> = { tactics: ["Táctica", "Tactics"], calculation: ["Cálculo", "Calculation"], threat_awareness: ["Amenazas", "Threats"], openings: ["Aperturas", "Openings"], positional: ["Posicional", "Positional"], endgames: ["Finales", "Endgames"], review: ["Repaso", "Review"], time_management: ["Tiempo", "Time"] };
  return (m[d] ?? [d, d])[lang === "es" ? 0 : 1];
}
