/**
 * Round script motion: a player who fights twice in quick succession holds
 * between the duels instead of walking back toward their default spot and
 * returning (the back-and-forth seen in multi-kills).
 */
import { sampleTrack } from '@/engine/match/round-script'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

/** Direction reversals (a turn of more than ~135° between 0.25 s samples), and bursts of 3 within 4 s. */
function reversals(fixtures: ReturnType<typeof playRadarSeries>[]) {
    let rounds = 0, reversals = 0, bursts = 0
    for (const f of fixtures) for (const live of f.live) {
        rounds++
        const sc = live.script
        const died = new Map(sc.deaths.map(d => [d.victimId, d.t]))
        for (const id of Object.keys(sc.tracks)) {
            const end = Math.min(sc.endTime, died.get(id) ?? Infinity)
            let recent: number[] = []
            const p = (t: number) => sampleTrack(sc.tracks[id], t)
            for (let t = 0.5; t <= end; t += 0.25) {
                const z = p(t - 0.5), a = p(t - 0.25), b = p(t)
                const ux = a.x - z.x, uy = a.y - z.y, vx = b.x - a.x, vy = b.y - a.y
                const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
                if (lu > 0.1 && lv > 0.1 && (ux * vx + uy * vy) / (lu * lv) < -0.7) {
                    reversals++
                    recent = [...recent.filter(r => t - r <= 4), t]
                    if (recent.length === 3) bursts++
                }
            }
        }
    }
    return { rounds, reversals, bursts }
}

describe('round script motion', () => {
    it('quick multi-kills do not walk back and forth', () => {
        const r = reversals([MapId.MIRAGE, MapId.INFERNO, MapId.NUKE, MapId.OVERPASS, MapId.ANCIENT].map(m => playRadarSeries(m, 5)))
        expect(r.rounds).toBeGreaterThan(80)
        // Measured on these rounds: 21 bursts (0.21 per round) before SHORT_LEG, 5 after.
        expect(r.bursts / r.rounds).toBeLessThan(0.1)
    })
})
