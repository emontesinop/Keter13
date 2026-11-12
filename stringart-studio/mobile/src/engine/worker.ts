/// <reference lib="webworker" />
// Runs generation off the UI thread. Cancel = terminate the worker.
import { generate } from "./generate";
import type { Settings } from "./types";

self.onmessage = (e: MessageEvent<{ rgba: Uint8ClampedArray; res: number; settings: Settings }>) => {
  const { rgba, res, settings } = e.data;
  try {
    const result = generate(rgba, res, settings, (p) => (self as any).postMessage({ type: "progress", progress: p }));
    (self as any).postMessage({ type: "done", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", message: String(err?.message ?? err) });
  }
};
