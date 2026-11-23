import { describe, it, expect } from "vitest";
import { withdrawalIntensity, withdrawalPhase } from "./withdrawal";

describe("curva de abstinencia", () => {
  it("pico entre los días 2 y 6", () => {
    const peak = [0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 28].reduce((best, d) =>
      withdrawalIntensity(d) > withdrawalIntensity(best) ? d : best, 0);
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(6);
  });
  it("baja claramente hacia las 2-4 semanas", () => {
    expect(withdrawalIntensity(14)).toBeLessThan(withdrawalIntensity(4) * 0.5);
    expect(withdrawalIntensity(28)).toBeLessThan(0.2);
  });
  it("valores en [0,1] y días negativos se tratan como 0", () => {
    for (let d = -3; d < 60; d++) {
      const v = withdrawalIntensity(d);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("fases", () => {
    expect(withdrawalPhase(0)).toBe("start");
    expect(withdrawalPhase(3)).toBe("peak");
    expect(withdrawalPhase(9)).toBe("easing");
    expect(withdrawalPhase(20)).toBe("settling");
    expect(withdrawalPhase(40)).toBe("sleep_tail");
    expect(withdrawalPhase(80)).toBe("beyond");
  });
});
