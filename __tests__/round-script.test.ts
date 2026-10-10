/**
 * Round script builder (Phase 2A, W2).
 *
 * Real resolver rounds (legacy series, all 8 maps, the baked RoundMaps in
 * data/round-maps) must turn into scripts that are deterministic,
 * keep every resolver fact (kills, plant, defuse, explosion), put each
 * killer within duel range of the victim, never teleport, keep teammates
 * apart, throw only bought utility, and build in < 2 ms per round.
 */
import { performance } from 'node:perf_hooks'
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound } from '@/engine/match/legacy-series'
import {
    buildRoundScript, prepareRoundMap, roundMapFromLayout, sampleTrack, samplePositions, scriptInputFromResolverRound,
} from '@/engine/match/round-script'
import { navGraphFor } from '@/engine/match/round-script-nav'
import type { RoundMap, RoundScript, RoundScriptInput, TrackKey } from '@/engine/match/round-script-types'
import { MAP_LAYOUT_JSONS as MAP_LAYOUTS } from '@/data/map-layouts'
import { getRoundMap, roundMapFor } from '@/data/round-maps'
import type { CustomTactics, Match, Player, RoundResult, Team } from '@/types'
import { MapId } from '@/types/enums'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
const MAPS = Object.values(MapId) as MapId[]
const UTILITY = [['smoke', 'flash'], ['smoke', 'molotov'], ['flash', 'flash'], ['he', 'smoke'], ['molotov']]

function player(id: string, skill: number, role: string): Player {
    return {
        id, name: id, nickname: id, age: 22, nationality: 'X', portraitPath: '', role, tier: 'PRO',
        skill, awp: skill, rifle: skill, pistol: skill, grenades: skill, creativity: skill, clutch: skill, tactic: skill,
        entry: skill, trading: skill, leader: skill, teamwork: skill, morale: 70, amicability: 50, productivity: 50,
        stressResistance: 60, loyalty: 50, reaction: skill, eyesight: skill, health: 100, strength: 50, endurance: 50,
        form: 70, fatigue: 0, potential: skill, energy: 100, maxEnergy: 100, matchesPlayed: 0, roundsPlayed: 0,
        avgRating: 1, clutchSuccessRate: 0,
        contract: { playerId: id, salaryPerWeek: 0, startWeek: 0, endWeek: 52, buyout: 0 }, traits: [], perks: [],
    } as unknown as Player
}

function team(id: string, players: Player[], playstyle?: string): Team {
    return {
        id, name: id, tier: 'PRO', logoPath: '', roster: players.map(p => p.id), staff: [], reputation: 50, fanbase: 0,
        chemistry: 60, facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 0, tacticalPrep: 0,
        equipment: [], playstyle,
    } as unknown as Team
}

/** The managed (home) team buys grenades in every buy, so scripts have utility to throw. */
function tactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: 'deagle', armorTier: 'HEAVY' as const, hasKit: kit, utility })),
    })
    const both = { ct: side('m4a4', true), t: side('ak47', false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, 'DOUBLE AWP': both }
}

interface Played { map: MapId; mapIndex: number; round: RoundResult; input: RoundScriptInput }

/** Play one BO1 per map through the canonical series runner and keep each round's script input. */
function playRounds(seed: number): Played[] {
    const out: Played[] = []
    for (const map of MAPS) {
        const hp = ROLES.map((r, i) => player(`H${i}`, 70, r))
        const ap = ROLES.map((r, i) => player(`A${i}`, 70, r))
        const home = team('HOME', hp, 'aggressive'), away = team('AWAY', ap, 'structured')
        const match = { id: `rs_${seed}_${map}`, engineVersion: 'legacy-v2', homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: false, maps: [], mapResults: [], roundHistory: [] } as unknown as Match
        const ctx = simulationEngineV2.createSeriesContext(match, home, away, hp, ap, {}, {}, [map], tactics(), 'HOME')
        let state = createLegacySeriesState(ctx)
        while (!state.finished) {
            const step = playLegacyRound(ctx, state)
            const input = scriptInputFromResolverRound({
                mapId: map, seed, matchId: match.id, mapIndex: 0, round: step.round,
                home: { teamId: 'HOME', playstyle: 'aggressive', players: hp }, away: { teamId: 'AWAY', playstyle: 'structured', players: ap },
                loadouts: { ...step.preRound.home, ...step.preRound.away },
            })
            out.push({ map, mapIndex: 0, round: step.round, input })
            state = step.state
        }
    }
    return out
}

