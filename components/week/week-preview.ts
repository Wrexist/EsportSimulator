/**
 * Week plan preview (Phase 4.2): what this week's update will do to the
 * squad, from the same numbers the processors apply. Read-only and pure.
 *
 * Order mirrors the real week (store/game-store.ts advanceWeek, then
 * engine/atomic-week-processor.ts):
 *   in-week   fixtures still to play: +10 / +15 / +25 fatigue (BO1 / BO3 / BO5)
 *             (store/slices/match-simulation-slice.ts, atomic-week-processor)
 *   pre-tick  weekly XP 40–79 per player (pre-tick-mutations)
 *             weekly team focus (weekly-activity-processor)
 *             staff meetings / bootcamp blocks (scheduled-activities-processor)
 *   step 1    weekly training (training-processor processTraining)
 *   step 2    recovery −(8 + bonus) fatigue, morale drift (player-lifecycle)
 *   step 8    idle days: −20% fatigue and +15 energy each (processRestDays)
 *
 * Not predicted: match results (morale, form), random events, injuries,
 * prize money. The UI says so next to the numbers.
 */

import { WEEKLY_ACTIVITIES, weeklyActivityXpBonus, type WeeklyActivityType } from "@/types/activities"
import { TrainingFocus } from "@/types"
import { CONDITION_TUNING } from "@/lib/balance-tuning"
import { BOOTCAMP_CHEMISTRY_BONUS } from "@/engine/chemistry-engine"
import { facilityLevel, staffDevelopmentEffects } from "@/engine/organization-effects"
import { getPlayerPassiveBonuses } from "@/engine/talent-trees"
import type { ActivitySaveData, PlayerSaveData, StaffSaveData, TeamSaveData } from "@/engine/save-types"
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"
import { weeklyPreview, type TrainingModifiers, type WeeklyPreview } from "@/components/training/weekly-training"

/** Weekly fatigue recovery before bonuses (PlayerLifecycleManager.processPsychology). */
export const BASE_WEEKLY_RECOVERY = 8
/** Morale drifts toward 50 − fatigue × drag by this share per week (processPsychology). */
export const MORALE_DRIFT_STEP = 0.05
export const MORALE_DRIFT_LOW_BONUS = 0.01
/** Pre-tick weekly XP per roster player (pre-tick-mutations applyPlayerXP). */
export const WEEKLY_XP_RANGE: [number, number] = [40, 79]

