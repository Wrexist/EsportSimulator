/**
 * L21.A3 post-match explanation built only from data the result already
 * records: the round log (winner, side, buys both teams visibly ran,
 * equipment), the public scoreboard (player stats) and the managed team's
 * own decisions. Nothing about the opponent's hidden plan, ratings or cash
 * is used — their buy label is inferred in-game from equipment anyway.
 *
 * These are review prompts tied to recorded events, not causal proof.
 */
import type { MatchResult, PlayerMatchStats, RoundResult } from '@/types'
import { t, tn } from '@/lib/i18n'

export interface KeyRound { map: string; round: number; label: string; won: boolean; kind?: 'pistol' | 'regroup' | 'other' }
export interface BuyRecord { buy: string; played: number; won: number }
export interface Standout { playerId: string; rating: number; kills: number; deaths: number }
export interface NextAction { label: string; href: string; reason: string }
export interface MatchInsights {
    won: boolean
    headline: string
    keyRounds: KeyRound[]
    economy: { buys: BuyRecord[]; avgSpend: number; underdogWins: number; favouredLosses: number }
    standouts: { best?: Standout; struggled?: Standout; opponentBest?: Standout }
    tactics: string[]
    actions: NextAction[]
}

const BUY_RANK: Record<string, number> = { PISTOL: 0, ECO: 0, FORCE: 1, SEMIBUY: 2, FULL: 3, 'DOUBLE AWP': 3 }
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const BUY_KEY: Record<string, string> = { PISTOL: 'pistol', ECO: 'eco', FORCE: 'force', SEMIBUY: 'semibuy', FULL: 'full', 'DOUBLE AWP': 'awp2' }
/** A buy with its article, for review lines ("a force buy"). */
const buyPhrase = (id: string) => (BUY_KEY[id] ? t(`insight.buy.${BUY_KEY[id]}`) : id.toLowerCase())

function streaks(rounds: RoundResult[], teamId: string) {
    let best = { len: 0, from: 0, to: 0, own: true }, cur = { len: 0, from: 0, own: true }
    for (const r of rounds) {
        const own = r.winningTeamId === teamId
        if (cur.len && cur.own === own) cur.len++
        else cur = { len: 1, from: r.roundNumber, own }
        if (cur.len > best.len) best = { len: cur.len, from: cur.from, to: r.roundNumber, own }
    }
    return best
}

