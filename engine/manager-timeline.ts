/**
 * Manager timeline (Phase 5.1): one stint per club managed (from-to, official
 * results, titles, how it ended) and the manager's reputation changes with
 * their causes.
 *
 * Writers:
 *   - official-stats.ts: every official managed result and title;
 *   - board-expectations.ts: a dismissal closes the stint as "sacked";
 *   - finance-processor.ts: a club folding closes it as "folded";
 *   - job-offer-generator.ts: taking another job closes it as "moved" and
 *     opens the next one.
 * There is no resignation action in the game, so no stint ends "resigned".
 *
 * A save from before Phase 5.1 opens its first stint lazily; when the club
 * had already played official matches by then, `trackedFromWeek` says from
 * when the counts are complete. Deterministic: no RNG.
 */

import type { GameSave } from "./save-types"
import type { ManagerStint, ReputationChange, StintEnd } from "./records-types"
import { RECORDS_TUNING } from "@/lib/balance-tuning"

type TimelineSave = Pick<GameSave, "managerDetails" | "currentWeek" | "playerTeamId" | "teams" | "completedMatches">

const cap = <T>(list: T[], n: number) => { if (list.length > n) list.splice(0, list.length - n) }

/**
 * Change the manager's reputation (0-100) and log the cause. Returns the
 * change actually applied after clamping (nothing is logged when it is 0).
 */
export function adjustManagerReputation(save: Pick<GameSave, "managerDetails" | "currentWeek">, delta: number, cause: string): number {
    const md = save.managerDetails
    if (!md || !Number.isFinite(delta) || delta === 0) return 0
    const before = Number.isFinite(md.reputation) ? md.reputation : 50
    const after = Math.max(0, Math.min(100, before + delta))
    md.reputation = after
    const applied = after - before
    if (applied !== 0) {
        const log = md.reputationLog ?? (md.reputationLog = [])
        log.push({ week: save.currentWeek, delta: applied, cause })
        cap(log, RECORDS_TUNING.REPUTATION_LOG_CAP)
    }
    return applied
}

/** Reputation changes in a season (weeks 52(s-1)+1 .. 52s), oldest first. */
export function reputationChangesIn(save: Pick<GameSave, "managerDetails">, season: number): ReputationChange[] {
    const from = (season - 1) * 52 + 1, to = season * 52
    return (save.managerDetails?.reputationLog ?? []).filter(c => c.week >= from && c.week <= to)
}

function hadEarlierOfficialMatch(save: TimelineSave, fromWeek: number, excludeMatchId?: string): boolean {
    const team = save.playerTeamId
    // Official = a competition id other than SCRIM (world-ranking matchImportance).
    return (save.completedMatches || []).some(m => m.id !== excludeMatchId && m.week >= fromWeek
        && (m.homeTeamId === team || m.awayTeamId === team)
        && !m.isScrim && !!m.tournamentId && m.tournamentId !== "SCRIM")
}

/**
 * The open stint at the managed club, opened when missing. `fresh` marks a
 * stint that starts now (a new job), so the counts are complete by definition.
 */
export function currentStint(save: TimelineSave, opts: { excludeMatchId?: string; fresh?: boolean } = {}): ManagerStint | undefined {
    const md = save.managerDetails
    const teamId = save.playerTeamId
    if (!md || !teamId) return undefined
    const stints = md.stints ?? (md.stints = [])
    const last = stints[stints.length - 1]
    if (last && !last.ended && last.teamId === teamId) return last
    // An open stint at another club means the club changed without a recorded end.
    if (last && !last.ended) { last.ended = "moved"; last.toWeek = last.toWeek ?? save.currentWeek }
    const fromWeek = Math.max(1, md.tenureStartWeek ?? 1)
    const team = save.teams.find(t => t.id === teamId)
    const stint: ManagerStint = { teamId, teamName: team?.name ?? teamId, fromWeek, matches: 0, wins: 0, losses: 0, trophies: 0 }
    if (!opts.fresh && hadEarlierOfficialMatch(save, fromWeek, opts.excludeMatchId)) stint.trackedFromWeek = save.currentWeek
    stints.push(stint)
    cap(stints, RECORDS_TUNING.STINTS_CAP)
    return stint
}

/** An official result of the managed club. */
export function recordManagedResult(save: TimelineSave, won: boolean, matchId: string): void {
    const stint = currentStint(save, { excludeMatchId: matchId })
    if (!stint) return
    stint.matches++
    if (won) stint.wins++
    else stint.losses++
}

/** A title won by the managed club. */
export function recordManagedTitle(save: TimelineSave): void {
    const stint = currentStint(save)
    if (stint) stint.trophies++
}

/** Close the open stint (sacked, the club folded, or a move to another club). */
export function closeStint(save: TimelineSave, ended: StintEnd): void {
    const last = save.managerDetails?.stints?.at(-1)
    if (last?.ended && last.teamId === save.playerTeamId) return // already closed
    const stint = currentStint(save)
    if (!stint || stint.ended) return
    stint.ended = ended
    stint.toWeek = save.currentWeek
}

/** Open the stint at a newly joined club (call after playerTeamId and tenureStartWeek are set). */
export function openStint(save: TimelineSave): void {
    currentStint(save, { fresh: true })
}