const fallbackMaps = new Map<string, RoundMap>(MAPS.map(m => [m, roundMapFromLayout(MAP_LAYOUTS[m], m)]))
const roundMaps = new Map<string, RoundMap>(MAPS.map(m => [m, getRoundMap(m)!]))
const rounds = [...playRounds(11), ...playRounds(29)]
const scripts: { played: Played; script: RoundScript }[] = rounds.map(played => ({ played, script: buildRoundScript(played.input, roundMaps.get(played.map)!) }))
const sideOf = (script: RoundScript, id: string) => script.sides[id]
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('round script fallback map', () => {
    it.each(MAPS)('%s: has the RoundMap essentials and a connected walk graph', map => {
        const m = fallbackMaps.get(map)!
        expect(m.spawns.T.length).toBeGreaterThanOrEqual(5)
        expect(m.spawns.CT.length).toBeGreaterThanOrEqual(5)
        for (const site of ['A', 'B'] as const) {
            expect(m.sites[site].plantSpots.length).toBeGreaterThanOrEqual(4)
            expect(m.routes.filter(r => r.kind === 't-exec' && r.site === site).length).toBeGreaterThanOrEqual(2)
            expect(m.routes.filter(r => r.kind === 'ct-setup' && r.site === site).length).toBeGreaterThanOrEqual(1)
            expect(m.routes.some(r => r.kind === 'rotate' && r.site === site)).toBe(true)
            expect(m.holds.filter(h => h.site === site).length).toBeGreaterThanOrEqual(3)
            expect(m.utility.filter(u => u.site === site && u.side === 'T' && u.kind === 'smoke').length).toBeGreaterThanOrEqual(2)
            expect(m.utility.some(u => u.site === site && u.side === 'CT' && u.kind === 'molotov')).toBe(true)
        }
        for (const r of m.routes) for (let i = 1; i < r.points.length; i++) expect(dist(r.points[i], r.points[i - 1])).toBeLessThanOrEqual(1.5 + 1e-6)
        expect(m.runSpeed).toBeGreaterThan(2)
        const g = navGraphFor(m)
        for (const s of [...g.spawnNodes.T, ...g.spawnNodes.CT]) for (const site of ['A', 'B'] as const) expect(Number.isFinite(g.pathDist(s, g.siteNodes[site]))).toBe(true)
    })

    it('puts Nuke B on the lower floor and Vertigo B on the upper one', () => {
        expect(fallbackMaps.get(MapId.NUKE)!.sites.B.center.floor).toBe('lower')
        expect(fallbackMaps.get(MapId.NUKE)!.sites.A.center.floor).toBe('upper')
        expect(fallbackMaps.get(MapId.VERTIGO)!.sites.B.center.floor).toBe('upper')
    })

    it('is only used for maps without a baked file', () => {
        expect(roundMapFor(MapId.MIRAGE, MAP_LAYOUTS[MapId.MIRAGE])).toBe(getRoundMap(MapId.MIRAGE))
        expect(roundMapFor('Unknown', MAP_LAYOUTS[MapId.MIRAGE])?.mapId).toBe('Unknown')
        expect(roundMapFor('Unknown')).toBeUndefined()
    })

    it('drives the same builder: kills in range, no teleports', () => {
        let kills = 0, inRange = 0
        for (const played of rounds.filter((_, i) => i % 4 === 0)) {
            const map = fallbackMaps.get(played.map)!
            const script = buildRoundScript(played.input, map)
            for (const d of script.deaths) { kills++; if (dist(d.at, d.from) <= 12 && d.at.floor === d.from.floor) inRange++ }
            for (const track of Object.values(script.tracks)) for (let i = 1; i < track.length; i++) {
                expect(dist(track[i], track[i - 1]) / (track[i].t - track[i - 1].t)).toBeLessThanOrEqual(map.runSpeed * 1.1 + 1e-6)
            }
        }
        expect(inRange / kills).toBeGreaterThan(0.98)
    })
})

