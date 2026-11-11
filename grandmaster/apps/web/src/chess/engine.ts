import type { PvLine } from "@gm/core";

/** Stockfish 18 (lite, single-threaded WASM) running in a Web Worker — never blocks the UI thread. */
export class BrowserEngine {
  private w: Worker | null = null;
  private ready: Promise<void> | null = null;
  private onLine: ((l: string) => void) | null = null;
  private searching = false;
  private pendingStop: Promise<void> | null = null;

  private start() {
    if (this.ready) return this.ready;
    this.w = new Worker("/engine/stockfish-18-lite-single.js");
    this.w.onmessage = (e) => { const l = typeof e.data === "string" ? e.data : String(e.data); this.onLine?.(l); };
    this.ready = new Promise((resolve) => {
      const prev = this.onLine;
      this.onLine = (l) => { if (l === "uciok") { this.onLine = prev; resolve(); } };
      this.w!.postMessage("uci");
    });
    return this.ready;
  }

  async stop() {
    if (!this.searching) return;
    if (this.pendingStop) return this.pendingStop;
    this.pendingStop = new Promise<void>((resolve) => {
      const prev = this.onLine;
      this.onLine = (l) => { prev?.(l); if (l.startsWith("bestmove")) { this.searching = false; this.pendingStop = null; resolve(); } };
      this.w!.postMessage("stop");
    });
    return this.pendingStop;
  }

  /** Streams PV updates; resolves with the final lines and best move. */
  async analyse(fen: string, opts: { depth?: number; multipv?: number; movetime?: number; skillElo?: number }, onUpdate?: (lines: PvLine[], depth: number) => void) {
    await this.start();
    await this.stop();
    const lines = new Map<number, PvLine>();
    this.searching = true;
    return new Promise<{ lines: PvLine[]; bestmove: string }>((resolve) => {
      this.onLine = (l) => {
        if (l.startsWith("info ") && l.includes(" pv ") && l.includes(" score ") && !/ (upper|lower)bound/.test(l)) {
          const t = l.split(" ");
          const g = (k: string) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : undefined; };
          const si = t.indexOf("score");
          const mpv = Number(g("multipv") ?? 1), depth = Number(g("depth") ?? 0);
          lines.set(mpv, { multipv: mpv, depth, score: t[si + 1] === "mate" ? { mate: Number(t[si + 2]) } : { cp: Number(t[si + 2]) }, pv: t.slice(t.indexOf("pv") + 1) });
          if (mpv === 1 || lines.size >= (opts.multipv ?? 1)) onUpdate?.([...lines.values()].sort((a, b) => a.multipv - b.multipv), depth);
        } else if (l.startsWith("bestmove")) {
          this.searching = false;
          resolve({ lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv), bestmove: l.split(" ")[1] });
        }
      };
      const w = this.w!;
      if (opts.skillElo) { w.postMessage("setoption name UCI_LimitStrength value true"); w.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, opts.skillElo))}`); }
      else w.postMessage("setoption name UCI_LimitStrength value false");
      w.postMessage(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 18}`);
    });
  }

  terminate() { this.w?.terminate(); this.w = null; this.ready = null; }
}

let shared: BrowserEngine | null = null;
export const sharedEngine = () => (shared ??= new BrowserEngine());
