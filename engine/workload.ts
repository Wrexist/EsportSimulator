/**
 * Workload and injury risk (C5).
 *
 * One formula for the weekly injury roll (EventProcessor.processInjuryChecks)
 * and for what the squad and training screens show, so the risk on screen is
 * the risk the week rolls. Load is the player's carried fatigue; the risk
 * rises with fatigue over 50, falls with health, and rises past age 30.
 *
 * The manager gets the call twice:
 *  - a workload warning when a player's weekly risk reaches WORKLOAD_TUNING.WARN_RISK: rest him this week (fatigue down, out of the
 *    starting five when a fit substitute exists) or play him at the stated risk;
 *  - a minor knock becomes a decision instead of an automatic layoff: rest him
 *    for the stated weeks, or play through it with a stated chance that it
 *    worsens into a moderate injury at the next check.
 *
 * Engine safe: no store, no React. Deterministic: rolls use the week's RNG.
 */
import type { PlayerSaveData } from "./save-types"

export const WORKLOAD_TUNING = {
    /** Weekly injury chance of a fresh player before health and age (same as before C5). */
    BASE_CHANCE: 0.002,
    /** Added per fatigue point over FATIGUE_FREE. */
    PER_FATIGUE: 0.002,
    FATIGUE_FREE: 50,
    /** Overall scale of the weekly roll (kept from the original tuning). */
    SCALE: 0.2,
    /** Age past which the chance rises by AGE_STEP per year. */
    AGE_FROM: 30,
    AGE_STEP: 0.05,
    /** A workload warning is raised once the weekly injury chance reaches this (about fatigue 75 at full health). */
    WARN_RISK: 0.005,
    /** Fatigue a rest week takes off at once (on top of the weekly recovery). */
    REST_FATIGUE: 25,
    /** Morale a rested player gains. */
    REST_MORALE: 3,
    /** Chance a knock played through worsens into a moderate injury at the next check. */
    KNOCK_ESCALATE: 0.3,
    /** Form a player loses for playing through a knock. */
    KNOCK_FORM: -5,
    /** From this fatigue, a moderate or severe injury is burnout rather than a random type. */
    BURNOUT_FATIGUE: 80,
} as const

type Loadable = Pick<PlayerSaveData, "fatigue" | "health" | "age"> & Partial<Pick<PlayerSaveData, "injury">>

/** Weekly injury chance (0..1) the week processor rolls for this player. */
export function injuryRiskPerWeek(p: Loadable, t = WORKLOAD_TUNING): number {
    if (p.injury) return 0
    let chance = t.BASE_CHANCE
    const fatigue = Math.max(0, Math.min(100, p.fatigue ?? 0))
    if (fatigue > t.FATIGUE_FREE) chance += (fatigue - t.FATIGUE_FREE) * t.PER_FATIGUE
    chance *= 1 - Math.max(0, Math.min(100, p.health ?? 100)) / 200
    if ((p.age ?? 22) > t.AGE_FROM) chance *= 1 + ((p.age ?? 22) - t.AGE_FROM) * t.AGE_STEP
    return chance * t.SCALE
}

/** The same player's risk if he were fresh (fatigue 0), the baseline the warning compares against. */
export function freshRisk(p: Loadable): number {
    return injuryRiskPerWeek({ ...p, fatigue: 0, injury: undefined })
}

/** How many times a fresh player's risk this player carries (1 = fresh). */
export function riskMultiple(p: Loadable): number {
    const base = freshRisk(p)
    return base > 0 ? injuryRiskPerWeek(p) / base : 1
}

export type LoadBand = "FRESH" | "NORMAL" | "HIGH" | "OVERLOADED"

export interface Workload {
    band: LoadBand
    label: string
    /** Fatigue 0–100 (the load). */
    load: number
    /** Weekly injury chance, 0..1. */
    risk: number
    /** Multiple of a fresh player's risk. */
    multiple: number
    tone: "good" | "neutral" | "warn" | "bad"
}

export function workloadOf(p: Loadable): Workload {
    const load = Math.round(Math.max(0, Math.min(100, p.fatigue ?? 0)))
    const risk = injuryRiskPerWeek(p)
    const multiple = riskMultiple(p)
    const band: LoadBand = load <= 30 ? "FRESH" : load <= 55 ? "NORMAL" : risk < WORKLOAD_TUNING.WARN_RISK ? "HIGH" : "OVERLOADED"
    const label = band === "FRESH" ? "Fresh" : band === "NORMAL" ? "Normal" : band === "HIGH" ? "High" : "Overloaded"
    const tone = band === "FRESH" ? "good" : band === "NORMAL" ? "neutral" : band === "HIGH" ? "warn" : "bad"
    return { band, label, load, risk, multiple, tone }
}

/** "0.4%" style percentage for a weekly chance (one decimal under 10%). */
export function riskPct(risk: number): string {
    const pct = risk * 100
    if (pct < 0.1) return "<0.1%"
    return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`
}

/** Should this player get a workload warning now? */
export function needsWorkloadWarning(p: Loadable & Partial<Pick<PlayerSaveData, "isRetired">>): boolean {
    if (p.isRetired || p.injury) return false
    return injuryRiskPerWeek(p) >= WORKLOAD_TUNING.WARN_RISK
}

/** Morale and form drift aside, what resting does to fatigue (never below 0). */
export function restedFatigue(fatigue: number): number {
    return Math.max(0, (fatigue ?? 0) - WORKLOAD_TUNING.REST_FATIGUE)
}