describe('round script builder', () => {
    it('plays a few hundred real resolver rounds on all 8 maps', () => {
        expect(rounds.length).toBeGreaterThan(300)
        expect(new Set(rounds.map(r => r.map)).size).toBe(8)
    })

    it('is deterministic: same input, same script (also on a fresh or prepared copy of the map)', () => {
        for (const [i, { played, script }] of scripts.slice(0, 40).entries()) {
            expect(buildRoundScript(played.input, roundMaps.get(played.map)!)).toEqual(script)
            const fresh = JSON.parse(JSON.stringify(roundMaps.get(played.map))) as RoundMap
            if (i % 2) prepareRoundMap(fresh)
            expect(buildRoundScript(played.input, fresh)).toEqual(script)
        }
    })

    it('starts every player at a spawn and ends them at their death or the round end', () => {
        for (const { played, script } of scripts) {
            const map = roundMaps.get(played.map)!
            expect(Object.keys(script.tracks).sort()).toEqual(played.input.players.map(p => p.id).sort())
            for (const p of played.input.players) {
                const track = script.tracks[p.id]
                expect(track[0].t).toBe(0)
                expect(Math.min(...map.spawns[p.side].map(s => dist(s, track[0])))).toBeLessThan(0.6)
                for (let i = 1; i < track.length; i++) expect(track[i].t).toBeGreaterThan(track[i - 1].t)
                const death = script.deaths.find(d => d.victimId === p.id)
                const last = track[track.length - 1]
                if (death) {
                    expect(last.t).toBeCloseTo(death.t, 3)
                    expect(dist(last, death.at)).toBeLessThan(0.02)
                } else expect(last.t).toBeCloseTo(script.endTime, 3)
            }
        }
    })

    it('never teleports: speed ≤ runSpeed × 1.1, keys ≤ 0.5 s apart while moving, inside the map', () => {
        for (const { played, script } of scripts) {
            const map = roundMaps.get(played.map)!
            for (const track of Object.values(script.tracks)) {
                for (let i = 1; i < track.length; i++) {
                    const dt = track[i].t - track[i - 1].t
                    const d = dist(track[i], track[i - 1])
                    expect(d / dt).toBeLessThanOrEqual(map.runSpeed * 1.1 + 1e-6)
                    if (d > 0.01) expect(dt).toBeLessThanOrEqual(0.5 + 1e-3)
                }
                for (const k of track) {
                    expect(k.x).toBeGreaterThanOrEqual(0)
                    expect(k.x).toBeLessThanOrEqual(100)
                    expect(k.y).toBeGreaterThanOrEqual(0)
                    expect(k.y).toBeLessThanOrEqual(100)
                }
            }
        }
    })

    it('keeps every position on the walk graph (route edges, plus the small teammate sidestep)', () => {
        const segDist = (p: TrackKey, a: { x: number; y: number }, b: { x: number; y: number }) => {
            const dx = b.x - a.x, dy = b.y - a.y
            const l2 = dx * dx + dy * dy
            const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
            return Math.hypot(p.x - a.x - dx * u, p.y - a.y - dy * u)
        }
        for (const { played, script } of scripts.slice(0, 80)) {
            const g = navGraphFor(roundMaps.get(played.map)!)
            for (const track of Object.values(script.tracks)) {
                for (const k of track) {
                    const near = g.around(g.nearest(k), 6)
                    let best = Infinity
                    for (const n of near) for (const m of g.neighbors(n)) best = Math.min(best, segDist(k, g.point(n), g.point(m)))
                    expect(best).toBeLessThanOrEqual(0.85)
                }
            }
        }
    })

    it('keeps every resolver kill and places the killer within duel range of the victim', () => {
        let kills = 0, inRange = 0, late = 0, lateInRange = 0, nearest = 0
        for (const { played, script } of scripts) {
            const events = played.round.events ?? []
            const killEvents = events.filter(e => e.type === 'KILL')
            expect(script.deaths.map(d => [d.t, d.victimId, d.killerId])).toEqual(killEvents.map(e => [e.time, e.victimId, e.playerId]))
            for (const d of script.deaths) {
                kills++
                const ok = dist(d.at, d.from) <= 12 && d.at.floor === d.from.floor
                if (ok) inRange++
                if (d.t >= 15) { late++; if (ok) lateInRange++ }
                const killer = sampleTrack(script.tracks[d.killerId], d.t)
                // Keys < 0.02 s apart are merged, so the shooter can sit a hair off its kill spot.
                expect(dist(killer, d.from)).toBeLessThan(0.15)
                const dots = samplePositions(script, d.t - 0.05)
                const victim = dots.find(p => p.id === d.victimId)!
                const enemies = dots.filter(p => p.alive && p.side !== victim.side).sort((a, b) => dist(a, victim) - dist(b, victim))
                if (enemies[0]?.id === d.killerId) nearest++
            }
        }
        // Kills in the first seconds can be out of reach at run speed on the big maps (the
        // resolver times them without positions); from 15 s on every fight is reachable
        // except rare back-to-back chains across the map.
        expect(inRange / kills).toBeGreaterThan(0.98)
        expect(lateInRange / late).toBeGreaterThan(0.995)
        expect(nearest / kills).toBeGreaterThan(0.8)
    })

    it('keeps teammates apart', () => {
        let pairs = 0, under36 = 0, under2 = 0
        for (const { script } of scripts) {
            for (let t = 6; t <= Math.min(115, script.endTime); t += 3) {
                const dots = samplePositions(script, t).filter(d => d.alive)
                for (const side of ['T', 'CT'] as const) {
                    const s = dots.filter(d => d.side === side)
                    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
                        if (s[i].floor !== s[j].floor) continue
                        pairs++
                        const d = dist(s[i], s[j])
                        if (d < 3.6) under36++
                        if (d < 2) under2++
                    }
                }
            }
        }
        expect(under36 / pairs).toBeLessThan(0.1)
        expect(under2 / pairs).toBeLessThan(0.02)
    })

    it('plants at the resolver time on a plant spot of the planned site, defuses on the bomb, explodes at +40 s', () => {
        let plants = 0, defuses = 0
        for (const { played, script } of scripts) {
            const events = played.round.events ?? []
            const plant = events.find(e => e.type === 'PLANT')
            const defuse = events.find(e => e.type === 'DEFUSE')
            const explode = events.find(e => e.type === 'EXPLODE')
            const map = roundMaps.get(played.map)!
            expect(script.bomb.carrier[0]?.t).toBe(0)
            for (const c of script.bomb.carrier) if (c.carrierId) expect(sideOf(script, c.carrierId)).toBe('T')
            for (const c of script.bomb.carrier) if (!c.carrierId) expect(c.at).toBeDefined()
            if (!plant) { expect(script.bomb.plant).toBeUndefined(); continue }
            plants++
            const p = script.bomb.plant!
            expect(p.t).toBe(plant.time)
            expect(p.site).toBe(script.plan.site)
            expect(map.sites[p.site].plantSpots.some(spot => dist(spot, p.at) < 0.6)).toBe(true)
            expect(sideOf(script, p.planterId)).toBe('T')
            const planter = samplePositions(script, p.t).find(d => d.id === p.planterId)!
            expect(planter.alive).toBe(true)
            expect(dist(planter, p.at)).toBeLessThan(0.05)
            expect(script.bomb.explodeAt).toBe(explode ? p.t + 40 : undefined)
            if (defuse) {
                defuses++
                const d = script.bomb.defuse!
                expect(d.tEnd).toBe(defuse.time)
                expect(d.tStart).toBeGreaterThanOrEqual(p.t)
                expect(d.tStart).toBeLessThanOrEqual(d.tEnd)
                expect(sideOf(script, d.defuserId)).toBe('CT')
                for (const t of [d.tStart, (d.tStart + d.tEnd) / 2, d.tEnd - 0.01]) {
                    const defuser = samplePositions(script, t).find(x => x.id === d.defuserId)!
                    expect(defuser.alive).toBe(true)
                    expect(dist(defuser, p.at)).toBeLessThan(0.05)
                }
            } else expect(script.bomb.defuse).toBeUndefined()
        }
        expect(plants).toBeGreaterThan(50)
        expect(defuses).toBeGreaterThan(10)
    })

    it('throws only bought utility, from living players, onto the map spots', () => {
        let thrown = 0
        for (const { played, script } of scripts) {
            const map = roundMaps.get(played.map)!
            const used = new Map<string, number>()
            for (const u of script.utility) {
                thrown++
                const key = `${u.throwerId}:${u.kind}`
                used.set(key, (used.get(key) ?? 0) + 1)
                const thrower = played.input.players.find(p => p.id === u.throwerId)!
                expect(used.get(key)!).toBeLessThanOrEqual(thrower.utility[u.kind] ?? 0)
                const death = script.deaths.find(d => d.victimId === u.throwerId)
                if (death) expect(u.t).toBeLessThan(death.t)
                expect(u.t).toBeLessThanOrEqual(script.endTime)
                expect(map.utility.some(s => s.side === thrower.side && s.kind === u.kind && dist(s.at, u.at) < 1e-6)).toBe(true)
                expect(u.duration).toBe({ smoke: 18, molotov: 7, flash: 0.3, he: 0.3 }[u.kind])
            }
        }
        expect(thrown).toBeGreaterThan(100)
    })

    it('reads the plan from the buy: an eco T side plays "eco", the attacked site is the plant site', () => {
        for (const { played, script } of scripts) {
            expect(script.plan.tStrategy === 'eco').toBe(played.input.buy.T === 'eco')
            if (script.bomb.plant) expect(script.bomb.plant.site).toBe(script.plan.site)
        }
        expect(new Set(scripts.map(s => s.script.plan.tStrategy)).size).toBeGreaterThanOrEqual(4)
        expect(new Set(scripts.map(s => s.script.plan.ctSetup)).size).toBeGreaterThanOrEqual(3)
    })

    it('builds a round in under 2 ms on average (walk graph warm)', () => {
        const times: number[] = []
        for (const { played } of scripts) {
            const t0 = performance.now()
            buildRoundScript(played.input, roundMaps.get(played.map)!)
            times.push(performance.now() - t0)
        }
        expect(times.reduce((s, t) => s + t, 0) / times.length).toBeLessThan(2)
    })
})

