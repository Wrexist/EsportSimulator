/**
 * Map data (G2): round win rates by map, side, buy, plan and call, kept as a
 * running tally because per-round detail is stripped from saved matches
 * (AI matches at once, your own after four weeks).
 *
 * Two parts, both per season (this season and the last one are kept):
 * - `teams`: every club's official maps, map wins and CT / T rounds. Public
 *   results only, so opponent intel can show them without scouting.
 * - `own`: the managed club's detail, official and friendlies apart: pistols,
 *   buy types, T plans, CT setups, your round calls and the playstyle set
 *   for the match. Reset when you move club.
 *
 * History only: nothing here changes a match.
 */

import type { MatchResult, RoundResult } from "@/types/match"
import type { GameSave, MatchSaveData } from "./save-types"
import { getSeasonNumber } from "./career-stats"

/** [maps, maps won, CT rounds, CT rounds won, T rounds, T rounds won] */
export type SideTally = [number, number, number, number, number, number]

/** Rounds (or maps, for playstyles) played and won. */
export interface RateCell { n: number; won: number }

export interface OwnMapDetail {
    side: SideTally
    pistol: RateCell
    /** Own buy (ECO, FORCE, FULL, ...), pistols left out. */
    buys: Record<string, RateCell>
    /** T rounds by the plan you ran (default, execute, rush, split, fake, eco). */
    tPlans: Record<string, RateCell>
    /** CT rounds by the setup you held (2-1-2, stack-A, stack-B, aggressive). */
    ctSetups: Record<string, RateCell>
    /** Rounds where you made the buy call from the match screen. */
    calls: Record<string, RateCell>
    /** Maps by the playstyle set before the match. */
    playstyles: Record<string, RateCell>
}

export interface MapRecordSeason {
    season: number
    teams: Record<string, Record<string, SideTally>>
    own?: { teamId: string; official: Record<string, OwnMapDetail>; friendly: Record<string, OwnMapDetail> }
}

export interface MapRecordState {
    current: MapRecordSeason
    previous?: MapRecordSeason
}

export const emptyTally = (): SideTally => [0, 0, 0, 0, 0, 0]
const emptyDetail = (): OwnMapDetail => ({ side: emptyTally(), pistol: { n: 0, won: 0 }, buys: {}, tPlans: {}, ctSetups: {}, calls: {}, playstyles: {} })
const bump = (cells: Record<string, RateCell>, key: string, won: boolean) => {
    const c = cells[key] ?? (cells[key] = { n: 0, won: 0 })
    c.n++
    if (won) c.won++
}

function addSides(t: SideTally, teamId: string, rounds: RoundResult[]): void {
    let won = 0
    for (const r of rounds) {
        const ct = r.ctTeam === teamId
        const w = r.winningTeamId ? r.winningTeamId === teamId : (r.winner === "ct") === ct
        if (w) won++
        if (ct) { t[2]++; if (w) t[3]++ } else { t[4]++; if (w) t[5]++ }
    }
    t[0]++
    if (won * 2 > rounds.length) t[1]++
}

/** The season's record, rolled over when the season changes. */
function seasonRecord(save: GameSave, season: number): MapRecordSeason {
    const state = save.mapRecords
    if (!state) return (save.mapRecords = { current: { season, teams: {} } }).current
    if (state.current.season < season) {
        state.previous = state.current.season === season - 1 ? state.current : undefined
        state.current = { season, teams: {} }
    }
    return state.current.season === season ? state.current : state.previous?.season === season ? state.previous : state.current
}

/**
 * Adds a played match to the tally. Official matches count for both clubs;
 * friendlies only for your own detail. Maps without rounds are skipped.
 */
export function recordMapResults(
    save: GameSave,
    match: Pick<MatchSaveData, "homeTeamId" | "awayTeamId" | "week">,
    result: Pick<MatchResult, "maps" | "management">,
    official: boolean,
): void {
    const maps = (result.maps ?? []).filter(m => Array.isArray(m.rounds) && m.rounds.length > 0)
    if (!maps.length) return
    const own = save.playerTeamId
    const ownInMatch = match.homeTeamId === own || match.awayTeamId === own
    if (!official && !ownInMatch) return

    const rec = seasonRecord(save, getSeasonNumber(match.week ?? save.currentWeek))
    for (const m of maps) {
        if (official) {
            for (const teamId of [match.homeTeamId, match.awayTeamId]) {
                const byMap = rec.teams[teamId] ?? (rec.teams[teamId] = {})
                addSides(byMap[m.map] ?? (byMap[m.map] = emptyTally()), teamId, m.rounds)
            }
        }
        if (!ownInMatch) continue
        if (!rec.own || rec.own.teamId !== own) rec.own = { teamId: own, official: {}, friendly: {} }
        const bucket = official ? rec.own.official : rec.own.friendly
        const d = bucket[m.map] ?? (bucket[m.map] = emptyDetail())
        addSides(d.side, own, m.rounds)
        const home = match.homeTeamId === own
        let mapWins = 0
        for (const r of m.rounds) {
            const ct = r.ctTeam === own
            const w = r.winningTeamId ? r.winningTeamId === own : (r.winner === "ct") === ct
            if (w) mapWins++
            const buy = r.buys?.[home ? "home" : "away"]
            if (buy === "PISTOL") { d.pistol.n++; if (w) d.pistol.won++ }
            else if (buy) bump(d.buys, buy, w)
            if (r.plan) {
                if (ct) bump(d.ctSetups, r.plan.ctSetup, w)
                else bump(d.tPlans, r.plan.tStrategy, w)
            }
            if (r.managerCall?.strategy) bump(d.calls, r.managerCall.strategy, w)
        }
        const style = result.management?.teamId === own ? result.management.playstyle : undefined
        if (style) bump(d.playstyles, style, mapWins * 2 > m.rounds.length)
    }
}

/** Win share in whole percent, or null when nothing was played. */
export const rate = (won: number, n: number): number | null => (n > 0 ? Math.round((won / n) * 100) : null)

/** A club's official tally for one season (empty object when none). */
export function teamMapTally(save: Pick<GameSave, "mapRecords">, teamId: string, which: "current" | "previous" = "current"): Record<string, SideTally> {
    return save.mapRecords?.[which]?.teams[teamId] ?? {}
}

/** Your own detail for one season, official or friendlies. */
export function ownMapDetail(save: Pick<GameSave, "mapRecords"> & { playerTeamId: string | null }, which: "current" | "previous", scope: "official" | "friendly"): Record<string, OwnMapDetail> {
    const own = save.mapRecords?.[which]?.own
    return own && own.teamId === save.playerTeamId ? own[scope] : {}
}

/** Sums tallies (for an all-maps row). */
export function sumTallies(tallies: SideTally[]): SideTally {
    const out = emptyTally()
    for (const t of tallies) for (let i = 0; i < 6; i++) out[i] += t[i]
    return out
}

/** A club's official tally per map over this season and the last (veto and opponent intel). */
export function recentMapTally(save: Pick<GameSave, "mapRecords">, teamId: string): Record<string, SideTally> {
    const out: Record<string, SideTally> = {}
    for (const which of ["current", "previous"] as const) {
        for (const [map, t] of Object.entries(teamMapTally(save, teamId, which))) out[map] = sumTallies([out[map] ?? emptyTally(), t])
    }
    return out
}
