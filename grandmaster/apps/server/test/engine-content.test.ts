import { describe, it, expect, afterAll } from "vitest";
import { SEED_PUZZLES, ENDGAME_DRILLS, PAWN_STRUCTURES, lineFen, sanToUci, winPercentFromScore, negate } from "@gm/core";
import { UciEngine } from "../src/engine/uci";

/** Engine validation of the bundled training content: puzzles must have a unique winning first move;
 *  endgame drills must have the stated theoretical result. */
const engine = new UciEngine();
afterAll(() => engine.quit());

describe("seed puzzles are engine-verified", () => {
  for (const p of SEED_PUZZLES) {
    it(p.id, async () => {
      const r = await engine.analyse(p.fen, { depth: 18, multipv: 2 });
      const [best, second] = r.lines;
      expect(best.pv[0], `${p.id} best`).toBe(p.solution[0]);
      const w1 = winPercentFromScore(best.score);
      const w2 = second ? winPercentFromScore(second.score) : 0;
      const mateOnly = best.score.mate !== undefined && best.score.mate > 0 && !(second?.score.mate && second.score.mate > 0 && second.score.mate <= best.score.mate);
      expect(mateOnly || w1 - w2 > 15, `${p.id} margin (best ${JSON.stringify(best.score)} vs ${JSON.stringify(second?.score)})`).toBe(true);
    }, 60000);
  }
});

describe("endgame drills have the stated result", () => {
  for (const d of ENDGAME_DRILLS) {
    it(d.id, async () => {
      const r = await engine.analyse(d.fen, { depth: 22 });
      const stm = d.fen.split(" ")[1];
      // score for the drill side
      const s = stm === d.side ? r.lines[0].score : negate(r.lines[0].score);
      const w = winPercentFromScore(s);
      // Without tablebases an engine shows technical wins as large-but-finite scores and some fortresses
      // as small edges; we require "clearly winning" (>75%) for wins and "not lost/not winning" for draws.
      // At runtime, ≤7-piece drills are additionally checked against Syzygy via the Lichess tablebase API.
      if (d.goal === "win") expect(w, `${d.id} ${JSON.stringify(s)}`).toBeGreaterThan(75);
      else { expect(w, `${d.id} ${JSON.stringify(s)}`).toBeGreaterThan(25); expect(w).toBeLessThan(75); }
    }, 60000);
  }
});

describe("structure quizzes teach sound moves", () => {
  for (const st of PAWN_STRUCTURES.filter((x) => x.quiz)) {
    it(st.id, async () => {
      const fen = lineFen(st.quiz!.line);
      const best = await engine.analyse(fen, { depth: 16 });
      const bestWin = winPercentFromScore(best.lines[0].score);
      // at least one accepted answer must be close to the engine's best move (within 8 win% points)
      let closest = 0;
      for (const a of st.quiz!.answers) {
        const uci = sanToUci(fen, a)!;
        const { Chess } = await import("chess.js");
        const c = new Chess(fen); c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        const after = await engine.analyse(c.fen(), { depth: 16 });
        closest = Math.max(closest, winPercentFromScore(negate(after.lines[0].score)));
      }
      expect(bestWin - closest, `${st.id}: best ${best.lines[0].pv[0]} ${JSON.stringify(best.lines[0].score)}`).toBeLessThan(8);
    }, 90000);
  }
});