describe('samplePositions', () => {
    const script: RoundScript = {
        version: 1, mapId: 'Test', round: 1,
        plan: { tStrategy: 'default', site: 'A', ctSetup: '2-1-2' },
        sides: { t1: 'T', c1: 'CT' },
        tracks: {
            t1: [
                { t: 0, x: 10, y: 10, floor: 'upper', aim: 3 },
                { t: 2, x: 20, y: 10, floor: 'upper', aim: -3 },
                { t: 4, x: 20, y: 30, floor: 'lower', aim: 0 },
            ],
            c1: [
                { t: 0, x: 50, y: 50, floor: 'upper', aim: 0 },
                { t: 5, x: 40, y: 50, floor: 'upper', aim: Math.PI },
            ],
        },
        deaths: [{ t: 5, victimId: 'c1', killerId: 't1', at: { x: 40, y: 50, floor: 'upper' }, from: { x: 20, y: 30, floor: 'lower' } }],
        utility: [], bomb: { carrier: [] }, endTime: 10,
    }

    it('interpolates linearly between keys and clamps outside the track', () => {
        const at = (t: number) => samplePositions(script, t).find(p => p.id === 't1')!
        expect(at(1)).toMatchObject({ x: 15, y: 10, floor: 'upper', alive: true, side: 'T' })
        expect(at(3)).toMatchObject({ x: 20, y: 20 })
        expect(at(-1)).toMatchObject({ x: 10, y: 10 })
        expect(at(9)).toMatchObject({ x: 20, y: 30, floor: 'lower' })
    })

    it('turns the aim the short way round', () => {
        // 3 → -3 rad is a 0.28 rad turn through ±π, not a 6 rad spin through 0.
        const mid = sampleTrack(script.tracks.t1, 1).aim
        expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.01)
    })

    it('freezes dead players at their death point', () => {
        const at = (t: number) => samplePositions(script, t).find(p => p.id === 'c1')!
        expect(at(4.9).alive).toBe(true)
        expect(at(5)).toMatchObject({ x: 40, y: 50, alive: false })
        expect(at(8)).toMatchObject({ x: 40, y: 50, alive: false })
    })
})

