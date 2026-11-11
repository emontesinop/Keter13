import { useState } from "react";
import { useData, useT } from "../state";
import { LineChart, Bars } from "../components/LineChart";
import { domainLabel } from "./Dashboard";
import { useApp } from "../state";

const WINDOWS = ["7d", "30d", "90d", "6m", "1y", "all"];

export function Analytics() {
  const tr = useT();
  const { lang } = useApp();
  const [w, setW] = useState("90d");
  const r = useData<any>(`/analytics/ratings?window=${w}`, [w]);
  const p = useData<any>(`/analytics/performance?window=${w}`, [w]);
  const rep = useData<any>("/analytics/weekly-report");
  const [table, setTable] = useState(false);
  return (
    <div>
      <h1>{tr("Analítica de rendimiento", "Performance analytics")}</h1>
      <div className="chips" style={{ marginBottom: 12 }}>{WINDOWS.map((x) => <button key={x} className={`chip ${w === x ? "on" : ""}`} onClick={() => setW(x)}>{x === "all" ? tr("Todo", "All") : x}</button>)}</div>
      <div className="card gold">
        <h3>{tr("Informe del coach (últimos 30 días)", "Coach report (last 30 days)")}</h3>
        {(rep.data?.lines ?? []).map((l: string, i: number) => <p key={i} style={{ color: "var(--text)" }}>{l}</p>)}
      </div>

      <div className="card">
        <div className="row between"><h3>{tr("Ratings por sistema y ritmo", "Ratings by system & time control")}</h3><button className="btn sm ghost" onClick={() => setTable(!table)}>{table ? tr("Gráficos", "Charts") : tr("Tabla", "Table")}</button></div>
        <p className="muted" style={{ fontSize: ".8rem" }}>{r.data?.disclaimer}</p>
        {table ? (
          <table><thead><tr><th>{tr("Grupo", "Pool")}</th><th>{tr("Actual", "Current")}</th><th>{tr("Máx.", "Peak")}</th><th>EWMA</th><th>{tr("Volatilidad", "Volatility")}</th><th>{tr("Tendencia/30d", "Trend/30d")}</th><th>n</th></tr></thead>
            <tbody>{(r.data?.summaries ?? []).map((s: any) => <tr key={s.pool}><td>{s.label}</td><td>{s.current ?? "—"}</td><td>{s.peak ?? "—"}</td><td>{s.smoothed ?? "—"}</td><td>{s.volatility ?? "—"}</td><td>{s.trend ? `${s.trend.slopePer30d} ±${s.trend.stderr}${s.trend.significant ? "" : " (n.s.)"}` : "—"}</td><td>{s.samples}</td></tr>)}</tbody></table>
        ) : (
          <div className="grid two">
            {(r.data?.summaries ?? []).map((s: any) => {
              const pts = (r.data.points as any[]).filter((x) => x.pool === s.pool).map((x) => ({ x: new Date(x.at).getTime(), y: x.rating }));
              return (
                <div key={s.pool}>
                  <div className="row between"><b>{s.label}</b><span className="muted" style={{ fontSize: ".8rem" }}>{s.current} · {tr("máx.", "peak")} {s.peak}</span></div>
                  <LineChart points={pts} ariaLabel={`${s.label} rating`} />
                  <small className="muted">{s.trend ? (s.trend.significant ? tr(`Tendencia significativa: ${s.trend.slopePer30d > 0 ? "+" : ""}${s.trend.slopePer30d}/30 días`, `Significant trend: ${s.trend.slopePer30d > 0 ? "+" : ""}${s.trend.slopePer30d}/30 days`) : tr("Sin tendencia estadísticamente clara (ruido normal).", "No statistically clear trend (normal noise).")) : tr("Pocos datos.", "Few data points.")}</small>
                </div>
              );
            })}
          </div>
        )}
        {!r.data?.summaries?.length && <p>{tr("Sin datos de rating.", "No rating data.")}</p>}
      </div>

      <div className="card">
        <h3>{tr("Fuerza de juego estimada (no oficial)", "Estimated playing strength (unofficial)")}</h3>
        {(r.data?.estimates ?? []).length ? (
          <div className="grid stats">{r.data.estimates.map((e: any) => <div key={e.pool} className="stat"><div className="k">{e.label}</div><div className="v">{e.performance.estimate}</div><div className="s">95%: {e.performance.low}–{e.performance.high} · n={e.performance.n}</div></div>)}</div>
        ) : <p>{tr("Se necesitan ≥10 partidas puntuables con rating rival en un mismo grupo.", "Needs ≥10 rated games with opponent rating in one pool.")}</p>}
      </div>

      <div className="grid two">
        <div className="card">
          <h3>{tr("Resultados", "Results")}</h3>
          <div className="grid stats">
            <div className="stat"><div className="k">{tr("Partidas", "Games")}</div><div className="v">{p.data?.results?.games ?? 0}</div></div>
            <div className="stat"><div className="k">{tr("Victorias", "Wins")}</div><div className="v">{p.data?.results?.winPct ?? "—"}%</div></div>
            <div className="stat"><div className="k">{tr("Tablas", "Draws")}</div><div className="v">{p.data?.results?.drawPct ?? "—"}%</div></div>
            <div className="stat"><div className="k">{tr("Derrotas", "Losses")}</div><div className="v">{p.data?.results?.lossPct ?? "—"}%</div></div>
          </div>
        </div>
        <div className="card">
          <h3>{tr("Calidad de juego", "Play quality")} <small className="muted">({p.data?.analysed ?? 0} {tr("analizadas", "analysed")})</small></h3>
          <div className="grid stats">
            <div className="stat"><div className="k">{tr("Precisión", "Accuracy")}</div><div className="v">{p.data?.accuracy?.avg ?? "—"}%</div></div>
            <div className="stat"><div className="k">ACPL</div><div className="v">{p.data?.perGame?.acpl ?? "—"}</div></div>
            <div className="stat"><div className="k">{tr("Graves/partida", "Blunders/game")}</div><div className="v">{p.data?.perGame?.blunders ?? "—"}</div></div>
            <div className="stat"><div className="k">{tr("Errores/partida", "Mistakes/game")}</div><div className="v">{p.data?.perGame?.mistakes ?? "—"}</div></div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>{tr("Precisión por partida", "Accuracy per game")}</h3>
        <LineChart points={(p.data?.accuracy?.series ?? []).filter((s: any) => s.accuracy !== null && s.at).map((s: any) => ({ x: new Date(s.at).getTime(), y: s.accuracy }))} ariaLabel="accuracy" color="#3987e5" yFormat={(v) => `${Math.round(v)}%`} />
      </div>
      <div className="grid two">
        <div className="card">
          <h3>{tr("Por fase", "By phase")}</h3>
          <Bars items={[{ label: tr("Apertura", "Opening"), value: p.data?.phases?.opening ?? null }, { label: tr("Medio juego", "Middlegame"), value: p.data?.phases?.middlegame ?? null }, { label: tr("Final", "Endgame"), value: p.data?.phases?.endgame ?? null }]} />
          <p className="muted" style={{ fontSize: ".78rem" }}>{tr("Precisión media del motor en cada fase.", "Average engine accuracy per phase.")}</p>
        </div>
        <div className="card">
          <h3>{tr("Entrenamiento", "Training")}</h3>
          <Bars items={(p.data?.training?.byDomain ?? []).map((d: any) => ({ label: `${domainLabel(d.domain, lang)} (n=${d.n})`, value: Math.round(d.pct) }))} />
          <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Racha", "Streak")}: {p.data?.training?.streak ?? 0} · {tr("días activos (30d)", "active days (30d)")}: {p.data?.training?.activeDays30 ?? 0}</p>
          <p className="muted" style={{ fontSize: ".8rem" }}>{tr("Tiempo: errores rápidos/partida", "Time: fast errors/game")} {p.data?.time?.fastErrorsPerGame ?? "—"} · {tr("en apuros", "in time trouble")} {p.data?.time?.timeTroubleErrorsPerGame ?? "—"}</p>
        </div>
      </div>
      <div className="card">
        <h3>{tr("Aperturas", "Openings")}</h3>
        <table><thead><tr><th>{tr("Línea", "Line")}</th><th>N</th><th>V/T/D %</th></tr></thead><tbody>{(p.data?.openings ?? []).slice(0, 15).map((o: any) => <tr key={o.opening}><td>{o.opening}</td><td>{o.games}</td><td>{o.winPct}/{o.drawPct}/{o.lossPct}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
