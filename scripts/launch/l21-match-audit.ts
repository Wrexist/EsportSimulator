import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { createLaunchFixture, FixtureStorage } from './fixtures'
import { simulationEngineV2 as engine } from '../../engine/match-simulation'
import { managedLoadout, regroupLossStreak } from '../../engine/match/manager-controls'
import { getActivePlayersByRosterOrder } from '../../lib/live-match-builders'
import { SeededRNG } from '../../engine/rng'
import { createDefaultTactics } from '../../engine/default-tactics'
import { SaveManager } from '../../engine/save-manager'
import { MapId, MatchFormat } from '../../types/enums'
import type { Match, Player, Team } from '../../types'
import type { PlayerSimulationState } from '../../engine/match/round-outcome'

export function matchFixture() {
    const save = createLaunchFixture('first-week', 3921)
    const [home, away] = save.teams
    return { save, home: home as unknown as Team, away: away as unknown as Team,
        hp: getActivePlayersByRosterOrder(home, save.players), ap: getActivePlayersByRosterOrder(away, save.players) }
}
export function economy(players: Player[], isCT = true): Record<string, PlayerSimulationState> {
    return Object.fromEntries(players.map(p => [p.id, { id: p.id, cash: 8000, weapon: isCT ? 'usp' : 'glock', hasArmor: false, hasHelmet: false, hasKit: false, utility: [] }]))
}
export async function auditMatchManagement() {
    const { save, home, away, hp, ap } = matchFixture()
    const input = JSON.stringify(save)
    const pairs = { noStreakChanges: 0, baselineWins: 0, regroupWins: 0, awayBaselineWins: 0, awayRegroupWins: 0, seeds: 400 }
    for (let seed = 1; seed <= pairs.seeds; seed++) {
        const run = (loss: number, active: boolean, isHome = true) => engine.simulateRound(new SeededRNG(seed), hp, ap, 50, 50, 50, 50, true, 0, 0,
            isHome ? regroupLossStreak(loss, active) : 0, isHome ? 0 : regroupLossStreak(loss, active), 5, economy(hp), economy(ap, false))
        pairs.noStreakChanges += Number(JSON.stringify(run(0, false)) !== JSON.stringify(run(0, true)))
        pairs.baselineWins += Number(run(5, false).winner === 'HOME')
        pairs.regroupWins += Number(run(5, true).winner === 'HOME')
        pairs.awayBaselineWins += Number(run(5, false, false).winner === 'AWAY')
        pairs.awayRegroupWins += Number(run(5, true, false).winner === 'AWAY')
    }
    assert.equal(pairs.noStreakChanges, 0)
    assert(pairs.regroupWins > pairs.baselineWins && pairs.regroupWins < pairs.seeds)
    assert(pairs.awayRegroupWins > pairs.awayBaselineWins && pairs.awayRegroupWins < pairs.seeds)
    const tactics = createDefaultTactics(), eco = economy(hp), full = economy(hp)
    engine.performBuyPhase(hp, eco, 'ECO', true, new SeededRNG(3921), managedLoadout(tactics, home.id, home.id))
    engine.performBuyPhase(hp, full, 'FULL', true, new SeededRNG(3921), managedLoadout(tactics, home.id, home.id))
    const spent = (e: typeof eco) => Object.values(e).reduce((s, p) => s + 8000 - p.cash, 0)
    assert(spent(full) > spent(eco)); assert(Object.values(full).every(p => p.cash >= 0))
    const opponent = economy(ap, false), opponentBaseline = economy(ap, false)
    engine.performBuyPhase(ap, opponent, 'FULL', false, new SeededRNG(3921), managedLoadout(tactics, away.id, home.id))
    engine.performBuyPhase(ap, opponentBaseline, 'FULL', false, new SeededRNG(3921))
    assert.deepEqual(opponent, opponentBaseline)
    const maps = [MapId.NUKE, MapId.MIRAGE, MapId.INFERNO, MapId.OVERPASS, MapId.SANDSTONE]
    const series = []
    for (const format of [MatchFormat.BO1, MatchFormat.BO3, MatchFormat.BO5]) {
        const count = format === MatchFormat.BO1 ? 1 : format === MatchFormat.BO3 ? 3 : 5
        const match = { ...save.scheduledMatches[0], format, maps: maps.slice(0, count), seed: 3921,
            mapStartingSides: Object.fromEntries(maps.map(m => [m, away.id])) } as unknown as Match
        const result = engine.simulateMatch(match, home, away, structuredClone(hp), structuredClone(ap), {}, {}, undefined, tactics, home.id)
        assert.deepEqual(result, engine.simulateMatch(match, home, away, structuredClone(hp), structuredClone(ap), {}, {}, undefined, tactics, home.id))
        assert.deepEqual(result.maps.map(m => m.map), maps.slice(0, result.maps.length))
        assert(result.maps.every(m => m.ctStartTeamId === away.id))
        assert.equal(Math.max(result.homeScore, result.awayScore), Math.ceil(count / 2))
        assert.equal(JSON.stringify(result.lineups?.[home.id]), JSON.stringify(hp.map(p => p.id)))
        const copy = structuredClone(save)
        copy.completedMatches = [{ ...save.scheduledMatches[0], format, result }]
        const manager = new SaveManager(new FixtureStorage())
        assert((await manager.saveGame(copy)).success)
        const restored = (await manager.loadGame(copy.saveId)).save
        assert.equal(JSON.stringify(restored?.completedMatches[0].result.lineups), JSON.stringify(result.lineups))
        series.push({ format, maps: result.maps.map(m => m.map), score: [result.homeScore, result.awayScore], hash: createHash('sha256').update(JSON.stringify(result)).digest('hex') })
    }
    assert.equal(JSON.stringify(save), input)
    return { seed: 3921, pairedRounds: pairs, purchases: { ecoSpent: spent(eco), fullSpent: spent(full), opponentUnchanged: true }, series, canonicalSaveRoundtrip: true, inputUnchanged: true }
}
if (require.main === module) auditMatchManagement().then(report => {
    fs.writeFileSync('docs/launch-readiness/evidence/L21-match-audit.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
}).catch(e => { console.error(e); process.exitCode = 1 })
