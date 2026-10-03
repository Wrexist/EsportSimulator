/**
 * Shared match-day preparation for the managed legacy-v2 paths (instant
 * simulation from the store and the live screen). Both used to build their
 * own staff bundles, apply talents differently and pick sides/maps from
 * different streams; they now build one `LegacySeriesContext` here.
 *
 * The caller resolves the ordered starters (getActivePlayersByRosterOrder)
 * so this module stays free of store/lib imports.
 */

import type { CustomTactics, Match, Player, Team, MatchManagementRecord, MatchResult } from '@/types'
import { simulationEngineV2 } from '../match-simulation'
import { applyPreMatchTalents } from './apply-talents'
import { buildRuntimeStaff } from './live-staff-adapter'
import type { LegacySeriesContext } from './legacy-series'

interface StaffSource { id: string; name: string; level: number; salaryPerWeek: number; role: string; unlockedTalentIds?: string[] }
interface TeamLike { id: string; staffIds?: string[] }
interface MatchLike {
    id: string; seed?: number; format: string; maps?: string[]; mapStartingSides?: Record<string, string>
    mentalPrep?: boolean; mentalPrepTeamId?: string; isHighPressure?: boolean; stage?: string | null; engineVersion?: string
}

/** Same rule as lib/live-match-builders#getNormalizedSeed (kept here to avoid an engine→lib cycle). */
export function normalizeMatchSeed(rawSeed: unknown, matchId: string): number {
    if (typeof rawSeed === 'number' && Number.isFinite(rawSeed) && rawSeed >= 0) return Math.floor(rawSeed)
    const fallback = Array.from(matchId).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0)
    return Math.max(1, fallback)
}

export function prepareLegacySeries(input: {
    match: MatchLike
    homeTeam: TeamLike
    awayTeam: TeamLike
    /** Ordered active starters (first five are used). Cloned here; never mutated. */
    homePlayers: unknown[]
    awayPlayers: unknown[]
    staff: StaffSource[]
    customTactics?: CustomTactics
    managedTeamId?: string
}): LegacySeriesContext {
    const homePlayers = input.homePlayers.slice(0, 5).map(p => structuredClone(p)) as Player[]
    const awayPlayers = input.awayPlayers.slice(0, 5).map(p => structuredClone(p)) as Player[]
    const homeStaffData = input.staff.filter(s => input.homeTeam.staffIds?.includes(s.id))
    const awayStaffData = input.staff.filter(s => input.awayTeam.staffIds?.includes(s.id))
    const { homeAntiStrat, awayAntiStrat } = applyPreMatchTalents(homePlayers, awayPlayers, homeStaffData, awayStaffData)
    const homeStaff = buildRuntimeStaff(homeStaffData)
    const awayStaff = buildRuntimeStaff(awayStaffData)
    if (homeAntiStrat > 0 && awayStaff.coach) awayStaff.coach.tacticBonus = Math.round(awayStaff.coach.tacticBonus * (1 - homeAntiStrat))
    if (awayAntiStrat > 0 && homeStaff.coach) homeStaff.coach.tacticBonus = Math.round(homeStaff.coach.tacticBonus * (1 - awayAntiStrat))
    const match = { ...input.match, seed: normalizeMatchSeed(input.match.seed, input.match.id) } as unknown as Match
    return simulationEngineV2.createSeriesContext(
        match, input.homeTeam as unknown as Team, input.awayTeam as unknown as Team, homePlayers, awayPlayers,
        homeStaff, awayStaff, undefined, input.customTactics, input.managedTeamId,
    )
}

/** Own-team decisions recorded on the result. The opponent style is only named when it was scouted (VOD review). */
export function buildManagementRecord(args: {
    ctx: LegacySeriesContext
    match: { vodReviewed?: boolean; mentalPrep?: boolean; mentalPrepTeamId?: string }
    mode: 'live' | 'instant'
    timeoutsUsed: number
    maps: MatchResult['maps']
}): MatchManagementRecord | undefined {
    const { ctx } = args
    const own = ctx.managedTeamId === ctx.home.team.id ? ctx.home : ctx.managedTeamId === ctx.away.team.id ? ctx.away : undefined
    if (!own) return undefined
    const opponent = own === ctx.home ? ctx.away : ctx.home
    const scouted = !!args.match.vodReviewed
    const counters: Record<string, string> = { aggressive: 'structured', structured: 'balanced', balanced: 'aggressive' }
    const mine = own.team.playstyle, theirs = opponent.team.playstyle
    const counter = !mine || mine === 'default' || !theirs || theirs === 'default' || mine === theirs ? 'neutral'
        : counters[mine] === theirs ? 'advantage' : counters[theirs] === mine ? 'disadvantage' : 'neutral'
    return {
        teamId: own.team.id,
        playstyle: mine ?? 'default',
        economyStyle: own.team.economyStyle ?? 'standard',
        tacticalPrep: own.team.tacticalPrep ?? 0,
        mentalPrep: !!args.match.mentalPrep && (args.match.mentalPrepTeamId ?? ctx.home.team.id) === own.team.id,
        ...(own.team.targetPlayerId ? { targetPlayerId: own.team.targetPlayerId } : {}),
        opponentScouted: scouted,
        ...(scouted ? { counter } : {}),
        timeoutsUsed: Math.max(0, Math.min(2, args.timeoutsUsed)),
        strategyCalls: args.maps.reduce((n, m) => n + m.rounds.filter(r => r.managerCall?.strategy).length, 0),
        mode: args.mode,
    }
}
