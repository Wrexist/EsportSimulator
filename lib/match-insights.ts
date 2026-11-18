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
import { formatNumber, t, tn } from '@/lib/i18n'

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
/** A starter "struggled badly" below this rating and STRUGGLED_GAP below his lineup's average. */
export const STRUGGLED_RATING = 0.6
export const STRUGGLED_GAP = 0.4
/** Below this a starter "had a weak game" (match-reasons calls 0.90+ "a steady game"). */
export const WEAK_RATING = 0.9
/**
 * Starters under WEAK_RATING it takes to prompt training (MATCHENGINE-05). Map
 * ratings spread wide: one under 0.90 happened after about 89% of matches, two
 * after about half, three after about a third (80 club BO1s, script-v1).
 */
export const WEAK_STARTERS_FOR_TRAINING = 3
/** Key rounds shown on the result screen, shared between the maps of a series. */
export const KEY_ROUND_LIMIT = 12
/** Economy key rounds (won on the weaker buy / lost on the stronger one) kept per map. */
const ECONOMY_KEY_ROUNDS_PER_MAP = 8
/** Nominal playstyle counter edges (lib/constants MATCH_BALANCE), for results recorded before counterEdge. */
const NOMINAL_COUNTER_EDGE = { advantage: 0.04, disadvantage: -0.03 } as const
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
    /** Every key round (counts: pistols, regroups). The shown list is cut per map (AUDIT17 MATCHENGINE-02). */
    const keyRounds: KeyRound[] = []
    const shown: KeyRound[] = []
    const playedMaps = Math.max(1, result.maps.filter(mp => (mp.rounds ?? []).length > 0).length)
    const perMap = Math.max(1, Math.floor(KEY_ROUND_LIMIT / playedMaps))
    const buys = new Map<string, BuyRecord>()
    let spend = 0, rounds = 0, underdogWins = 0, favouredLosses = 0
    const ownSet = new Set(ownLineup)

    for (const map of result.maps) {
        const rs = map.rounds ?? []
        // Lines that always show for a map (pistols, overtime, decider) and the rest, by priority.
        const must: KeyRound[] = [], run: KeyRound[] = [], regroups: KeyRound[] = [], economy: KeyRound[] = []
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
                if (ownWon && BUY_RANK[ownBuy] < BUY_RANK[oppBuy]) { underdogWins++; if (economy.length < ECONOMY_KEY_ROUNDS_PER_MAP) economy.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.underdogWin', { own: buyPhrase(ownBuy), opp: buyPhrase(oppBuy) }), won: true }) }
                if (!ownWon && BUY_RANK[ownBuy] > BUY_RANK[oppBuy]) { favouredLosses++; if (economy.length < ECONOMY_KEY_ROUNDS_PER_MAP) economy.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.favouredLoss', { own: buyPhrase(ownBuy), opp: buyPhrase(oppBuy) }), won: false }) }
            }
            if (r.managerCall?.regroup) regroups.push({ map: map.map, round: r.roundNumber, label: t('insight.kr.regroup'), won: ownWon, kind: 'regroup' })
        }
        for (const pistol of rs.filter(r => r.roundNumber === 1 || r.roundNumber === 13)) {
            must.push({ map: map.map, round: pistol.roundNumber, label: pistol.roundNumber === 1 ? t('insight.kr.pistol1') : t('insight.kr.pistol2'), won: pistol.winningTeamId === teamId, kind: 'pistol' })
        }
        const best = streaks(rs, teamId)
        if (best.len >= 4) run.push({ map: map.map, round: best.from, label: t(best.own ? 'insight.kr.runOwn' : 'insight.kr.runOpp', { n: best.len, from: best.from, to: best.to }), won: best.own })
        if (rs.length > 24) must.push({ map: map.map, round: 25, label: t('insight.kr.overtime'), won: map.winner === teamId })
        const last = rs[rs.length - 1]
        if (last) must.push({ map: map.map, round: last.roundNumber, label: t('insight.kr.decider'), won: last.winningTeamId === teamId })
        const byRound = (a: KeyRound, b: KeyRound) => a.round - b.round
        keyRounds.push(...[...must, ...run, ...regroups, ...economy].sort(byRound))
        // Each map gets its share of the list: its pistols, overtime and decider always,
        // then its run, regroups and economy rounds while the share lasts. Sorting the
        // whole series and cutting at 12 dropped map 3 in most BO3s.
        shown.push(...[...must, ...run, ...regroups, ...economy].slice(0, Math.max(must.length, perMap)).sort(byRound))
    }

    const stats = (ids: string[]) => ids.map(id => result.playerStats?.[id]).filter((s): s is PlayerMatchStats => !!s)
    const toStandout = (s?: PlayerMatchStats): Standout | undefined => s && { playerId: s.playerId, rating: s.rating, kills: s.kills, deaths: s.deaths }
    const own = stats(ownLineup).sort((a, b) => b.rating - a.rating)
    const opp = stats(opponentLineup).sort((a, b) => b.rating - a.rating)

    const m = result.management
    const tactics: string[] = []
    if (m) {
        const style = t(`playstyle.${m.playstyle ?? 'default'}`)
        const styleKey = !m.opponentScouted ? 'unscouted' : m.counter === 'advantage' ? 'advantage' : m.counter === 'disadvantage' ? 'disadvantage' : 'none'
        if (styleKey === 'advantage' || styleKey === 'disadvantage') {
            // The counter shares the +10% non-player cap with staff (MATCHENGINE-06):
            // name what it really changed, or that the cap absorbed it.
            const edge = typeof m.counterEdge === 'number' && Number.isFinite(m.counterEdge) ? m.counterEdge : NOMINAL_COUNTER_EDGE[styleKey]
            const pctPoints = Math.round(Math.abs(edge) * 1000) / 10
            tactics.push(pctPoints > 0 ? t(`insight.style.${styleKey}`, { style, pct: formatNumber(pctPoints) }) : t(`insight.style.${styleKey}Capped`, { style }))
        } else tactics.push(t(`insight.style.${styleKey}`, { style }))
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
    // MATCHENGINE-05: a team-wide weak game, not the usual one or two low map ratings.
    const weak = own.filter(s => s.rating < WEAK_RATING)
    if (weak.length >= WEAK_STARTERS_FOR_TRAINING) actions.push({ label: t('insight.action.training'), href: '/training', reason: tn('insight.reason.weak', weak.length) })
    const buyList = [...buys.values()]
    const fullRec = buyList.find(b => b.buy === 'FULL')
    const poorFullBuys = !!fullRec && fullRec.played >= 5 && fullRec.won / fullRec.played < 0.5
    // The reason names what triggered the button (MATCHENGINE-06): it said
    // "0 rounds lost while better equipped" when the full buys triggered it.
    const tacticsPrompt = favouredLosses >= 3 || poorFullBuys
    if (tacticsPrompt) actions.push({
        label: t('insight.action.tactics'), href: nextMatchId ? `/match/${nextMatchId}/tactics` : '/schedule',
        reason: favouredLosses >= 3 ? tn('insight.reason.favoured', favouredLosses) : t('insight.reason.fullBuys', { won: fullRec!.won, played: fullRec!.played }),
    })
    // "Struggled badly" (MATCHENGINE-07): the lowest starter under
    // STRUGGLED_RATING and well behind his own lineup's average. Under 0.8
    // alone was true after about 70% of matches (one map's ratings spread wide).
    const lowest = own[own.length - 1]
    const ownAverage = own.length ? own.reduce((sum, s) => sum + s.rating, 0) / own.length : 0
    if (lowest && lowest.rating < STRUGGLED_RATING && lowest.rating <= ownAverage - STRUGGLED_GAP) actions.push({ label: t('insight.action.transfers'), href: '/transfers', reason: t('insight.reason.struggled') })
    actions.push({ label: t('insight.action.squad'), href: '/squad', reason: t('insight.reason.squad') })
    // One button to the next match's setup (MATCHENGINE-07): without a next match
    // both went to /schedule, so the href test added a second, differently named one.
    if (!tacticsPrompt) actions.push({ label: t('insight.action.prepare'), href: nextMatchId ? `/match/${nextMatchId}/tactics` : '/schedule', reason: t('insight.reason.prepare') })

    const ownRounds = result.maps.reduce((s, mp) => s + (mp.rounds ?? []).filter(r => r.winningTeamId === teamId).length, 0)
    const pistols = keyRounds.filter(k => k.kind === 'pistol')
    // Match outcome and the rounds you took are separate facts: "Lost 10 of
    // 23 rounds" read as ten rounds lost when the team had won ten.
    // The two buy counts are full plural phrases ("1 round won with the weaker buy", MATCHDAY-12).
    const headline = t(won ? 'insight.headline.won' : 'insight.headline.lost', { own: ownRounds, total: rounds, pw: pistols.filter(k => k.won).length, pt: pistols.length, under: tn('insight.underdogWins', underdogWins), fav: tn('insight.favouredLosses', favouredLosses) })

    return {
        won, headline, keyRounds: shown,
        economy: { buys: buyList.sort((a, b) => (BUY_RANK[b.buy] ?? 0) - (BUY_RANK[a.buy] ?? 0)), avgSpend: rounds ? Math.round(spend / rounds / Math.max(1, ownLineup.length)) : 0, underdogWins, favouredLosses },
        // "Struggled" only below WEAK_RATING (MATCHENGINE-04): the lowest of five at 1.05 is not struggling.
        standouts: { best: toStandout(own[0]), struggled: own.length > 1 && own[own.length - 1].rating < WEAK_RATING ? toStandout(own[own.length - 1]) : undefined, opponentBest: toStandout(opp[0]) },
        tactics, actions,
    }
}

export const buyWinRate = (b: BuyRecord) => pct(b.won, b.played)
