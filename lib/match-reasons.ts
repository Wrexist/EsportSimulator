/**
 * "Why we won" for the result screen: the three recorded factors that leaned
 * hardest toward the result, and one line per player on what drove their
 * rating. Built only from the round log (kills, openings, trades, clutches,
 * grenade damage, buys) and the public scoreboard, like match-insights.
 *
 * Each factor gets a rough swing in rounds so they can be ranked against
 * each other. The weights are deliberately simple; the lines say what
 * happened, not a proof of cause.
 */
import type { MatchEvent, MatchResult, PlayerMatchStats, RoundResult } from '@/types'
import { COACH_CALL_LABEL } from '@/engine/match/coach-calls'

export interface MatchReason {
    key: 'opening' | 'trades' | 'clutches' | 'pistols' | 'buys' | 'utility' | 'multikills'
    /** Rough rounds this factor moved toward the managed team (negative = toward the opponent). */
    swing: number
    text: string
}

export interface PlayerReason { playerId: string; rating: number; line: string }

export interface MatchReasons {
    reasons: MatchReason[]
    players: PlayerReason[]
    /** Mid-round coach calls (R2), when any were made. */
    calls: CallsReason | null
}

/** One mid-round call and what it did to its round. */
export interface CallLine {
    map: string
    round: number
    label: string
    /** 'won' = the call turned a lost round into a win, 'lost' = the reverse, null = same result either way. */
    flipped: 'won' | 'lost' | null
}

export interface CallsReason {
    calls: CallLine[]
    /** Rounds the calls won minus rounds they lost. */
    swing: number
    text: string
}

/**
 * Each call is judged against the same round played with the calls before it
 * but not this one (recorded when the call was made); its own result is the
 * next call's comparison, or the round's result for the last call.
 */
export function coachCallsReason(result: MatchResult, teamId: string): CallsReason | null {
    const calls: CallLine[] = []
    for (const map of result.maps) {
        for (const r of map.rounds ?? []) {
            const made = r.managerCall?.coachCalls ?? []
            const won = r.winningTeamId === teamId
            made.forEach((c, i) => {
                const withIt = i + 1 < made.length ? made[i + 1].without === 'won' : won
                const without = c.without === 'won'
                calls.push({ map: map.map, round: r.roundNumber, label: COACH_CALL_LABEL[c.kind], flipped: withIt === without ? null : withIt ? 'won' : 'lost' })
            })
        }
    }
    if (!calls.length) return null
    const gained = calls.filter(c => c.flipped === 'won').length
    const cost = calls.filter(c => c.flipped === 'lost').length
    const n = (k: number) => k === 1 ? '1 call' : `${k} calls`
    const parts = [`You made ${n(calls.length)} during rounds.`]
    if (gained) parts.push(`${n(gained)} won a round that was lost without it.`)
    if (cost) parts.push(`${n(cost)} lost a round that was won without it.`)
    if (!gained && !cost) parts.push(calls.length === 1 ? 'It did not change the result of its round.' : 'None of them changed the result of a round.')
    const text = parts.join(' ')
    return { calls, swing: gained - cost, text }
}

const BUY_RANK: Record<string, number> = { PISTOL: 0, ECO: 0, FORCE: 1, SEMIBUY: 2, FULL: 3, 'DOUBLE AWP': 3 }

interface Side { openings: number; openingRoundsWon: number; trades: number; clutches: number; pistols: number; underdog: number; utility: number; multikills: number }
const emptySide = (): Side => ({ openings: 0, openingRoundsWon: 0, trades: 0, clutches: 0, pistols: 0, underdog: 0, utility: 0, multikills: 0 })

interface PlayerTally { openings: number; openingDeaths: number; trades: number; clutches: string[]; multikills: number; utility: number }
const emptyTally = (): PlayerTally => ({ openings: 0, openingDeaths: 0, trades: 0, clutches: [], multikills: 0, utility: 0 })

const plural = (n: number, one: string, many = `${one}s`) => n === 1 ? `a ${one}` : `${n} ${many}`

function kills(r: RoundResult): MatchEvent[] {
    return (r.events ?? []).filter(e => e.type === 'KILL').sort((a, b) => a.time - b.time)
}

