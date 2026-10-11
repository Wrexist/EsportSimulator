/**
 * Weekly-report causes for world-ranking movement (Phase 4.8).
 *
 * A club's rank change at a ranking refresh is split (engine/world-ranking
 * rankMovement) into what its own results explain and what other clubs'
 * results explain, and each part names its cause: the club's results (the
 * opponent, the competition and its weight, the Elo exchanged), and the
 * clubs that passed it or dropped behind it.
 */

import type { CompletedMatchSaveData, GameSave } from "./save-types"
import type { ChangeCause, ChangeEntry } from "@/lib/week-changes"
import { IMPORTANCE_LABEL, isPlayoffStage, matchImportance, rankMovement, type RankMovement } from "./world-ranking"

type MatchRef = Pick<CompletedMatchSaveData, "tournamentId" | "stage">
type ReportSave = Pick<GameSave, "teams" | "tournaments" | "completedMatches" | "currentWeek">

export const RANK_LABEL = "World rank"

/** " · IEM Cologne (S-Tier playoffs)", " · Europe Division 1 (League)", "" for a friendly. */
export function competitionLabel(save: Pick<GameSave, "tournaments">, match: MatchRef): string {
    const tournament = match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId) : undefined
    const importance = matchImportance(match.tournamentId, tournament?.tier)
    if (importance === "FRIENDLY") return ""
    if (importance === "LEAGUE") {
        const division = String(match.stage ?? "").split(" · ")[0]
        return ` · ${division || "League"} (League)`
    }
    const playoff = isPlayoffStage(match.stage) ? " playoffs" : ""
    return ` · ${tournament?.name ?? "Event"} (${IMPORTANCE_LABEL[importance]}${playoff})`
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n))}`

function names(save: Pick<GameSave, "teams">, ids: string[], max = 2): string {
    const list = ids.slice(0, max).map(id => save.teams.find(t => t.id === id)?.name ?? id)
    return ids.length > max ? `${list.join(", ")} +${ids.length - max}` : list.join(", ")
}

/**
 * The club's rated results since the last ranking refresh: its latest
 * results whose Elo changes add up to its Elo move since then (falls back to
 * this and last week's results).
 */
function resultsSinceRefresh(save: ReportSave, teamId: string): CompletedMatchSaveData[] {
    const team = save.teams.find(t => t.id === teamId)
    const rated = save.completedMatches.filter(m => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.result
        && matchImportance(m.tournamentId, save.tournaments.find(t => t.id === m.tournamentId)?.tier) !== "FRIENDLY")
    const pending = team && typeof team.rankedElo === "number" ? team.elo - team.rankedElo : NaN
    if (Number.isFinite(pending) && pending !== 0) {
        const picked: CompletedMatchSaveData[] = []
        let sum = 0
        for (let i = rated.length - 1; i >= 0 && picked.length < 8; i--) {
            const m = rated[i]
            const change = m.homeTeamId === teamId ? m.eloChange?.home : m.eloChange?.away
            if (typeof change !== "number") continue
            picked.unshift(m)
            sum += change
            if (sum === pending) return picked
        }
    }
    return rated.filter(m => m.week >= save.currentWeek - 1)
}

/** "Your results: beat X · IEM Cologne (S-Tier playoffs), Elo +14; lost to Y · ... (League), Elo −5". */
export function ownResultsLabel(save: ReportSave, teamId: string): string {
    const results = resultsSinceRefresh(save, teamId)
    const parts = results.slice(0, 3).map(m => {
        const home = m.homeTeamId === teamId
        const opp = save.teams.find(t => t.id === (home ? m.awayTeamId : m.homeTeamId))?.name ?? "opponent"
        const elo = home ? m.eloChange?.home : m.eloChange?.away
        const won = m.result?.winnerId === teamId
        return `${won ? "beat" : "lost to"} ${opp}${competitionLabel(save, m)}${typeof elo === "number" ? `, Elo ${signed(elo)}` : ""}`
    })
    if (results.length > 3) parts.push(`${results.length - 3} more`)
    return parts.length ? `Your results: ${parts.join("; ")}` : "Your results"
}

/** "Other clubs' results: passed by A, B; C dropped behind". */
export function othersResultsLabel(save: Pick<GameSave, "teams">, move: Pick<RankMovement, "passedBy" | "droppedBehind">, suffix = ""): string {
    const bits: string[] = []
    if (move.passedBy.length) bits.push(`passed by ${names(save, move.passedBy)}`)
    if (move.droppedBehind.length) bits.push(`${names(save, move.droppedBehind)} dropped behind`)
    return `Other clubs' results${suffix}${bits.length ? `: ${bits.join("; ")}` : ""}`
}

/** The two "World rank" entries of a movement (only the non-zero parts). */
export function rankEntries(save: Pick<GameSave, "teams">, teamId: string, move: RankMovement, ownCause: ChangeCause, othersSuffix = ""): ChangeEntry[] {
    const out: ChangeEntry[] = []
    if (move.own !== 0) out.push({ kind: "ranking", subjectId: teamId, label: RANK_LABEL, delta: move.own, cause: ownCause })
    if (move.others !== 0) out.push({ kind: "ranking", subjectId: teamId, label: RANK_LABEL, delta: move.others, cause: { type: "world", label: othersResultsLabel(save, move, othersSuffix) } })
    return out
}

/**
 * "World rank" entries for the managed club's move at the weekly refresh,
 * split by cause. Call before the refresh. Empty when the club did not move.
 */
export function rankMovementEntries(save: ReportSave, teamId: string): ChangeEntry[] {
    const move = rankMovement(save, teamId)
    if (!move) return []
    return rankEntries(save, teamId, move, { type: "match", label: ownResultsLabel(save, teamId) })
}

/**
 * Live match path (the ranking refreshes right after the managed club's
 * match): replace the diff's single "World rank" entry with the split, own
 * part under the match's cause. `before` is the state before the match.
 */
export function splitLiveRankEntries(entries: ChangeEntry[], before: Pick<GameSave, "teams">, after: Pick<GameSave, "teams">, teamId: string): ChangeEntry[] {
    const i = entries.findIndex(e => e.kind === "ranking" && e.label === RANK_LABEL && e.subjectId === teamId)
    if (i < 0) return entries
    const move = rankMovement(before, teamId, after)
    if (!move || move.own + move.others !== entries[i].delta) return entries
    return [...entries.slice(0, i), ...rankEntries(after, teamId, move, entries[i].cause, " this week"), ...entries.slice(i + 1)]
}
