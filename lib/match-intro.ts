/**
 * Facts for the match intro (Phase 5.4a): the head-to-head record and the
 * one context line, built only from what the career holds.
 */
import { getHeadToHead, getRivalryBetween, isDerby } from "@/engine/history-tracker"
import { isTerminalBracketStage } from "@/engine/processors/tournament-completion"
import type { CompletedMatchSaveData, TeamSaveData } from "@/engine/save-types"

export interface HeadToHead {
    meetings: number
    homeWins: number
    awayWins: number
    /** The most recent recorded meeting. */
    last?: { winnerId: string; winnerScore: number; loserScore: number; week: number }
}

const winnerOf = (m: CompletedMatchSaveData): string | undefined =>
    m.result?.winnerId ?? (m.result?.homeScore > m.result?.awayScore ? m.homeTeamId : m.result?.awayScore > m.result?.homeScore ? m.awayTeamId : undefined)

/** Recorded meetings between two clubs (engine/history-tracker getHeadToHead). */
export function headToHeadOf(completedMatches: CompletedMatchSaveData[], homeId: string, awayId: string): HeadToHead {
    const meetings = getHeadToHead({ completedMatches } as never, homeId, awayId).filter(m => !!winnerOf(m))
    let homeWins = 0, awayWins = 0
    for (const m of meetings) {
        if (winnerOf(m) === homeId) homeWins++
        else awayWins++
    }
    const lastMatch = [...meetings].sort((a, b) => b.week - a.week || (b.day ?? 0) - (a.day ?? 0))[0]
    let last: HeadToHead["last"]
    if (lastMatch) {
        const winnerId = winnerOf(lastMatch)!
        const homeWon = winnerId === lastMatch.homeTeamId
        last = {
            winnerId,
            winnerScore: homeWon ? lastMatch.result.homeScore : lastMatch.result.awayScore,
            loserScore: homeWon ? lastMatch.result.awayScore : lastMatch.result.homeScore,
            week: lastMatch.week,
        }
    }
    return { meetings: meetings.length, homeWins, awayWins, last }
}

export interface IntroContextInput {
    home: Pick<TeamSaveData, "id" | "name" | "worldRanking" | "rivalries">
    away: Pick<TeamSaveData, "id" | "name" | "worldRanking" | "rivalries">
    playerTeamId: string | null
    stage?: string | null
    competitionName: string
    h2h: HeadToHead
}

/**
 * One line of context, the first that is true: a final, an established
 * rivalry (the engine's derby state), a rematch of a lost last meeting, a
 * clash of two top-10 clubs.
 */
export function introContextLine(input: IntroContextInput): string | null {
    const { home, away, playerTeamId, stage, competitionName, h2h } = input
    if (stage && isTerminalBracketStage(stage)) return `${stage}: the winner lifts the ${competitionName} trophy`

    const rivalry = getRivalryBetween(home as TeamSaveData, away.id) ?? getRivalryBetween(away as TeamSaveData, home.id)
    if (rivalry && isDerby(rivalry.intensity)) return `${rivalry.intensity === "FIERCE" ? "Fierce" : "Heated"} rivalry: a derby between ${home.name} and ${away.name}`

    const mine = playerTeamId === home.id ? home : playerTeamId === away.id ? away : null
    const other = mine ? (mine.id === home.id ? away : home) : null
    if (mine && other && h2h.last && h2h.last.winnerId === other.id) {
        return `Rematch: ${other.name} won the last meeting ${h2h.last.winnerScore}–${h2h.last.loserScore} in week ${h2h.last.week}`
    }

    const hr = home.worldRanking ?? 999, ar = away.worldRanking ?? 999
    if (hr <= 10 && ar <= 10) return `Top-10 clash: world #${Math.min(hr, ar)} meets world #${Math.max(hr, ar)}`
    return null
}
