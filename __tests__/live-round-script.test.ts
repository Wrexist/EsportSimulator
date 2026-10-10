/**
 * Phase 2A W3: the live match builds one round script per round from the
 * resolved round (useLiveMatch → lib/live-round-script), the radar reads
 * frames from it (lib/radar-script-frame) and the feed names the bombsite.
 */
import { performance } from 'node:perf_hooks'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { simulationEngineV2 } from '@/engine/match-simulation'
import { createLegacySeriesState, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext } from '@/engine/match/legacy-series'
import { buildRoundScript, scriptInputFromResolverRound } from '@/engine/match/round-script'
import { annotateRoundEvents, buildLiveRoundScript, liveRoundMap, locationOf, warmRoundMap } from '@/lib/live-round-script'
import { aliveCounts, bombAt, radarScriptFrame, scriptAutoFloor, TRACER_SECONDS } from '@/lib/radar-script-frame'
import { MapRadarPanel } from '@/components/match/MapRadarPanel'
import { getRoundMap } from '@/data/round-maps'
import type { CustomTactics, Match, Player, Team } from '@/types'
import { MapId } from '@/types/enums'

const ROLES = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER']
const UTILITY = [['smoke', 'flash'], ['smoke', 'molotov'], ['flash', 'flash'], ['he', 'smoke'], ['molotov']]

function player(id: string, role: string): Player {
    const skill = 70
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

function team(id: string, players: Player[], playstyle: string): Team {
    return { id, name: id, tier: 'PRO', roster: players.map(p => p.id), staff: [], equipment: [], playstyle } as unknown as Team
}

function tactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: 'deagle', armorTier: 'HEAVY' as const, hasKit: kit, utility })),
    })
    const both = { ct: side('m4a4', true), t: side('ak47', false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, 'DOUBLE AWP': both }
}

function playSeries(map: MapId, seed: number): { ctx: LegacySeriesContext; steps: LegacyRoundStep[] } {
    const hp = ROLES.map((r, i) => player(`H${i}`, r)), ap = ROLES.map((r, i) => player(`A${i}`, r))
    const match = { id: `live_rs_${seed}_${map}`, homeTeamId: 'HOME', awayTeamId: 'AWAY', format: 'BO1', seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [map], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, team('HOME', hp, 'aggressive'), team('AWAY', ap, 'structured'), hp, ap, {}, {}, [map], tactics(), 'HOME')
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    return { ctx, steps }
}

const MAPS = [MapId.MIRAGE, MapId.NUKE, MapId.INFERNO, MapId.VERTIGO]
const series = MAPS.map(map => ({ map, ...playSeries(map, 17) }))
const loadoutsOf = (step: LegacyRoundStep) => ({ ...step.preRound.home, ...step.preRound.away })

