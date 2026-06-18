/**
 * Staff specialization → gameplay effect.
 *
 * `staff.specialization` was written by every generator (and the curated DB)
 * but read by no logic — a cosmetic field. This module normalizes the messy
 * free-form vocabulary (generator strings like "Player Dev"/"Data Science",
 * curated-DB strings like "Macro & Meta"/"Opponent Prep", and the legacy
 * tactical/mental/individual enum) into a small canonical focus, then grants a
 * bounded "true specialist" multiplier when a staffer's focus matches their
 * role's core domain.
 *
 * The multiplier modulates the staffer's EXISTING primary contribution (it does
 * not add a parallel system): coach→training development, analyst→tactical
 * bonus. It is deterministic (pure string→number) and bounded, so it's safe to
 * multiply unconditionally — a non-specialist or unknown specialization yields
 * exactly 1.0.
 */

import type { StaffSaveData } from "./save-types"

export type SpecializationFocus = "DEVELOPMENT" | "TACTICAL" | "MENTAL" | "SCOUTING" | "GENERAL"

/** Each role's core domain — the focus that makes a staffer a "true specialist". */
export const ROLE_PRIMARY_FOCUS: Record<StaffSaveData["role"], SpecializationFocus> = {
    coach: "DEVELOPMENT",
    analyst: "TACTICAL",
    psychologist: "MENTAL",
    scout: "SCOUTING",
}

/** Bounded bonus applied to a specialist's primary-role contribution (+10%). */
export const SPECIALIST_MULTIPLIER = 1.1

/**
 * Collapse any specialization string into a canonical focus. Substring,
 * case-insensitive; first match wins (order matters: "mental" must not be
 * shadowed by the development "mentor" key).
 */
export function normalizeSpecialization(spec: string | null | undefined): SpecializationFocus {
    const s = (spec || "").toLowerCase()
    if (!s) return "GENERAL"
    if (s.includes("dev") || s.includes("individual") || s.includes("growth") || s.includes("mentor")) return "DEVELOPMENT"
    if (s.includes("mental") || s.includes("psych") || s.includes("stress") || s.includes("mind")) return "MENTAL"
    if (s.includes("talent") || s.includes("scout") || s.includes("recruit")) return "SCOUTING"
    if (s.includes("tactic") || s.includes("strateg") || s.includes("data") || s.includes("macro") ||
        s.includes("meta") || s.includes("prep") || s.includes("analy") || s.includes("opponent")) return "TACTICAL"
    return "GENERAL"
}

/** True when the staffer's specialization aligns with their role's core domain. */
export function isSpecialist(staff: { role: string; specialization?: string | null }): boolean {
    const primary = ROLE_PRIMARY_FOCUS[staff.role as StaffSaveData["role"]]
    if (!primary) return false
    return normalizeSpecialization(staff.specialization) === primary
}

/**
 * Deterministic, bounded multiplier for a staffer's primary-role effect.
 * SPECIALIST_MULTIPLIER for a true specialist, 1.0 otherwise.
 */
export function getSpecializationMultiplier(staff: { role: string; specialization?: string | null }): number {
    return isSpecialist(staff) ? SPECIALIST_MULTIPLIER : 1
}
