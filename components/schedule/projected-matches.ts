/**
 * Calendar forecasts: the managed club's tournament matches that are not
 * drawn yet ("Kato Open · Bracket · TBD"). Pure, so the rules are testable.
 *
 * HOME-01: an event the club is out of forecasts nothing. A bracket slot is
 * forecast only while the club can still reach it: it plays in that match,
 * or in an unfinished match that feeds it.
 */
import type { BracketMatchSaveData, QualificationStatus, TournamentSaveData } from "@/engine/save-types"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

export interface ProjectedMatch {
    id: string
    week: number
    stage: string
    tournamentName: string
    tournamentId: string
    reason?: string
}

export interface ProjectionSource {
    playerTeamId: string | null
    currentWeek: number
    tournaments: readonly TournamentSaveData[]
    tournamentQualifications: readonly QualificationStatus[]
    scheduledMatches: ReadonlyArray<{ id: string; week: number; tournamentId?: string | null; homeTeamId: string; awayTeamId: string }>
    completedMatches: ReadonlyArray<{ id: string }>
}

/** The club is out of this event instance (its qualification row says so). */
export function eliminatedFrom(src: Pick<ProjectionSource, "playerTeamId" | "tournamentQualifications">, instanceId: string): boolean {
    return src.tournamentQualifications.some(q => q.teamId === src.playerTeamId && q.status === "ELIMINATED" && (q.tournamentId === instanceId || q.instanceId === instanceId))
}

/**
 * Can the club still play in this bracket match? It is drawn in it, or one of
 * its open slots is fed by an unfinished match the club can still reach.
 * A match whose feeders are unknown (older brackets) counts while it has an
 * open slot, as before.
 */
export function canReachBracketMatch(match: BracketMatchSaveData, bracket: readonly BracketMatchSaveData[], teamId: string, seen = new Set<string>()): boolean {
    if (match.homeTeamId === teamId || match.awayTeamId === teamId) return true
    if (match.homeTeamId && match.awayTeamId) return false
    if (!match.sourceMatchIds?.length) return true
    if (seen.has(match.id)) return false
    seen.add(match.id)
    return match.sourceMatchIds.some(id => {
        const source = bracket.find(m => m.id === id)
        return !!source && !source.isCompleted && canReachBracketMatch(source, bracket, teamId, seen)
    })
}

export function projectedMatchesFor(src: ProjectionSource, labels: { nextStage: string; upcomingStage: string; forecast: string }): ProjectedMatch[] {
    const me = src.playerTeamId
    if (!me) return []
    const projected: ProjectedMatch[] = []
    const pushed = new Set<string>()
    const scheduledIds = new Set(src.scheduledMatches.map(m => m.id))
    const completedIds = new Set(src.completedMatches.map(m => m.id))

    const liveInstances = src.tournaments.filter(t => !t.isCompleted && t.teamIds?.includes(me) && !eliminatedFrom(src, t.id))

    for (const instance of liveInstances) {
        const definition = FULL_TOURNAMENT_CALENDAR.find(def => def.id === (instance.seriesId || instance.id.replace(/_s\d+$/, "")))
        const name = definition?.shortName || instance.shortName || instance.name
        const bracket = instance.playoffBracket || []

        const forecastedBracketMatches = bracket
            .filter(m => !m.isCompleted)
            .filter(m => canReachBracketMatch(m, bracket, me))
            .filter(m => !scheduledIds.has(m.id) && !completedIds.has(m.id))
            .filter(m => m.week >= src.currentWeek)
            .sort((a, b) => ((a.week || 0) - (b.week || 0)) || (a.id || "").localeCompare(b.id || ""))

        for (const match of forecastedBracketMatches) {
            const key = `${instance.id}:${match.id}`
            if (pushed.has(key)) continue
            pushed.add(key)
            projected.push({
                id: `proj_${instance.id}_${match.id}`,
                week: match.week,
                tournamentId: instance.id,
                tournamentName: name,
                stage: match.stage || instance.currentStage || labels.nextStage,
                reason: labels.forecast,
            })
        }
        if (forecastedBracketMatches.length > 0) continue
        // A drawn bracket with nothing left for the club: it is out, even if no qualification row says so.
        if (bracket.length > 0 && bracket.some(m => m.isCompleted && m.loserId === me) && !bracket.some(m => !m.isCompleted && canReachBracketMatch(m, bracket, me))) continue

        // SMOKE-A-09: the club is drawn in the bracket's last round (a match
        // no other match is fed by): nothing comes after it to forecast.
        // Swiss rounds and GSL groups share playoffBracket and are not part of it.
        const playoff = bracket.filter(m => !m.id.includes("_swiss_r") && !/^Group /.test(m.stage || ""))
        const fedBy = new Set(playoff.flatMap(m => m.sourceMatchIds ?? []))
        if (fedBy.size > 0 && playoff.some(m => (m.homeTeamId === me || m.awayTeamId === me) && !fedBy.has(m.id))) continue

        // Stage window fallback when bracket rounds are not generated yet.
        // A saved event's endWeek is the week after its last one (start + duration).
        const startWeek = Math.max(src.currentWeek, instance.startWeek)
        const endWeek = Math.max(startWeek, instance.endWeek - 1)
        for (let week = startWeek; week <= endWeek; week++) {
            const hasPlayerMatch = src.scheduledMatches.some(m => m.week === week && m.tournamentId === instance.id && (m.homeTeamId === me || m.awayTeamId === me))
            if (hasPlayerMatch) continue
            const key = `${instance.id}:stage:${week}`
            if (pushed.has(key)) continue
            pushed.add(key)
            projected.push({
                id: `proj_${instance.id}_${week}`,
                week,
                tournamentId: instance.id,
                tournamentName: name,
                stage: instance.currentStage || labels.upcomingStage,
                reason: labels.forecast,
            })
        }
    }

    return projected.sort((a, b) => (a.week - b.week) || a.id.localeCompare(b.id)).slice(0, 60)
}
