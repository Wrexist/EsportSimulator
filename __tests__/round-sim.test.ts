/**
 * Phase 2B: the script-v1 round engine (engine/match/round-sim) — rounds
 * decided by plans, utility, duels and the bomb; CS2 economy; engine
 * selection; stats from real damage; the round script built from the
 * resolver's plan, grenades and fight zones.
 */
import { simulationEngineV2 } from '@/engine/match-simulation'
import { MatchEngine } from '@/engine/match-engine'
import { createLegacySeriesState, playLegacyRound, runLegacySeries, finalizeLegacySeries, type LegacyRoundStep, type LegacySeriesContext } from '@/engine/match/legacy-series'
import { DEFAULT_ENGINE_VERSION, LEGACY_ENGINE_VERSION, SCRIPT_ENGINE_VERSION, resolveEngineVersion } from '@/engine/match/engine-version'
import { DEFAULT_MATCH_ENGINE, getRoundEngine, isMatchEngineRunnable, withEngine } from '@/engine/match/engine-registry'
import { applyScriptRoundEconomy, ECON_OVERTIME_START_CASH, lossBonusAt, nextLossLevel } from '@/engine/match/round-sim/economy'
import { scriptBuyPhase } from '@/engine/match/round-sim/buy'
import { cappedEdge, NON_PLAYER_BONUS_CAP, teamEdgeBreakdown } from '@/engine/match/round-sim/team-edge'
import { killRewardFor, weaponClassOf } from '@/engine/match/round-sim/weapons'
import { scriptRating } from '@/engine/match/match-stats'
import { samplePositions } from '@/engine/match/round-script'
import { hasMoves, scriptFromMoves } from '@/engine/match/round-script-moves'
import { zonePoint } from '@/engine/match/round-sim/zones'
import { restoreLivePlayback } from '@/engine/match/live-checkpoint'
import { sanitizeRestoredSimState } from '@/engine/match/live-match-init'
import { buildSide, even } from '@/engine/match/calibration/fixtures'
import { getRoundMap } from '@/data/round-maps'
import { SeededRNG } from '@/engine/rng'
import type { ActiveMatchState, Match, MatchEvent, Player, Team } from '@/types'
import type { PlayerSimulationState } from '@/engine/match/round-outcome'
import { MapId } from '@/types/enums'

function series(map: MapId, seed: number, engine?: string, homeSkills = even(70), awaySkills = even(70)): { ctx: LegacySeriesContext; steps: LegacyRoundStep[] } {
    const home = buildSide({ id: 'H', skills: homeSkills }), away = buildSide({ id: 'A', skills: awaySkills })
    const match = { id: `rs_${map}_${seed}`, homeTeamId: 'H', awayTeamId: 'A', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [], ...(engine ? { engineVersion: engine } : {}) } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players, away.players, {}, {}, [map], undefined, 'nobody')
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    return { ctx, steps }
}

const MAPS = [MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.VERTIGO, MapId.ANUBIS, MapId.ANCIENT]
const played = MAPS.flatMap((map, i) => [series(map, 100 + i), series(map, 900 + i)])
const rounds = played.flatMap(p => p.steps.map(s => ({ ...p, step: s, round: s.round })))

