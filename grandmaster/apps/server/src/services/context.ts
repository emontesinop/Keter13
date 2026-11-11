import type { Db } from "../db";
import type { LlmProvider } from "../llm/provider";
import type { PositionAnalysis } from "@gm/core";
import type { FetchLike } from "../integrations/http";

export interface EngineLike { analyse(fen: string, opts?: { depth?: number; multipv?: number; movetimeMs?: number }): Promise<PositionAnalysis>; label?: string; quit?(): Promise<void>; }

export interface Ctx { db: Db; engine: EngineLike; llm: LlmProvider; fetchImpl?: FetchLike; httpBackoffMs?: number; }

export interface Profile {
  user_id: string; display_name: string | null; rating_estimate: number; goal_rating: number; long_term_goal: number; minutes_per_day: number;
  primary_platform: string; secondary_platform: string; white_repertoire: string; black_repertoire: string; language: "es" | "en"; secondary_language: string;
  learning_preference: string; training_style: string; thresholds: { inaccuracy: number; mistake: number; blunder: number }; engine_depth: number; sync_frequency: string; fide_id: string | null; repertoire_ids: string[];
}

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const p = await db.one<Profile>("SELECT * FROM profiles WHERE user_id=$1", [userId]);
  if (!p) throw new Error("Profile missing");
  return p;
}
