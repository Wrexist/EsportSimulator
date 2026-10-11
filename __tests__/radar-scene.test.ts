/**
 * Phase 3 radar: the per-frame scene sampler (lib/radar-scene) matches the
 * reference frame (lib/radar-script-frame), shows the round's exact HP (the
 * roster's model), builds trails and allocates nothing once warm.
 */
import { performance } from 'node:perf_hooks'
import { radarScriptFrame } from '@/lib/radar-script-frame'
import {
    createRadarScene, prepareRadarScript, sampleRadarScene, sceneAliveCounts, sceneFromSnapshot, weaponClassOf,
    HIT_SECONDS, TRAIL_SECONDS, TRACER_SECONDS,
} from '@/lib/radar-scene'
import { buildRoundTimeline, samplePlayer } from '@/lib/live-match-roster'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

const fixture = playRadarSeries(MapId.MIRAGE, 23)
const prepared = fixture.live.map((live, i) => prepareRadarScript(live.script, { events: fixture.steps[i].round.events, economy: fixture.steps[i].round.playerEconomy }))

describe('radar scene sampling', () => {
    it('matches the reference frame: positions, life, deaths, tracers, grenades and bomb', () => {
        const scene = createRadarScene()
        for (const prep of prepared) {
            for (let t = 0; t <= prep.endTime + 2; t += 0.37) {
                sampleRadarScene(prep, t, scene)
                const ref = radarScriptFrame(prep.script, t)
                expect(scene.playerCount).toBe(ref.players.length)
                for (const rp of ref.players) {
                    const sp = scene.players.slice(0, scene.playerCount).find(p => p.id === rp.id)!
                    expect(sp.x).toBeCloseTo(rp.x, 6)
                    expect(sp.y).toBeCloseTo(rp.y, 6)
                    expect(sp.floor).toBe(rp.floor)
                    expect(sp.alive).toBe(rp.alive)
                    expect(sp.hasBomb).toBe(rp.hasBomb)
                }
                expect(scene.deathCount).toBe(ref.deaths.length)
                expect(scene.tracerCount).toBe(ref.tracers.length)
                const refPhase = ref.bomb.phase
                expect(scene.bomb.phase).toBe(refPhase)
                if (ref.bomb.at) {
                    expect(scene.bomb.x).toBe(ref.bomb.at.x)
                    expect(scene.bomb.y).toBe(ref.bomb.at.y)
                }
                expect(scene.utilityCount).toBe(ref.utility.length)
                expect(sceneAliveCounts(scene)).toEqual({ CT: ref.players.filter(p => p.alive && p.side === 'CT').length, T: ref.players.filter(p => p.alive && p.side === 'T').length })
            }
        }
    })

    it('shows tracers for TRACER_SECONDS in the killer colour and keeps death markers', () => {
        const scene = createRadarScene()
        for (const prep of prepared) {
            for (const d of prep.deaths) {
                sampleRadarScene(prep, d.t + 0.05, scene)
                const tracers = scene.tracers.slice(0, scene.tracerCount)
                expect(tracers.some(tr => tr.tx === d.ax && tr.ty === d.ay && tr.side === d.killerSide)).toBe(true)
                sampleRadarScene(prep, d.t + TRACER_SECONDS + 0.05, scene)
                for (const tr of scene.tracers.slice(0, scene.tracerCount)) expect(tr.age).toBeLessThanOrEqual(TRACER_SECONDS)
                expect(scene.deaths.slice(0, scene.deathCount).some(x => x.x === d.ax && x.side === d.victimSide)).toBe(true)
            }
        }
    })

    it('shows exact HP from the recorded hits: duel chip and grenades, survivors included, 0 when dead', () => {
        const exact = fixture.live.map((live, i) => prepareRadarScript(live.script, { events: fixture.steps[i].round.events, economy: fixture.steps[i].round.playerEconomy, round: fixture.steps[i].round }))
        expect(exact.every(p => p.hpKnown && p.hpExact)).toBe(true)
        let chippedVictims = 0, chippedSurvivors = 0, hitLines = 0
        const scene = createRadarScene()
        for (const [r, prep] of exact.entries()) {
            const kills = (fixture.steps[r].round.events ?? []).filter(e => e.type === 'KILL')
            for (const [i, p] of prep.players.entries()) {
                for (const t of p.hitTimes) {
                    sampleRadarScene(prep, t + HIT_SECONDS / 2, scene)
                    if (scene.hits.slice(0, scene.hitCount).some(h => h.tx === scene.players[i].x && h.ty === scene.players[i].y)) hitLines++
                }
                if (!Number.isFinite(p.deathT)) {
                    sampleRadarScene(prep, prep.endTime, scene)
                    if (scene.players[i].hp < 100) chippedSurvivors++
                    expect(scene.players[i].hp).toBeGreaterThan(0)
                    continue
                }
                // Just before the fatal hit the victim has exactly the HP the kill took.
                const kill = kills.find(e => e.victimId === p.id)!
                sampleRadarScene(prep, p.deathT - 0.001, scene)
                expect(scene.players[i].hp).toBe(kill.damage)
                if (kill.damage! < 100) chippedVictims++
                sampleRadarScene(prep, p.deathT + 0.001, scene)
                expect(scene.players[i].hp).toBe(0)
                expect(scene.players[i].alive).toBe(false)
            }
        }
        expect(chippedVictims).toBeGreaterThan(0)
        expect(chippedSurvivors).toBeGreaterThan(0)
        expect(hitLines).toBeGreaterThan(0)
    })

    it('shows the same HP as the roster at every moment (one model)', () => {
        const scene = createRadarScene()
        let compared = 0
        for (const [r, live] of fixture.live.entries()) {
            const round = fixture.steps[r].round
            const prep = prepareRadarScript(live.script, { events: round.events, round })
            const homeIds = fixture.ctx.home.players.map(p => p.id), awayIds = fixture.ctx.away.players.map(p => p.id)
            const timeline = buildRoundTimeline({ round, homeIds, awayIds })
            for (let t = 0; t <= prep.endTime; t += 0.25) {
                sampleRadarScene(prep, t, scene)
                for (let i = 0; i < scene.playerCount; i++) {
                    const p = scene.players[i]
                    expect(p.hp).toBe(samplePlayer(timeline, p.id, t).hp)
                    expect(p.alive).toBe(!samplePlayer(timeline, p.id, t).dead)
                    compared++
                }
            }
        }
        expect(compared).toBeGreaterThan(1000)
    })

    it('has no HP ring without KILL damage (legacy rounds)', () => {
        const prep = prepareRadarScript(fixture.live[2].script, {})
        expect(prep.hpKnown).toBe(false)
        const scene = sampleRadarScene(prep, 10, createRadarScene())
        expect(Number.isNaN(scene.players[0].hp)).toBe(true)
    })

    it('builds newest-first trails over the last TRAIL_SECONDS on the current floor', () => {
        const scene = createRadarScene()
        let moving = 0
        for (const prep of prepared.slice(0, 6)) {
            for (let t = 3; t < prep.endTime; t += 2.3) {
                sampleRadarScene(prep, t, scene)
                for (let i = 0; i < scene.playerCount; i++) {
                    const p = scene.players[i]
                    if (!p.alive) { expect(p.trailN).toBe(0); continue }
                    if (p.trailN < 2) continue
                    moving++
                    expect(p.trail[0]).toBe(p.x)
                    expect(p.trail[1]).toBe(p.y)
                    for (let j = 1; j < p.trailN; j++) expect(p.trailAge[j]).toBeGreaterThanOrEqual(p.trailAge[j - 1])
                    expect(p.trailAge[p.trailN - 1]).toBeLessThanOrEqual(TRAIL_SECONDS + 1e-9)
                }
            }
        }
        expect(moving).toBeGreaterThan(0)
    })

    it('reuses its pools: no new objects once warm, and samples a frame in microseconds', () => {
        const prep = prepared.reduce((a, b) => (b.utility.length + b.deaths.length > a.utility.length + a.deaths.length ? b : a))
        const scene = createRadarScene()
        for (let t = 0; t <= prep.endTime; t += 1 / 60) sampleRadarScene(prep, t, scene)
        const pools = [scene.players, scene.deaths, scene.tracers, scene.utility, scene.grenades, scene.hits].map(p => [...p])
        const t0 = performance.now()
        let n = 0
        for (let t = 0; t <= prep.endTime; t += 1 / 60) { sampleRadarScene(prep, t, scene); n++ }
        const perFrame = (performance.now() - t0) / n
        ;[scene.players, scene.deaths, scene.tracers, scene.utility, scene.grenades, scene.hits].forEach((pool, i) => {
            expect(pool.length).toBe(pools[i].length)
            pool.forEach((obj, j) => expect(obj).toBe(pools[i][j]))
        })
        expect(perFrame).toBeLessThan(0.1)
    })

    it('marks the bomb carrier, the planter and the defuser', () => {
        const scene = createRadarScene()
        const withDefuse = prepared.find(p => p.defuse?.success)
        const withPlant = prepared.find(p => p.plant)
        expect(withPlant).toBeDefined()
        const plant = withPlant!.plant!
        sampleRadarScene(withPlant!, plant.t - 1, scene)
        if (scene.bomb.phase === 'planting') expect(scene.players[plant.planter].planting).toBe(true)
        sampleRadarScene(withPlant!, plant.t + 1, scene)
        expect(['planted', 'defusing', 'exploded', 'defused']).toContain(scene.bomb.phase)
        expect(scene.bomb.site).toBe(plant.site)
        expect(scene.bomb.remaining).toBeCloseTo(39, 5)
        if (withDefuse) {
            const d = withDefuse.defuse!
            sampleRadarScene(withDefuse, (d.tStart + d.tEnd) / 2, scene)
            expect(scene.bomb.phase).toBe('defusing')
            expect(scene.players[d.defuser].defusing).toBe(true)
            expect(scene.players[d.defuser].progress).toBeCloseTo(0.5, 5)
        }
    })

    it('knows the weapon class of every player from the recorded loadouts', () => {
        for (const prep of prepared) for (const p of prep.players) expect(p.weapon).not.toBeNull()
        expect(weaponClassOf('awp')).toBe('sniper')
        expect(weaponClassOf('AK-47')).toBe('rifle')
        expect(weaponClassOf('usp_s')).toBe('pistol')
        expect(weaponClassOf('molotov')).toBeNull()
        expect(weaponClassOf(undefined)).toBeNull()
    })
})

