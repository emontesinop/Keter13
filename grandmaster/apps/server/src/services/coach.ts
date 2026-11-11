import { Chess } from "chess.js";
import {
  buildCoachSystemPrompt, buildKnowledgeBlock, buildPositionContext, findUnverifiedMoves, searchConcepts, extractFeatures,
  formatLine, uciLineToSan, formatScore, toWhitePov, COACH_MODES, MOTIF_LABEL, detectMotifs, conceptById,
  type CoachMode, type PvLine, type Lang,
} from "@gm/core";
import type { Ctx } from "./context";
import { getProfile } from "./context";
import { analysePosition } from "./analysis";
import { userWeaknesses, dueCount } from "./training";

export interface ChatInput { threadId: string; mode: CoachMode; message: string; fen?: string; history?: string[]; socratic?: boolean; }

export async function getMemory(ctx: Ctx, userId: string) {
  const rows = await ctx.db.query<{ key: string; value: any }>("SELECT key, value FROM coach_memory WHERE user_id=$1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as { session_log?: { at: string; kind: string; summary: string }[]; notes?: string[]; last_position?: string };
}

export async function remember(ctx: Ctx, userId: string, kind: string, summary: string) {
  const mem = await getMemory(ctx, userId);
  const log = [...(mem.session_log ?? []), { at: new Date().toISOString(), kind, summary }].slice(-40);
  await ctx.db.query("INSERT INTO coach_memory(user_id, key, value) VALUES ($1,'session_log',$2) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()", [userId, JSON.stringify(log)]);
}

async function memoryBlock(ctx: Ctx, userId: string, lang: Lang) {
  const mem = await getMemory(ctx, userId);
  const { weaknesses, gamesAnalysed } = await userWeaknesses(ctx.db, userId);
  const due = await dueCount(ctx.db, userId);
  const lines = ["MEMORY (student history, from the app database):", `Analysed games (90d): ${gamesAnalysed}. Due spaced-repetition reviews: ${due}.`];
  if (weaknesses.length) lines.push(`Top recurring weaknesses: ${weaknesses.slice(0, 3).map((w) => `${w.label.en} (score ${w.score}, ${w.occurrences}×${w.detail ? `, detail ${JSON.stringify(w.detail)}` : ""})`).join("; ")}.`);
  for (const s of (mem.session_log ?? []).slice(-5)) lines.push(`- ${s.at.slice(0, 10)} [${s.kind}] ${s.summary}`);
  return lines.join("\n");
}

/** "Welcome back" message: what we studied last, what's due, and today's priority — no generic motivation. */
export async function welcome(ctx: Ctx, userId: string) {
  const p = await getProfile(ctx.db, userId);
  const es = p.language === "es";
  const mem = await getMemory(ctx, userId);
  const { weaknesses } = await userWeaknesses(ctx.db, userId);
  const due = await dueCount(ctx.db, userId);
  const last = (mem.session_log ?? []).slice(-1)[0];
  const parts: string[] = [];
  if (last) parts.push(es ? `La última vez (${last.at.slice(0, 10)}) trabajamos: ${last.summary}` : `Last time (${last.at.slice(0, 10)}) we worked on: ${last.summary}`);
  else parts.push(es ? "Primera sesión: importa tus partidas (Chess.com/Lichess) o sube un PGN para que pueda diagnosticar tus debilidades reales." : "First session: import your games (Chess.com/Lichess) or upload a PGN so I can diagnose your real weaknesses.");
  if (due) parts.push(es ? `Tienes ${due} posiciones de repaso pendientes (errores anteriores).` : `You have ${due} review positions due (previous mistakes).`);
  if (weaknesses[0]) parts.push(es ? `Prioridad actual según tus partidas: ${weaknesses[0].label.es}.` : `Current priority from your games: ${weaknesses[0].label.en}.`);
  return { message: parts.join(" "), due, topWeakness: weaknesses[0] ?? null };
}

/** Deterministic, engine-grounded answer used when no LLM is configured (or the LLM fails). */
function groundedAnswer(lang: Lang, fen: string | undefined, lines: PvLine[], conceptsQ: string) {
  const es = lang === "es";
  const out: string[] = [];
  if (fen) {
    const f = extractFeatures(fen);
    const stm = f.sideToMove;
    if (lines[0]) {
      const best = lines[0];
      const motifs = detectMotifs({ fen, line: best.pv, mateIn: best.score.mate });
      out.push(es ? `Evaluación del motor: ${formatScore(toWhitePov(best.score, stm))} (profundidad ${best.depth}). Mejor línea: ${formatLine(fen, uciLineToSan(fen, best.pv.slice(0, 8)))}.` : `Engine evaluation: ${formatScore(toWhitePov(best.score, stm))} (depth ${best.depth}). Best line: ${formatLine(fen, uciLineToSan(fen, best.pv.slice(0, 8)))}.`);
      if (motifs.length) out.push(es ? `Idea táctica detectada: ${motifs.map((m) => MOTIF_LABEL[m].es).join(", ")}.` : `Tactical idea detected: ${motifs.map((m) => MOTIF_LABEL[m].en).join(", ")}.`);
      for (const l of lines.slice(1, 3)) out.push(es ? `Alternativa: ${formatLine(fen, uciLineToSan(fen, l.pv.slice(0, 5)))} (${formatScore(toWhitePov(l.score, stm))}).` : `Alternative: ${formatLine(fen, uciLineToSan(fen, l.pv.slice(0, 5)))} (${formatScore(toWhitePov(l.score, stm))}).`);
    }
    const th = f.threatsAgainstSideToMove;
    out.push(th.length ? (es ? `Amenazas del rival si no actúas: ${th.map((t) => t.san).join(", ")}.` : `Opponent threats if you do nothing: ${th.map((t) => t.san).join(", ")}.`) : (es ? "No hay amenazas tácticas directas del rival." : "No direct tactical threats from the opponent."));
    const own = f.hanging[stm];
    if (own.length) out.push(es ? `Piezas tuyas vulnerables: ${own.map((h) => h.square).join(", ")}.` : `Your vulnerable pieces: ${own.map((h) => h.square).join(", ")}.`);
    const ps = f.pawns[stm];
    const weak = [...ps.isolated, ...ps.backward];
    if (weak.length) out.push(es ? `Debilidades de peones propias: ${[...new Set(weak)].join(", ")}.` : `Your pawn weaknesses: ${[...new Set(weak)].join(", ")}.`);
  }
  const concepts = searchConcepts(conceptsQ, 2);
  for (const c of concepts) out.push(`• ${c.title[lang]}: ${c.body[lang]}`);
  out.push(es ? "(Respuesta generada sin modelo de lenguaje: solo datos verificados del tablero y del motor. Configura ANTHROPIC_API_KEY para explicaciones conversacionales.)" : "(Answer generated without a language model: only verified board and engine data. Configure ANTHROPIC_API_KEY for conversational explanations.)");
  return out.join("\n");
}

export async function coachChat(ctx: Ctx, userId: string, input: ChatInput) {
  const p = await getProfile(ctx.db, userId);
  const lang = p.language;
  let fen = input.fen;
  if (fen) { try { fen = new Chess(fen).fen(); } catch { throw new Error("Invalid FEN"); } }
  const lines = fen ? (await analysePosition(ctx, fen, Math.min(p.engine_depth, 18), 3)).lines : [];
  const concepts = searchConcepts(`${input.message} ${input.mode}`, 3);
  const history = await ctx.db.query<{ role: "user" | "assistant"; content: string }>("SELECT role, content FROM coach_messages WHERE user_id=$1 AND thread_id=$2 ORDER BY id DESC LIMIT 12", [userId, input.threadId]);
  history.reverse();
  await ctx.db.query("INSERT INTO coach_messages(user_id, thread_id, role, content, meta) VALUES ($1,$2,'user',$3,$4)", [userId, input.threadId, input.message, JSON.stringify({ fen, mode: input.mode })]);

  let answer: string, provider = "grounded", unverified: string[] = [];
  const verifiedLines = fen ? [...lines.map((l) => uciLineToSan(fen!, l.pv)), input.history ?? []] : [];
  if (ctx.llm.available) {
    const system = buildCoachSystemPrompt(input.mode, { rating: p.rating_estimate, goal: p.goal_rating, whiteRepertoire: p.white_repertoire, blackRepertoire: p.black_repertoire, minutesPerDay: p.minutes_per_day, lang });
    const blocks = [
      fen ? buildPositionContext({ fen, lines, history: input.history, lang }) : "No position attached to this question.",
      buildKnowledgeBlock(concepts, lang),
      await memoryBlock(ctx, userId, lang),
      input.socratic ? "SOCRATIC MODE: do not reveal the best move yet. Ask the next single guiding question." : "",
      `STUDENT QUESTION: ${input.message}`,
    ].filter(Boolean).join("\n\n");
    const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: blocks }];
    try {
      let r = await ctx.llm.complete({ system, messages });
      provider = `${r.provider}:${r.model}`;
      unverified = fen ? findUnverifiedMoves(r.text, fen, verifiedLines) : [];
      if (unverified.length) {
        // one self-correction round, then disclose anything still unverified
        r = await ctx.llm.complete({ system, messages: [...messages, { role: "assistant", content: r.text }, { role: "user", content: `These moves are not legal here nor in the verified lines: ${unverified.join(", ")}. Rewrite your answer without them, or explicitly label them as unverified ideas.` }] });
        unverified = fen ? findUnverifiedMoves(r.text, fen, verifiedLines) : [];
      }
      answer = r.refused || !r.text ? groundedAnswer(lang, fen, lines, input.message) : r.text;
      if (unverified.length) answer += lang === "es" ? `\n\n⚠️ No verificado por el motor: ${unverified.join(", ")}. Compruébalo en el tablero de análisis.` : `\n\n⚠️ Not engine-verified: ${unverified.join(", ")}. Check it on the analysis board.`;
    } catch (e) {
      answer = groundedAnswer(lang, fen, lines, input.message);
      provider = "grounded (LLM error: " + (e as Error).message.slice(0, 80) + ")";
    }
  } else {
    answer = groundedAnswer(lang, fen, lines, input.message);
  }
  const meta = { provider, unverified, lines: fen ? lines.map((l) => ({ ...l, san: uciLineToSan(fen!, l.pv.slice(0, 10)) })) : [], concepts: concepts.map((c) => c.id), mode: input.mode };
  await ctx.db.query("INSERT INTO coach_messages(user_id, thread_id, role, content, meta) VALUES ($1,$2,'assistant',$3,$4)", [userId, input.threadId, answer, JSON.stringify(meta)]);
  await remember(ctx, userId, `coach:${input.mode}`, `${COACH_MODES[input.mode][lang]} — "${input.message.slice(0, 90)}"${concepts[0] ? ` (${concepts[0].title[lang]})` : ""}`);
  return { answer, ...meta };
}

export const conceptLookup = conceptById;
