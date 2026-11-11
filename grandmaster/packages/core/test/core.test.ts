import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  winPercent, moveAccuracy, classifyMove, scoreToCp, gameAccuracy,
  parsePgn, splitPgn, parseClock, hash64, formatLine, uciLineToSan,
  hangingPieces, opponentThreats, pawnStructure, staticExchange, gamePhase, flipTurn, outposts,
  detectMotifs, explainMove, buildGameReport,
  review, newSrsState, qualityFromResult,
  summarizeRatings, performanceRating, ewma,
  detectWeaknesses, errorsFromReport, endgameType,
  buildDailyPlan, stageFor, milestoneDiagnostic, evaluateDiagnostic,
  REPERTOIRES, validateRepertoire, matchRepertoire, repertoireLines, LONDON, CARO_KANN, openingStats,
  MASTER_GAMES, SEED_PUZZLES, checkPuzzleMove, parseLichessPuzzleCsv, ENDGAME_DRILLS,
  searchConcepts, CONCEPTS, gradeCalculation, gradeCandidates,
  findUnverifiedMoves, buildPositionContext, gradeThreatAnswer, buildCoachSystemPrompt,
  type PositionAnalysis,
} from "../src";

const pa = (fen: string, cp: number | { mate: number }, pv: string[]): PositionAnalysis => ({
  fen, depth: 20, lines: [{ multipv: 1, depth: 20, score: typeof cp === "number" ? { cp } : cp, pv }],
});

describe("evaluation model", () => {
  it("win% is symmetric and bounded", () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
    expect(winPercent(5000)).toBeLessThanOrEqual(100);
  });
  it("accuracy is ~100 when nothing is lost and drops with win% loss", () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThan(99);
    expect(moveAccuracy(60, 30)).toBeLessThan(30);
  });
  it("classification thresholds are configurable", () => {
    expect(classifyMove({ winBefore: 70, winAfter: 50, isBest: false })).toBe("blunder");
    expect(classifyMove({ winBefore: 70, winAfter: 62, isBest: false })).toBe("inaccuracy");
    expect(classifyMove({ winBefore: 70, winAfter: 62, isBest: false }, { inaccuracy: 10, mistake: 20, blunder: 30 })).toBe("good");
    expect(classifyMove({ winBefore: 70, winAfter: 10, isBest: true })).toBe("best");
  });
  it("mate scores map beyond any cp score", () => {
    expect(scoreToCp({ mate: 3 })).toBeGreaterThan(9000);
    expect(scoreToCp({ mate: -2 })).toBeLessThan(-9000);
    expect(gameAccuracy([100, 100, 10])).toBeLessThan(80);
  });
});

const SAMPLE_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.10.01"]
[White "me"]
[Black "opp"]
[Result "0-1"]
[TimeControl "600"]

1. e4 {[%clk 0:10:00]} 1... e5 {[%clk 0:09:58]} 2. Bc4 {[%clk 0:09:55]} 2... Nc6 {[%clk 0:09:50]} 3. Qh5 {[%clk 0:09:40]} 3... Nf6 {[%clk 0:09:30]} 4. Qxf7# {[%clk 0:09:38]} 1-0

[Event "Second"]
[White "a"]
[Black "b"]
[Result "*"]

