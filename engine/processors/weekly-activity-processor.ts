/**
 * Weekly-activity processor.
 *
 * Applies the side-effects of the player's selected "weekly focus"
 * activity (bootcamp, marketing, streaming, etc.) to a freshly-built
 * GameSave snapshot before that snapshot ships off to the week processor.
 *
 * For non-TRAINING_ONLY activities the player team:
 *   - Pays the activity cost (logged to financeLedger as a FACILITIES
 *     expense).
 *   - Applies per-player fatigue / morale / XP effects to the roster.
 *   - Applies reputation gain to the team.
 *   - Surfaces a TEAM_UPDATE event so the user sees the action confirmed.
 *
 * Extracted from store/game-store.ts. Mutates `save` in place.
 */

import type { GameSave } from "../save-types"
import { WEEKLY_ACTIVITIES, type WeeklyActivityType } from "@/types"

const FLAT_XP_BASE = 50

interface WeeklyActivityContext {
    playerTeamId: string
    selectedActivity: WeeklyActivityType | null | undefined
    /** Same nextDeterministicId helper used by the store. */
    nextId: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { lastRngSeed: number; currentWeek: number } & Record<string, any>,
        prefix: string,
        ...parts: Array<string | number | null | undefined>
    ) => string
}

export function applyWeeklyActivity(save: GameSave, ctx: WeeklyActivityContext): void {
    if (!ctx.selectedActivity) return
    const activity = WEEKLY_ACTIVITIES[ctx.selectedActivity]
    // TRAINING_ONLY skips this branch — the dedicated drill action runs
    // instead and pays its own costs/XP separately.
    if (!activity || activity.type === "TRAINING_ONLY") return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myTeam = save.teams.find((t: any) => t.id === ctx.playerTeamId)
    if (!myTeam) return

    if (activity.cost > 0) {
        myTeam.budget -= activity.cost
        save.financeLedger.push({
            id: ctx.nextId(save, "fin_activity", activity.type),
            teamId: myTeam.id,
            type: "EXPENSE",
            amount: activity.cost,
            category: "FACILITIES",
            week: save.currentWeek,
            description: `Activity: ${activity.name}`,
            balance: myTeam.budget,
        })
    }

    // Per-player effects — fatigue, morale, flat XP bonus when the
    // activity's xp multiplier > 1 (bootcamp 2.0 → +50 XP, streaming → 0).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myPlayers = save.players.filter((p: any) => myTeam.rosterIds.includes(p.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    myPlayers.forEach((p: any) => {
        if (activity.effects.fatigue) {
            p.fatigue = Math.max(0, Math.min(100, (p.fatigue || 0) + activity.effects.fatigue))
        }
        if (activity.effects.morale) {
            p.morale = Math.max(0, Math.min(100, (p.morale || 50) + activity.effects.morale))
        }
        if (activity.effects.xp && activity.effects.xp > 1) {
            const bonus = Math.floor(FLAT_XP_BASE * (activity.effects.xp - 1))
            p.xp = (p.xp || 0) + bonus
        }
    })

    if (activity.effects.reputation) {
        myTeam.reputation = Math.min(100, (myTeam.reputation || 0) + activity.effects.reputation)
    }

    // Activity income (e.g. STREAMING). The UI advertises this amount but the
    // processor previously never granted it — a broken promise. Bounded and
    // non-farmable: the player picks exactly one weekly focus, so it's at most
    // this once per week. Ledgered like every other budget mutation (invariant #5).
    if (activity.effects.money && activity.effects.money > 0) {
        myTeam.budget += activity.effects.money
        save.financeLedger.push({
            id: ctx.nextId(save, "fin_activity_inc", activity.type),
            teamId: myTeam.id,
            type: "INCOME",
            amount: activity.effects.money,
            category: "OTHER",
            week: save.currentWeek,
            description: `Activity income: ${activity.name}`,
            balance: myTeam.budget,
        })
    }

    save.eventsLog.unshift({
        id: ctx.nextId(save, "evt_activity", activity.type),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "TEAM_UPDATE" as any,
        week: save.currentWeek,
        acknowledged: false,
        data: {
            title: `Weekly Focus: ${activity.name}`,
            message: activity.description,
            severity: "info",
        },
    })
}
