import type { ArmStats, Helped } from "../core/engine/bandit";
import type { InterventionId } from "../core/engine/interventions";
import type { CuditBand } from "../core/domain/cudit";

export interface Profile {
  id: "me";
  createdAt: number;
  onboarded: boolean;
  ageConfirmed: boolean;
  consentAt: number;
  locale: "es" | "en";
  /** Momento de inicio del corte (ms). */
  quitAt: number;
  strategy: "cold_turkey" | "taper";
  weeklySpend: number;
  currency: string;
  jointsPerDay: number;
  years: number;
  forms: string[];
  riskSlots: string[];
  triggers: string[];
}

export interface Assessment { id?: number; at: number; type: "cudit_r"; answers: number[]; score: number; band: CuditBand }
export interface Reason { id?: number; at: number; text?: string; /** data URL JPEG */ photo?: string }
export interface Craving {
  id?: number;
  at: number;
  intensity: number;
  emotion?: string;
  context?: string[];
  ctxKey: string;
  intervention?: InterventionId;
  after?: number;
  helped?: Helped;
  used: boolean;
  durationSec?: number;
}
/** Escalas 1-5. Clave primaria = fecha local YYYY-MM-DD (un check-in por día). */
export interface Checkin {
  date: string;
  at: number;
  mood: number;
  sleep: number;
  anxiety: number;
  irritability: number;
  appetite: number;
  cravings: number;
  used: boolean;
  note?: string;
}
export interface Lapse {
  id?: number;
  at: number;
  amount?: string;
  before?: string;
  during?: string;
  after?: string;
  triggers: string[];
  learned?: string;
  ifThen?: string;
}
export interface KV { key: string; value: unknown }
export type { ArmStats };