describe('live round script', () => {
    it('builds a script for every live round, on the baked map, deterministically and fast', () => {
        const ms: number[] = []
        for (const { map, ctx, steps } of series) {
            warmRoundMap(map)
            expect(liveRoundMap(map)).toBe(getRoundMap(map))
            for (const step of steps) {
                const t0 = performance.now()
                const live = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: loadoutsOf(step) })
                ms.push(performance.now() - t0)
                expect(live).not.toBeNull()
                expect(live!.mapId).toBe(map)
                expect(live!.roundNumber).toBe(step.round.roundNumber)
                // Same input as the W2 adapter with the series lineups.
                const direct = buildRoundScript(scriptInputFromResolverRound({
                    mapId: map, seed: ctx.seed, matchId: ctx.matchId, mapIndex: 0, round: step.round,
                    home: { teamId: ctx.home.team.id, playstyle: ctx.home.team.playstyle, players: ctx.home.players },
                    away: { teamId: ctx.away.team.id, playstyle: ctx.away.team.playstyle, players: ctx.away.players },
                    loadouts: loadoutsOf(step),
                }), getRoundMap(map)!)
                expect(live!.script).toEqual(direct)
            }
        }
        const mean = ms.reduce((s, x) => s + x, 0) / ms.length
        expect(mean).toBeLessThan(4)
    })

    it('rebuilds the same round on restore (recorded round, no loadouts): only the grenades are missing', () => {
        let utilityRounds = 0
        for (const { map, ctx, steps } of series) {
            for (const step of steps.slice(0, 12)) {
                const live = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: loadoutsOf(step) })!
                const restored = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: structuredClone(step.round) })!
                expect(restored.script.plan).toEqual(live.script.plan)
                expect(restored.script.deaths).toEqual(live.script.deaths)
                expect(restored.script.bomb).toEqual(live.script.bomb)
                expect(restored.script.tracks).toEqual(live.script.tracks)
                expect(restored.script.utility).toEqual([])
                if (live.script.utility.length) utilityRounds++
            }
        }
        expect(utilityRounds).toBeGreaterThan(0)
    })

    it('names the bombsite on PLANT / DEFUSE / EXPLODE and a callout on kills; annotations never change the script', () => {
        let plants = 0
        for (const { map, ctx, steps } of series) {
            for (const step of steps) {
                const live = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: loadoutsOf(step) })!
                const events = step.round.events!
                const annotated = annotateRoundEvents(events, live)
                expect(annotated).toHaveLength(events.length)
                for (const [i, e] of annotated.entries()) {
                    expect({ ...e, site: undefined, location: undefined }).toEqual({ ...events[i], site: undefined, location: undefined })
                    if (e.type === 'PLANT' || e.type === 'DEFUSE' || e.type === 'EXPLODE') {
                        plants += e.type === 'PLANT' ? 1 : 0
                        expect(e.site).toBe(live.script.bomb.plant!.site)
                        expect(e.site).toBe(live.script.plan.site)
                    }
                    if (e.type === 'KILL' && live.script.deaths.some(d => d.victimId === e.victimId)) expect(typeof e.location).toBe('string')
                    if (e.type !== 'KILL' && e.type !== 'PLANT' && e.type !== 'DEFUSE' && e.type !== 'EXPLODE') expect(e).toBe(events[i])
                }
                // The persisted resolver round is untouched.
                expect(events.some(e => 'site' in e || 'location' in e)).toBe(false)
                // A checkpoint keeps the annotated events: rebuilding from them gives the same script.
                const rebuilt = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: { ...step.round, events: annotated }, loadouts: loadoutsOf(step) })!
                expect(rebuilt.script).toEqual(live.script)
            }
        }
        expect(plants).toBeGreaterThan(0)
        expect(annotateRoundEvents([], null)).toEqual([])
    })

    it('labels callouts from the baked map', () => {
        const mirage = getRoundMap(MapId.MIRAGE)!
        expect(locationOf(mirage, mirage.sites.A.center)).toBe('A site')
        expect(locationOf(mirage, mirage.sites.B.center)).toBe('B site')
        expect(locationOf(mirage, mirage.spawns.T[0])).toBe('T spawn')
        const nuke = getRoundMap(MapId.NUKE)!
        // B is under A on Nuke: the floor decides.
        expect(locationOf(nuke, nuke.sites.B.center)).toBe('B site')
        expect(locationOf(nuke, { ...nuke.sites.B.center, floor: 'upper' })).not.toBe('B site')
    })

    it('returns null instead of throwing for an unknown map or an empty round', () => {
        const { ctx, steps } = series[0]
        expect(buildLiveRoundScript({ ctx, mapId: 'NoSuchMap', mapIndex: 0, round: steps[0].round })).toBeNull()
        expect(buildLiveRoundScript({ ctx, mapId: MapId.MIRAGE, mapIndex: 0, round: { ...steps[0].round, events: [] } })).toBeNull()
    })
})

