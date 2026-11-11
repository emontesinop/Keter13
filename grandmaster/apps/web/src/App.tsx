import { useState } from "react";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import { useApp, useT } from "./state";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Coach } from "./pages/Coach";
import { Academy } from "./pages/Academy";
import { Games, GameView } from "./pages/Games";
import { AnalysisBoard } from "./pages/AnalysisBoard";
import { Openings } from "./pages/Openings";
import { Tactics } from "./pages/Tactics";
import { Endgames } from "./pages/Endgames";
import { Analytics } from "./pages/Analytics";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Masters } from "./pages/Masters";
import { Play } from "./pages/Play";

export function App() {
  const { me, loading } = useApp();
  const tr = useT();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  if (loading) return <div className="center" style={{ padding: 80 }}><span className="muted">…</span></div>;
  if (!me) return <Login />;

  const primary = [
    { to: "/", ico: "◆", label: tr("Inicio", "Home") },
    { to: "/coach", ico: "♛", label: tr("Coach GM", "GM Coach") },
    { to: "/academy", ico: "▤", label: tr("Academia", "Academy") },
    { to: "/games", ico: "♞", label: tr("Partidas", "Games") },
  ];
  const secondary = [
    { to: "/openings", ico: "♙", label: tr("Aperturas", "Openings") },
    { to: "/tactics", ico: "⚡", label: tr("Táctica", "Tactics") },
    { to: "/endgames", ico: "♚", label: tr("Finales", "Endgames") },
    { to: "/analytics", ico: "📈", label: tr("Analítica", "Analytics") },
    { to: "/history", ico: "🗓", label: tr("Historial", "History") },
    { to: "/settings", ico: "⚙", label: tr("Ajustes", "Settings") },
    { to: "/board", ico: "⊞", label: tr("Tablero", "Board") },
    { to: "/masters", ico: "🏛", label: tr("Maestros", "Masters") },
    { to: "/play", ico: "⏱", label: tr("Jugar", "Play") },
  ];
  return (
    <div className="app">
      <nav className="tabbar" aria-label="Main">
        <div className="desk-only brand" style={{ fontFamily: "var(--serif)", color: "var(--gold-2)", fontSize: "1.2rem", padding: "6px 12px 14px" }}>Grandmaster AI</div>
        {primary.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><span className="ico">{l.ico}</span>{l.label}</NavLink>
        ))}
        <button className={`more-btn ${secondary.some((s) => loc.pathname.startsWith(s.to)) ? "active" : ""}`} onClick={() => setMore(true)}><span className="ico">⋯</span>{tr("Más", "More")}</button>
        {secondary.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => `desk-only ${isActive ? "active" : ""}`}><span className="ico">{l.ico}</span>{l.label}</NavLink>
        ))}
      </nav>
      <div className="content-col">
        <header className="topbar">
          <Link to="/" className="brand">Grandmaster AI</Link>
          <span className="spacer" />
          <span className="badge" title="Engine">{me.engine.includes("WASM") ? "SF 18" : "SF"}</span>
          <span className={`badge ${me.llm ? "good" : ""}`} title="AI">{me.llm ? "IA" : tr("IA: modo motor", "AI: engine mode")}</span>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameView />} />
            <Route path="/board" element={<AnalysisBoard />} />
            <Route path="/openings" element={<Openings />} />
            <Route path="/tactics" element={<Tactics />} />
            <Route path="/endgames" element={<Endgames />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/masters" element={<Masters />} />
            <Route path="/play" element={<Play />} />
          </Routes>
        </main>
      </div>
      {more && (
        <>
          <div className="sheet-bg" onClick={() => setMore(false)} />
          <div className="sheet" role="dialog" aria-label={tr("Más secciones", "More sections")}>
            <div className="grid">
              {secondary.map((l) => <Link key={l.to} to={l.to} onClick={() => setMore(false)}><span className="ico">{l.ico}</span>{l.label}</Link>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
