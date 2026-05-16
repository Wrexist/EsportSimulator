/**
 * Scheduled-activities processor.
 *
 * Runs the side-effects of every save.scheduledActivities entry whose
 * week matches the current week. Two recognized activity types:
 *
 *   - STAFF_MEETING: applies morale / xp / fatigue / stressResistance /
 *     tactic XP / chemistry effects to the roster from
 *     `activity.data.effects` (default: { morale: 10, xp: 25 }). Surfaces
 *     a TEAM_UPDATE event summarizing the applied effects.
 *
 *   - BOOTCAMP / REST / TRAVEL: applies a chemistry bonus via
 *     applyBootcampChemistryBonus and surfaces a TEAM_UPDATE event when
 *     the bonus is non-zero.
 *
 * Extracted from store/game-store.ts. Mutates `save` in place.
 */

import type { GameSave } from "../save-types"
import { applyBootcampChemistryBonus } from "../chemistry-engine"

const DEFAULT_STAFF_MEETING_EFFECTS = { morale: 10, xp: 25 } as const
const TACTIC_XP_DIVISOR = 5
const MAX_TACTIC_VALUE = 99

interface ScheduledActivitiesContext {
    playerTeamId: string
    nextId: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { lastRngSeed: number; currentWeek: number } & Record<string, any>,
        prefix: string,
        ...parts: Array<string | number | null | undefined>
    ) => string
}

export function applyScheduledActivities(save: GameSave, ctx: ScheduledActivitiesContext): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeScheduled = save.scheduledActivities?.filter((a: any) => a.week === save.currentWeek) || []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeScheduled.forEach((act: any) => {
        if (act.type === "STAFF_MEETING") {
            applyStaffMeeting(save, act, ctx)
        }

        if (act.type === "BOOTCAMP" || act.type === "REST" || act.type === "TRAVEL") {
            applyBootcampChemistry(save, act, ctx)
        }
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyStaffMeeting(save: GameSave, act: any, ctx: ScheduledActivitiesContext): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = save.teams.find((t: any) => t.id === ctx.playerTeamId)
    if (!team) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roster = save.players.filter((p: any) => team.rosterIds.includes(p.id))

    const effects = act.data?.effects || DEFAULT_STAFF_MEETING_EFFECTS
    const meetingName = act.name || "Staff Meeting"
    const effectParts: string[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    roster.forEach((p: any) => {
        if (effects.morale) {
            p.morale = Math.min(100, Math.max(0, (p.morale || 50) + effects.morale))
        }
        if (effects.xp) {
            p.xp = (p.xp || 0) + effects.xp
        }
        // Negative fatigue effect = recovery; clamped to [0, 100].
        if (effects.fatigue) {
            p.fatigue = Math.min(100, Math.max(0, (p.fatigue || 0) + effects.fatigue))
        }
        if (effects.stressResistance) {
            p.stressResistance = Math.min(100, (p.stressResistance || 50) + effects.stressResistance)
        }
        // Tactic XP — divided by 5 to convert from XP units to stat points.
        if (effects.tacticXp) {
            p.tactic = Math.min(MAX_TACTIC_VALUE, (p.tactic || 50) + Math.floor(effects.tacticXp / TACTIC_XP_DIVISOR))
        }
    })

    if (effects.chemistry && team.chemistry !== undefined) {
        team.chemistry = Math.min(100, (team.chemistry || 50) + effects.chemistry)
    }

    // Build a human-readable effect summary for the event log.
    if (effects.morale) effectParts.push(`Morale +${effects.morale}`)
    if (effects.xp) effectParts.push(`XP +${effects.xp}`)
    if (effects.fatigue) effectParts.push(`Fatigue ${effects.fatigue}`)
    if (effects.chemistry) effectParts.push(`Chemistry +${effects.chemistry}`)
    if (effects.stressResistance) effectParts.push(`Stress Resistance +${effects.stressResistance}`)
    if (effects.tacticXp) effectParts.push(`Tactic XP +${effects.tacticXp}`)

    save.eventsLog.unshift({
        id: ctx.nextId(save, "evt_staff_meeting"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "TEAM_UPDATE" as any,
        week: save.currentWeek,
        acknowledged: false,
        data: {
            title: meetingName,
            message: `The team held a ${meetingName.toLowerCase()}. ${effectParts.join(", ")}.`,
            severity: "success",
        },
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyBootcampChemistry(save: GameSave, act: any, ctx: ScheduledActivitiesContext): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = save.teams.find((t: any) => t.id === ctx.playerTeamId)
    if (!team) return

    const bonus = applyBootcampChemistryBonus(team, act.type)
    if (bonus <= 0) return

    save.eventsLog.unshift({
        id: ctx.nextId(save, "evt_bootcamp_chem", act.type),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "TEAM_UPDATE" as any,
        week: save.currentWeek,
        acknowledged: false,
        data: {
            title: "Team Chemistry Improved",
            message: `The ${act.name || "bootcamp"} brought the team closer together. Chemistry +${bonus}.`,
            severity: "success",
        },
    })
}