describe('engine selection and versioning', () => {
    test('new matches play script-v1; a recorded version is kept; unknown versions are refused', () => {
        expect(DEFAULT_ENGINE_VERSION).toBe(SCRIPT_ENGINE_VERSION)
        expect(DEFAULT_MATCH_ENGINE).toBe(SCRIPT_ENGINE_VERSION)
        expect(resolveEngineVersion(undefined)).toBe(SCRIPT_ENGINE_VERSION)
        expect(resolveEngineVersion('legacy-v2')).toBe(LEGACY_ENGINE_VERSION)
        expect(() => resolveEngineVersion('spatial-round-v1')).toThrow('Unsupported match engine')
        expect(played[0].ctx.engineVersion).toBe(SCRIPT_ENGINE_VERSION)
        expect(series(MapId.MIRAGE, 5, 'legacy-v2').ctx.engineVersion).toBe(LEGACY_ENGINE_VERSION)
        expect(isMatchEngineRunnable('script-v1')).toBe(true)
        expect(getRoundEngine('legacy-v2')).toBe(simulationEngineV2)
    })

    test('legacy-v2 matches keep their rules: no plan / damage on rounds, $10k overtime, legacy stats', () => {
        const legacy = series(MapId.MIRAGE, 5, 'legacy-v2')
        expect(legacy.steps.every(s => !s.round.plan && !s.round.damage)).toBe(true)
        const script = withEngine(legacy.ctx, 'script-v1')
        expect(script.engineVersion).toBe('script-v1')
        expect(script.script).toBeDefined()
        expect(finalizeLegacySeries(legacy.ctx, legacy.steps[legacy.steps.length - 1].state).engineVersion).toBe('legacy-v2')
    })

    test('a live checkpoint keeps the engine it was written with', () => {
        const base = { matchId: 'm', isWaitingForStrategy: true, timeoutsRemaining: 2, timeoutBoostRounds: 0, homeRoster: [], awayRoster: [], gameState: { currentMapIndex: 0, round: 1, status: 'IN_PROGRESS' } } as unknown as ActiveMatchState
        const playback = { version: 1, events: [], processedTime: -1, maps: ['Mirage'], seed: 1, homeRoster: [], awayRoster: [] }
        expect(restoreLivePlayback({ ...base, playback: { ...playback, engine: 'legacy-v2' } } as ActiveMatchState).engine).toBe('legacy-v2')
        expect(restoreLivePlayback({ ...base, playback: { ...playback, engine: 'script-v1' } } as ActiveMatchState).engine).toBe('script-v1')
        // Checkpoints from before engine stamps are legacy-v2.
        expect(restoreLivePlayback(base).engine).toBe('legacy-v2')
        expect(() => restoreLivePlayback({ ...base, playback: { ...playback, engine: 'nope' } } as unknown as ActiveMatchState)).toThrow()
    })

    test('a resumed script-v1 match keeps its loss-bonus levels', () => {
        const restored = sanitizeRestoredSimState({ restoredSim: { homeLossLevel: 3, awayLossLevel: 0 }, homeEconomy: {}, awayEconomy: {}, homeStartsCT: true, currentMapIndex: 0 })
        expect(restored.homeLossLevel).toBe(3)
        expect(restored.awayLossLevel).toBe(0)
        const bad = sanitizeRestoredSimState({ restoredSim: { homeLossLevel: 9 } as never, homeEconomy: {}, awayEconomy: {}, homeStartsCT: true, currentMapIndex: 0 })
        expect(bad.homeLossLevel).toBeUndefined()
    })

    test('the AI path plays the same engine and the same result as the managed path', () => {
        const home = buildSide({ id: 'H', skills: even(72) }), away = buildSide({ id: 'A', skills: even(68) })
        const ai = new MatchEngine().simulateMatch(
            { id: 'ai1', homeTeamId: 'H', awayTeamId: 'A', format: 'BO1', seed: 77, maps: ['Mirage'], week: 1 } as never,
            home.team as never, away.team as never, home.players as never, away.players as never, new SeededRNG(1))
        expect(ai.engineVersion).toBe('script-v1')
        expect(ai.maps[0].rounds.every(r => r.plan && r.damage)).toBe(true)
    })

    test('deterministic: same seed, same rounds', () => {
        const a = series(MapId.INFERNO, 42), b = series(MapId.INFERNO, 42)
        expect(a.steps.map(s => s.round)).toEqual(b.steps.map(s => s.round))
    })
})