describe('radar frames from the script', () => {
    const rounds = series.flatMap(({ map, ctx, steps }) => steps.map(step => buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: loadoutsOf(step) })!))

    it('shows tracers only right after each kill and keeps death markers for the round', () => {
        for (const { script } of rounds) {
            for (const d of script.deaths) {
                const at = radarScriptFrame(script, d.t + 0.1)
                expect(at.tracers.some(tr => tr.at === d.at && tr.from === d.from)).toBe(true)
                expect(at.tracers.find(tr => tr.at === d.at)!.side).toBe(script.sides[d.killerId])
                expect(at.deaths.find(x => x.victimId === d.victimId)!.side).toBe(script.sides[d.victimId])
                expect(at.players.find(p => p.id === d.victimId)!.alive).toBe(false)
                const later = radarScriptFrame(script, d.t + TRACER_SECONDS + 0.05)
                expect(later.tracers.some(tr => tr.at === d.at)).toBe(false)
                expect(radarScriptFrame(script, script.endTime).deaths.some(x => x.victimId === d.victimId)).toBe(true)
                expect(radarScriptFrame(script, d.t - 0.05).deaths.some(x => x.victimId === d.victimId)).toBe(false)
            }
        }
    })

    it('follows the bomb: carried, planted at the plant spot, defused or exploded', () => {
        let planted = 0, defused = 0, exploded = 0, carried = 0
        for (const { script } of rounds) {
            const early = bombAt(script, 5)
            if (early.phase === 'carried') {
                carried++
                expect(radarScriptFrame(script, 5).players.find(p => p.id === early.carrierId)!.hasBomb).toBe(true)
            }
            const plant = script.bomb.plant
            if (!plant) continue
            planted++
            const after = bombAt(script, plant.t + 0.5)
            expect(['planted', 'defusing']).toContain(after.phase)
            expect(after.at).toEqual(plant.at)
            expect(after.site).toBe(plant.site)
            expect(scriptAutoFloor(script, plant.t + 0.5, 'upper')).toBe(plant.at.floor)
            if (script.bomb.defuse?.success) {
                defused++
                expect(bombAt(script, script.bomb.defuse.tEnd + 0.1).phase).toBe('defused')
                const mid = bombAt(script, (script.bomb.defuse.tStart + script.bomb.defuse.tEnd) / 2)
                expect(mid.phase).toBe('defusing')
                expect(mid.defuserId).toBe(script.bomb.defuse.defuserId)
            }
            if (script.bomb.explodeAt !== undefined) {
                exploded++
                expect(bombAt(script, script.bomb.explodeAt + 0.1).phase).toBe('exploded')
            }
        }
        expect(carried).toBeGreaterThan(0)
        expect(planted).toBeGreaterThan(0)
        expect(defused + exploded).toBeGreaterThan(0)
    })

    it('shows bought grenades for their duration only', () => {
        let smokes = 0
        for (const { script } of rounds) {
            for (const u of script.utility) {
                if (u.kind !== 'smoke') continue
                smokes++
                expect(radarScriptFrame(script, u.t + 3).utility.some(x => x.kind === 'smoke' && x.at === u.at)).toBe(true)
                expect(radarScriptFrame(script, u.t + u.duration + 0.5).utility.some(x => x.kind === 'smoke' && x.at === u.at)).toBe(false)
                expect(radarScriptFrame(script, u.t - 0.1).utility.some(x => x.at === u.at)).toBe(false)
            }
        }
        expect(smokes).toBeGreaterThan(0)
    })

    it('lets losing survivors of a bomb round give the site up instead of idling next to the enemy', () => {
        let checked = 0
        for (const { script } of rounds) {
            const plant = script.bomb.plant
            if (!plant || script.endTime - plant.t < 8) continue
            const loser = script.bomb.explodeAt !== undefined ? 'CT' : script.bomb.defuse?.success ? 'T' : undefined
            if (!loser) continue
            for (const [id, side] of Object.entries(script.sides)) {
                if (side !== loser || script.deaths.some(d => d.victimId === id)) continue
                const lastFight = Math.max(plant.t, ...script.deaths.filter(d => d.killerId === id).map(d => d.t))
                if (script.endTime - lastFight < 8) continue
                const at = (t: number) => radarScriptFrame(script, t).players.find(p => p.id === id)!
                const d0 = Math.hypot(at(lastFight + 1).x - plant.at.x, at(lastFight + 1).y - plant.at.y)
                const d1 = Math.hypot(at(script.endTime).x - plant.at.x, at(script.endTime).y - plant.at.y)
                expect(d1).toBeGreaterThan(d0)
                checked++
            }
        }
        expect(checked).toBeGreaterThan(0)
    })

    it('counts the living per side', () => {
        for (const { script } of rounds) {
            const start = aliveCounts(script, 0)
            expect(start).toEqual({ CT: 5, T: 5 })
            const end = aliveCounts(script, script.endTime)
            expect(end.CT + end.T).toBe(10 - script.deaths.length)
        }
    })

    it('samples a frame in well under a millisecond', () => {
        const { script } = rounds[3]
        const t0 = performance.now()
        let n = 0
        for (let t = 0; t <= script.endTime; t += 1 / 60) { radarScriptFrame(script, t); n++ }
        expect((performance.now() - t0) / n).toBeLessThan(0.5)
    })
})

