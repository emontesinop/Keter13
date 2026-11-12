// Shared types and defaults for the on-device engine.

export type PaletteColor = { name: string; hex: string; enabled: boolean };

export const SETTINGS_VERSION = 2;

export type Settings = {
  version?: number;
  frame: { zoom: number; x: number; y: number; rotation: number };
  tone: {
    autoLevels: boolean; exposure: number; brightness: number; contrast: number; gamma: number;
    localContrast: number; sharpness: number; invert: boolean; edgeEmphasis: number; centerFocus: number;
    background?: "keep" | "remove"; bgTolerance?: number;
  };
  board: {
    shape: "circle" | "square"; diameter: number; nails: number; margin: number; nailDiameter: number;
    numbering: "clockwise" | "counterclockwise"; startAngle: number;
  };
  thread: {
    mode: "mono" | "color"; preset: string; threadColor: string; background: string; thickness: number;
    opacity: number; autoTone: boolean; maxCoverage: number; tonePhysics: number; palette: PaletteColor[]; paletteBackground: string;
  };
  gen: { quality: "fast" | "balanced" | "detailed"; maxLines: number; minSkip: number; overshoot: number };
  materials: { knotMm: number; slackPct: number; wastePct: number; secondsPerConnection: number };
};

export const THREAD_PRESETS: Record<string, { label: string; thread: string; background: string }> = {
  white_on_black: { label: "White on black", thread: "#f4f4f0", background: "#0b0b0c" },
  black_on_white: { label: "Black on white", thread: "#111111", background: "#f5f3ee" },
  red_on_black: { label: "Red on black", thread: "#c41e26", background: "#0b0b0c" },
  white_on_wood: { label: "White on wood", thread: "#f4f4f0", background: "#9a6b3f" },
  black_on_wood: { label: "Black on wood", thread: "#111111", background: "#c9a27a" },
};

export const PALETTE_PRESETS: Record<string, { label: string; background: string; colors: [string, string][] }> = {
  cmyk: { label: "CMYK on white", background: "#ffffff", colors: [["Cyan", "#00a3d9"], ["Magenta", "#d4237a"], ["Yellow", "#f6d40e"], ["Black", "#111111"]] },
  rgb: { label: "RGB on black", background: "#0b0b0c", colors: [["Red", "#d62a2a"], ["Green", "#2fa84f"], ["Blue", "#2a5bd6"], ["White", "#f4f4f0"]] },
  warm: { label: "Warm on cream", background: "#f5f3ee", colors: [["Black", "#111111"], ["Brick", "#a63d2a"], ["Ochre", "#d39b2a"], ["Navy", "#1f2f5c"]] },
};

// comparison resolution (px across the board) and line budget per quality level
export const QUALITY: Record<Settings["gen"]["quality"], { resolution: number; maxLines: number; patience: number; minImprovement: number }> = {
// tuned with the desktop scripts/tune_engine.py (likeness of the physical render to the photo)
  fast: { resolution: 180, maxLines: 3500, patience: 60, minImprovement: 0 },
  balanced: { resolution: 220, maxLines: 6000, patience: 200, minImprovement: 0 },
  detailed: { resolution: 240, maxLines: 9000, patience: 300, minImprovement: 0 },
};

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    frame: { zoom: 1, x: 0, y: 0, rotation: 0 },
    tone: { autoLevels: true, exposure: 0, brightness: 0, contrast: 1, gamma: 1, localContrast: 0.6, sharpness: 0.4,
      invert: false, edgeEmphasis: 0.6, centerFocus: 0.3, background: "keep", bgTolerance: 20 },
    board: { shape: "circle", diameter: 300, nails: 300, margin: 6, nailDiameter: 1.6, numbering: "clockwise", startAngle: 0 },
    thread: { mode: "mono", preset: "black_on_white", threadColor: "#111111", background: "#f5f3ee", thickness: 0.15,
      opacity: 0.85, autoTone: true, maxCoverage: 0.98, tonePhysics: 1,
      palette: PALETTE_PRESETS.cmyk.colors.map(([name, hex]) => ({ name, hex, enabled: true })), paletteBackground: "#ffffff" },
    gen: { quality: "balanced", maxLines: 6000, minSkip: 0, overshoot: 0.7 },
    materials: { knotMm: 150, slackPct: 5, wastePct: 10, secondsPerConnection: 7 },
  };
}

/** Upgrade settings saved by v1 (lighter tone mapping that stopped at ~2,000 lines). */
export function migrateSettings(s: Settings): Settings {
  if ((s.version ?? 1) >= SETTINGS_VERSION) return s;
  return {
    ...s, version: SETTINGS_VERSION,
    thread: { ...s.thread, autoTone: true, maxCoverage: 0.98, tonePhysics: 1 },
    gen: { ...s.gen, overshoot: 0.7, maxLines: Math.max(s.gen.maxLines, QUALITY[s.gen.quality].maxLines) },
  };
}

/** Measured best tone mapping for the thread/board contrast direction (see desktop docs). */
export function resolveTone(threadHex: string, bgHex: string, t: Settings["thread"], overshoot: number) {
  if (!t.autoTone) return { physics: t.tonePhysics, cmax: t.maxCoverage, overshoot };
  const lum = (h: string) => { const v = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).reduce((a, x, k) => a + x * [0.2126, 0.7152, 0.0722][k], 0); };
  return lum(bgHex) >= lum(threadHex)
    ? { physics: 1, cmax: 0.98, overshoot }
    : { physics: 0.5, cmax: 0.9, overshoot: Math.max(overshoot, 1) };
}

export type Layer = {
  name: string;
  color: string;
  path: number[];        // 0-based nail indices; one continuous thread section per layer
  stopReason: string;
  errorReduction: number;
  budget?: number;       // max connections allowed for this layer
};

export type Result = {
  version: 1;
  created: number;
  board: Settings["board"];
  nailsMm: number[];     // flat x,y pairs, centre origin, +y down
  widthMm: number;
  heightMm: number;
  background: string;
  thicknessMm: number;
  opacity: number;
  layers: Layer[];
  stats: {
    connections: number; sections: number; threadM: number; buildHours: number; seconds: number;
    errorReduction: number; candidates: number; validated: boolean; duplicates: number;
  };
};

export type Step = { step: number; layer: number; colorName: string; color: string; section: number; from: number; to: number; distMm: number };

export function buildSteps(r: Result): Step[] {
  const out: Step[] = [];
  let k = 0;
  r.layers.forEach((L, li) => {
    for (let i = 1; i < L.path.length; i++) {
      const a = L.path[i - 1], b = L.path[i];
      const d = Math.hypot(r.nailsMm[2 * a] - r.nailsMm[2 * b], r.nailsMm[2 * a + 1] - r.nailsMm[2 * b + 1]);
      out.push({ step: ++k, layer: li, colorName: L.name, color: L.color, section: li + 1, from: a + 1, to: b + 1, distMm: d });
    }
  });
  return out;
}