describe('rounds decided by what happens', () => {
    test('every round records a plan, real damage and its grenades', () => {
        for (const { round } of rounds) {
            expect(round.plan).toBeDefined()
            expect(['default', 'execute', 'rush', 'split', 'fake', 'eco']).toContain(round.plan!.tStrategy)
            expect(Object.values(round.damage ?? {}).every(v => v > 0)).toBe(true)
        }
        expect(rounds.filter(r => r.round.utility?.length).length / rounds.length).toBeGreaterThan(0.6)
    })

    test('kills carry a baked zone and callout; plants name the planned site', () => {
        for (const { round, ctx } of rounds) {
            const map = getRoundMap(ctx.maps[0])!
            for (const e of round.events ?? []) {
                if (e.type === 'KILL') {
                    expect(e.zone && zonePoint(map, e.zone)).toBeTruthy()
                    expect(typeof e.location).toBe('string')
                    expect(e.damage).toBeGreaterThan(0)
                }
                if (e.type === 'PLANT') expect(e.site).toBe(round.plan!.site)
            }
        }
    })

    test('timeline: plant by 1:55, bomb at plant + 40 s, defuse in time, the winner is wiped out only by a bomb that still goes off', () => {
        for (const { round } of rounds) {
            const ev = round.events ?? []
            const plant = ev.find(e => e.type === 'PLANT'), explode = ev.find(e => e.type === 'EXPLODE'), defuse = ev.find(e => e.type === 'DEFUSE')
            if (plant) expect(plant.time).toBeLessThanOrEqual(115)
            if (plant && explode) expect(explode.time).toBeCloseTo(plant.time + 40, 1)
            if (plant && defuse) expect(defuse.time).toBeLessThan(plant.time + 40)
            const winners = new Set(round.winningTeamId === 'H' ? ['H_0', 'H_1', 'H_2', 'H_3', 'H_4'] : ['A_0', 'A_1', 'A_2', 'A_3', 'A_4'])
            if (round.winType !== 'BOMB_EXPLODED') expect(ev.filter(e => e.type === 'KILL' && winners.has(e.victimId!)).length).toBeLessThan(5)
            for (let i = 1; i < ev.length; i++) expect(ev[i].time).toBeGreaterThanOrEqual(ev[i - 1].time)
        }
    })

    test('assists need 41+ damage or a flash; trades are kills of a recent killer', () => {
        let kills = 0, trades = 0
        for (const { round } of rounds) {
            const ev = (round.events ?? []).filter(e => e.type === 'KILL')
            ev.forEach((e, i) => {
                kills++
                if (e.isTrade) {
                    trades++
                    expect(ev.slice(0, i).some(p => p.playerId === e.victimId && e.time - p.time <= 5)).toBe(true)
                }
            })
        }
        expect(trades / kills).toBeGreaterThan(0.1)
        expect(trades / kills).toBeLessThan(0.35)
    })

    test('late man-advantages close out: a 2v1 rarely becomes a 1v1, and is won', () => {
        let states = 0, won = 0, toOneVOne = 0
        for (const { round } of rounds) {
            let h = 5, a = 5, seen = false
            for (const e of (round.events ?? []).filter(x => x.type === 'KILL')) {
                const before = [h, a]
                if (e.victimId!.startsWith('H')) h--; else a--
                if (!seen && Math.max(...before) === 2 && Math.min(...before) === 1) {
                    seen = true
                    states++
                    const pairHome = before[0] === 2
                    if ((round.winningTeamId === 'H') === pairHome) won++
                    if (h === 1 && a === 1) toOneVOne++
                }
            }
        }
        expect(states).toBeGreaterThan(30)
        expect(won / states).toBeGreaterThan(0.78)
        expect(toOneVOne / states).toBeLessThan(0.4)
    })

    test('a side that gives the round up saves; the winners may catch a saver on the way out', () => {
        let saves = 0, exitKills = 0, lost = 0
        for (const { round } of rounds) {
            const ev = round.events ?? []
            const save = ev.find(e => e.type === 'SAVE')
            if (!save) continue
            saves++
            // Ts save before a plant (the CTs win), CTs save a planted bomb (the Ts win);
            // now and then the savers still win the fights the hunters bring them.
            if (round.winner === (save.side === 't' ? 'ct' : 't')) lost++
            const savingTeam = save.side === 'ct' ? round.ctTeam : round.tTeam
            const saverIds = new Set(savingTeam === 'H' ? ['H_0', 'H_1', 'H_2', 'H_3', 'H_4'] : ['A_0', 'A_1', 'A_2', 'A_3', 'A_4'])
            for (const e of ev) if (e.type === 'KILL' && e.time > save.time && saverIds.has(e.victimId!)) exitKills++
        }
        expect(saves).toBeGreaterThan(10)
        expect(lost / saves).toBeGreaterThan(0.9)
        expect(exitKills).toBeGreaterThan(0)
    })

    test('a stronger team wins more rounds; equipment matters', () => {
        // Ten maps: four BO1 maps leave the round share ±6 points of noise.
        let fav = 0, total = 0
        for (let s = 0; s < 10; s++) {
            const { steps } = series(MapId.MIRAGE, 300 + s, undefined, even(80), even(65))
            for (const st of steps) { total++; if (st.round.winningTeamId === 'H') fav++ }
        }
        expect(fav / total).toBeGreaterThan(0.6)
        let fullVsEco = 0, n = 0
        for (const { round } of rounds) {
            const b = round.buys!
            if (b.home === 'FULL' && b.away === 'ECO') { n++; if (round.winningTeamId === 'H') fullVsEco++ }
            if (b.away === 'FULL' && b.home === 'ECO') { n++; if (round.winningTeamId === 'A') fullVsEco++ }
        }
        if (n >= 10) expect(fullVsEco / n).toBeGreaterThan(0.6)
    })
})

