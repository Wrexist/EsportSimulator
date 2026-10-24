/**
 * script-v1 resolver: kills are resolved out of time order (a lurk pick is
 * played apart from the hit), so everything derived from "what happened
 * first" must be read from the sorted kills. And no grenade leaves the hand
 * of a player who is already dead.
 */
import type { MatchEvent } from '@/types'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

describe('resolver event order', () => {
    const fixtures = [MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.ANCIENT, MapId.OVERPASS].flatMap(m => [playRadarSeries(m, 1), playRadarSeries(m, 2)])
    const rounds = fixtures.flatMap(f => f.steps.map(s => s.round))
    const killsOf = (events: MatchEvent[] | undefined) => (events ?? []).filter(e => e.type === 'KILL')

    it('events come in time order', () => {
        for (const r of rounds) {
            const ev = r.events ?? []
            for (let i = 1; i < ev.length; i++) expect(ev[i].time).toBeGreaterThanOrEqual(ev[i - 1].time)
        }
    })

    it('the opening kill is the first kill in time, and there is exactly one', () => {
        let rounds_ = 0
        for (const r of rounds) {
            const ks = killsOf(r.events)
            if (!ks.length) continue
            rounds_++
            expect(ks.filter(k => k.isOpening)).toEqual([ks[0]])
        }
        expect(rounds_).toBeGreaterThan(150)
    })

    it('a trade avenges a kill made earlier in time (within 5 s)', () => {
        for (const r of rounds) {
            const ks = killsOf(r.events)
            ks.forEach((k, i) => {
                const avenged = ks.slice(0, i).some(p => p.playerId === k.victimId && k.time - p.time <= 5)
                expect(!!k.isTrade).toBe(avenged)
            })
        }
    })

    it('a 1vX clutch is credited to a player who really was last alive, against the right count', () => {
        let clutches = 0
        for (const f of fixtures) f.steps.forEach((s, i) => {
            const r = s.round, sides = f.live[i].script.sides
            const ks = killsOf(r.events)
            for (const c of (r.events ?? []).filter(e => e.type === 'CLUTCH')) {
                clutches++
                const mine = sides[c.playerId!]
                const ids = Object.keys(sides)
                // Replay the kills in time order: the first moment c.playerId is their side's last player.
                const dead = new Set<string>()
                let vs = -1
                for (const k of ks) {
                    dead.add(k.victimId!)
                    const team = ids.filter(id => sides[id] === mine && !dead.has(id))
                    if (team.length === 1) { expect(team[0]).toBe(c.playerId); vs = ids.filter(id => sides[id] !== mine && !dead.has(id)).length; break }
                }
                expect(c.details).toBe(`1v${vs}`)
            }
        })
        expect(clutches).toBeGreaterThan(5)
    })

    it('no grenade is thrown by a player after their death', () => {
        let late = 0, thrown = 0
        for (const r of rounds) {
            const died = new Map(killsOf(r.events).map(k => [k.victimId, k.time]))
            for (const u of r.utility ?? []) {
                thrown++
                if (u.t > (died.get(u.playerId) ?? Infinity)) late++
            }
        }
        expect(thrown).toBeGreaterThan(500)
        expect(late).toBe(0)
    })
})
