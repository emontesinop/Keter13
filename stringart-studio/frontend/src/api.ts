// Typed client for the StringArt Studio backend.

export type Settings = {
  image: Record<string, any>;
  board: Record<string, any>;
  thread: Record<string, any> & { palette: { name: string; hex: string; enabled: boolean }[] };
  generation: Record<string, any>;
  route: { mode: "strict" | "practical"; max_bridges: number; approved_bridges: [number, number][] };
  materials: Record<string, any>;
};

export type VersionSummary = {
  id: string; label: string; created: number; mode: string; color_mode: string; nails: number;
  connections: number; sections: number; thread_m: number; metrics: Record<string, number>; elapsed_s: number;
};

export type ProjectMeta = {
  id: string; name: string; created: number; updated: number; settings: Settings;
  versions: VersionSummary[]; current_version: string | null; faces: number[][]; source_filename: string;
  source_size: [number, number];
};

export type Nail = { index: number; number: number; x_mm: number; y_mm: number; angle_deg: number;
  radius_mm: number; dist_prev_mm: number; dist_next_mm: number };

export type Layer = {
  name: string; color: string; selected_edges: [number, number][]; optimizer_sections: number[][];
  sections: number[][]; bridges_proposed: { from: number; to: number; visual_cost: number; length_mm: number }[];
  bridges_applied: [number, number][];
  stats: { lines: number; stop_reason: string; error_reduction: number; jumps: number; trimmed_tail_lines: number;
    elapsed_s: number; budget: number; error_curve: number[] };
  route: { sections: number; min_sections: number; continuous: boolean; components: number; odd_vertices: number;
    reordered: boolean; steps: number; validated: boolean; min_sections_without_bridges: number };
};

export type Result = {
  id: string; created: number; settings: Settings; board: any; nails: Nail[]; background: string;
  thread_mm: number; opacity: number; comparison_resolution: number; min_skip: number; candidate_lines: number;
  layers: Layer[]; analysis: any; timings: any; materials: any; metrics: Record<string, number>;
  totals: { connections: number; unique_connections: number; bridges: number; sections: number };
};

export type Step = { step: number; kind: "line" | "rim"; layer: number; color_name: string; color: string; section: number;
  from: number; to: number; distance_mm: number; bridge: boolean };

export type Preview = { analysis: any; faces_px: number[][]; size: [number, number];
  images: Record<"framed" | "processed" | "edges" | "importance" | "subject" | "intended", string> };

export type Job = { id: string; status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: { stage: string; fraction: number; lines?: number; error_reduction?: number; layer?: string;
    layer_index?: number; partial?: number[][] };
  result: any; error: string | null };

async function j<T>(r: Promise<Response>): Promise<T> {
  const res = await r;
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail ?? msg; } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

const H = { "Content-Type": "application/json" };

export const api = {
  defaults: () => j<any>(fetch("/api/defaults")),
  projects: () => j<any[]>(fetch("/api/projects")),
  project: (id: string) => j<ProjectMeta>(fetch(`/api/projects/${id}`)),
  create: (file: File, name = "") => {
    const fd = new FormData(); fd.append("file", file); fd.append("name", name);
    return j<ProjectMeta>(fetch("/api/projects", { method: "POST", body: fd }));
  },
  importProject: (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    return j<ProjectMeta>(fetch("/api/projects/import", { method: "POST", body: fd }));
  },
  patch: (id: string, body: { name?: string; settings?: Settings }) =>
    j<ProjectMeta>(fetch(`/api/projects/${id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) })),
  remove: (id: string) => j<any>(fetch(`/api/projects/${id}`, { method: "DELETE" })),
  duplicate: (id: string) => j<ProjectMeta>(fetch(`/api/projects/${id}/duplicate`, { method: "POST" })),
  preview: (id: string, settings: Settings, size = 360) =>
    j<Preview>(fetch(`/api/projects/${id}/preview?size=${size}`, { method: "POST", headers: H, body: JSON.stringify(settings) })),
  autoPalette: (id: string, count: number, background: string, settings: Settings) =>
    j<{ background: string; colors: { name: string; hex: string; enabled: boolean }[] }>(fetch(`/api/projects/${id}/auto-palette`,
      { method: "POST", headers: H, body: JSON.stringify({ count, background, settings }) })),
  geometry: (board: any) => j<{ summary: any; nails: Nail[] }>(fetch("/api/geometry", { method: "POST", headers: H, body: JSON.stringify(board) })),
  generate: (id: string, settings: Settings) =>
    j<{ job_id: string }>(fetch(`/api/projects/${id}/generate`, { method: "POST", headers: H, body: JSON.stringify(settings) })),
  job: (jid: string) => j<Job>(fetch(`/api/jobs/${jid}`)),
  cancel: (jid: string) => j<any>(fetch(`/api/jobs/${jid}`, { method: "DELETE" })),
  version: (id: string, vid: string) => j<Result>(fetch(`/api/projects/${id}/versions/${vid}`)),
  steps: (id: string, vid: string) => j<Step[]>(fetch(`/api/projects/${id}/versions/${vid}/steps`)),
  deleteVersion: (id: string, vid: string) => j<any>(fetch(`/api/projects/${id}/versions/${vid}`, { method: "DELETE" })),
  renameVersion: (id: string, vid: string, label: string) =>
    j<any>(fetch(`/api/projects/${id}/versions/${vid}`, { method: "PATCH", headers: H, body: JSON.stringify({ label }) })),
  reroute: (id: string, vid: string, approved: [number, number][]) =>
    j<Result>(fetch(`/api/projects/${id}/versions/${vid}/route`, { method: "POST", headers: H, body: JSON.stringify({ approved_bridges: approved }) })),
  sourceUrl: (id: string) => `/api/projects/${id}/source`,
  previewUrl: (id: string, vid: string) => `/api/projects/${id}/versions/${vid}/image/preview.png`,
  exportUrl: (id: string, vid: string, kind: string, q = "") => `/api/projects/${id}/versions/${vid}/export/${kind}${q}`,
  projectFileUrl: (id: string) => `/api/projects/${id}/export.saproj`,
};
