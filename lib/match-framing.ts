/**
 * How a fixture is named on the big screens (match intro, board brief):
 * the competition, its tier and the stage, from the fixture itself.
 */
import { leagueDivisionLabel, leagueStageLabel } from "@/components/league/league-view"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

interface FixtureLike {
    id: string
    tournamentId?: string | null
    stage?: string | null
}

export interface CompetitionFraming {
    /** "Europe Division 3", "Nordic Masters", "Friendly". */
    name: string
    /** Tournament tier ("S_TIER"...) when it is a tournament. */
    tier?: string
    /** "Round 5", "Grand Final", "Preseason Friendly". */
    stage?: string
    kind: "league" | "tournament" | "friendly"
}

export function competitionOf(match: FixtureLike, tournaments: ReadonlyArray<{ id: string; name: string; tier?: string }> = []): CompetitionFraming {
    const leagueStage = leagueStageLabel(match)
    if (leagueStage) {
        const division = leagueDivisionLabel(match) ?? "Regional league"
        const round = leagueStage.includes(" · ") ? leagueStage.split(" · ").slice(1).join(" · ") : undefined
        return { name: division, stage: round, kind: "league" }
    }
    const tid = match.tournamentId
    if (!tid || tid === "SCRIM") return { name: match.stage?.trim() || "Friendly", kind: "friendly" }
    const live = tournaments.find(t => t.id === tid)
    const def = FULL_TOURNAMENT_CALENDAR.find(t => t.id === tid.replace(/_s\d+$/, "") || t.id === tid)
    return { name: live?.name ?? def?.name ?? "Tournament", tier: live?.tier ?? def?.tier, stage: match.stage ?? undefined, kind: "tournament" }
}
