/**
 * Per-player duel profile for the script-v1 engine, built once per series.
 *
 * Aim is `skill` (the headline number) plus small, clamped adjustments from
 * the weapon attributes (rifle / AWP / pistol) and weapon mastery. The other
 * attributes act only in their situation (duel.ts): reaction and entry in
 * opening duels, eyesight when holding, trading in trade duels, clutch and
 * stress resistance when last alive, creativity for lurks, grenades for
 * utility, tactic/leader for the IGL's reads.
 *
 * Condition (form, morale, energy, fatigue) is a small bounded term
 * (CONDITION_MIN..CONDITION_MAX rating points).
 */

import type { Player } from "@/types"
import { getMasteryLevel, MASTERY_LEVELS } from "../../weapon-mastery-system"
import { TUNING } from "./tuning"
import type { WeaponClass } from "./weapons"

export type SimRole = "entry" | "support" | "igl" | "awp" | "rifler"

export const CONDITION_MIN = -6
export const CONDITION_MAX = 3

export const TRAIT_AGGRESSIVE = 1
export const TRAIT_PASSIVE = 2
export const TRAIT_CLUTCHER = 4
export const TRAIT_TRADER = 8

export interface SimProfile {
    id: string
    role: SimRole
    skill: number
    /** Aim adjustment (points) per weapon attribute family. */
    adj: { rifle: number; awp: number; pistol: number; mixed: number }
    reaction: number
    eyesight: number
    entry: number
    trading: number
    clutch: number
    stress: number
    grenades: number
    teamwork: number
    creativity: number
    tactic: number
    leader: number
    /** Form / morale / energy / fatigue, rating points. */
    condition: number
    traits: number
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d)
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export function roleOf(role: string | undefined): SimRole {
    const r = (role ?? "").toUpperCase()
    if (r.includes("ENTRY")) return "entry"
    if (r.includes("SUPPORT")) return "support"
    if (r === "IGL" || r.includes("LEADER")) return "igl"
    if (r.includes("AWP") || r.includes("SNIPER")) return "awp"
    return "rifler"
}

function masteryPoints(p: Player, key: "RIFLE" | "AWP" | "PISTOL" | "SMG"): number {
    const xp = p.weaponMastery?.[key]
    if (typeof xp !== "number" || xp <= 0) return 0
    // Master (+12% accuracy) ≈ +2.4 points.
    return MASTERY_LEVELS[getMasteryLevel(xp)].accuracyBonus * 0.2
}

/**
 * Condition in rating points: form 55 and morale 65 are neutral (unset form
 * 50 / morale 70, as the AI-path adapter), low energy (< 50) and fatigue
 * cost, all bounded to [CONDITION_MIN, CONDITION_MAX].
 */
export function conditionPoints(p: Pick<Player, "form" | "morale" | "energy" | "fatigue">): number {
    const form = clamp((num(p.form, 50) - 55) / 40, -1.5, 1) * 2
    const morale = clamp((num(p.morale, 70) - 65) / 35, -1.5, 1) * 1.5
    const energy = -6 * Math.max(0, 50 - num(p.energy, 100)) / 50
    const fatigue = -4 * clamp(num(p.fatigue, 0), 0, 100) / 100
    return clamp(form + morale + energy + fatigue, CONDITION_MIN, CONDITION_MAX)
}

export function buildProfile(p: Player): SimProfile {
    const skill = num(p.skill, 50)
    const traits = p.traits ?? []
    const t = (name: string, bit: number) => (traits.includes(name) ? bit : 0)
    return {
        id: p.id,
        role: roleOf(p.role),
        skill,
        adj: {
            rifle: clamp((num(p.rifle, 70) - 70) * 0.08, -3, 2.5) + masteryPoints(p, "RIFLE"),
            awp: clamp((num(p.awp, 70) - 70) * 0.15, -9, 3.5) + masteryPoints(p, "AWP"),
            pistol: clamp((num(p.pistol, 60) - 60) * 0.08, -3, 3) + masteryPoints(p, "PISTOL"),
            mixed: clamp(((num(p.rifle, 70) - 70) + (num(p.pistol, 60) - 60)) * 0.04, -3, 3) + masteryPoints(p, "SMG"),
        },
        reaction: num(p.reaction, 50),
        eyesight: num(p.eyesight, 70),
        entry: num(p.entry, 50),
        trading: num(p.trading, 50),
        clutch: num(p.clutch, 50),
        stress: num(p.stressResistance, 50),
        grenades: num(p.grenades, 50),
        teamwork: num(p.teamwork, 50),
        creativity: num(p.creativity, 50),
        tactic: num(p.tactic, 50),
        leader: num(p.leader, 50),
        condition: conditionPoints(p),
        traits: t("AGGRESSIVE", TRAIT_AGGRESSIVE) | t("PASSIVE", TRAIT_PASSIVE) | t("CLUTCHER", TRAIT_CLUTCHER) | t("TRADE_FRAGGER", TRAIT_TRADER),
    }
}

/** Aim points with a weapon class: skill plus the weapon attribute adjustment. */
export function aimPoints(prof: SimProfile, cls: WeaponClass): number {
    const base = TUNING.AIM_PER_SKILL * prof.skill
    switch (cls) {
        case "awp": case "scout": return base + prof.adj.awp
        case "rifle": case "rifleB": return base + prof.adj.rifle
        case "deagle": case "pistolB": case "pistol": return base + prof.adj.pistol
        default: return base + prof.adj.mixed
    }
}

/** IGL call quality (0-100): the IGL's tactic/leader blend, or the best caller minus a penalty when nobody is the IGL. */
export function callQuality(profiles: readonly SimProfile[]): number {
    const score = (p: SimProfile) => 0.6 * p.tactic + 0.4 * p.leader
    const igl = profiles.find(p => p.role === "igl")
    if (igl) return score(igl)
    return profiles.length ? Math.max(...profiles.map(score)) - 8 : 40
}