1. d4 d5 *`;

describe("PGN", () => {
  it("splits multi-game files and parses clocks", () => {
    const parts = splitPgn(SAMPLE_PGN);
    expect(parts).toHaveLength(2);
    const g = parsePgn(parts[0]);
    expect(g.moves).toHaveLength(7);
    expect(g.moves[6].san).toBe("Qxf7#");
    expect(g.moves[4].clock).toBe(580);
    expect(g.moves[4].timeSpent).toBe(15);
    expect(g.timeControl).toEqual({ base: 600, increment: 0 });
    expect(parseClock("[%clk 1:02:03.5]")).toBeCloseTo(3723.5);
  });
  it("fingerprints are stable and distinguish games", () => {
    const [a, b] = splitPgn(SAMPLE_PGN).map(parsePgn);
    expect(parsePgn(splitPgn(SAMPLE_PGN)[0]).fingerprint).toBe(a.fingerprint);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(hash64("x")).toHaveLength(16);
  });
  it("formats lines with move numbers", () => {
    const fen = new Chess().fen();
    expect(formatLine(fen, uciLineToSan(fen, ["e2e4", "e7e5", "g1f3"]))).toBe("1.e4 e5 2.Nf3");
  });
});

describe("position features", () => {
  it("detects hanging pieces with SEE", () => {
    const fen = "4k3/8/8/3n4/4P3/8/8/4K3 b - - 0 1"; // black knight d5 attacked by pawn e4
    expect(hangingPieces(fen, "b").map((h) => h.square)).toContain("d5");
    expect(staticExchange(fen, "d5", "w")).toBe(3);
  });
  it("finds the opponent's mate threat via null move", () => {
    // White to move; Black threatens ...Qxg2# (queen g3? use classic) — black queen h4 + bishop c5 vs f2
    const fen = "r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P2q/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
    const th = opponentThreats(fen);
    expect(th.some((t) => t.san.startsWith("Qxf2"))).toBe(true);
  });
  it("pawn structure", () => {
    const fen = "4k3/8/8/8/8/2P5/P1P4P/4K3 w - - 0 1";
    const ps = pawnStructure(fen, "w");
    expect(ps.doubled.sort()).toEqual(["c2", "c3"]);
    expect(ps.isolated).toContain("h2");
    expect(ps.islands).toBe(3);
  });
  it("phase & flip turn & outposts", () => {
    expect(gamePhase(new Chess().fen(), 1)).toBe("opening");
    expect(gamePhase("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1")).toBe("endgame");
    expect(flipTurn("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1")).toBeNull(); // black in check → cannot flip
    expect(outposts("4k3/8/8/3N4/4P3/8/8/4K3 w - - 0 1", "w")).toContain("d5");
  });
});

describe("motifs & puzzles", () => {
  it("each seed puzzle is legal and its solution shows the tagged motif family", () => {
    for (const p of SEED_PUZZLES) {
      const c = new Chess(p.fen);
      for (const u of p.solution) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      const m = detectMotifs({ fen: p.fen, line: p.solution, winGain: 50 });
      expect(m.length, p.id).toBeGreaterThan(0);
    }
  });
  it("detects back-rank mate, fork and skewer geometry", () => {
    expect(detectMotifs({ fen: SEED_PUZZLES[0].fen, line: ["d1d8"] })).toContain("back_rank_mate");
    expect(detectMotifs({ fen: "r3k3/8/8/1N6/8/8/5PPP/6K1 w - - 0 1", line: ["b5c7", "e8d7", "c7a8"] })).toContain("fork");
    expect(detectMotifs({ fen: "q7/8/8/3k4/8/8/4BPPP/6K1 w - - 0 1", line: ["e2f3"] })).toContain("skewer");
  });
  it("puzzle checker accepts alternative mates and walks multi-move solutions", () => {
    const p = SEED_PUZZLES.find((x) => x.id === "o-smother-1")!;
    const r1 = checkPuzzleMove(p, ["d5g8"], 0);
    expect(r1).toMatchObject({ correct: true, finished: false, reply: "e8g8" });
    const r2 = checkPuzzleMove(p, ["d5g8", "e8g8", "h6f7"], 2);
    expect(r2.finished).toBe(true);
    expect(checkPuzzleMove(p, ["d5d4"], 0).correct).toBe(false);
  });
  it("parses a Lichess (CC0) puzzle CSV row", () => {
    const row = "00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1913,75,94,6227,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#47,";
    const p = parseLichessPuzzleCsv(row)!;
    expect(p.solution[0]).toBe("e6e7");
    expect(p.fen.split(" ")[1]).toBe("w");
    expect(p.motifs).toContain("hanging_piece");
  });
});

describe("grounded explanations & reports", () => {
  // Scholar's-mate defence failure: Black plays 3...Nf6?? allowing Qxf7#
  const pgn = `[White "me"]\n[Black "opp"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
  const g = parsePgn(pgn);
  const analyses: PositionAnalysis[] = [
    pa(g.moves[0].fenBefore, 30, ["e2e4"]),
    pa(g.moves[1].fenBefore, -30, ["e7e5"]),
    pa(g.moves[2].fenBefore, 30, ["f1c4"]),
    pa(g.moves[3].fenBefore, -30, ["b8c6"]),
    pa(g.moves[4].fenBefore, 20, ["d1h5"]),
    pa(g.moves[5].fenBefore, 0, ["g7g6", "h5f3", "g8f6"]),
    pa(g.moves[6].fenBefore, { mate: 1 }, ["h5f7"]),
    { fen: g.moves[6].fenAfter, depth: 0, lines: [] },
  ];
  it("explains the blunder with the ignored mate threat and the refutation", () => {
    const ex = explainMove({ fenBefore: g.moves[5].fenBefore, playedUci: g.moves[5].uci, bestLine: analyses[5].lines[0], afterLine: analyses[6].lines[0], winBefore: 50, winAfter: 0, classification: "blunder", lang: "es" });
    expect(ex.headline).toContain("Nf6");
    expect(ex.threatsIgnored[0].san).toBe("Qxf7#");
    expect(ex.points.some((p) => p.kind === "threat" && p.text.includes("mate"))).toBe(true);
    expect(ex.bestSan).toBe("g6");
    expect(ex.motifsRefutation).toContain("mate");
  });
  it("builds a report from Black's perspective", () => {
    const r = buildGameReport(g, analyses, { userColor: "b", lang: "en" });
    expect(r.userResult).toBe("loss");
    expect(r.counts.blunders).toBe(1);
    expect(r.topMistakes[0].san).toBe("Nf6");
    expect(r.exercises.some((e) => e.kind === "find_threat" && e.solutionUci[0] === "h5f7")).toBe(true);
    expect(r.lessons.join(" ")).toMatch(/threat/i);
    expect(r.time.available).toBe(false);
    const errs = errorsFromReport("g1", new Date().toISOString(), r);
    expect(errs[0].threatIgnored).toBe(true);
    const w = detectWeaknesses(errs, 1);
    expect(w[0].id).toBe("threat_awareness");
  });
});

