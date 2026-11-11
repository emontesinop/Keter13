import { Chess } from "chess.js";
import type { PositionAnalysis, PvLine } from "./types";
import { negate, winPercentFromScore } from "./eval";
import { moveToUci, uciLineToSan } from "./pgn";
import type { Lang } from "./explain";

export interface PlyVerdict { ply: number; san: string; by: "user" | "opponent"; verdict: "best" | "good" | "dubious" | "wrong" | "illegal"; engineSan?: string; drop?: number; note: string; }
export interface CalculationGrade { legalPlies: number; correctDepth: number; score: number; verdicts: PlyVerdict[]; summary: string; }

/** Return the FENs of each position along a SAN line (index 0 = start). Stops at the first illegal move. */
export function linePositions(fen: string, sans: string[]): { fens: string[]; uci: string[]; illegalAt: number | null } {
  const c = new Chess(fen);
  const fens = [c.fen()], uci: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    try { const m = c.move(sans[i].trim()); uci.push(moveToUci(m)); fens.push(c.fen()); }
    catch { return { fens, uci, illegalAt: i }; }
  }
  return { fens, uci, illegalAt: null };
}

/**
 * "Calculation without moving": the student writes a line BEFORE touching the pieces.
 * analyses[i] must analyse fens[i] (the position before ply i). The user is the side to move at the start.
 */
export function gradeCalculation(fen: string, sans: string[], analyses: PositionAnalysis[], lang: Lang = "es"): CalculationGrade {
  const es = lang === "es";
  const { fens, uci, illegalAt } = linePositions(fen, sans);
  const verdicts: PlyVerdict[] = [];
  let correctDepth = 0, chainOk = true;
  for (let i = 0; i < uci.length; i++) {
    const a = analyses[i], b = analyses[i + 1];
    const by = i % 2 === 0 ? "user" : "opponent";
    if (!a?.lines.length) break;
    const best = a.lines[0];
    const before = winPercentFromScore(best.score);
    const after = b?.lines.length ? winPercentFromScore(negate(b.lines[0].score)) : (new Chess(fens[i + 1]).isCheckmate() ? 100 : 50);
    const drop = Math.max(0, before - after);
    const isBest = best.pv[0] === uci[i];
    const engineSan = uciLineToSan(fens[i], [best.pv[0]])[0];
    let verdict: PlyVerdict["verdict"] = isBest || drop < 2 ? "best" : drop < 5 ? "good" : drop < 12 ? "dubious" : "wrong";
    let note: string;
    if (by === "user") {
      note = verdict === "best" || verdict === "good" ? (es ? "Correcto." : "Correct.") : (es ? `Mejor era ${engineSan} (pierdes ≈${Math.round(drop)} pts de probabilidad).` : `Better was ${engineSan} (≈${Math.round(drop)} win% points lost).`);
    } else {
      // For opponent moves, a "wrong" prediction means the student assumed a weaker defence than the best one.
      note = verdict === "best" || verdict === "good" ? (es ? "Consideraste la mejor defensa." : "You considered the best defence.") : (es ? `El rival tiene una defensa mejor: ${engineSan}.` : `The opponent has a better defence: ${engineSan}.`);
      if (verdict === "wrong") verdict = "dubious";
    }
    if (chainOk && (verdict === "best" || verdict === "good")) correctDepth++; else chainOk = false;
    verdicts.push({ ply: i + 1, san: sans[i], by, verdict, engineSan, drop: Math.round(drop * 10) / 10, note });
  }
  if (illegalAt !== null) verdicts.push({ ply: illegalAt + 1, san: sans[illegalAt], by: illegalAt % 2 === 0 ? "user" : "opponent", verdict: "illegal", note: es ? "Jugada ilegal en esa posición: revisa tu visualización." : "Illegal move in that position: check your visualisation." });
  const n = Math.max(1, sans.length);
  const score = Math.round((correctDepth / n) * 70 + Math.min(30, correctDepth * 6));
  const summary = es
    ? `Variante correcta hasta la jugada ${correctDepth} de ${sans.length}.${illegalAt !== null ? " Hubo una jugada ilegal: la visualización necesita trabajo." : ""}`
    : `Line correct up to ply ${correctDepth} of ${sans.length}.${illegalAt !== null ? " There was an illegal move: visualisation needs work." : ""}`;
  return { legalPlies: uci.length, correctDepth, score: Math.min(100, score), verdicts, summary };
}

/** Compare a student's candidate list against the engine's MultiPV lines. */
export function gradeCandidates(fen: string, candidatesSan: string[], lines: PvLine[], lang: Lang = "es") {
  const es = lang === "es";
  const top = lines.slice(0, 3);
  const bestWin = top[0] ? winPercentFromScore(top[0].score) : 50;
  const goodUci = new Set(top.filter((l) => bestWin - winPercentFromScore(l.score) < 8).map((l) => l.pv[0]));
  const cands = candidatesSan.map((s) => { const p = linePositions(fen, [s]); return { san: s, uci: p.uci[0] ?? null }; });
  const found = cands.filter((c) => c.uci && goodUci.has(c.uci));
  const missed = [...goodUci].filter((u) => !cands.some((c) => c.uci === u)).map((u) => uciLineToSan(fen, [u])[0]);
  return {
    candidates: cands.map((c) => ({ ...c, legal: !!c.uci, strong: !!c.uci && goodUci.has(c.uci) })),
    foundBest: !!top[0] && cands.some((c) => c.uci === top[0].pv[0]),
    missed,
    feedback: found.length
      ? (es ? `Encontraste ${found.length} de las candidatas fuertes.${missed.length ? ` No consideraste: ${missed.join(", ")}.` : ""}` : `You found ${found.length} strong candidate(s).${missed.length ? ` You didn't consider: ${missed.join(", ")}.` : ""}`)
      : (es ? `Ninguna de tus candidatas está entre las fuertes. Revisa jaques, capturas y amenazas: ${missed.join(", ")}.` : `None of your candidates is among the strong ones. Check checks, captures and threats: ${missed.join(", ")}.`),
  };
}
