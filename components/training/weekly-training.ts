import { t } from "@/lib/i18n"
/**
 * Read-only preview of what the weekly training tick will do to a player.
 *
 * Mirrors TrainingProcessor.processTraining (engine/processors/
 * training-processor.ts) with the managed club's config from the week tick
 * (store/game-store.ts: AIM at intensity 5; a player's own focus overrides it
 * unless it is "BALANCED"). Uses the engine's own formulas so the UI can't
 * promise gains the game doesn't apply.
 */

import { trainingAgeFactor } from "@/engine/development-rates"
import { TrainingFocus, calculateTrainingFatigue, calculateTrainingGains } from "@/types"
import { facilityLevel, staffDevelopmentEffects } from "@/engine/organization-effects"
import { getPlayerPassiveBonuses } from "@/engine/talent-trees"
import type { PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"

/** The managed club's weekly regimen (store/game-store.ts). */
export const TEAM_DEFAULT_FOCUS = TrainingFocus.AIM
export const TEAM_TRAINING_INTENSITY = 5

/** Weekly focus choices; the label is t(`tr.focus.${value}`) and the line under it t(`tr.focus.${value}.trains`). */
export const FOCUS_OPTIONS: { value: string }[] = [
    { value: "BALANCED" },
    { value: TrainingFocus.AIM },
    { value: TrainingFocus.TACTICS },
    { value: TrainingFocus.TEAMPLAY },
    { value: TrainingFocus.REST },
]

/** Translated label of a weekly focus value (unknown values fall back to the club default). */
export function focusLabel(value: string | undefined): string {
    return FOCUS_OPTIONS.some(o => o.value === value) ? t(`tr.focus.${value}`) : t("tr.focus.BALANCED")
}

const STAT_KEYS = new Set(["skill", "rifle", "awp", "pistol", "reaction", "tactic", "grenades", "creativity", "teamwork", "leader", "clutch", "morale", "stressResistance", "health"])

/** Translated name of a player stat key (tr.stat.*), or the key itself when unknown. */
export function statLabel(stat: string): string {
    return STAT_KEYS.has(stat) ? t(`tr.stat.${stat}`) : stat
}

export function resolveFocus(playerFocus: string | undefined): TrainingFocus {
    if (playerFocus && playerFocus !== "BALANCED" && (Object.values(TrainingFocus) as string[]).includes(playerFocus)) {
        return playerFocus as TrainingFocus
    }
    return TEAM_DEFAULT_FOCUS
}

export interface TrainingModifiers {
    /** Training facility × coach development (applies to every stat). */
    general: number
    /** Extra for tactics/leadership/teamwork: tactical facility × coach talent. */
    tactical: number
}

export function trainingModifiers(team: TeamSaveData | undefined, staff: StaffSaveData[], currentWeek: number): TrainingModifiers {
    const active = staff.filter(s => s.teamId === team?.id && (s.contractEndWeek === undefined || s.contractEndWeek > currentWeek))
    const effects = staffDevelopmentEffects(active)
    const trainingFacility = 1 + facilityLevel(team?.facilities?.find(f => f.type === "TRAINING")?.level || 0) * 0.1
    const tacticalFacility = 1 + facilityLevel(team?.facilities?.find(f => f.type === "TACTICAL")?.level || 0) * 0.2
    return { general: trainingFacility * effects.trainingMultiplier, tactical: tacticalFacility * effects.tacticMultiplier }
}

export interface WeeklyPreview {
    focus: TrainingFocus
    gains: { stat: string; amount: number }[]
    /** Positive adds fatigue, negative recovers it. */
    fatigue: number
    morale: number
}

export function weeklyPreview(player: PlayerSaveData, mods: TrainingModifiers): WeeklyPreview {
    const focus = resolveFocus(player.trainingFocus)
    const raw = calculateTrainingGains(focus, TEAM_TRAINING_INTENSITY, player.productivity, player.potential)
    const gains: { stat: string; amount: number }[] = []
    for (const [stat, gain] of Object.entries(raw)) {
        if (!gain) continue
        const current = Number((player as unknown as Record<string, number>)[stat])
        if (!Number.isFinite(current)) continue
        let g = gain * mods.general * trainingAgeFactor(player.age)
        if (stat === "tactic" || stat === "leader" || stat === "teamwork") g *= mods.tactical
        const cap = Math.min(100, Math.max(current, player.potential))
        gains.push({ stat, amount: Math.max(0, Math.min(cap, current + g) - current) })
    }
    const reduction = getPlayerPassiveBonuses(player.unlockedTalentIds || [])["fatigue_reduction"] || 0
    let fatigue = calculateTrainingFatigue(focus, TEAM_TRAINING_INTENSITY, player.endurance)
    if (reduction > 0) fatigue *= 1 - Math.min(reduction, 90) / 100
    return { focus, gains, fatigue, morale: focus === TrainingFocus.REST ? 5 : 0 }
}

/** Drill reward names → the player stat they actually change (store/slices/team-drills-slice.ts STAT_MAPPING). */
const DRILL_STAT_KEY: Record<string, string> = {
    agility: "reaction", focus: "stressResistance", entry: "rifle", mechanics: "skill", accuracy: "rifle",
    leadership: "leader", stressresistance: "stressResistance",
}

export function drillStatLabel(stat: string): string {
    const key = stat.toLowerCase()
    const mapped = DRILL_STAT_KEY[key] ?? key
    if (STAT_KEYS.has(mapped)) return statLabel(mapped)
    const direct = [...STAT_KEYS].find(k => k.toLowerCase() === key)
    return direct ? statLabel(direct) : stat
}