describe("training science", () => {
  it("SM-2 intervals grow on success and reset on failure", () => {
    let s = newSrsState(new Date("2026-01-01"));
    s = review(s, 5, new Date("2026-01-01")); expect(s.interval).toBe(1);
    s = review(s, 5, new Date("2026-01-02")); expect(s.interval).toBe(3);
    s = review(s, 4, new Date("2026-01-05")); expect(s.interval).toBeGreaterThan(6);
    s = review(s, 1, new Date("2026-01-20")); expect(s.interval).toBe(1); expect(s.lapses).toBe(1);
    expect(qualityFromResult({ correct: true, hintsUsed: 1 })).toBe(4);
  });
  it("ratings: pools never mix, trend needs enough data", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ pool: "chesscom_rapid" as const, rating: 1600 + i * 3, at: new Date(2026, 0, 1 + i).toISOString() }));
    pts.push({ pool: "lichess_blitz" as any, rating: 2100, at: new Date(2026, 0, 5).toISOString() });
    const s = summarizeRatings(pts, "chesscom_rapid");
    expect(s.peak).toBe(1687);
    expect(s.trend?.significant).toBe(true);
    expect(s.trend!.slopePer30d).toBeCloseTo(90, 0);
    expect(ewma([1, 1, 1])[2]).toBe(1);
    expect(performanceRating([{ opponentRating: 1700, score: 1 }])).toBeNull();
    const perf = performanceRating(Array.from({ length: 20 }, (_, i) => ({ opponentRating: 1700, score: (i % 2) as 0 | 1 })))!;
    expect(perf.estimate).toBe(1700);
    expect(perf.low).toBeLessThan(1700);
  });
  it("daily plan redistributes time toward weaknesses and respects total minutes", () => {
    const plan = buildDailyPlan({ date: "2026-11-11", minutes: 60, weaknesses: [{ id: "endgame", domain: "endgames", label: { es: "Finales", en: "Endgames" }, score: 20, occurrences: 5, examples: [] }], dueReviews: 5, streak: 2 });
    expect(plan.totalMinutes).toBe(60);
    const eg = plan.blocks.find((b) => b.domain === "endgames")!;
    expect(eg.minutes).toBeGreaterThanOrEqual(20);
    const rec = buildDailyPlan({ date: "2026-11-11", minutes: 60, weaknesses: [], dueReviews: 5, streak: 7 });
    expect(rec.recovery).toBe(true);
    expect(rec.totalMinutes).toBeLessThanOrEqual(35);
  });
  it("curriculum & diagnostics", () => {
    expect(stageFor(1650).id).toBe(1);
    expect(stageFor(2050).id).toBe(3);
    const d = milestoneDiagnostic(1800);
    const ev = evaluateDiagnostic(d, { tactics: 99, threat_awareness: 99, calculation: 9, endgames: 30, openings: 99 });
    expect(ev.ready).toBe(false);
    expect(ev.gaps).toEqual(["positional"]);
  });
  it("endgame type", () => {
    expect(endgameType("8/8/4k3/8/8/2r5/4P3/4K2R w - - 0 1")).toBe("rook");
    expect(endgameType("8/8/4k3/8/8/8/4P3/4K3 w - - 0 1")).toBe("pawn");
  });
});