export function matchFatigue(format: string | undefined): number {
    const f = (format || "BO1").toUpperCase()
    return f === "BO5" ? 25 : f === "BO3" ? 15 : 10
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

export interface FixtureLike {
    id: string
    week: number
    day?: number
    homeTeamId: string
    awayTeamId: string
    format?: string
    isScrim?: boolean
}

export interface WeekPreviewInput {
    team: TeamSaveData
    roster: PlayerSaveData[]
    staff: StaffSaveData[]
    currentWeek: number
    selectedWeeklyActivity: WeeklyActivityType | null
    scheduledActivities: ActivitySaveData[]
    scheduledMatches: FixtureLike[]
    completedMatches: FixtureLike[]
    trainingMods: TrainingModifiers
}

/** One line of the preview with its cause. */
export interface PlanEffect {
    source: "fixtures" | "focus" | "meeting" | "bootcamp" | "marketing" | "training" | "recovery" | "xp"
    /** The booking this line comes from. */
    activityId?: string
    label: string
    /** Short effect texts, e.g. "+15 morale", "−$1,500". */
    effects: { text: string; good: boolean }[]
}

export interface PlayerProjection {
    id: string
    retraining: boolean
    training: WeeklyPreview | null
    fatigueNow: number
    fatigueEnd: number
    moraleNow: number
    /** Before match results and events. */
    moraleEnd: number
    xpMin: number
    xpMax: number
}

export interface WeekPreview {
    players: PlayerProjection[]
    effects: PlanEffect[]
    /** Calendar days (0–6) the engine will count as idle (rest) days. */
    restDays: number[]
    fixturesToPlay: FixtureLike[]
    /** Cash the update moves outside the settlement (focus, retraining). */
    cash: { focusCost: number; focusIncome: number; retraining: number; focusSkipped: boolean }
    /** Paid when booked; not charged again at the update. */
    bookingsPaid: number
    chemistry: number
    reputation: number
    followers: number
    recoveryBonus: number
}

/** Activities the scheduled-activities processor runs this week (same filter). */
export function activitiesThisWeek(activities: ActivitySaveData[], week: number): ActivitySaveData[] {
    return activities.filter(a => a.week === week || (week > a.week && week < a.week + (a.duration || 0)))
}

/** Days the club rests (TrainingProcessor.processRestDays for the managed club). */
export function idleDays(teamId: string, week: number, matches: FixtureLike[], activities: ActivitySaveData[]): number[] {
    const list = matches.filter(m => m.week === week && (m.homeTeamId === teamId || m.awayTeamId === teamId))
        .sort((a, b) => a.id.localeCompare(b.id))
    const busy = new Set<number>()
    list.forEach((m, idx) => {
        if (m.day !== undefined) busy.add(m.day)
        else if (m.isScrim) busy.add(idx % 2 === 0 ? 3 : 4)
        else busy.add(idx % 2 === 0 ? 5 : 6)
    })
    const days: number[] = []
    for (let day = 0; day <= 6; day++) {
        if (busy.has(day)) continue
        const hasActivity = activities.some(a => a.week === week && (a.day === day || (a.duration || 0) > 0))
        if (hasActivity) continue
        if (activities.some(a => a.id === `rest_w${week}_d${day}_${teamId}`)) continue
        days.push(day)
    }
    return days
}

/** Weekly recovery bonus (TrainingProcessor.processFatigueRecovery), before the player's talent. */
export function teamRecoveryBonus(team: TeamSaveData, staff: StaffSaveData[], weekAtTick: number): number {
    const facility = facilityLevel(team.facilities?.find(f => f.type === "RECOVERY")?.level || 0)
    const active = staff.filter(s => s.teamId === team.id && (s.contractEndWeek === undefined || s.contractEndWeek > weekAtTick))
    return facility + staffDevelopmentEffects(active).recovery
}

/** A booked meeting's effects (the processor's default when none are stored). */
function meetingEffects(a: ActivitySaveData): Record<string, number> {
    return ((a.data as { effects?: Record<string, number> } | undefined)?.effects) ?? { morale: 10, xp: 25 }
}

const signed = (n: number, unit: string) => `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`
const money = (n: number) => `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`

export function buildWeekPreview(input: WeekPreviewInput): WeekPreview {
    const { team, roster, currentWeek: week } = input
    const effects: PlanEffect[] = []
    const allMatches = [...input.scheduledMatches, ...input.completedMatches]
    const completedIds = new Set(input.completedMatches.map(m => m.id))
    const mine = (m: FixtureLike) => m.homeTeamId === team.id || m.awayTeamId === team.id
    const fixturesToPlay = input.scheduledMatches
        .filter(m => mine(m) && m.week === week && !completedIds.has(m.id))
        .sort((a, b) => (a.day ?? 6) - (b.day ?? 6))
    const fixtureFatigue = fixturesToPlay.reduce((s, m) => s + matchFatigue(m.format), 0)
    if (fixturesToPlay.length > 0) {
        effects.push({
            source: "fixtures",
            label: `${fixturesToPlay.length} match${fixturesToPlay.length === 1 ? "" : "es"} to play`,
            effects: [{ text: `+${fixtureFatigue} fatigue for the five who play`, good: false }, { text: "morale and form follow the results", good: true }],
        })
    }

    // ---- weekly focus (applies at the update if still affordable) ----
    const focus = input.selectedWeeklyActivity ? WEEKLY_ACTIVITIES[input.selectedWeeklyActivity] : null
    const focusAlreadyUsed = team.weeklyActivityWeek !== undefined && team.weeklyActivityWeek >= week
    const focusActive = !!focus && focus.type !== "TRAINING_ONLY" && !focusAlreadyUsed
    const focusAffordable = !focus || focus.cost <= 0 || (Number.isFinite(team.budget) && team.budget >= focus.cost)
    const focusApplies = focusActive && focusAffordable
    const focusXp = focusApplies && focus ? weeklyActivityXpBonus(focus) : 0
    if (focus && focus.type !== "TRAINING_ONLY") {
        const e = focus.effects
        const list: PlanEffect["effects"] = []
        if (focus.cost) list.push({ text: money(-focus.cost), good: false })
        if (e.money) list.push({ text: money(e.money), good: true })
        if (e.morale) list.push({ text: signed(e.morale, " morale"), good: e.morale > 0 })
        if (e.fatigue) list.push({ text: signed(e.fatigue, " fatigue"), good: e.fatigue < 0 })
        if (focusXp) list.push({ text: `+${focusXp} XP`, good: true })
        if (e.synergy) list.push({ text: `+${e.synergy} chemistry`, good: true })
        if (e.reputation) list.push({ text: `+${e.reputation} reputation`, good: true })
        if (!focusAffordable) list.push({ text: `cancelled: needs $${focus.cost.toLocaleString("en-US")} at the update`, good: false })
        if (focusAlreadyUsed) list.push({ text: "already applied this week", good: false })
        effects.push({ source: "focus", label: `Team focus: ${focus.name}`, effects: list })
    }

    // ---- bookings (staff meetings, bootcamp blocks, marketing) ----
    const active = activitiesThisWeek(input.scheduledActivities || [], week)
    let chemistry = focusApplies && focus?.effects.synergy ? focus.effects.synergy : 0
    let followers = 0
    for (const a of active) {
        if (a.type === "STAFF_MEETING" && a.week === week) {
            const fx = meetingEffects(a)
            const list: PlanEffect["effects"] = []
            if (fx.morale) list.push({ text: signed(fx.morale, " morale"), good: fx.morale > 0 })
            if (fx.xp) list.push({ text: `+${fx.xp} XP`, good: true })
            if (fx.fatigue) list.push({ text: signed(fx.fatigue, " fatigue"), good: fx.fatigue < 0 })
            if (fx.stressResistance) list.push({ text: `+${fx.stressResistance} composure`, good: true })
            if (fx.tacticXp) list.push({ text: `+${Math.floor(fx.tacticXp / 5)} tactics`, good: true })
            if (fx.chemistry && team.chemistry !== undefined) { list.push({ text: `+${fx.chemistry} chemistry`, good: true }); chemistry += fx.chemistry }
            effects.push({ source: "meeting", activityId: a.id, label: a.name || "Staff meeting", effects: list })
        } else if (a.type === "BOOTCAMP" || a.type === "REST" || a.type === "TRAVEL") {
            const list: PlanEffect["effects"] = []
            const xp = Math.max(0, num(a.effect?.trainingBonus))
            const morale = num(a.effect?.morale)
            const fatigue = num(a.fatigue)
            if (xp) list.push({ text: `+${xp} XP`, good: true })
            if (morale) list.push({ text: signed(morale, " morale"), good: morale > 0 })
            if (fatigue) list.push({ text: signed(fatigue, " fatigue"), good: fatigue < 0 })
            const chem = a.week === week ? (BOOTCAMP_CHEMISTRY_BONUS[a.type] ?? 0) : 0
            if (chem) { list.push({ text: `+${chem} chemistry`, good: true }); chemistry += chem }
            if (list.length) effects.push({ source: "bootcamp", activityId: a.id, label: `${a.name || "Bootcamp"}${a.duration > 1 ? ` (week ${week - a.week + 1} of ${a.duration})` : ""}`, effects: list })
        }
    }
    // Marketing: the fanbase step runs after the week counter moves on, so a
    // campaign pays for the weeks where (this week + 1) is inside its window.
    for (const a of input.scheduledActivities || []) {
        if (a.type !== "MARKETING") continue
        const perWeek = num((a.data as { followersPerWeek?: number } | undefined)?.followersPerWeek)
        const inWindow = week + 1 >= a.week && week + 1 < a.week + a.duration
        const runsThisWeek = week >= a.week && week < a.week + a.duration
        if (!runsThisWeek && !inWindow) continue
        if (inWindow && perWeek > 0) followers += perWeek
        effects.push({
            source: "marketing",
            activityId: a.id,
            label: a.name || "Marketing campaign",
            effects: inWindow && perWeek > 0
                ? [{ text: `+${perWeek.toLocaleString("en-US")} followers`, good: true }]
                : [{ text: "no followers counted at this update", good: false }],
        })
    }
    const bookingsPaid = active.filter(a => a.week === week).reduce((s, a) => s + num(a.cost), 0)

    // ---- per player ----
    const rest = idleDays(team.id, week, allMatches, input.scheduledActivities || [])
    const recoveryBonus = teamRecoveryBonus(team, input.staff, week + 1)
    const sessions = team.activeRoleTraining || []
    // Only the five who take the server play; their match fatigue is part of the projection.
    const starters = new Set(getActivePlayersByRosterOrder(team, roster).map(p => p.id))

    const players: PlayerProjection[] = roster.filter(p => !p.isRetired).map(p => {
        const retraining = sessions.some(s => s.playerId === p.id)
        const training = retraining ? null : weeklyPreview(p, input.trainingMods)
        let f = clamp(num(p.fatigue))
        let m = clamp(p.morale ?? 50)
        const fatigueNow = f, moraleNow = m
        let xp = 0

        if (starters.has(p.id)) f = Math.min(100, f + fixtureFatigue)
        if (focusApplies && focus) {
            if (focus.effects.fatigue) f = clamp(f + focus.effects.fatigue)
            if (focus.effects.morale) m = clamp((m || 50) + focus.effects.morale)
            xp += focusXp
        }
        // Same order as the processor: the save's activity list.
        for (const a of active) {
            if (a.type === "STAFF_MEETING" && a.week === week) {
                const fx = meetingEffects(a)
                if (fx.morale) m = clamp((m || 50) + fx.morale)
                if (fx.xp) xp += fx.xp
                if (fx.fatigue) f = clamp(f + fx.fatigue)
            } else if (a.type === "BOOTCAMP" || a.type === "REST" || a.type === "TRAVEL") {
                const fatigue = num(a.fatigue), morale = num(a.effect?.morale)
                if (fatigue) f = clamp(f + fatigue)
                if (morale) m = clamp(m + morale)
                xp += Math.max(0, num(a.effect?.trainingBonus))
            }
        }
        if (training) {
            f = clamp(f + training.fatigue)
            if (training.focus === TrainingFocus.REST) m = Math.min(100, m + 5)
        }
        const bonus = recoveryBonus + (getPlayerPassiveBonuses(p.unlockedTalentIds || [])["energy_recovery"] || 0)
        if (f > 0) f = Math.max(0, f - (BASE_WEEKLY_RECOVERY + bonus))
        const target = 50 - f * CONDITION_TUNING.FATIGUE_MORALE_DRAG
        const step = m < 50 ? MORALE_DRIFT_STEP + bonus * MORALE_DRIFT_LOW_BONUS : MORALE_DRIFT_STEP
        m = clamp(m + (target - m) * step)
        for (let i = 0; i < rest.length; i++) f = Math.max(0, f * (1 - CONDITION_TUNING.IDLE_DAY_FATIGUE_RECOVERY_RATE))

        return {
            id: p.id, retraining, training,
            fatigueNow, fatigueEnd: f, moraleNow, moraleEnd: m,
            xpMin: WEEKLY_XP_RANGE[0] + xp, xpMax: WEEKLY_XP_RANGE[1] + xp,
        }
    })

    const retrainingCost = sessions
        .filter(s => !roster.find(p => p.id === s.playerId)?.injury)
        .reduce((sum, s) => sum + num(s.weeklyCost), 0)
    if (sessions.length > 0) {
        effects.push({ source: "training", label: `Role retraining (${sessions.length})`, effects: [{ text: money(-retrainingCost), good: false }, { text: "skips weekly training", good: false }] })
    }

    effects.push({
        source: "recovery",
        label: `Recovery · ${rest.length} rest day${rest.length === 1 ? "" : "s"}`,
        effects: [
            { text: `−${BASE_WEEKLY_RECOVERY + Math.round(recoveryBonus * 10) / 10} fatigue`, good: true },
            ...(rest.length ? [{ text: `−${Math.round(CONDITION_TUNING.IDLE_DAY_FATIGUE_RECOVERY_RATE * 100)}% fatigue and +${CONDITION_TUNING.IDLE_DAY_ENERGY} energy per rest day`, good: true }] : []),
        ],
    })
    effects.push({ source: "xp", label: "Weekly XP", effects: [{ text: `+${WEEKLY_XP_RANGE[0]}–${WEEKLY_XP_RANGE[1]} XP each`, good: true }] })

    return {
        players,
        effects,
        restDays: rest,
        fixturesToPlay,
        cash: {
            focusCost: focusApplies && focus ? focus.cost : 0,
            focusIncome: focusApplies && focus?.effects.money ? focus.effects.money : 0,
            retraining: retrainingCost,
            focusSkipped: focusActive && !focusAffordable,
        },
        bookingsPaid,
        chemistry,
        reputation: focusApplies && focus?.effects.reputation ? focus.effects.reputation : 0,
        followers,
        recoveryBonus,
    }
}
