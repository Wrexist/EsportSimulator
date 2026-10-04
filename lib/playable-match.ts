/**
 * Which of the manager's fixtures can actually be played right now.
 *
 * One predicate for every surface that offers "Play match" (TopBar, the
 * advance-week guard, the tactics screen). The TopBar used to apply only the
 * week/day check, so a fixture the store refuses to simulate (the manager's
 * or the opponent's roster below five, e.g. after a contract expired) was
 * still offered; quick sim then navigated to a result that was never
 * recorded and showed "Match Not Found" (L27 long career, week 168).
 */
import { getActivePlayersByRosterOrder } from "@/lib/live-match-builders"

export const PLAYERS_NEEDED = 5

interface FixtureLike {
    id: string
    week: number
    day?: number
    homeTeamId: string
    awayTeamId: string
}

interface TeamLike {
    id: string
    name?: string
    rosterIds?: string[]
}

export interface PlayableMatchState<M extends FixtureLike = FixtureLike> {
    playerTeamId: string | null
    scheduledMatches: M[]
    currentWeek: number
    currentDay?: number
    timeMode?: string
    teams: TeamLike[]
    players: Array<{ id: string; isRetired?: boolean }>
}

/** Number of players this team can put on the server (at most five). */
export function fieldablePlayerCount(state: Pick<PlayableMatchState, "teams" | "players">, teamId: string): number {
    const team = state.teams.find(t => t.id === teamId)
    return team ? getActivePlayersByRosterOrder(team, state.players).length : 0
}

/**
 * Why the store would refuse to simulate this fixture, or null when it can be
 * played. Mirrors the roster guards in simulateInstantMatch.
 */
export function fixtureBlockReason(state: PlayableMatchState, match: FixtureLike): string | null {
    const sides = [match.homeTeamId, match.awayTeamId]
    for (const teamId of sides) {
        const count = fieldablePlayerCount(state, teamId)
        if (count >= PLAYERS_NEEDED) continue
        if (teamId === state.playerTeamId) {
            return `Your roster has ${count} active player${count === 1 ? "" : "s"}; you need ${PLAYERS_NEEDED} to play. Sign a player, or advance the week and this match is forfeited.`
        }
        const name = state.teams.find(t => t.id === teamId)?.name ?? "Your opponent"
        return `${name} can't field ${PLAYERS_NEEDED} players. Advance the week to resolve this match by forfeit.`
    }
    return null
}

let lastInputs: unknown[] = []
let lastId: string | null = null

/**
 * Store selector: id of the fixture "Play match" may offer right now, or
 * null. Memoized on input references because zustand runs selectors on every
 * store update.
 */
export function selectPlayableMatchId(state: PlayableMatchState): string | null {
    const inputs = [state.playerTeamId, state.scheduledMatches, state.currentWeek, state.currentDay, state.timeMode, state.teams, state.players]
    if (inputs.length === lastInputs.length && inputs.every((v, i) => v === lastInputs[i])) return lastId
    lastInputs = inputs
    lastId = pendingPlayableMatch(state)?.id ?? null
    return lastId
}

/**
 * The manager's fixture this week that must be played before the week can
 * advance, and that "Play match" may offer. Fixtures where either side cannot
 * field five are excluded: simulateInstantMatch refuses them and the week
 * tick resolves them by forfeit (match-forfeit.ts).
 *
 * respectDay=false ignores the HYBRID_DAILY day cursor (the advance-week
 * guard blocks on any unplayed fixture of the week).
 */
export function pendingPlayableMatch<M extends FixtureLike>(
    state: PlayableMatchState<M>,
    completedIds?: Set<string>,
    opts: { respectDay?: boolean } = {},
): M | null {
    if (!state.playerTeamId) return null
    const me = state.playerTeamId
    const respectDay = opts.respectDay ?? true
    return state.scheduledMatches.find(m =>
        m.week === state.currentWeek &&
        (m.homeTeamId === me || m.awayTeamId === me) &&
        !completedIds?.has(m.id) &&
        (!respectDay || state.timeMode !== "HYBRID_DAILY" || (m.day ?? 6) <= (state.currentDay ?? 6)) &&
        fixtureBlockReason(state, m) === null
    ) ?? null
}
