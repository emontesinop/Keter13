import { describe, it, expect } from "vitest";
import { chooseIntervention, updateStats, rewardFrom, contextKey, mulberry32, type ArmStats } from "./bandit";
import { INTERVENTION_IDS } from "./interventions";

describe("contextKey", () => {
  it("combina franja horaria e intensidad", () => {
    expect(contextKey(new Date("2026-11-23T05:30:00"), 9)).toBe("madrugada:alta");
    expect(contextKey(new Date("2026-11-23T19:00:00"), 3)).toBe("noche:baja");
    expect(contextKey(new Date("2026-11-23T13:00:00"), 6)).toBe("tarde:media");
  });
});

describe("rewardFrom", () => {
  it("sí=1, algo=0.5, no=0 sin intensidad final", () => {
    expect(rewardFrom("yes", 8)).toBe(1);
    expect(rewardFrom("some", 8)).toBe(0.5);
    expect(rewardFrom("no", 8)).toBe(0);
  });
  it("la caída de intensidad suma y el resultado queda en [0,1]", () => {
    expect(rewardFrom("no", 8, 2)).toBeGreaterThan(0);
    expect(rewardFrom("yes", 8, 1)).toBeLessThanOrEqual(1);
    expect(rewardFrom("no", 3, 9)).toBe(0);
  });
});

describe("Thompson sampling", () => {
  it("sin datos elige un brazo válido", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) expect(INTERVENTION_IDS).toContain(chooseIntervention({}, "noche:alta", rng));
  });

  it("respeta la lista de disponibles", () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 50; i++) expect(chooseIntervention({}, "noche:alta", rng, ["box"])).toBe("box");
  });

  it("un brazo con 20 éxitos gana > 80% de 200 sorteos", () => {
    let stats: ArmStats = {};
    for (let i = 0; i < 20; i++) stats = updateStats(stats, "sigh", "noche:alta", 1);
    const rng = mulberry32(3);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (chooseIntervention(stats, "noche:alta", rng) === "sigh") wins++;
    expect(wins).toBeGreaterThan(160);
  });

  it("lo aprendido en otro contexto también ayuda (prior global)", () => {
    let stats: ArmStats = {};
    for (let i = 0; i < 30; i++) stats = updateStats(stats, "grounding", "tarde:media", 1);
    const rng = mulberry32(4);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (chooseIntervention(stats, "madrugada:baja", rng) === "grounding") wins++;
    expect(wins).toBeGreaterThan(100);
  });

  it("updateStats no muta la entrada", () => {
    const s: ArmStats = {};
    const s2 = updateStats(s, "box", "noche:alta", 1);
    expect(s).toEqual({});
    expect(s2["noche:alta|box"].n).toBe(1);
    expect(s2["*|box"].n).toBe(1);
  });
});
