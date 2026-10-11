/**
 * Staff meetings: the bookable sessions and their unlock rules.
 *
 * Effects are applied to every roster player by the scheduled-activities
 * processor (engine/processors/scheduled-activities-processor.ts) when the
 * booked week is processed: morale and fatigue clamp to 0–100, XP adds,
 * stress resistance caps at 100, tactic XP converts 5:1 into the tactic
 * rating (cap 99) and chemistry adds to the team (cap 100). The cost is paid
 * when booked (scheduleActivity). Was the separate `/schedule/staff-meeting`
 * screen; Phase 4.2 made it a booking in the week plan.
 */

export interface MeetingEffects {
    morale?: number
    xp?: number
    fatigue?: number
    chemistry?: number
    stressResistance?: number
    tacticXp?: number
}

export type MeetingUnlock =
    | { type: "always" }
    | { type: "consecutive_losses"; value: number }
    | { type: "manager_level"; value: number }
    | { type: "has_staff"; value: string }
    | { type: "after_match" }
    | { type: "low_morale"; value: number }

export interface MeetingType {
    id: string
    name: string
    description: string
    cost: number
    effects: MeetingEffects
    unlock: MeetingUnlock
    unlockMessage: string
}

export const MEETING_TYPES: MeetingType[] = [
    {
        id: "general_strategy",
        name: "General Strategy Review",
        description: "Review recent performances and align team goals.",
        cost: 500,
        effects: { morale: 10, xp: 25 },
        unlock: { type: "always" },
        unlockMessage: "",
    },
    {
        id: "crisis_management",
        name: "Crisis Management",
        description: "Drastic measures to stop a losing streak.",
        cost: 1500,
        effects: { morale: 25, fatigue: -5 },
        unlock: { type: "consecutive_losses", value: 3 },
        unlockMessage: "Needs 3+ losses in a row",
    },
    {
        id: "chemistry_workshop",
        name: "Chemistry Workshop",
        description: "Team building exercises between the players.",
        cost: 1000,
        effects: { chemistry: 15, morale: 5 },
        unlock: { type: "manager_level", value: 3 },
        unlockMessage: "Needs manager level 3+",
    },
    {
        id: "tactical_deep_dive",
        name: "Tactical Deep Dive",
        description: "Go through tactics with your coaching staff.",
        cost: 800,
        effects: { tacticXp: 20, xp: 10 },
        unlock: { type: "has_staff", value: "coach" },
        unlockMessage: "Needs a coach on staff",
    },
    {
        id: "mental_fortitude",
        name: "Mental Fortitude Session",
        description: "Sessions with the psychologist on handling pressure.",
        cost: 1200,
        effects: { stressResistance: 15, morale: 5 },
        unlock: { type: "has_staff", value: "psychologist" },
        unlockMessage: "Needs a psychologist on staff",
    },
    {
        id: "post_match_debrief",
        name: "Post-Match Debrief",
        description: "Quick review after a match.",
        cost: 300,
        effects: { xp: 15, fatigue: -10 },
        unlock: { type: "after_match" },
        unlockMessage: "Available after a match this week or last",
    },
    {
        id: "motivation_boost",
        name: "Motivation Boost",
        description: "One-on-one sessions with struggling players.",
        cost: 600,
        effects: { morale: 20 },
        unlock: { type: "low_morale", value: 40 },
        unlockMessage: "Available when a player's morale is below 40",
    },
]

/** Tactic XP turns into tactic rating points at this rate (processor). */
export const TACTIC_XP_PER_POINT = 5

export interface EffectLabel { label: string; good: boolean }

/** Per-player effects in the processor's own terms. */
export function meetingEffectLabels(e: MeetingEffects): EffectLabel[] {
    const out: EffectLabel[] = []
    if (e.morale) out.push({ label: `+${e.morale} morale`, good: true })
    if (e.xp) out.push({ label: `+${e.xp} XP`, good: true })
    if (e.fatigue) out.push({ label: `${e.fatigue > 0 ? "+" : "−"}${Math.abs(e.fatigue)} fatigue`, good: e.fatigue < 0 })
    if (e.chemistry) out.push({ label: `+${e.chemistry} chemistry`, good: true })
    if (e.stressResistance) out.push({ label: `+${e.stressResistance} composure`, good: true })
    if (e.tacticXp) out.push({ label: `+${Math.floor(e.tacticXp / TACTIC_XP_PER_POINT)} tactics`, good: true })
    return out
}

export interface MeetingContext {
    playerTeamId: string | null
    currentWeek: number
    managerLevel: number
    staffRoles: string[]
    rosterMorale: number[]
    /** The club's completed matches, any order. */
    results: Array<{ week: number; day?: number; won: boolean }>
}

export function consecutiveLosses(results: MeetingContext["results"]): number {
    const recent = [...results].sort((a, b) => (b.week - a.week) || ((b.day ?? 0) - (a.day ?? 0))).slice(0, 5)
    let count = 0
    for (const r of recent) {
        if (r.won) break
        count++
    }
    return count
}

export function meetingStatus(meeting: MeetingType, ctx: MeetingContext): { unlocked: boolean; reason?: string } {
    const u = meeting.unlock
    switch (u.type) {
        case "always": return { unlocked: true }
        case "consecutive_losses": return { unlocked: consecutiveLosses(ctx.results) >= u.value, reason: meeting.unlockMessage }
        case "manager_level": return { unlocked: ctx.managerLevel >= u.value, reason: meeting.unlockMessage }
        case "has_staff": return { unlocked: ctx.staffRoles.includes(u.value), reason: meeting.unlockMessage }
        case "after_match": return { unlocked: ctx.results.some(r => r.week === ctx.currentWeek || r.week === ctx.currentWeek - 1), reason: meeting.unlockMessage }
        case "low_morale": return { unlocked: ctx.rosterMorale.some(m => m < u.value), reason: meeting.unlockMessage }
    }
}

/** Activity id the booking uses (one meeting of each type per week). */
export function meetingActivityId(meetingId: string, week: number): string {
    return `act_meet_${meetingId}_w${week}`
}