describe('snapshot scene', () => {
    it('keeps edge coordinates, glides toward the next tick and hides future kill lines', () => {
        const scene = sceneFromSnapshot({
            t: 3,
            dots: [{ playerId: 'p', nickname: 'Edge', side: 'ct', isAlive: true, x: 0, y: 100, angle: 0 }],
            nextDots: [{ playerId: 'p', nickname: 'Edge', side: 'ct', isAlive: true, x: 10, y: 100, angle: 0 }],
            alpha: 0.5,
            killLines: [{ fromX: 20, fromY: 20, toX: 30, toY: 30, time: 4, isHeadshot: false }],
        }, createRadarScene())
        expect(scene.players[0].x).toBe(5)
        expect(scene.players[0].y).toBe(100)
        expect(scene.tracerCount).toBe(0)
    })

    it('keeps death markers and a planted bomb', () => {
        const scene = sceneFromSnapshot({
            t: 40,
            dots: [
                { playerId: 'c1', nickname: 'Last', side: 'ct', isAlive: true, x: 30, y: 30, angle: 0 },
                { playerId: 'c2', nickname: 'Gone', side: 'ct', isAlive: false, deathTime: 5, x: 40, y: 40, angle: 0 },
            ],
            bomb: { planted: true, exploded: false, defused: false, position: { x: 50, y: 50 } },
        }, createRadarScene())
        expect(scene.deathCount).toBe(1)
        expect(scene.deaths[0]).toMatchObject({ victimId: 'c2', side: 'CT', x: 40, y: 40 })
        expect(scene.bomb.phase).toBe('planted')
        expect(sceneAliveCounts(scene)).toEqual({ CT: 1, T: 0 })
    })
})
