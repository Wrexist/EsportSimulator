/**
 * Development outlook: what raises and lowers a player's numbers, read from
 * the same formulas the week applies (TrainingProcessor.processTraining,
 * PlayerLifecycleManager natural growth / aging, the coach breakthrough
 * talent in pre-tick-mutations). Pure; nothing here changes the save.
 *
 * The forecast is an expected value, not a roll: training gains are applied
 * every week as computed, natural growth and age decline are chances, so
 * they appear as expected points per season.
 */

import { TrainingFocus, TRAINING_EFFECTS, calculateTrainingGains } from "@/types"
import type { PlayerSaveData, StaffSaveData, TeamSaveData } from "./save-types"
import { facilityLevel, staffDevelopmentEffects } from "./organization-effects"
import { ARCHETYPE_INFO, getArchetype, mentorTrainingFactor, trainingFactor } from "./personality"
import { isFeatureUnlocked } from "./talent-trees"
import { ageDeclineChance, naturalGrowthChance, naturalGrowthPerWeek } from "./development-rates"

export { ageDeclineChance, naturalGrowthChance }

/** The managed club's weekly regimen when a player has no personal focus (store advance). */
export const DEFAULT_TEAM_TRAINING = { focus: TrainingFocus.AIM, intensity: 5 } as const

const WEEKS_PER_SEASON = 52

export const FOCUS_NAMES: Record<string, string> = {
    [TrainingFocus.AIM]: "Aim",
    [TrainingFocus.TACTICS]: "Tactics",
    [TrainingFocus.TEAMPLAY]: "Teamwork",
    [TrainingFocus.REST]: "Rest",
}

export interface OutlookFactor {
    label: string
    /** Multiplier on weekly training gains (1 = no effect). */
    multiplier: number
}

export interface StatForecast {
    stat: string
    now: number
    /** Expected value after `weeks` of the current plan, capped at potential. */
    after: number
}

export interface DevelopmentOutlook {
    potential: number
    /** Highest trained attribute gap below potential, for the headroom bar. */
    headroom: number
    trainsWithClub: boolean
    focus: string
    focusIsPersonal: boolean
    /** Points per week to each primary stat before the cap. */
    weeklyGain: number
    factors: OutlookFactor[]
    forecast: StatForecast[]
    weeks: number
    /** Expected +1s per season from natural growth (age 24 and under). */
    naturalPerSeason: number
    /** Expected −1s per season from age decline (over 27). */
    declinePerSeason: number
    breakthrough: boolean
    atCeiling: boolean
}

type Lookup = (id: string) => PlayerSaveData | undefined

function activeStaff(staff: StaffSaveData[], teamId: string, week: number) {
    return staff.filter(s => s.teamId === teamId && (s.contractEndWeek === undefined || s.contractEndWeek > week))
}

export function developmentOutlook(input: {
    player: PlayerSaveData
    team?: TeamSaveData
    playerTeamId?: string | null
    staff: StaffSaveData[]
    lookup: Lookup
    currentWeek: number
    weeks?: number
}): DevelopmentOutlook {
    const { player, team, playerTeamId, staff, lookup, currentWeek } = input
    const weeks = input.weeks ?? 12
    const potential = typeof player.potential === "number" ? player.potential : 75
    const age = player.age ?? 22
    const trainsWithClub = !!team && team.id === playerTeamId && !player.isRetired
        && !team.activeRoleTraining?.some(rt => rt.playerId === player.id)

    const personal = player.trainingFocus && player.trainingFocus !== "BALANCED"
        && Object.values(TrainingFocus).includes(player.trainingFocus as TrainingFocus)
    const focus = (personal ? player.trainingFocus : DEFAULT_TEAM_TRAINING.focus) as TrainingFocus
    const effects = TRAINING_EFFECTS[focus]
    const trained = [...effects.primaryStats, ...effects.secondaryStats] as string[]

    const factors: OutlookFactor[] = []
    let multiplier = 1
    let tacticalMultiplier = 1
    let breakthrough = false
    if (team) {
        const trainingLevel = facilityLevel(team.facilities?.find(f => f.type === "TRAINING")?.level || 0)
        const tacticalLevel = facilityLevel(team.facilities?.find(f => f.type === "TACTICAL")?.level || 0)
        const clubStaff = activeStaff(staff, team.id, currentWeek)
        const effectsOfStaff = staffDevelopmentEffects(clubStaff)
        const archetype = getArchetype(player)
        const push = (label: string, m: number) => { if (Math.abs(m - 1) > 1e-9) factors.push({ label, multiplier: m }) }
        push(`Training facility L${trainingLevel}`, 1 + trainingLevel * 0.1)
        push("Coaching staff", effectsOfStaff.trainingMultiplier)
        push(ARCHETYPE_INFO[archetype].label, focus === TrainingFocus.REST ? 1 : trainingFactor(archetype))
        push("Mentor", mentorTrainingFactor(team, player.id, lookup))
        multiplier = factors.reduce((m, f) => m * f.multiplier, 1)
        tacticalMultiplier = (1 + tacticalLevel * 0.2) * effectsOfStaff.tacticMultiplier
        breakthrough = team.id === playerTeamId && clubStaff.some(s => s.role === "coach"
            && isFeatureUnlocked("coach", s.unlockedTalentIds, "potential_breakthrough"))
    }

    const gains = trainsWithClub ? calculateTrainingGains(focus, DEFAULT_TEAM_TRAINING.intensity, player.productivity ?? 50, potential) : {}
    const forecast: StatForecast[] = trained.map(stat => {
        const now = Number((player as unknown as Record<string, unknown>)[stat] ?? 0)
        let perWeek = (gains as Record<string, number | undefined>)[stat] ?? 0
        perWeek *= multiplier
        if (["tactic", "leader", "teamwork"].includes(stat)) perWeek *= tacticalMultiplier
        const cap = Math.min(100, Math.max(now, potential))
        return { stat, now, after: Math.min(cap, now + perWeek * weeks) }
    })
    const primary = effects.primaryStats[0] as string | undefined
    const weeklyGain = primary
        ? ((gains as Record<string, number | undefined>)[primary] ?? 0) * multiplier * (["tactic", "leader", "teamwork"].includes(primary) ? tacticalMultiplier : 1)
        : 0

    const skill = player.skill ?? 50
    const headroom = Math.max(0, ...trained.map(s => potential - Number((player as unknown as Record<string, unknown>)[s] ?? potential)), potential - skill)
    return {
        potential,
        headroom,
        trainsWithClub,
        focus: FOCUS_NAMES[focus] ?? "Training",
        focusIsPersonal: !!personal,
        weeklyGain,
        factors,
        forecast,
        weeks,
        naturalPerSeason: naturalGrowthPerWeek(player as unknown as Record<string, unknown>) * WEEKS_PER_SEASON,
        declinePerSeason: ageDeclineChance(age) * WEEKS_PER_SEASON,
        breakthrough,
        atCeiling: headroom <= 0,
    }
}