describe('CS2 economy (script-v1)', () => {
    const econ = (ids: string[], ct: boolean, cash = 1000): Record<string, PlayerSimulationState> =>
        Object.fromEntries(ids.map(id => [id, { id, cash, weapon: ct ? 'm4a4' : 'ak47', hasArmor: true, hasHelmet: true, hasKit: ct, utility: ['smoke', 'flash'] }]))
    const H = ['h0', 'h1', 'h2', 'h3', 'h4'], A = ['a0', 'a1', 'a2', 'a3', 'a4']

    test('loss bonus $1,400-$3,400 steps up on a loss and down one level on a win', () => {
        expect([0, 1, 2, 3, 4, 9].map(lossBonusAt)).toEqual([1400, 1900, 2400, 2900, 3400, 3400])
        expect(nextLossLevel(1, false)).toBe(2)
        expect(nextLossLevel(4, false)).toBe(4)
        expect(nextLossLevel(3, true)).toBe(2)
        expect(nextLossLevel(0, true)).toBe(0)
        expect(ECON_OVERTIME_START_CASH).toBe(12500)
    })

    test('win rewards, plant bonus, planter / defuser, kill rewards by weapon, grenades consumed, the dead lose gear', () => {
        const events: MatchEvent[] = [
            { type: 'KILL', time: 10, playerId: 'h0', victimId: 'a0', weapon: 'mp9' },
            { type: 'KILL', time: 20, playerId: 'a1', victimId: 'h1', weapon: 'awp' },
            { type: 'PLANT', time: 40, playerId: 'a2' },
            { type: 'DEFUSE', time: 60, playerId: 'h2' },
        ]
        const out = applyScriptRoundEconomy({
            homeEconomy: econ(H, true), awayEconomy: econ(A, false), winner: 'HOME', winType: 'BOMB_DEFUSE', events, homeIsCT: true,
            homeLossLevel: 2, awayLossLevel: 1, utilityUsed: { h3: ['smoke'] },
        })
        // CT win by defuse: $3,500; SMG kill $600; CT team kill bonus $50 each; defuser +$300.
        expect(out.homeEconomy.h0.cash).toBe(1000 + 3500 + 600 + 50)
        expect(out.homeEconomy.h2.cash).toBe(1000 + 3500 + 50 + 300)
        // T loss at level 1 ($1,900) + plant bonus $800; AWP kill $100; planter +$300.
        expect(out.awayEconomy.a1.cash).toBe(1000 + 1900 + 800 + 100)
        expect(out.awayEconomy.a2.cash).toBe(1000 + 1900 + 800 + 300)
        expect(out.homeEconomy.h3.utility).toEqual(['flash'])
        expect(out.homeEconomy.h1).toMatchObject({ weapon: 'usp', hasArmor: false, hasKit: false, utility: [] })
        expect(out.homeLossLevel).toBe(1)
        expect(out.awayLossLevel).toBe(2)
    })

    test('Ts alive when the clock runs out get no loss bonus', () => {
        const out = applyScriptRoundEconomy({
            homeEconomy: econ(H, true), awayEconomy: econ(A, false), winner: 'HOME', winType: 'TIME',
            events: [{ type: 'KILL', time: 30, playerId: 'h0', victimId: 'a0', weapon: 'm4a4' }], homeIsCT: true, homeLossLevel: 0, awayLossLevel: 3,
        })
        expect(out.awayEconomy.a0.cash).toBe(1000 + 2900)
        expect(out.awayEconomy.a1.cash).toBe(1000)
    })

    test('kill rewards by weapon class', () => {
        expect(['knife', 'nova', 'xm1014', 'mac10', 'p90', 'ak47', 'deagle', 'awp', 'he'].map(killRewardFor)).toEqual([1500, 900, 600, 600, 300, 300, 300, 100, 300])
        expect(weaponClassOf('M4A1-S')).toBe('rifle')
    })

    test('overtime starts at $12,500 and halves reset the loss level', () => {
        const { steps } = played[0]
        const ot = steps.find(s => s.round.roundNumber === 25)
        if (ot) expect(ot.preRound.home && Object.values(ot.round.playerEconomy!).every(e => e.spent + e.remaining <= 16000)).toBe(true)
        const half = steps.find(s => s.round.roundNumber === 12)!
        expect(half.state.sim.homeLossLevel).toBe(1)
        expect(half.state.sim.awayLossLevel).toBe(1)
    })
})

