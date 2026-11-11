import { useData, useT, useApp } from "../state";
import { domainLabel } from "./Dashboard";

export function History() {
  const tr = useT();
  const { lang } = useApp();
  const h = useData<any>("/training/history");
  return (
    <div>
      <h1>{tr("Historial de entrenamiento", "Training history")}</h1>
      <div className="card">
        <h3>{tr("Actividad diaria", "Daily activity")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(18px, 1fr))", gap: 3 }}>
          {(h.data?.byDay ?? []).slice().reverse().map((d: any) => <div key={d.day} title={`${d.day}: ${d.n} · ${Math.round(d.pct)}%`} style={{ aspectRatio: "1", borderRadius: 4, background: `rgba(57,135,229,${Math.min(1, 0.2 + d.n / 25)})` }} />)}
        </div>
        {!h.data?.byDay?.length && <p>{tr("Sin actividad todavía.", "No activity yet.")}</p>}
      </div>
      <div className="card">
        <h3>{tr("Sesiones", "Sessions")}</h3>
        <table><thead><tr><th>{tr("Día", "Day")}</th><th>{tr("Bloques", "Blocks")}</th><th>min</th><th>{tr("Objetivo", "Goal")}</th></tr></thead>
          <tbody>{(h.data?.sessions ?? []).map((s: any) => <tr key={s.day}><td>{String(s.day).slice(0, 10)}</td><td>{(s.completed_blocks ?? []).length}/{s.plan?.blocks?.length ?? 0}</td><td>{s.minutes}</td><td style={{ fontSize: ".8rem" }}>{s.plan?.objective}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h3>{tr("Últimos intentos", "Recent attempts")}</h3>
        <table><thead><tr><th>{tr("Fecha", "Date")}</th><th>{tr("Área", "Area")}</th><th>{tr("Tipo", "Type")}</th><th></th></tr></thead>
          <tbody>{(h.data?.attempts ?? []).slice(0, 60).map((a: any, i: number) => <tr key={i}><td>{new Date(a.created_at).toLocaleString()}</td><td>{domainLabel(a.domain, lang)}</td><td>{a.item_type}</td><td>{a.correct ? <span className="badge good">✓</span> : <span className="badge bad">✗</span>}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