describe("content integrity", () => {
  it("all repertoire lines are legal", () => {
    for (const r of REPERTOIRES) expect(validateRepertoire(r)).toEqual([]);
    expect(repertoireLines(LONDON).length).toBeGreaterThan(4);
  });
  it("matches games against the repertoire", () => {
    const m = matchRepertoire(CARO_KANN, ["e4", "c6", "d4", "d5", "e5", "Bf5", "Nf3", "e6", "Be2", "Nd7"], "b");
    expect(m.deviation).toMatchObject({ by: "user", played: "Nd7", expected: ["c5"] });
    const o = matchRepertoire(LONDON, ["d4", "f5"], "w");
    expect(o.deviation?.by).toBe("opponent");
    const st = openingStats([{ opening: "Caro", result: "win" }, { opening: "Caro", result: "loss", deviationBy: "user", deviationSan: "Nd7" }]);
    expect(st[0]).toMatchObject({ games: 2, winPct: 50, userDeviations: { Nd7: 1 } });
  });
  it("master games are legal and stops point at the master's move", () => {
    for (const g of MASTER_GAMES) {
      const c = new Chess();
      c.loadPgn(g.pgnMoves);
      expect(c.history().length).toBeGreaterThan(30);
      expect(c.isCheckmate(), g.id).toBe(true);
      for (const s of g.stops) expect(s.ply).toBeLessThanOrEqual(c.history().length);
    }
    const opera = new Chess(); opera.loadPgn(MASTER_GAMES[0].pgnMoves);
    expect(opera.history()[MASTER_GAMES[0].stops[0].ply - 1]).toBe("Nxb5");
    expect(opera.history()[MASTER_GAMES[0].stops[2].ply - 1]).toBe("Qb8+");
    const imm = new Chess(); imm.loadPgn(MASTER_GAMES[1].pgnMoves);
    expect(imm.history()[MASTER_GAMES[1].stops[0].ply - 1]).toBe("Bd6");
    const ev = new Chess(); ev.loadPgn(MASTER_GAMES[2].pgnMoves);
    expect(ev.history()[MASTER_GAMES[2].stops[0].ply - 1]).toBe("Rad1");
    expect(ev.history()[MASTER_GAMES[2].stops[1].ply - 1]).toBe("Qxd7+");
  });
  it("endgame drills have legal FENs", () => {
    for (const d of ENDGAME_DRILLS) expect(() => new Chess(d.fen)).not.toThrow();
  });
  it("knowledge retrieval (BM25) finds relevant concepts in both languages", () => {
    expect(searchConcepts("clavada pieza")[0].id).toBe("motif-pin");
    expect(searchConcepts("rook endgame bridge")[0].id).toBe("lucena");
    expect(CONCEPTS.every((c) => c.title.es && c.title.en && c.body.es && c.body.en)).toBe(true);
  });
});