export function buildMatchInsights(args: { result: MatchResult; teamId: string; isHome: boolean; ownLineup: string[]; opponentLineup: string[]; nextMatchId?: string }): MatchInsights {
    const { result, teamId, isHome, ownLineup, opponentLineup, nextMatchId } = args
    const won = result.winnerId === teamId
    const keyRounds: KeyRound[] = []
    const buys = new Map<string, BuyRecord>()
    let spend = 0, rounds = 0, underdogWins = 0, favouredLosses = 0
    const ownSet = new Set(ownLineup)

    for (const map of result.maps) {
        const rs = map.rounds ?? []
        for (const r of rs) {
            const ownWon = r.winningTeamId === teamId
            rounds++
            for (const e of r.playerEconomy ?? []) if (ownSet.has(e.playerId)) spend += e.spent
            // Round buys are recorded home/away.
            const ownBuy = r.buys ? (isHome ? r.buys.home : r.buys.away) : undefined
            const oppBuy = r.buys ? (isHome ? r.buys.away : r.buys.home) : undefined
            if (ownBuy) {
                const rec = buys.get(ownBuy) ?? { buy: ownBuy, played: 0, won: 0 }
                rec.played++; if (ownWon) rec.won++
                buys.set(ownBuy, rec)
            }
            if (ownBuy && oppBuy && ownBuy !== 'PISTOL') {
                if (ownWon && BUY_RANK[ownBuy] < BUY_RANK[oppBuy]) { underdogWins++; if (keyRounds.length < 8) keyRounds.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.underdogWin', { own: buyPhrase(ownBuy), opp: buyPhrase(oppBuy) }), won: true }) }
                if (!ownWon && BUY_RANK[ownBuy] > BUY_RANK[oppBuy]) { favouredLosses++; if (keyRounds.length < 8) keyRounds.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.favouredLoss', { own: buyPhrase(ownBuy), opp: buyPhrase(oppBuy) }), won: false }) }
            }
            if (r.managerCall?.regroup) keyRounds.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.regroup'), won: ownWon, kind: 'regroup' })
        }
        for (const pistol of rs.filter(r => r.roundNumber === 1 || r.roundNumber === 13)) {
            keyRounds.push({ map: map.map, round: pistol.roundNumber, label: pistol.roundNumber === 1 ? t('insight.kr.pistol1') : t('insight.kr.pistol2'), won: pistol.winningTeamId === teamId, kind: 'pistol' })
        }
        const run = streaks(rs, teamId)
        if (run.len >= 4) keyRounds.push({ map: map.map, round: run.from, label: t(run.own ? 'insight.kr.runOwn' : 'insight.kr.runOpp', { n: run.len, from: run.from, to: run.to }), won: run.own })
        if (rs.length > 24) keyRounds.push({ map: map.map, round: 25, label: t('insight.kr.overtime'), won: map.winner === teamId })
        const last = rs[rs.length - 1]
        if (last) keyRounds.push({ map: map.map, round: last.roundNumber, label: t('insight.kr.decider'), won: last.winningTeamId === teamId })
    }
    keyRounds.sort((a, b) => result.maps.findIndex(m => m.map === a.map) - result.maps.findIndex(m => m.map === b.map) || a.round - b.round)

    const stats = (ids: string[]) => ids.map(id => result.playerStats?.[id]).filter((s): s is PlayerMatchStats => !!s)
    const toStandout = (s?: PlayerMatchStats): Standout | undefined => s && { playerId: s.playerId, rating: s.rating, kills: s.kills, deaths: s.deaths }
    const own = stats(ownLineup).sort((a, b) => b.rating - a.rating)
    const opp = stats(opponentLineup).sort((a, b) => b.rating - a.rating)

    const m = result.management
    const tactics: string[] = []
    if (m) {
        const style = t(`playstyle.${m.playstyle ?? 'default'}`)
        const styleKey = !m.opponentScouted ? 'unscouted' : m.counter === 'advantage' ? 'advantage' : m.counter === 'disadvantage' ? 'disadvantage' : 'none'
        tactics.push(t(`insight.style.${styleKey}`, { style }))
        const plan = t(`economy.${m.economyStyle ?? 'standard'}`)
        tactics.push(m.strategyCalls ? tn('insight.economy.calls', m.strategyCalls, { plan }) : t('insight.economy.plan', { plan }))
        const prep = [m.tacticalPrep ? t('insight.prep.vod', { pct: m.tacticalPrep }) : '', m.mentalPrep ? t('insight.prep.mental') : '', m.targetPlayerId ? t('insight.prep.target') : ''].filter(Boolean)
        if (prep.length) tactics.push(t('insight.prep.line', { items: prep.join(', ') }))
        if (m.timeoutsUsed) {
            const regroup = keyRounds.filter(k => k.kind === 'regroup')
            tactics.push(tn('insight.timeouts', m.timeoutsUsed, { won: regroup.filter(k => k.won).length, total: regroup.length }))
        } else if (m.mode === 'live') tactics.push(t('insight.noTimeouts'))
    } else tactics.push(t('insight.predates'))

    const actions: NextAction[] = []
    const weak = own.filter(s => s.rating < 0.9)
    if (weak.length) actions.push({ label: t('insight.action.training'), href: '/training', reason: tn('insight.reason.weak', weak.length) })
    const buyList = [...buys.values()]
    const fullRec = buyList.find(b => b.buy === 'FULL')
    if (favouredLosses >= 3 || (fullRec && fullRec.played >= 5 && fullRec.won / fullRec.played < 0.5)) actions.push({ label: t('insight.action.tactics'), href: nextMatchId ? `/match/${nextMatchId}/tactics` : '/schedule', reason: tn('insight.reason.favoured', favouredLosses) })
    if (own.length && own[own.length - 1].rating < 0.8) actions.push({ label: t('insight.action.transfers'), href: '/transfers', reason: t('insight.reason.struggled') })
    actions.push({ label: t('insight.action.squad'), href: '/squad', reason: t('insight.reason.squad') })
    if (!actions.some(a => a.href.includes('/tactics'))) actions.push({ label: t('insight.action.prepare'), href: nextMatchId ? `/match/${nextMatchId}/tactics` : '/schedule', reason: t('insight.reason.prepare') })

    const ownRounds = result.maps.reduce((s, mp) => s + (mp.rounds ?? []).filter(r => r.winningTeamId === teamId).length, 0)
    const pistols = keyRounds.filter(k => k.kind === 'pistol')
    // Match outcome and the rounds you took are separate facts: "Lost 10 of
    // 23 rounds" read as ten rounds lost when the team had won ten.
    const headline = t(won ? 'insight.headline.won' : 'insight.headline.lost', { own: ownRounds, total: rounds, pw: pistols.filter(k => k.won).length, pt: pistols.length, under: underdogWins, fav: favouredLosses })

    return {
        won, headline, keyRounds: keyRounds.slice(0, 12),
        economy: { buys: buyList.sort((a, b) => (BUY_RANK[b.buy] ?? 0) - (BUY_RANK[a.buy] ?? 0)), avgSpend: rounds ? Math.round(spend / rounds / Math.max(1, ownLineup.length)) : 0, underdogWins, favouredLosses },
        standouts: { best: toStandout(own[0]), struggled: own.length > 1 ? toStandout(own[own.length - 1]) : undefined, opponentBest: toStandout(opp[0]) },
        tactics, actions,
    }
}

export const buyWinRate = (b: BuyRecord) => pct(b.won, b.played)
