import React, { useEffect, useState } from "react";
import Build from "./screens/Build";
import Editor from "./screens/Editor";
import Home from "./screens/Home";
import ResultScreen from "./screens/ResultScreen";
import { getProject, Project, requestPersistence, updateProject } from "./store";
import { THREAD_PRESETS } from "./engine/types";

type Route = { screen: "home" } | { screen: "editor" | "result" | "build"; project: Project };

export default function App() {
  const [route, setRoute] = useState<Route>({ screen: "home" });
  useEffect(() => { requestPersistence(); }, []);
  const go = async (screen: Route["screen"], p?: Project) => {
    if (screen === "home" || !p) return setRoute({ screen: "home" });
    const fresh = (await getProject(p.id)) ?? p;
    setRoute({ screen, project: { ...fresh, ...(screen === "result" ? { settings: p.settings } : {}) } });
  };
  switch (route.screen) {
    case "home":
      return <Home onOpen={(p) => go(p.result ? "result" : "editor", p)} />;
    case "editor":
      return <Editor key={route.project.id} project={route.project} onBack={() => go("home")} onResult={(p) => go("result", p)} />;
    case "result":
      return <ResultScreen project={route.project} onBack={() => go("home")} onEdit={() => route.project.image ? go("editor", route.project) : alert("Imported sequences have no photo to edit.")} onBuild={() => go("build", route.project)}
        onTryBlackOnWhite={async () => {
          const p = route.project, b = THREAD_PRESETS.black_on_white;
          const np = { ...p, settings: { ...p.settings, thread: { ...p.settings.thread, mode: "mono" as const, preset: "black_on_white", threadColor: b.thread, background: b.background } } };
          await updateProject(p.id, { settings: np.settings });
          go("editor", np);
        }} />;
    case "build":
      return <Build project={route.project} onExit={(p) => go("result", p)} />;
  }
}
