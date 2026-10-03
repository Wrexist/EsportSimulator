/**
 * L21.A1 paired-scenario proof (200 identical seeds per comparison) and
 * L21.A3 result explanation built from recorded, non-omniscient data.
 */
import { SCENARIOS, runScenario, regroupRoundProbe, contextFor } from '@/scripts/launch/l21-paired-scenarios'
import { runLegacySeries, finalizeLegacySeries } from '@/engine/match/legacy-series'
import { buildManagementRecord } from '@/engine/match/legacy-prepare'
import { buildMatchInsights } from '@/lib/match-insights'
import { getUtilPower } from '@/engine/match-simulation'
import { EconomyManager, WEAPONS } from '@/engine/economy-manager'
import { SeededRNG } from '@/engine/rng'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { createDefaultTactics } from '@/engine/default-tactics'

jest.setTimeout(240_000)

describe('every permitted decision has a measurable, bounded effect over 200 paired seeds', () => {
    const reports = SCENARIOS.map(s => runScenario(s, 200))
    test.each(reports.map(r => [r.id, r] as const))('%s', (_id, r) => {
        if (r.id === 'call-save-always') {
            expect(r.verdict).toBe('negative-control')
            expect(r.variant.roundShare).toBeGreaterThan(0.05)
            return
        }
        expect(r.verdict).toBe('bounded')
        expect(Math.abs(r.effect.matchWin.mean)).toBeLessThanOrEqual(0.30)
        expect(r.variant.matchWin).toBeGreaterThan(0.2)
        expect(r.variant.matchWin).toBeLessThan(0.8)
    })
    test('expected directions', () => {
        const by = Object.fromEntries(reports.map(r => [r.id, r]))
        for (const up of ['playstyle-counter', 'roles-coverage', 'vod-review', 'mental-reset', 'antistrat-target', 'loadout-utility', 'timeout-on-streak']) expect(by[up].effect.roundShare.low).toBeGreaterThan(0)
        for (const down of ['playstyle-countered', 'roles-no-awper']) expect(by[down].effect.roundShare.high).toBeLessThan(0)
        expect(by['economy-eco'].effect.cashPerRound.low).toBeGreaterThan(0)
        expect(by['call-eco-after-pistol-loss'].effect.cashPerRound.low).toBeGreaterThan(0)
        // Overbuying utility costs far more cash than a modest plan.
        expect(by['loadout-overbuy'].effect.cashPerRound.high).toBeLessThan(by['loadout-utility'].effect.cashPerRound.low)
    })
})

test('regroup only changes rounds with a losing streak and never guarantees them', () => {
    const p = regroupRoundProbe(400)
    expect(p.noStreakIdentical).toBe(400)
    expect(p.regroupWins).toBeGreaterThan(p.baselineWins)
    expect(p.regroupWins).toBeLessThan(400)
})

test('utility power saturates (bounded) and an unaffordable planned primary falls back to the role buy', () => {
    expect(getUtilPower([])).toBe(0)
    expect(getUtilPower(['flash', 'smoke'])).toBeGreaterThan(6)
    expect(getUtilPower(['flash', 'smoke', 'molotov', 'he'])).toBeLessThan(10)
    const plan = createDefaultTactics().FULL.ct.playerLoadouts![0] // AWP slot
    const short = EconomyManager.getPlayerBuyV2(3500, 'FULL', 'AWPER', true, new SeededRNG(1), plan as never)
    expect(short.weapon.id).toBe(WEAPONS.M4A4.id)
    const rich = EconomyManager.getPlayerBuyV2(6000, 'FULL', 'AWPER', true, new SeededRNG(1), plan as never)
    expect(rich.weapon.id).toBe('awp')
})

describe('result explanation', () => {
    const save = createLaunchFixture('first-week', 3921)
    const ctx = contextFor(save, 4040, createDefaultTactics())
    const run = runLegacySeries(ctx, v => (v.ownLossStreak >= 3 && v.timeoutsRemaining > 0 && !v.regroupActive ? { callTimeout: true } : v.round === 2 && v.ownLossStreak === 1 ? { strategy: 'ECO' } : undefined))
    const result = finalizeLegacySeries(ctx, run.state, buildManagementRecord({ ctx, match: { vodReviewed: false }, mode: 'live', timeoutsUsed: 2 - run.timeouts.remaining, maps: run.state.maps }))
    const own = ctx.home.players.map(p => p.id), opp = ctx.away.players.map(p => p.id)
    const insights = buildMatchInsights({ result, teamId: ctx.home.team.id, isHome: true, ownLineup: own, opponentLineup: opp, nextMatchId: 'next_1' })

    test('explains key rounds, economy, players and own decisions from recorded data', () => {
        expect(insights.headline).toMatch(/rounds; pistol rounds \d\/\d/)
        expect(insights.keyRounds.some(k => /pistol round/.test(k.label))).toBe(true)
        expect(insights.keyRounds.some(k => k.label === 'Map-deciding round')).toBe(true)
        expect(insights.economy.buys.reduce((s, b) => s + b.played, 0)).toBe(result.maps.reduce((s, m) => s + m.rounds.length, 0))
        expect(insights.standouts.best && own.includes(insights.standouts.best.playerId)).toBe(true)
        expect(insights.standouts.opponentBest && opp.includes(insights.standouts.opponentBest.playerId)).toBe(true)
        expect(insights.tactics.join(' ')).toMatch(/not scouted/)
        if (run.timeouts.remaining < 2) expect(insights.tactics.join(' ')).toMatch(/regroup rounds won/)
    })

    test('never reveals the opponent plan, ratings or hidden cash; links to real routes', () => {
        const text = JSON.stringify(insights)
        expect(text).not.toMatch(/opponent (style|playstyle) (is|was) (aggressive|structured|balanced)/i)
        expect(text).not.toMatch(/skill|cash remaining|bank/i)
        expect(insights.actions.length).toBeGreaterThan(0)
        for (const a of insights.actions) expect(['/training', '/transfers', '/squad', '/schedule', '/match/next_1/tactics']).toContain(a.href)
        expect(insights.actions.some(a => a.href === '/match/next_1/tactics')).toBe(true)
        const scouted = buildMatchInsights({ result: { ...result, management: { ...result.management!, opponentScouted: true, counter: 'advantage' } }, teamId: ctx.home.team.id, isHome: true, ownLineup: own, opponentLineup: opp })
        expect(scouted.tactics[0]).toMatch(/countered the scouted opponent style/)
    })

    test('works for away teams and results without decisions', () => {
        const away = buildMatchInsights({ result: { ...result, management: undefined }, teamId: ctx.away.team.id, isHome: false, ownLineup: opp, opponentLineup: own })
        expect(away.tactics[0]).toMatch(/predates/)
        expect(away.economy.buys.reduce((s, b) => s + b.played, 0)).toBe(insights.economy.buys.reduce((s, b) => s + b.played, 0))
        expect(away.won).toBe(!insights.won)
    })
})