export function buildMatchReasons(args: { result: MatchResult; teamId: string; isHome: boolean; ownLineup: string[]; opponentLineup: string[] }): MatchReasons {
    const { result, teamId, isHome, ownLineup, opponentLineup } = args
    const ownSet = new Set(ownLineup), oppSet = new Set(opponentLineup)
    const own = emptySide(), opp = emptySide()
    const tally = new Map<string, PlayerTally>()
    const t = (id: string) => { let x = tally.get(id); if (!x) { x = emptyTally(); tally.set(id, x) } return x }
    const sideOf = (id?: string) => !id ? undefined : ownSet.has(id) ? own : oppSet.has(id) ? opp : undefined
    let opportunities = 0

    for (const map of result.maps) {
        for (const r of map.rounds ?? []) {
            const ownWon = r.winningTeamId === teamId
            const ks = kills(r)
            if (ks.length) {
                const first = ks.find(e => e.isOpening) ?? ks[0]
                const s = sideOf(first.playerId)
                if (s) {
                    s.openings++
                    if ((s === own) === ownWon) s.openingRoundsWon++
                    opportunities++
                    t(first.playerId!).openings++
                    if (first.victimId) t(first.victimId).openingDeaths++
                }
            }
            const perPlayer = new Map<string, number>()
            for (const e of ks) {
                if (!e.playerId) continue
                perPlayer.set(e.playerId, (perPlayer.get(e.playerId) ?? 0) + 1)
                if (e.isTrade) { const s = sideOf(e.playerId); if (s) s.trades++; t(e.playerId).trades++ }
            }
            for (const [pid, n] of perPlayer) if (n >= 4) { const s = sideOf(pid); if (s) s.multikills++; t(pid).multikills++ }
            for (const e of r.events ?? []) {
                if (e.type !== 'CLUTCH' || !e.playerId) continue
                const s = sideOf(e.playerId)
                if (s) s.clutches++
                t(e.playerId).clutches.push(e.details ?? 'clutch')
            }
            for (const u of r.utility ?? []) {
                if (!u.dmg) continue
                const s = sideOf(u.playerId)
                if (s) s.utility += u.dmg
                t(u.playerId).utility += u.dmg
            }
            if (r.roundNumber === 1 || r.roundNumber === 13) (ownWon ? own : opp).pistols++
            const ownBuy = r.buys ? (isHome ? r.buys.home : r.buys.away) : undefined
            const oppBuy = r.buys ? (isHome ? r.buys.away : r.buys.home) : undefined
            if (ownBuy && oppBuy && ownBuy !== 'PISTOL' && BUY_RANK[ownBuy] !== undefined && BUY_RANK[oppBuy] !== undefined) {
                if (ownWon && BUY_RANK[ownBuy] < BUY_RANK[oppBuy]) own.underdog++
                if (!ownWon && BUY_RANK[oppBuy] < BUY_RANK[ownBuy]) opp.underdog++
            }
        }
    }

    const reasons: MatchReason[] = []
    if (opportunities > 0) {
        const conv = (s: Side) => s.openings ? Math.round((s.openingRoundsWon / s.openings) * 100) : 0
        // An opening kill is worth about a third of a round over winning the duel 50/50.
        reasons.push({
            key: 'opening', swing: (own.openings - opp.openings) * 0.35,
            text: `Opening duels ${own.openings}–${opp.openings}. You won ${conv(own)}% of the rounds where you struck first; they won ${conv(opp)}% of theirs.`,
        })
    }
    if (own.trades + opp.trades > 0) reasons.push({
        key: 'trades', swing: (own.trades - opp.trades) * 0.25,
        text: `Trade kills ${own.trades}–${opp.trades}. ${own.trades >= opp.trades ? 'Your players were close enough to answer a death' : 'Their players answered deaths faster than yours'}.`,
    })
    if (own.clutches + opp.clutches > 0) reasons.push({
        key: 'clutches', swing: own.clutches - opp.clutches,
        text: `Clutch rounds ${own.clutches}–${opp.clutches}: rounds won by the last player standing.`,
    })
    if (own.pistols + opp.pistols > 0) reasons.push({
        key: 'pistols', swing: (own.pistols - opp.pistols) * 1.5,
        text: `Pistol rounds ${own.pistols}–${opp.pistols}. A pistol win usually brings the next round or two with it.`,
    })
    if (own.underdog + opp.underdog > 0) reasons.push({
        key: 'buys', swing: own.underdog - opp.underdog,
        text: `Rounds won with the weaker buy ${own.underdog}–${opp.underdog}. ${own.underdog >= opp.underdog ? 'Your ecos and force buys stole rounds' : 'They stole rounds on cheaper buys'}.`,
    })
    if (own.utility + opp.utility > 0) reasons.push({
        key: 'utility', swing: (own.utility - opp.utility) / 300,
        text: `Grenade damage ${own.utility}–${opp.utility} HP.`,
    })
    if (own.multikills + opp.multikills > 0) reasons.push({
        // A four-kill round is usually won, but often would have been anyway.
        key: 'multikills', swing: (own.multikills - opp.multikills) * 0.6,
        text: `Four-kill rounds or better ${own.multikills}–${opp.multikills}.`,
    })

    const won = result.winnerId === teamId
    const leaning = reasons.filter(r => (won ? r.swing > 0 : r.swing < 0)).sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))

    const players: PlayerReason[] = []
    for (const id of ownLineup) {
        const s: PlayerMatchStats | undefined = result.playerStats?.[id]
        if (!s) continue
        players.push({ playerId: id, rating: s.rating, line: playerLine(s, tally.get(id) ?? emptyTally()) })
    }
    players.sort((a, b) => b.rating - a.rating)

    return { reasons: leaning.slice(0, 3), players, calls: coachCallsReason(result, teamId) }
}