describe('buying grenades', () => {
    const players = [{ id: 's', role: 'SUPPORT' }, { id: 'e', role: 'ENTRY_FRAGGER' }, { id: 'w', role: 'AWPER' }, { id: 'i', role: 'IGL' }, { id: 'r', role: 'RIFLER' }]
    const econ = (cash: number) => Object.fromEntries(players.map(p => [p.id, { id: p.id, cash, weapon: 'glock', hasArmor: false, hasHelmet: false, hasKit: false, utility: [] as string[] }]))

    test('every team buys grenades on a full buy, within the CS limits', () => {
        const e = econ(7000)
        scriptBuyPhase(players, e, 'FULL', false, new SeededRNG(1))
        for (const p of players) {
            const u = e[p.id].utility
            expect(u.length).toBeGreaterThan(0)
            expect(u.length).toBeLessThanOrEqual(4)
            expect(u.filter(x => x === 'flash').length).toBeLessThanOrEqual(2)
            expect(e[p.id].cash).toBeGreaterThanOrEqual(0)
        }
        expect(e.s.utility).toEqual(['smoke', 'flash', 'flash', 'molotov'])
    })

    test('ecos and pistol rounds buy none; a manager loadout with grenades is bought as set', () => {
        const eco = econ(2000)
        scriptBuyPhase(players, eco, 'ECO', true, new SeededRNG(1))
        expect(Object.values(eco).every(s => s.utility.length === 0)).toBe(true)
        const plan = { slotIndex: 0, primaryWeaponId: 'ak47', secondaryWeaponId: 'glock', armorTier: 'HEAVY' as const, hasKit: false, utility: ['he'] }
        const tactics = { FULL: { t: { playerLoadouts: [plan] }, ct: {} } } as never
        const e = econ(7000)
        scriptBuyPhase(players, e, 'FULL', false, new SeededRNG(1), tactics)
        expect(e.s.utility).toEqual(['he'])
        expect(e.e.utility.length).toBeGreaterThan(0)
    })
})

describe('non-player factors', () => {
    test('the edge between two teams is capped at the non-player cap', () => {
        expect(cappedEdge(0.4, 0)).toBe(NON_PLAYER_BONUS_CAP)
        expect(cappedEdge(0, 0.4)).toBe(-NON_PLAYER_BONUS_CAP)
        const t = buildSide({ id: 'T', skills: even(70), tacticalPrep: 25 })
        const e = teamEdgeBreakdown(t.team as unknown as Team, t.players as Player[], {}, { mentalPrep: true })
        expect(e.prep).toBeCloseTo(0.0625)
        expect(e.mentalPrep).toBeCloseTo(0.03)
        expect(e.roles).toBeCloseTo(0)
    })
})

