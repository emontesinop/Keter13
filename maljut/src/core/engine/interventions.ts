export const INTERVENTION_IDS = ["sigh", "box", "urge_surf", "reasons", "grounding"] as const;
export type InterventionId = (typeof INTERVENTION_IDS)[number];

export interface InterventionMeta {
  id: InterventionId;
  minutes: number;
  kind: "breath" | "mind" | "meaning" | "senses";
}

export const INTERVENTIONS: Record<InterventionId, InterventionMeta> = {
  sigh: { id: "sigh", minutes: 3, kind: "breath" },
  box: { id: "box", minutes: 4, kind: "breath" },
  urge_surf: { id: "urge_surf", minutes: 6, kind: "mind" },
  reasons: { id: "reasons", minutes: 3, kind: "meaning" },
  grounding: { id: "grounding", minutes: 4, kind: "senses" },
};
