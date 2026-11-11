// Cross-platform (Windows/macOS/Linux) dev runner: API server + Vite web app in parallel.
import { spawn } from "node:child_process";
const run = (ws) => spawn("npm", ["run", "dev", "-w", ws], { stdio: "inherit", shell: true });
const procs = [run("@gm/server"), run("@gm/web")];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => { if (code) stop(); });