/** What drove one player's rating: up to two strengths, then the main weakness. */
export function playerLine(s: PlayerMatchStats, p: PlayerTally): string {
    const good: string[] = [], bad: string[] = []
    const adr = Math.round(s.adr)
    if (p.clutches.length) good.push(p.clutches.length === 1 ? `won a ${p.clutches[0]} clutch` : `won ${p.clutches.length} clutches`)
    if (p.multikills) good.push(plural(p.multikills, 'four-kill round'))
    if (p.openings >= 3 && p.openings > p.openingDeaths) good.push(plural(p.openings, 'opening kill'))
    if (adr >= 85) good.push(`${adr} damage per round`)
    if (p.trades >= 3) good.push(plural(p.trades, 'trade kill'))
    if (p.utility >= 150) good.push(`${p.utility} grenade damage`)
    if (p.openingDeaths >= 3 && p.openingDeaths > p.openings) bad.push(`died first in ${p.openingDeaths} rounds`)
    if (adr < 60) bad.push(`only ${adr} damage per round`)
    if (s.kast < 60) bad.push(`no kill, assist, trade or survival in ${100 - Math.round(s.kast)}% of rounds`)
    const parts = [...good.slice(0, 2), ...bad.slice(0, 1)]
    if (!parts.length) return `${s.kills}–${s.deaths}, ${adr} damage per round: a steady game.`
    const text = parts.join(', ')
    return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}

/**
 * C1: one line on how the result is judged against the pre-match odds
 * (ranking points). Morale and form move by resultSurpriseFactor, so an
 * expected result moves them less and an upset more.
 */
export function oddsLine(expected: number | undefined, won: boolean): string | null {
    if (typeof expected !== 'number' || !Number.isFinite(expected)) return null
    const pct = Math.round(expected * 100)
    if (pct >= 40 && pct <= 60) return `An even match by ranking points (${pct}% for you): the usual morale and form swing.`
    if (won) return pct < 40
        ? `An upset: ranking points gave you ${pct}%. Morale and form rise more than after an even win.`
        : `Expected: ranking points made you ${pct}% favourites. Morale and form rise less than after an even win.`
    return pct > 60
        ? `A setback: ranking points made you ${pct}% favourites. Morale and form drop more than after an even defeat.`
        : `They were the stronger side (${pct}% for you by ranking points), so the defeat costs less morale and form than an even one.`
}
