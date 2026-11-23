import { describe, it, expect } from "vitest";
import { scoreCudit, CUDIT_ITEMS } from "./cudit";

describe("CUDIT-R", () => {
  it("tiene 8 ítems; el 8 puntúa 0/2/4", () => {
    expect(CUDIT_ITEMS).toHaveLength(8);
    expect(CUDIT_ITEMS[7].options.map((o) => o.value)).toEqual([0, 2, 4]);
  });
  it("bandas: <8 bajo, 8-11 riesgo, ≥12 posible trastorno", () => {
    expect(scoreCudit([1, 1, 1, 1, 1, 1, 1, 0])).toEqual({ score: 7, band: "low" });
    expect(scoreCudit([2, 2, 1, 1, 1, 1, 0, 0]).band).toBe("hazardous");
    expect(scoreCudit([4, 2, 2, 1, 1, 1, 0, 2])).toEqual({ score: 13, band: "possible_cud" });
  });
  it("rechaza respuestas incompletas o fuera de rango", () => {
    expect(() => scoreCudit([1, 1])).toThrow();
    expect(() => scoreCudit([9, 0, 0, 0, 0, 0, 0, 0])).toThrow();
  });
});
