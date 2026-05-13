"use client"

/**
 * Shared Store Utility Helpers
 *
 * Helper functions shared across multiple store slices.
 * Extracted from game-store.ts to avoid duplication.
 */

import { SeededRNG } from "@/engine"
import { generateSeed } from "@/engine/rng"

// ===== RNG-BACKED STATE TYPE =====

export type RngBackedState = {
  lastRngSeed: number
  currentWeek: number
}

// ===== RNG HELPERS =====

export const nextRandom = (state: RngBackedState): number => {
  const rng = new SeededRNG(state.lastRngSeed || generateSeed())
  const value = rng.next()
  state.lastRngSeed = rng.getState()
  return value
}

export const nextRandomInt = (state: RngBackedState, min: number, max: number): number => {
  return Math.floor(nextRandom(state) * (max - min + 1)) + min
}

export const nextDeterministicId = (
  state: RngBackedState,
  prefix: string,
  ...parts: Array<string | number | null | undefined>
): string => {
  const token = nextRandomInt(state, 0, 0x7fffffff).toString(36)
  const suffix = parts
    .filter((part): part is string | number => part !== undefined && part !== null)
    .map(String)
    .join("_")

  return suffix
    ? `${prefix}_${state.currentWeek}_${token}_${suffix}`
    : `${prefix}_${state.currentWeek}_${token}`
}

// ===== NUMERIC VALIDATION =====

export type NumericValidationResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

export const parseBoundedInt = (
  value: unknown,
  label: string,
  min: number,
  max: number
): NumericValidationResult => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a valid number` }
  }

  const normalized = Math.floor(value)
  if (normalized < min || normalized > max) {
    return { ok: false, message: `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` }
  }

  return { ok: true, value: normalized }
}

export const parseBoundedNumber = (
  value: unknown,
  label: string,
  min: number,
  max: number
): NumericValidationResult => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${label} must be a valid number` }
  }

  if (value < min || value > max) {
    return { ok: false, message: `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` }
  }

  return { ok: true, value }
}

// ===== SEED HELPERS =====

export const ensureDeterministicSeed = (
  state: RngBackedState,
  matchLike: { seed?: number }
): number => {
  if (Number.isFinite(matchLike.seed) && (matchLike.seed as number) > 0) {
    return matchLike.seed as number
  }
  const seed = nextRandomInt(state, 1, 2147483646)
  matchLike.seed = seed
  return seed
}

export const computeFallbackMatchSeed = (matchId: string, week: number, day: number, salt: number): number => {
  let hash = 2166136261
  const payload = `${matchId}:${week}:${day}:${salt}`
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.max(1, hash >>> 0)
}

// ===== DOMAIN CONSTANTS =====

export const MAX_TRANSFER_FEE = 1_000_000_000
export const MAX_PLAYER_SALARY_PER_WEEK = 10_000_000
export const MAX_STAFF_SALARY_PER_WEEK = 2_000_000
export const MAX_SIGNING_BONUS = 50_000_000
export const MAX_CONTRACT_LENGTH_WEEKS = 52 * 10
export const MAX_MAPS_PER_SERIES = 5
export const MAX_ROUNDS_PER_MAP = 60
export const MAX_MATCH_KILLS = 80
export const MAX_MATCH_DEATHS = 80
export const MAX_MATCH_ASSISTS = 60
export const MAX_MATCH_CLUTCHES = 15
export const MAX_MATCH_OPENINGS = 30
export const MAX_MATCH_ADR = 300
export const MAX_MATCH_RATING = 3
export const VOD_REVIEW_COST = 2_500
export const MENTAL_RESET_COST = 5_000

import { MapId } from "@/types/enums"
import type { TeamSaveData } from "@/engine/save-types"

export const ALLOWED_MAP_IDS = new Set<string>(Object.values(MapId))
export const VALID_PLAYSTYLES = new Set<TeamSaveData["playstyle"]>(["balanced", "aggressive", "structured", "default"])
export const VALID_ECONOMY_STYLES = new Set<TeamSaveData["economyStyle"]>(["standard", "force", "eco"])
