/**
 * Pre-tick mutations applied at the very start of advanceWeek, before
 * the GameSave snapshot is built and shipped off to the week processor.
 *
 * All four sub-phases mutate a single immer draft:
 *   1. Scouting completion — if the active mission's completionWeek has
 *      arrived, mark the player as scouted (EXPERT tier) and surface an
 *      events-log entry. Missing players produce a "mission failed"
 *      event instead so the user knows the mission didn't pay out.
 *   2. Market rotation — every 4-8 weeks, rotate the staff market and
 *      pick a new random refresh window (4-8 weeks ahead).
 *   3. Staff XP — every staff member on the player team gains 50-100 XP
 *      with level-up handling (1.5× cap, +1 talent point per level).
 *   4. Player XP — every player team roster player gains 40-80 XP with
 *      the same level-up handling as staff.
 *
 * Extracted from store/game-store.ts. Caller passes the immer draft +
 * playerTeamId + a SeededRNG; this module mutates the draft in place.
 */

import type { GameSave } from "../save-types"
import { StaffGenerator } from "../staff-generator"
import type { SeededRNG } from "../rng"

const DEFAULT_XP_TO_NEXT = 1000
const XP_GROWTH_MULTIPLIER = 1.5

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PreTickDraft = GameSave & { _teamIndex?: any; _playerIndex?: any }

interface PreTickContext {
    playerTeamId: string
    currentWeek: number
    rng: SeededRNG
    /** Deterministic ID generator matching the store's nextDeterministicId. */
    nextId: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { lastRngSeed: number; currentWeek: number } & Record<string, any>,
        prefix: string,
        ...parts: Array<string | number | null | undefined>
    ) => string
}

export function applyPreTickMutations(draft: PreTickDraft, ctx: PreTickContext): void {
    applyScoutingCompletion(draft, ctx)
    applyMarketRotation(draft, ctx)
    applyStaffXP(draft, ctx)
    applyPlayerXP(draft, ctx)
}

function applyScoutingCompletion(draft: PreTickDraft, ctx: PreTickContext): void {
    const mission = draft.activeScoutingMission
    if (!mission || draft.currentWeek < mission.completionWeek) return

    const player = draft.players.find(p => p.id === mission.playerId)
    draft.activeScoutingMission = undefined

    if (!player) {
        draft.eventsLog.unshift({
            id: ctx.nextId(draft, "evt_scout_failed", mission.playerId),
            type: "SCOUTING_COMPLETE",
            week: draft.currentWeek,
            data: {
                title: "Scouting Mission Failed",
                message: "The scouted player is no longer available.",
                severity: "warning",
            },
            acknowledged: false,
        })
        return
    }

    // Guard against double-marking when this fires alongside the
    // dedicated scouting-mission-processor (rollback/resume paths).
    const alreadyScouted = draft.scoutedPlayers.some(sp => sp.playerId === mission.playerId)
    if (!alreadyScouted) {
        draft.scoutedPlayers.push({
            playerId: mission.playerId,
            scoutedWeek: draft.currentWeek,
            scoutLevel: "EXPERT",
        })
    }
    draft.eventsLog.unshift({
        id: ctx.nextId(draft, "evt_scout_complete", mission.playerId),
        type: "SCOUTING_COMPLETE",
        week: draft.currentWeek,
        data: {
            title: "Scouting Report Ready",
            message: `Analysis for ${player.nickname} is complete. Full attributes are now visible.`,
            playerId: mission.playerId,
            severity: "success",
        },
        acknowledged: false,
    })
}

function applyMarketRotation(draft: PreTickDraft, ctx: PreTickContext): void {
    if (!draft.nextMarketRefreshWeek) {
        draft.nextMarketRefreshWeek = ctx.currentWeek + 4
        return
    }
    if (ctx.currentWeek < draft.nextMarketRefreshWeek) return

    const rotated = StaffGenerator.rotateMarket(draft.marketStaff, ctx.currentWeek, ctx.rng)
    draft.marketStaff = rotated
    // Next refresh in 4-8 weeks.
    draft.nextMarketRefreshWeek = ctx.currentWeek + 4 + Math.floor(ctx.rng.next() * 5)
}

function applyStaffXP(draft: PreTickDraft, ctx: PreTickContext): void {
    if (!draft.staff) return

    draft.staff.forEach(s => {
        if (s.teamId !== ctx.playerTeamId) return

        const xpGain = 50 + Math.floor(ctx.rng.next() * 50)
        s.xp += xpGain

        if (s.xp < s.xpToNextLevel) return

        // Level-up — same growth curve as players.
        s.xp -= s.xpToNextLevel
        s.level += 1
        s.talentPoints += 1
        s.xpToNextLevel = Math.floor(s.xpToNextLevel * XP_GROWTH_MULTIPLIER)

        draft.eventsLog.unshift({
            id: ctx.nextId(draft, "evt_staff_levelup", s.id),
            type: "STAFF_LEVEL_UP",
            week: ctx.currentWeek,
            data: { staffName: s.name, newLevel: s.level },
            acknowledged: false,
        })
    })
}

function applyPlayerXP(draft: PreTickDraft, ctx: PreTickContext): void {
    const userTeam = draft.teams.find(t => t.id === ctx.playerTeamId)
    if (!userTeam) return

    draft.players.forEach(p => {
        if (!userTeam.rosterIds.includes(p.id)) return

        const xpGain = 40 + Math.floor(ctx.rng.next() * 40)
        p.xp = (p.xp || 0) + xpGain

        const xpCap = p.xpToNextLevel || DEFAULT_XP_TO_NEXT
        if (p.xp < xpCap) return

        p.xp -= xpCap
        p.level = (p.level || 1) + 1
        p.talentPoints = (p.talentPoints || 0) + 1
        p.xpToNextLevel = Math.floor(xpCap * XP_GROWTH_MULTIPLIER)

        draft.eventsLog.unshift({
            id: ctx.nextId(draft, "evt_player_levelup", p.id),
            type: "PLAYER_LEVEL_UP",
            week: ctx.currentWeek,
            data: { playerName: p.nickname, newLevel: p.level },
            acknowledged: false,
        })
    })
}
