// Full on-device generation: processed image -> targets -> optimised continuous paths -> result.
import { boardGeometry, boardMask, nailsPx } from "./geometry";
import { decompose } from "./color";
import { hexRgb, l2s, luminance, processImage, s2l, targetCoverage } from "./imageproc";
import { buildCache, optimize } from "./optimizer";
import { chainTrails, eulerTrails, rimTravelMm, threadLengthMm, validatePath, validateSections } from "./route";
import { optimizeColorJoint } from "./colorOpt";
import { QUALITY, resolveTone, Result, Settings } from "./types";

export type Progress = { stage: string; fraction: number; layer?: number; lines?: number; path?: number[];
  edges?: [number, number][][]; errorReduction?: number };

export function layersOf(s: Settings): { name: string; color: string }[] {
  return s.thread.mode === "mono"
    ? [{ name: "Thread", color: s.thread.threadColor }]
    : s.thread.palette.filter((c) => c.enabled).map((c) => ({ name: c.name, color: c.hex }));
}
export const backgroundOf = (s: Settings) => (s.thread.mode === "mono" ? s.thread.background : s.thread.paletteBackground);

/** Per-layer target densities for an already framed RGBA raster. */
export function targets(rgba: Uint8ClampedArray, res: number, s: Settings) {
  const mask = boardMask(s.board, res);
  const layers = layersOf(s);
  const bg = backgroundOf(s);
  const pi = processImage(rgba, res, s.tone, mask, { tone: l2s(luminance(hexRgb(bg))), rgb: hexRgb(bg) });
  let dens: Float32Array[];
  const sum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  const darkest = layers.length ? layers.reduce((a, l) => (sum(l.color) < sum(a.color) ? l : a)).color : "#000000";
  const tone = resolveTone(s.thread.mode === "mono" ? layers[0]?.color ?? "#000000" : darkest, bg, s.thread, s.gen.overshoot);
  if (s.thread.mode === "mono") {
    const C = targetCoverage(pi.tone, layers[0].color, bg, tone.cmax, tone.physics, mask);
    dens = [Float32Array.from(C, (v) => -Math.log1p(-v))];
  } else {
    dens = decompose(pi.color, layers.map((l) => l.color), bg, tone.cmax, tone.physics, mask);
  }
  return { pi, mask, dens, layers, bg, tone };
}

export function generate(rgba: Uint8ClampedArray, res: number, s: Settings, report: (p: Progress) => void): Result {
  const t0 = Date.now();
  const q = QUALITY[s.gen.quality];
  report({ stage: "Analysing image", fraction: 0.02 });
  const { pi, dens, layers, bg, tone } = targets(rgba, res, s);
  if (!layers.length) throw new Error("Enable at least one thread colour.");
  const g = boardGeometry(s.board);
  const minSkip = s.gen.minSkip > 0 ? s.gen.minSkip : Math.max(2, Math.floor(g.n / 25));
  report({ stage: "Preparing candidate lines", fraction: 0.06 });
  const cache = buildCache(g, nailsPx(g, res), res, minSkip);
  const pxPerMm = res / g.widthMm;
  const maxLines = s.gen.maxLines || q.maxLines;
  const out: Result["layers"] = [];
  let threadMm = 0, connections = 0, dupTotal = 0, valid = true, errSum = 0, sections = 0, rimMoves = 0;
  if (s.thread.mode === "color") {
    // joint optimisation of all colours on the whole board (no continuity constraint), then the
    // physical route: minimum Euler trails per colour, chained by rim moves (one thread per colour)
    const N = res * res;
    const tLin = new Float32Array(3 * N);
    for (let i = 0; i < 3 * N; i++) tLin[i] = s2l(pi.color[i]);
    const w = Float32Array.from(pi.importance, (v, i) => (pi.mask[i] ? v : 0));
    const colsLin = layers.map((l) => hexRgb(l.color).map(s2l));
    const r = optimizeColorJoint(cache, tLin, w, colsLin, hexRgb(bg).map(s2l), {
      maxLines, threadPx: s.thread.thickness * pxPerMm, opacity: s.thread.opacity, refreshEvery: 800,
    }, (lines, edges, er) => report({
      stage: "Optimising all colours together", fraction: 0.08 + 0.88 * Math.min(1, lines / maxLines), lines,
      edges, errorReduction: er,
    }));
    report({ stage: "Planning the thread route", fraction: 0.97 });
    // build lighter colours first so darker detail ends up on top
    const order = layers.map((_, i) => i).sort((a, b) => luminance(hexRgb(layers[b].color)) - luminance(hexRgb(layers[a].color)));
    for (const li of order) {
      const L = layers[li];
      const secs = chainTrails(eulerTrails(r.edges[li], g.n), g.n, 0);
      if (!secs.length) continue;
      const v = validateSections(secs, g.n);
      valid = valid && v.ok; dupTotal += v.duplicates;
      const lines = secs.reduce((a, t) => a + t.length - 1, 0);
      connections += lines; sections += secs.length; rimMoves += secs.length - 1;
      threadMm += secs.reduce((a, t) => a + threadLengthMm(t, g.xy, s.board.nailDiameter, s.thread.thickness, { ...s.materials, knotMm: 0 }), 0)
        + rimTravelMm(secs, g.xy) + 2 * s.materials.knotMm;
      out.push({ name: L.name, color: L.color, path: secs[0], sections: secs, stopReason: r.stopReason, errorReduction: r.errorReduction, budget: maxLines });
    }
    errSum = r.errorReduction * out.length;
  } else {
    const sums = dens.map((d) => d.reduce((a, v) => a + v, 0));
    const total = sums.reduce((a, v) => a + v, 0) || 1;
    layers.forEach((L, li) => {
      const budget = Math.max(30, Math.round((maxLines * sums[li]) / total));
      const r = optimize(cache, dens[li], pi.importance, {
        maxLines: budget, minImprovement: q.minImprovement, overshoot: tone.overshoot, patience: q.patience,
        startNail: 0, threadPx: s.thread.thickness * pxPerMm, opacity: s.thread.opacity,
      }, (lines, path, er) => report({
        stage: "Optimising thread path", fraction: 0.08 + 0.9 * (li + lines / budget) / layers.length, layer: li, lines, path, errorReduction: er,
      }));
      const v = validatePath(r.path, g.n);
      valid = valid && v.ok;
      dupTotal += v.duplicates;
      connections += r.path.length - 1;
      sections += 1;
      threadMm += threadLengthMm(r.path, g.xy, s.board.nailDiameter, s.thread.thickness, s.materials);
      errSum += r.errorReduction;
      out.push({ name: L.name, color: L.color, path: r.path, stopReason: r.stopReason, errorReduction: r.errorReduction, budget });
    });
  }
  const seconds = (Date.now() - t0) / 1000;
  report({ stage: "Done", fraction: 1 });
  return {
    version: 1, created: Date.now(), board: { ...s.board }, nailsMm: Array.from(g.xy), widthMm: g.widthMm, heightMm: g.heightMm,
    background: bg, thicknessMm: s.thread.thickness, opacity: s.thread.opacity, layers: out,
    stats: {
      connections, sections, rimMoves, threads: out.length, threadM: threadMm / 1000,
      buildHours: (connections * s.materials.secondsPerConnection + rimMoves * 10 + out.length * 120 + g.n * 15) / 3600,
      seconds, errorReduction: errSum / Math.max(1, out.length), candidates: cache.lines, validated: valid, duplicates: dupTotal,
    },
  };
}
