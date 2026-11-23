import { describe, it, expect } from "vitest";
import { computeCounters, DAY_MS } from "./counters";

const quit = new Date("2026-11-20T08:00:00");
const at = (d: number, h = 0) => new Date(quit.getTime() + d * DAY_MS + h * 3600_000);

describe("computeCounters", () => {
  it("cuenta días completos y dinero sin recaídas", () => {
    const c = computeCounters(quit, [], at(3, 12), 6);
    expect(c.daysThisAttempt).toBe(3);
    expect(c.cleanDaysTotal).toBe(3);
    expect(c.cleanPct).toBe(1);
    expect(c.moneySaved).toBeCloseTo(21, 5);
  });

  it("fecha de inicio en el futuro → todo en cero, nunca negativo", () => {
    const c = computeCounters(quit, [], at(-2), 6);
    expect(c.daysThisAttempt).toBe(0);
    expect(c.cleanDaysTotal).toBe(0);
    expect(c.moneySaved).toBe(0);
    expect(c.cleanPct).toBeNull();
  });

  it("una recaída reinicia el intento pero no los días limpios totales", () => {
    const c = computeCounters(quit, [{ at: at(5) }], at(10), 6);
    expect(c.daysThisAttempt).toBe(5);
    expect(c.cleanDaysTotal).toBe(9);
    expect(c.cleanPct).toBeCloseTo(0.9, 5);
    expect(c.moneySaved).toBeCloseTo(54, 5);
  });

  it("recaída el mismo día del inicio no da negativos", () => {
    const c = computeCounters(quit, [{ at: at(0, 2) }], at(0, 5), 6);
    expect(c.daysThisAttempt).toBe(0);
    expect(c.cleanDaysTotal).toBe(0);
    expect(c.moneySaved).toBeGreaterThanOrEqual(0);
  });

  it("varias recaídas el mismo día cuentan como un solo día", () => {
    const c = computeCounters(quit, [{ at: at(4, 1) }, { at: at(4, 3) }], at(8), 6);
    expect(c.cleanDaysTotal).toBe(7);
  });

  it("ignora recaídas anteriores al inicio", () => {
    const c = computeCounters(quit, [{ at: at(-3) }], at(2), 6);
    expect(c.daysThisAttempt).toBe(2);
    expect(c.cleanDaysTotal).toBe(2);
  });
});
