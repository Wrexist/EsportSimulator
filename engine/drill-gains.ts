/**
 * Team drill stat gains (SQUAD-01).
 *
 * A drill's listed gains are the base. Each player keeps the share weekly
 * training gives him (TrainingProcessor.processTraining): training facility ×
 * coach development, the archetype and mentor factors and the age curve
 * (AGE_CURVE.TRAINING); tactics, leadership and teamwork also take the
 * tactical facility × coach talent bonus. The result is capped at the
 * player's potential (a stat already above it is held). Morale and health are
 * not development: they move by the listed amount, capped at 100.
 *
 * Shared by the drill action (store/slices/team-drills-slice.ts) and the
 * Training screen, so the cards and the toast show what the drill applies.
 */

import type { PlayerSaveData, StaffSaveData, TeamSaveData } from "./save-types"
import { trainingAgeFactor } from "./development-rates"
import { facilityLevel, staffDevelopmentEffects } from "./organization-effects"
import { getArchetype, mentorTrainingFactor, trainingFactor } from "./personality"

/** Drill reward names → the player stat they change. */
export const DRILL_STAT_MAPPING: Record<string, keyof PlayerSaveData> = {
    agility: "reaction",
    focus: "stressResistance",
    entry: "rifle",
    mechanics: "skill",
    accuracy: "rifle",
    leadership: "leader",
    stressresistance: "stressResistance",
}

/** Stats a drill moves by the listed amount (not development, capped at 100). */
const UNSCALED_STATS = new Set(["morale", "health"])
const TACTICAL_STATS = new Set(["tactic", "leader", "teamwork"])

/** Player stat key a drill reward changes (lower case unless mapped). */
export function drillStatKey(stat: string): string {
    const key = stat.toLowerCase()
    return (DRILL_STAT_MAPPING[key] as string | undefined) ?? key
}

export interface DrillContext {
    team: TeamSaveData
    /** All staff; filtered to the club's active contracts here. */
    staff: StaffSaveData[]
    currentWeek: number
    lookup: (id: string) => PlayerSaveData | undefined
}

export interface DrillClubFactors {
    /** Training facility × coach development (every scaled stat). */
    general: number
    /** Tactical facility × coach talent (tactics, leadership, teamwork). */
    tactical: number
}

/** The club's drill multipliers: the same as weekly training's. */
export function drillClubFactors(team: TeamSaveData, staff: StaffSaveData[], currentWeek: number): DrillClubFactors {
    const active = staff.filter(s => s.teamId === team.id && (s.contractEndWeek === undefined || s.contractEndWeek > currentWeek))
    const effects = staffDevelopmentEffects(active)
    const training = 1 + facilityLevel(team.facilities?.find(f => f.type === "TRAINING")?.level || 0) * 0.1
    const tactical = 1 + facilityLevel(team.facilities?.find(f => f.type === "TACTICAL")?.level || 0) * 0.2
    return { general: training * effects.trainingMultiplier, tactical: tactical * effects.tacticMultiplier }
}

export interface DrillStatGain {
    /** Player stat key. */
    stat: string
    /** Points the drill adds to this player (0 at the ceiling). */
    amount: number
}

/**
 * What one drill adds to one player, stat by stat, before anything changes.
 * Rewards whose stat the player doesn't have are left out.
 */
export function drillGainsForPlayer(
    player: PlayerSaveData,
    rewards: ReadonlyArray<{ stat: string; value: number }>,
    ctx: DrillContext,
    club: DrillClubFactors = drillClubFactors(ctx.team, ctx.staff, ctx.currentWeek),
): DrillStatGain[] {
    const personal = trainingFactor(getArchetype(player)) * mentorTrainingFactor(ctx.team, player.id, ctx.lookup) * trainingAgeFactor(player.age)
    const values = { ...(player as unknown as Record<string, unknown>) }
    const out: DrillStatGain[] = []
    for (const reward of rewards) {
        const stat = drillStatKey(reward.stat)
        const current = values[stat]
        if (typeof current !== "number") continue
        let gain = reward.value
        if (!UNSCALED_STATS.has(stat)) {
            gain *= club.general * personal
            if (TACTICAL_STATS.has(stat)) gain *= club.tactical
        }
        const cap = UNSCALED_STATS.has(stat) ? 100 : Math.min(100, Math.max(current, player.potential ?? 100))
        const next = Math.max(0, Math.min(cap, current + gain))
        // Two rewards on one stat stack, like the action applies them.
        values[stat] = next
        const existing = out.find(g => g.stat === stat)
        if (existing) existing.amount += next - current
        else out.push({ stat, amount: next - current })
    }
    return out
}
