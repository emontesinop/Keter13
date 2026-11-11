import { describe, it, expect, afterAll } from "vitest";
import { UciEngine, parseInfo } from "../src/engine/uci";

const engine = new UciEngine();
afterAll(() => engine.quit());

describe("UCI parsing", () => {
  it("parses cp and mate scores", () => {
    expect(parseInfo("info depth 12 seldepth 15 multipv 2 score cp -34 nodes 100 nps 1 pv e7e5 g1f3")).toEqual({ multipv: 2, depth: 12, score: { cp: -34 }, pv: ["e7e5", "g1f3"] });
    expect(parseInfo("info depth 5 score mate 3 pv d1d8")?.score).toEqual({ mate: 3 });
    expect(parseInfo("info depth 5 score cp 10 lowerbound pv e2e4")).toBeNull();
    expect(parseInfo("info string NNUE enabled")).toBeNull();
  });
});

describe("Stockfish 18 (bundled WASM)", () => {
  it("finds a back-rank mate in one with MultiPV", async () => {
    const r = await engine.analyse("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", { depth: 10, multipv: 2 });
    expect(r.engine).toMatch(/Stockfish/);
    expect(r.lines[0].pv[0]).toBe("d1d8");
    expect(r.lines[0].score.mate).toBe(1);
    expect(r.lines).toHaveLength(2);
  }, 60000);
  it("returns no lines in terminal positions", async () => {
    const r = await engine.analyse("R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", { depth: 5 });
    expect(r.lines).toEqual([]);
  });
});
