import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp, useData, useT } from "../state";
import { routeFor, domainLabel } from "./Dashboard";

export function Academy() {
  const tr = useT();
  const { lang } = useApp();
  const plan = useData<any>("/training/plan");
  const weekly = useData<any>("/training/weekly");
  const cur = useData<any>("/training/curriculum");
  const diag = useData<any>("/training/diagnostics");
  const done: number[] = plan.data?.completed_blocks ?? [];
  const complete = async (i: number, minutes: number) => { await api("/training/plan/block", { body: { day: plan.data.day?.slice?.(0, 10) ?? new Date().toISOString().slice(0, 10), index: i, minutes } }); plan.reload(); };
  const modes = [
    ["/play?mode=self", tr("Juega contra ti mismo", "Play against yourself"), tr("Repite tus partidas e intenta mejorar tus decisiones.", "Replay your games and improve your decisions.")],
    ["/tactics?mode=challenge", tr("Desafío GM", "Grandmaster challenge"), tr("Posiciones difíciles ajustadas a tu nivel real.", "Hard positions matched to your real level.")],
    ["/coach?socratic=1", tr("Piensa como un GM", "Think like a GM"), tr("Analiza sin motor, explica tu plan y compáralo.", "Analyse without engine, explain your plan, compare.")],
    ["/tactics?mode=threats", tr("Prevención de errores", "Blunder prevention"), tr("Identifica la amenaza del rival antes de cada jugada.", "Identify the opponent's threat before each move.")],
    ["/play?mode=opening", tr("Supervivencia en la apertura", "Opening survival"), tr("Juega variantes inesperadas contra el motor.", "Play unexpected lines against the engine.")],
    ["/endgames", tr("Supervivencia en el final", "Endgame survival"), tr("Defiende posiciones difíciles contra el motor.", "Defend tough positions against the engine.")],
    ["/play?mode=tournament", tr("Simulación de torneo", "Tournament simulation"), tr("Ritmo real + evaluación posterior.", "Real clock + post-game assessment.")],
    ["/tactics?mode=weakness", tr("Cazador de debilidades", "Weakness hunter"), tr("Ejercicios sobre tus 3 debilidades más dañinas.", "Exercises on your 3 most damaging weaknesses.")],
    ["/tactics?mode=calculation", tr("Cálculo a ciegas", "Blind calculation"), tr("Calcula variantes sin mover piezas.", "Calculate lines without moving pieces.")],
    ["/masters", tr("Comparación con maestros", "Master comparison"), tr("¿Qué jugarías tú? Compara con el maestro y el motor.", "What would you play? Compare with the master and engine.")],
  ];
  return (
    <div>
      <h1>{tr("Academia", "Training Academy")}</h1>
      <div className="card gold">
        <div className="row between"><h3>{tr("Plan de hoy", "Today's plan")}</h3><span className="muted">{plan.data?.plan?.totalMinutes} min</span></div>
        <p style={{ color: "var(--text)" }}>{plan.data?.plan?.objective}</p>
        {(plan.data?.plan?.rationale ?? []).map((r: string, i: number) => <p key={i} style={{ fontSize: ".85rem" }}>• {r}</p>)}
        <ul className="list">
          {(plan.data?.plan?.blocks ?? []).map((b: any, i: number) => (
            <li key={i}>
              <div className="row between">
                <b>{b.minutes}′ {domainLabel(b.domain, lang)}</b>
                {done.includes(i) ? <span className="badge good">✓ {tr("hecho", "done")}</span> : <div className="row"><Link className="btn sm primary" to={`/${routeFor(b.activity)}`}>{tr("Empezar", "Start")}</Link><button className="btn sm" onClick={() => void complete(i, b.minutes)}>✓</button></div>}
              </div>
              <p style={{ margin: "4px 0 0" }}>{b.objective}</p>
              <small className="muted">{tr("Medible", "Measurable")}: {b.measurable}{b.linkedWeakness ? ` · ${tr("ligado a", "linked to")}: ${b.linkedWeakness}` : ""}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>{tr("Modos avanzados", "Advanced modes")}</h3>
        <div className="grid two">
          {modes.map(([to, t, d]) => <Link key={to} to={to} className="stat" style={{ color: "var(--text)" }}><b>{t}</b><div className="s">{d}</div></Link>)}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>{tr("Semana", "This week")}</h3>
          <ul className="list">{(weekly.data?.themes ?? []).map((t: any) => <li key={t.day}><b>{tr("Día", "Day")} {t.day}</b> · {t.theme}{t.focusWeakness ? <small className="muted"> — {t.focusWeakness}</small> : null}</li>)}</ul>
        </div>
        <div className="card">
          <h3>{tr("Diagnóstico del próximo hito", "Next milestone diagnostic")}: {diag.data?.milestone}</h3>
          <table><thead><tr><th>{tr("Habilidad", "Skill")}</th><th>{tr("Objetivo", "Target")}</th><th>{tr("Tú", "You")}</th></tr></thead>
            <tbody>{(diag.data?.items ?? []).map((it: any) => <tr key={it.domain}><td>{it.label[lang]}</td><td>{it.target}{it.unit === "%" ? "%" : ""}</td><td>{it.value ?? "—"} {it.passed ? <span className="badge good">✓</span> : null}</td></tr>)}</tbody></table>
          <p className="muted" style={{ fontSize: ".78rem" }}>{diag.data?.note} {tr("Un hito de rating desbloquea este diagnóstico; no es una insignia.", "A rating milestone unlocks this diagnostic; it's not a badge.")}</p>
        </div>
      </div>

      <div className="card">
        <h3>{tr("Currículo por etapas", "Staged curriculum")}</h3>
        {(cur.data?.stages ?? []).map((s: any) => (
          <details key={s.id} open={cur.data?.current?.id === s.id} style={{ marginBottom: 8 }}>
            <summary style={{ cursor: "pointer" }}><b>{tr("Etapa", "Stage")} {s.id}: {s.range[0]}–{s.range[1]}</b> · {s.title[lang]} {cur.data?.current?.id === s.id && <span className="badge info">{tr("actual", "current")}</span>}</summary>
            <ul>{s.goals.map((g: any, i: number) => <li key={i}>{g[lang]}</li>)}</ul>
          </details>
        ))}
        <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Las etapas son orientativas: lo que se entrena se decide por tus habilidades demostradas en partidas y ejercicios.", "Stages are a guide: what you train is decided by abilities demonstrated in games and exercises.")}</p>
      </div>

      <div className="card">
        <h3>{tr("Hoja de ruta a largo plazo (GM)", "Long-term roadmap (GM)")}</h3>
        <div className="row" style={{ marginBottom: 8 }}>{(cur.data?.milestones ?? []).map((m: any) => <span key={m.milestone} className={`badge ${m.reached ? "good" : ""}`}>{m.milestone}</span>)}</div>
        <ul>{(cur.data?.roadmap ?? []).map((r: string, i: number) => <li key={i} style={{ margin: "4px 0", color: "var(--text-2)" }}>{r}</li>)}</ul>
      </div>
    </div>
  );
}
