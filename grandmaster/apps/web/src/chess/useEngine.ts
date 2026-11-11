import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { PvLine } from "@gm/core";
import { BrowserEngine } from "./engine";

/** Live analysis of `fen` while `enabled`. Debounced so fast navigation doesn't thrash the engine. */
export function useEngine(fen: string, enabled: boolean, multipv = 3, depth = 20) {
  const eng = useRef<BrowserEngine | null>(null);
  const [lines, setLines] = useState<PvLine[]>([]);
  const [depthNow, setDepth] = useState(0);
  useEffect(() => () => eng.current?.terminate(), []);
  useEffect(() => {
    setLines([]); setDepth(0);
    if (!enabled) { void eng.current?.stop(); return; }
    let game: Chess; try { game = new Chess(fen); } catch { return; }
    if (game.isGameOver()) return;
    eng.current ??= new BrowserEngine();
    let cancelled = false;
    const t = setTimeout(() => {
      void eng.current!.analyse(fen, { depth, multipv }, (ls, d) => { if (!cancelled) { setLines(ls); setDepth(d); } });
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [fen, enabled, multipv, depth]);
  return { lines, depth: depthNow };
}
