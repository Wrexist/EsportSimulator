/**
 * Handle a forfeit when one side has fewer than 5 healthy players.
 *
 * Extracted from atomic-week-processor.ts processMatches (Phase M7).
 * Runs inside the per-match loop when selectActivePlayers returns
 * fewer than 5 for either team. The team with the depleted roster
 * forfeits and loses the match by default.
 *
 * Side effects (in order):
 *   1. Push a CompletedMatchSaveData record to save.completedMatches
 *      with a 1-0 / 0-1 score and a forfeit-summary analysis.
 *   2. Add the match id to `removedMatchIds` so the outer pass can
 *      drop it from scheduledMatches in one batch.
 *   3. Update both teams' recentForm trackers (W for winner, L for
 *      forfeiter; ring buffer of 5).
 *   4. Push a MATCH_RESULT event to save.eventsLog when the player
 *      team is on either side.
 *
 * Returns the matchesPlayed delta — always 1 — so the caller can
 * increment its counter consistently with the match-engine branch.
 */

import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    MatchSaveData,
    CompletedMatchSaveData,
} from "../save-types"

const RECENT_FORM_MAX = 5

function pushForm(team: TeamSaveData, outcome: "W" | "L" | "D"): void {
    if (!team.recentForm) team.recentForm = []
    team.recentForm.push(outcome)
    if (team.recentForm.length > RECENT_FORM_MAX) team.recentForm.shift()
}

export function processForfeitMatch(args: {
    save: GameSave
    match: MatchSaveData
    homeTeam: TeamSaveData
    awayTeam: TeamSaveData
    homePlayers: PlayerSaveData[]
    awayPlayers: PlayerSaveData[]
    playerTeamId: string
    removedMatchIds: Set<string>
}): { matchesPlayed: number } {
    const { save, match, homeTeam, awayTeam, homePlayers, awayPlayers, playerTeamId, removedMatchIds } = args

    const homeForfeits = homePlayers.length < 5
    const forfeitingTeam = homeForfeits ? homeTeam : awayTeam
    const winningTeam = homeForfeits ? awayTeam : homeTeam
    const availableCount = homeForfeits ? homePlayers.length : awayPlayers.length

    const forfeitResult: CompletedMatchSaveData = {
        ...match,
        result: {
            homeScore: homeForfeits ? 0 : 1,
            awayScore: homeForfeits ? 1 : 0,
            maps: [],
            playerStats: {},
            winnerId: winningTeam.id,
            mvpPlayerId: "",
        },
        analysis: {
            summary: `${forfeitingTeam.name} forfeited due to insufficient healthy players (${availableCount}/5 available).`,
            keyFactor: "FIREPOWER",
            winningFactor: "Win by forfeit",
            losingFactor: "Insufficient healthy players",
            teamPerformance: { economyRating: 0, aimRating: 0, utilityRating: 0, tradingRating: 0 },
        },
    } as CompletedMatchSaveData

    save.completedMatches.push(forfeitResult)
    removedMatchIds.add(match.id)

    pushForm(winningTeam, "W")
    pushForm(forfeitingTeam, "L")

    // Player-team notification (either side).
    if (forfeitingTeam.id === playerTeamId || winningTeam.id === playerTeamId) {
        save.eventsLog.unshift({
            id: `forfeit_${save.currentWeek}_${match.id}`,
            type: "MATCH_RESULT",
            week: save.currentWeek,
            data: {
                description: forfeitingTeam.id === playerTeamId
                    ? `Your team forfeited against ${winningTeam.name} due to too many injured players.`
                    : `${forfeitingTeam.name} forfeited your match — win by default!`,
                importance: "HIGH",
            },
            acknowledged: false,
        })
    }

    return { matchesPlayed: 1 }
}
