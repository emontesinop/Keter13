import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { Chess } from "chess.js";
import type { PositionAnalysis, PvLine } from "@gm/core";
import { config } from "../config";

const require = createRequire(import.meta.url);

/** Parse one UCI "info" line. Returns null for lines without a scored PV or bound-only scores. */
export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith("info ") || !line.includes(" pv ") || !line.includes(" score ")) return null;
  if (/ (upperbound|lowerbound)/.test(line)) return null;
  const tok = line.split(/\s+/);
  const get = (k: string) => { const i = tok.indexOf(k); return i >= 0 ? tok[i + 1] : undefined; };
  const si = tok.indexOf("score");
  const kind = tok[si + 1], val = Number(tok[si + 2]);
  const pvIdx = tok.indexOf("pv");
  return {
    multipv: Number(get("multipv") ?? 1),
    depth: Number(get("depth") ?? 0),
    score: kind === "mate" ? { mate: val } : { cp: val },
    pv: tok.slice(pvIdx + 1),
  };
}

export interface AnalyseOptions { depth?: number; multipv?: number; movetimeMs?: number; }

/** Resolve how to launch the engine: native binary if configured, else the bundled Stockfish 18 WASM build under Node. */
export function engineCommand(): { cmd: string; args: string[]; label: string } {
  if (config.engine.path) return { cmd: config.engine.path, args: [], label: "Stockfish (native)" };
  const pkgDir = path.dirname(require.resolve("stockfish/package.json"));
  const file = config.engine.flavor === "single" ? "stockfish-18-single.js" : "stockfish-18-lite-single.js";
  return { cmd: process.execPath, args: [path.join(pkgDir, "bin", file)], label: `Stockfish 18 WASM (${config.engine.flavor})` };
}

/** A single UCI engine process. Requests are serialised. */
export class UciEngine {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private listeners: ((line: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  readonly label: string;
  name = "Stockfish";

  constructor(private launch = engineCommand()) { this.label = launch.label; }

  private send(cmd: string) { this.proc!.stdin.write(cmd + "\n"); }

  private waitFor(pred: (l: string) => boolean, onLine?: (l: string) => void, timeoutMs = 120000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners = this.listeners.filter((x) => x !== fn); reject(new Error("Engine timeout")); }, timeoutMs);
      const fn = (l: string) => {
        onLine?.(l);
        if (pred(l)) { clearTimeout(timer); this.listeners = this.listeners.filter((x) => x !== fn); resolve(l); }
      };
      this.listeners.push(fn);
    });
  }

  async start() {
    if (this.proc) return;
    this.proc = spawn(this.launch.cmd, this.launch.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => {
      this.buf += chunk;
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line.startsWith("id name ")) this.name = line.slice(8);
        for (const l of [...this.listeners]) l(line);
      }
    });
    this.proc.on("exit", () => { this.proc = null; });
    const ok = this.waitFor((l) => l === "uciok", undefined, 60000);
    this.send("uci");
    await ok;
    if (config.engine.path) {
      this.send(`setoption name Threads value ${config.engine.threads}`);
      this.send(`setoption name Hash value ${config.engine.hashMb}`);
    }
    await this.isReady();
  }

  private async isReady() { const p = this.waitFor((l) => l === "readyok", undefined, 60000); this.send("isready"); await p; }

  analyse(fen: string, opts: AnalyseOptions = {}): Promise<PositionAnalysis> {
    const run = async (): Promise<PositionAnalysis> => {
      await this.start();
      const chess = new Chess(fen);
      if (chess.isGameOver()) return { fen, depth: 0, lines: [], engine: this.name };
      const multipv = Math.min(opts.multipv ?? 1, chess.moves().length);
      const lines = new Map<number, PvLine>();
      this.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady();
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      const done = this.waitFor((l) => l.startsWith("bestmove"), (l) => {
        const info = parseInfo(l);
        if (info) lines.set(info.multipv, info);
      }, Math.max(120000, (opts.movetimeMs ?? 0) * 3));
      this.send(opts.movetimeMs ? `go movetime ${opts.movetimeMs}` : `go depth ${opts.depth ?? config.engine.depth}`);
      await done;
      const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
      return { fen, depth: sorted[0]?.depth ?? 0, lines: sorted, engine: this.name };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async quit() { if (this.proc) { this.send("quit"); this.proc.kill(); this.proc = null; } }
}

/** Small round-robin pool. */
export class EnginePool {
  private engines: UciEngine[];
  private i = 0;
  constructor(size = config.engine.poolSize) { this.engines = Array.from({ length: Math.max(1, size) }, () => new UciEngine()); }
  analyse(fen: string, opts?: AnalyseOptions) { const e = this.engines[this.i++ % this.engines.length]; return e.analyse(fen, opts); }
  get label() { return this.engines[0].label; }
  async quit() { await Promise.all(this.engines.map((e) => e.quit())); }
}