describe('scriptInputFromResolverRound', () => {
    it('maps sides, buys, bought utility, kit, winner and end reason', () => {
        const round = {
            roundNumber: 5, winner: 't', winType: 'BOMB_EXPLODED', ctTeam: 'B', tTeam: 'A',
            events: [{ type: 'PLANT', time: 50 }, { type: 'EXPLODE', time: 90 }], buys: { home: 'FORCE', away: 'FULL' },
            kills: [],
        } as unknown as RoundResult
        const input = scriptInputFromResolverRound({
            mapId: 'Mirage', seed: 7, matchId: 'm1', mapIndex: 1, round,
            home: { teamId: 'A', playstyle: 'aggressive', players: [{ id: 'a1', role: 'ENTRY_FRAGGER' }] },
            away: { teamId: 'B', players: [{ id: 'b1', role: 'AWPER' }] },
            loadouts: { a1: { weapon: 'galilar', utility: ['smoke', 'flash', 'flash', 'decoy'] }, b1: { weapon: 'AWP', utility: ['incendiary'], hasKit: true } },
        })
        expect(input.players).toEqual([
            { id: 'a1', teamId: 'A', side: 'T', role: 'ENTRY_FRAGGER', weapon: 'galilar', utility: { smoke: 1, flash: 2 } },
            { id: 'b1', teamId: 'B', side: 'CT', role: 'AWPER', weapon: 'awp', utility: { molotov: 1 }, hasKit: true },
        ])
        expect(input.buy).toEqual({ T: 'force', CT: 'full' })
        expect(input.tPlaystyle).toBe('aggressive')
        expect(input.winnerSide).toBe('T')
        expect(input.endReason).toBe('bomb_exploded')
        expect(input.seed).toBe(scriptInputFromResolverRound({
            mapId: 'Mirage', seed: 7, matchId: 'm1', mapIndex: 1, round,
            home: { teamId: 'A', players: [] }, away: { teamId: 'B', players: [] },
        }).seed)
    })
})
