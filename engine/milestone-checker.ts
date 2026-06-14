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

export interface MilestoneHit {
    id: string
    message: string
}

const WIN_TIERS = [1, 10, 50, 100, 250, 500]
const TROPHY_TIERS = [1, 5, 10, 25]
const KILL_TIERS = [1000, 5000, 10000, 25000]
const FOLLOWER_TIERS = [100_000, 500_000, 1_000_000]
const STREAK_TIERS = [3, 5, 10]

function compactFollowers(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`
    return `${n}`
}

export function checkMilestones(save: GameSave, firedIds: Set<string>): MilestoneHit[] {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return []

    const hits: MilestoneHit[] = []
    const add = (id: string, met: boolean, message: string) => {
        if (met && !firedIds.has(id)) hits.push({ id, message })
    }

    // Single pass over the player's matches (chronological) for total wins + the
    // longest win streak across the whole career.
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
            totalWins++
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

    for (const t of WIN_TIERS) add(`ms_win_${t}`, totalWins >= t, t === 1 ? "Your first win!" : `${t} career wins!`)
    for (const t of TROPHY_TIERS) add(`ms_trophy_${t}`, trophyCount >= t, t === 1 ? "Your first trophy!" : `${t} trophies in the cabinet!`)
    for (const t of KILL_TIERS) add(`ms_kills_${t}`, totalKills >= t, `${t.toLocaleString()} team kills!`)
    for (const t of FOLLOWER_TIERS) add(`ms_fans_${t}`, followers >= t, `${compactFollowers(t)} followers reached!`)
    for (const t of STREAK_TIERS) add(`ms_streak_${t}`, maxStreak >= t, `${t}-match win streak!`)

    return hits
}
