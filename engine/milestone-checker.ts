/**
 * Career milestone checker (AUDIT_UX_2026-06 D6/D7/D8).
 *
 * Surfaces the "feeling of achievement" beats the game was firing silently:
 * firsts (first win, first trophy), round-number totals (100 wins, 1,000 kills,
 * 100k followers), and win streaks. Pure read of the save — the store calls it
 * post-tick, toasts each hit, and acknowledges it so its stable id lands in the
 * durable acknowledgedEventIds set. That set is the dedup: every milestone has a
 * fixed id, so it can only ever fire once (idempotent across replays/reloads).
 */

import type { GameSave } from "./save-types"
import { NUMBER_REF, tRefEn, type TextRef } from "@/lib/i18n"
import { isOfficialMatch } from "./personality"

export interface MilestoneHit {
    id: string
    /** English copy (toasts, logs). */
    message: string
    /** The same line as a translation key, shown in the active language. */
    ref: TextRef
}

const WIN_TIERS = [1, 10, 50, 100, 250, 500]
const TROPHY_TIERS = [1, 5, 10, 25]
const KILL_TIERS = [1000, 5000, 10000, 25000]
const FOLLOWER_TIERS = [100_000, 500_000, 1_000_000]
const STREAK_TIERS = [3, 5, 10]

export function checkMilestones(save: GameSave, firedIds: Set<string>): MilestoneHit[] {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return []

    const hits: MilestoneHit[] = []
    const add = (id: string, met: boolean, ref: TextRef) => {
        if (met && !firedIds.has(id)) hits.push({ id, message: tRefEn(ref), ref })
    }
    const number = (n: number): TextRef => ({ key: NUMBER_REF, count: n })

    // Single pass over the player's matches (chronological) for total wins + the
    // longest win streak across the whole career. Win totals count official
    // matches only, as the Steam win achievements they pair with do
    // (lib/celebration-toasts.ts, MODES-06): a scrim is not "your first win".
    const playerMatches = save.completedMatches
        .filter(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
        .sort((a, b) => a.week - b.week)
    let totalWins = 0
    let curStreak = 0
    let maxStreak = 0
    for (const m of playerMatches) {
        const isHome = m.homeTeamId === save.playerTeamId
        const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
        if (won) {
            if (isOfficialMatch(m)) totalWins++
            curStreak++
            if (curStreak > maxStreak) maxStreak = curStreak
        } else {
            curStreak = 0
        }
    }

    const rosterPlayers = save.players.filter(p => team.rosterIds.includes(p.id))
    const totalKills = rosterPlayers.reduce((s, p) => s + (p.totalKills || 0), 0)
    const followers = team.followers ?? team.fanbase ?? 0
    const trophyCount = team.trophies?.length ?? 0

    for (const t of WIN_TIERS) add(`ms_win_${t}`, totalWins >= t, t === 1 ? { key: "evn.ms.firstWin" } : { key: "evn.ms.wins", count: t })
    for (const t of TROPHY_TIERS) add(`ms_trophy_${t}`, trophyCount >= t, t === 1 ? { key: "evn.ms.firstTrophy" } : { key: "evn.ms.trophies", count: t })
    for (const t of KILL_TIERS) add(`ms_kills_${t}`, totalKills >= t, { key: "evn.ms.kills", count: t, params: { n: number(t) } })
    for (const t of FOLLOWER_TIERS) add(`ms_fans_${t}`, followers >= t, { key: "evn.ms.followers", count: t, params: { n: number(t) } })
    for (const t of STREAK_TIERS) add(`ms_streak_${t}`, maxStreak >= t, { key: "evn.ms.streak", count: t })

    return hits
}

/** The first-win milestone's id. */
export const FIRST_WIN_MILESTONE = "ms_win_1"

/**
 * NEWPLAYER-12: the first official win is celebrated when the match is
 * recorded (store/slices/match-simulation-slice.ts), not at the next week tick.
 * Null when it has fired already or the club has no official win yet.
 */
export function firstWinMilestone(save: GameSave, firedIds: Set<string>): MilestoneHit | null {
    if (firedIds.has(FIRST_WIN_MILESTONE)) return null
    return checkMilestones(save, firedIds).find(h => h.id === FIRST_WIN_MILESTONE) ?? null
}