describe('radar panel in script mode', () => {
    const { map, ctx, steps } = series[0]
    const step = steps.find(s => s.round.events!.some(e => e.type === 'PLANT'))!
    const live = buildLiveRoundScript({ ctx, mapId: map, mapIndex: 0, round: step.round, loadouts: loadoutsOf(step) })!
    const render = (t: number, extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(MapRadarPanel, {
        currentMapId: map, mapName: 'Mirage', script: live.script, roundMap: live.map, currentTime: t,
        players: Object.fromEntries(Object.keys(live.script.tracks).map(id => [id, { name: `N_${id}`, money: 5000 }])),
        ...extra,
    }))

    it('draws players, names, site letters from the baked map and the round-script source', () => {
        const html = render(2)
        expect(html).toContain('data-radar-source="round-script"')
        expect(html.match(/data-side-shape="ct-circle"/g)).toHaveLength(5)
        expect(html.match(/data-side-shape="t-diamond"/g)).toHaveLength(5)
        expect(html.match(/data-view-cone=""/g)).toHaveLength(10)
        expect(html).toContain('N_H0'.toUpperCase())
        const a = live.map.sites.A.center
        expect(html).toMatch(new RegExp(`<text x="${a.x}" y="${a.y}"[^>]*data-site-label="a"`))
    })

    it('draws death markers, the tracer of a fresh kill and the planted bomb', () => {
        const kill = live.script.deaths[0]
        const atKill = render(kill.t + 0.2)
        expect(atKill).toContain(`data-death-marker="${kill.victimId}"`)
        expect(atKill).toContain('data-tracer=""')
        const plant = live.script.bomb.plant!
        const planted = render(Math.ceil(plant.t) + 1)
        expect(planted).toMatch(/data-bomb="(planted|defusing|defused|exploded)"/)
        expect(planted).toMatch(new RegExp(`BOMB PLANTED ${plant.site}|DEFUSING ${plant.site}|DEFUSED|BOMB EXPLODED`))
        const end = render(live.script.endTime + 1, { roundOver: true })
        for (const d of live.script.deaths) expect(end).toContain(`data-death-marker="${d.victimId}"`)
    })

    it('keeps the snapshot mode (no script) and hides the script before the round starts', () => {
        const before = render(-1)
        expect(before).not.toContain('data-radar-source="round-script"')
        const none = render(10, { script: null })
        expect(none).not.toContain('data-radar-source')
    })
})