describe('stats from real numbers', () => {
    test('pro-average numbers rate 1.00; ADR and KAST come from the rounds', () => {
        expect(scriptRating({ kpr: 0.7, dpr: 0.7, apr: 0.13, adr: 76, kast: 71 })).toBeCloseTo(1, 1)
        const res = finalizeLegacySeries(played[0].ctx, played[0].steps[played[0].steps.length - 1].state)
        const rounds = res.maps[0].rounds.length
        for (const s of Object.values(res.playerStats)) {
            expect(s.adr).toBeGreaterThan(0)
            expect(s.kast).toBeGreaterThan(0)
            expect(s.kast).toBeLessThanOrEqual(100)
            expect(s.headshots).toBeLessThanOrEqual(s.kills)
        }
        const dealt = res.maps[0].rounds.reduce((sum, r) => sum + Object.values(r.damage ?? {}).reduce((a, b) => a + b, 0), 0)
        const adrSum = Object.values(res.playerStats).reduce((sum, s) => sum + s.adr, 0)
        expect(adrSum * rounds).toBeCloseTo(dealt, -2)
    })

    test('a star (90 among 65s) stands out', () => {
        let star = 0, mates = 0
        for (let s = 0; s < 6; s++) {
            const home = buildSide({ id: 'S', skills: [90, 65, 65, 65, 65] }), away = buildSide({ id: 'O', skills: even(70) })
            const match = { id: `star_${s}`, homeTeamId: 'S', awayTeamId: 'O', format: 'BO1', seed: 4000 + s, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [MAPS[s % MAPS.length]], mapResults: [], roundHistory: [] } as unknown as Match
            const ctx = simulationEngineV2.createSeriesContext(match, home.team as unknown as Team, away.team as unknown as Team, home.players, away.players, {}, {}, [MAPS[s % MAPS.length]], undefined, 'nobody')
            const res = finalizeLegacySeries(ctx, runLegacySeries(ctx).state)
            star += res.playerStats.S_0.rating
            mates += [1, 2, 3, 4].reduce((sum, i) => sum + res.playerStats[`S_${i}`].rating, 0) / 4
        }
        expect(star / mates).toBeGreaterThan(1.2)
    })
})

describe('the radar replays what the engine did', () => {
    const sample = rounds.filter((_, i) => i % 3 === 0)
    const built = sample.map(r => {
        const map = getRoundMap(r.ctx.maps[0])!
        const ct = r.round.ctTeam === 'H' ? r.ctx.home : r.ctx.away
        return { r, map, script: scriptFromMoves(r.round, r.ctx.maps[0], map, new Set(ct.players.map(p => p.id))) }
    })

    test('every sight round records where everyone walked; the plan, site and grenades come from the engine', () => {
        let thrown = 0, recorded = 0
        for (const { r, script } of built) {
            expect(hasMoves(r.round)).toBe(true)
            expect(script.plan).toEqual({ tStrategy: r.round.plan!.tStrategy, site: r.round.plan!.site, ctSetup: r.round.plan!.ctSetup })
            if (script.bomb.plant) expect(script.bomb.plant.site).toBe(r.round.plan!.site)
            recorded += r.round.utility?.length ?? 0
            thrown += script.utility.length
        }
        expect(thrown).toBe(recorded)
    })

    test('each kill is where the two players stood, in sight range, at walking speed', () => {
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
        let kills = 0, inRange = 0, atSpot = 0
        for (const { r, map, script } of built) {
            for (const d of script.deaths) {
                kills++
                if (dist(d.at, d.from) <= 24 && d.at.floor === d.from.floor) inRange++
                const spot = r.round.events!.find(e => e.type === 'KILL' && e.victimId === d.victimId)?.spot
                if (spot && dist({ x: (d.at.x + d.from.x) / 2, y: (d.at.y + d.from.y) / 2 }, spot) <= 0.1) atSpot++
                const pos = samplePositions(script, d.t - 0.01)
                expect(pos.find(p => p.id === d.victimId)!.alive).toBe(true)
            }
            for (const track of Object.values(script.tracks)) for (let i = 1; i < track.length; i++) {
                const dt = track[i].t - track[i - 1].t
                if (dt > 0.01) expect(dist(track[i], track[i - 1]) / dt).toBeLessThanOrEqual(map.runSpeed * 1.01)
            }
        }
        expect(inRange / kills).toBeGreaterThan(0.97)
        expect(atSpot / kills).toBeGreaterThan(0.97)
    })
})