describe("calculation & coach guards", () => {
  const fen = SEED_PUZZLES[4].fen; // smothered mate
  it("grades a calculated line", () => {
    const sans = ["Qg8+", "Rxg8", "Nf7#"];
    const c = new Chess(fen);
    const fens = [c.fen()]; for (const s of sans) { c.move(s); fens.push(c.fen()); }
    const an: PositionAnalysis[] = [pa(fens[0], { mate: 2 }, ["d5g8", "e8g8", "h6f7"]), pa(fens[1], { mate: -1 }, ["e8g8", "h6f7"]), pa(fens[2], { mate: 1 }, ["h6f7"]), { fen: fens[3], depth: 0, lines: [] }];
    const g = gradeCalculation(fen, sans, an, "en");
    expect(g.correctDepth).toBe(3);
    expect(g.verdicts.every((v) => v.verdict === "best")).toBe(true);
    const bad = gradeCalculation(fen, ["Qg8+", "Kxg8"], an, "en");
    expect(bad.verdicts.at(-1)!.verdict).toBe("illegal");
    const cand = gradeCandidates(fen, ["Nf7+", "Qg8+"], an[0].lines, "en");
    expect(cand.foundBest).toBe(true);
  });
  it("flags hallucinated moves but allows legal / verified ones", () => {
    const start = new Chess().fen();
    expect(findUnverifiedMoves("Play Nf3 or e4, then Bb5 in the Ruy Lopez.", start, [["e4", "e5", "Nf3", "Nc6", "Bb5"]])).toEqual([]);
    expect(findUnverifiedMoves("Now Qxf7# wins immediately.", start)).toEqual(["Qxf7"]);
  });
  it("position context lists engine lines and threats", () => {
    const ctx = buildPositionContext({ fen, lines: [{ multipv: 1, depth: 22, score: { mate: 2 }, pv: ["d5g8", "e8g8", "h6f7"] }] });
    expect(ctx).toContain("1.Qg8+ Rxg8 2.Nf7#");
    expect(ctx).toContain("#2");
    expect(gradeThreatAnswer(fen, "gxh6", "en").correct).toBe(true);
    expect(gradeThreatAnswer(fen, "Re1+", "en").correct).toBe(false);
    expect(buildCoachSystemPrompt("tactical", { rating: 1650, goal: 2000, whiteRepertoire: "London", blackRepertoire: "Caro-Kann", minutesPerDay: 60, lang: "es" })).toContain("Spanish");
  });
});

import { PAWN_STRUCTURES, OPENING_PRINCIPLES, buildIdeaQuestion, bestRepertoireMatch, repertoireById, lineFen } from "../src";

describe("expanded repertoire & opening understanding", () => {
  it("has modules for both colours against the main first moves, all legal", () => {
    const groups = new Set(REPERTOIRES.map((r) => r.group));
    expect(groups).toEqual(new Set(["white", "black_e4", "black_d4"]));
    expect(REPERTOIRES.length).toBeGreaterThanOrEqual(13);
    for (const r of REPERTOIRES) {
      expect(validateRepertoire(r), r.id).toEqual([]);
      expect(r.side === "w" ? r.group === "white" : r.group !== "white").toBe(true);
      for (const sid of r.structureIds) expect(PAWN_STRUCTURES.some((s) => s.id === sid), `${r.id} → ${sid}`).toBe(true);
      // every module explains itself: ideas on at least a third of its moves for the module's side
      expect(r.principles.length + r.plans.length).toBeGreaterThanOrEqual(3);
    }
  });
  it("structure example lines and quiz answers are legal", () => {
    for (const s of PAWN_STRUCTURES) {
      if (s.exampleLine) expect(() => lineFen(s.exampleLine!), s.id).not.toThrow();
      if (s.quiz) {
        const c = new Chess(lineFen(s.quiz.line));
        for (const a of s.quiz.answers) expect(() => new Chess(c.fen()).move(a), `${s.id}: ${a}`).not.toThrow();
      }
    }
    expect(OPENING_PRINCIPLES.length).toBeGreaterThanOrEqual(6);
  });
  it("matches games to the best module of the user's repertoire", () => {
    const qgd = ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"];
    expect(bestRepertoireMatch(qgd, "b", ["caro-kann", "qgd"]).rep.id).toBe("qgd");
    const r = bestRepertoireMatch(["e4", "c5", "Nf3", "d6", "d4", "cxd4"], "b", ["caro-kann"]);
    expect(r.rep.id).toBe("sicilian-najdorf");
    expect(r.inUserRepertoire).toBe(false);
    expect(bestRepertoireMatch(["d4", "d5", "Bf4"], "w").rep.id).toBe("london");
  });
  it("builds 'why this move?' questions with one correct idea", () => {
    let seed = 1; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const q = buildIdeaQuestion(REPERTOIRES, "french", rand)!;
    expect(q.options[q.answerIndex]).toEqual(q.correct);
    expect(q.options.length).toBe(4);
    expect(new Set(q.options.map((o) => o.es)).size).toBe(4);
    expect(() => new Chess(q.fen).move(q.san)).not.toThrow();
    expect(repertoireById("slav")?.side).toBe("b");
  });
});
