/**
 * Phase 3 radar: the canvas renderer against a recording 2D context (no DOM
 * canvas under Jest), and screen-space name layout.
 */
import { RadarRenderer, RADAR_COLORS } from '@/lib/radar-draw'
import { createRadarScene, prepareRadarScript, sampleRadarScene, sceneFromSnapshot } from '@/lib/radar-scene'
import { layoutRadarLabels } from '@/lib/radar-label-layout'
import type { RadarPlayerDot } from '@/lib/radar-types'
import { MapId } from '@/types/enums'
import { playRadarSeries } from './radar-fixtures'

type Call = { op: string; args: unknown[]; fillStyle?: unknown; strokeStyle?: unknown; alpha?: unknown }

function mockCanvas(log: Call[], w = 1, h = 1): HTMLCanvasElement {
    const state: Record<string, unknown> = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' }
    const ctx = new Proxy(state, {
        get(target, prop: string) {
            if (prop in target) return target[prop]
            if (prop === 'measureText') return (s: string) => ({ width: s.length * 6 })
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() { } })
            if (prop === 'getImageData') return (_x: number, _y: number, gw: number, gh: number) => ({ data: new Uint8ClampedArray(gw * gh * 4) })
            return (...args: unknown[]) => { log.push({ op: prop, args, fillStyle: target.fillStyle, strokeStyle: target.strokeStyle, alpha: target.globalAlpha }) }
        },
        set(target, prop: string, value) { target[prop] = value; return true },
    })
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement
}

function renderer(log: Call[]) {
    const r = new RadarRenderer(mockCanvas(log), (w, h) => mockCanvas([], w, h))
    r.resize(800, 800, 1)
    return r
}

const opts = { level: 'upper' as const, dualLevel: false, showNames: true, reducedMotion: false, nowMs: 1000, selectedId: null }

describe('radar renderer', () => {
    const fixture = playRadarSeries(MapId.MIRAGE, 41, 10)

    it('draws every moment of real rounds without throwing, names included', () => {
        const log: Call[] = []
        const r = renderer(log)
        const scene = createRadarScene()
        for (const [i, live] of fixture.live.entries()) {
            const prep = prepareRadarScript(live.script, { events: fixture.steps[i].round.events, economy: fixture.steps[i].round.playerEconomy })
            for (let t = 0; t <= prep.endTime + 1; t += 0.5) {
                sampleRadarScene(prep, t, scene)
                expect(() => r.draw(scene, { ...opts, nowMs: t * 1000 })).not.toThrow()
            }
        }
        // Base blit + name plates were drawn.
        expect(log.filter(c => c.op === 'drawImage').length).toBeGreaterThan(100)
    })

    it('draws CT players as circles and T players as diamonds (colour-independent side signal)', () => {
        const shapes = (side: 'ct' | 't') => {
            const log: Call[] = []
            const r = renderer(log)
            const scene = sceneFromSnapshot({ t: 10, dots: [{ playerId: 'p', nickname: 'P', side, isAlive: true, x: 50, y: 50, angle: 0 }] }, createRadarScene())
            r.draw(scene, { ...opts, showNames: false })
            const color = side === 'ct' ? RADAR_COLORS.ct : RADAR_COLORS.t
            const fillAt = log.findIndex(c => c.op === 'fill' && c.fillStyle === color && c.alpha === 1)
            expect(fillAt).toBeGreaterThan(0)
            // Ops of the body path: from its beginPath to the fill.
            let start = fillAt
            while (start > 0 && log[start].op !== 'beginPath') start--
            return log.slice(start, fillAt).map(c => c.op)
        }
        expect(shapes('ct')).toContain('arc')
        expect(shapes('ct')).not.toContain('lineTo')
        expect(shapes('t').filter(op => op === 'lineTo')).toHaveLength(3)
        expect(shapes('t')).not.toContain('arc')
    })

    it('dims players on the other floor and outlines a selected player in gold', () => {
        const log: Call[] = []
        const r = renderer(log)
        const scene = sceneFromSnapshot({ t: 5, dots: [
            { playerId: 'up', nickname: 'Up', side: 'ct', isAlive: true, x: 30, y: 30, angle: 0, level: 'upper' },
            { playerId: 'low', nickname: 'Low', side: 't', isAlive: true, x: 60, y: 60, angle: 0, level: 'lower' },
        ] }, createRadarScene())
        r.draw(scene, { ...opts, dualLevel: true, level: 'upper', selectedId: 'up' })
        expect(log.some(c => c.op === 'fill' && c.fillStyle === RADAR_COLORS.t && (c.alpha as number) < 0.5)).toBe(true)
        expect(log.some(c => c.op === 'fill' && c.fillStyle === RADAR_COLORS.ct && c.alpha === 1)).toBe(true)
        expect(log.some(c => c.op === 'stroke' && c.strokeStyle === RADAR_COLORS.gold)).toBe(true)
        expect(r.hitTest(scene, 240, 240, 16, 'upper', true)).toBe('up')
        expect(r.hitTest(scene, 480, 480, 16, 'upper', true)).toBeNull()
    })
})

describe('screen-space name layout', () => {
    it('places full, case-kept names with measured widths inside the viewport, without overlaps', () => {
        const dots: RadarPlayerDot[] = Array.from({ length: 10 }, (_, i) => ({
            playerId: `p${i}`, nickname: i === 0 ? 'averyveryverylongname' : `Player${i}`, side: i < 5 ? 'ct' : 't', isAlive: true, angle: 0,
            x: 400 + (i % 3) * 12, y: 400 + Math.floor(i / 3) * 12,
        }))
        const labels = [...layoutRadarLabels(dots, undefined, {
            measure: text => text.length * 7 + 30, height: 18, distances: [11, 16, 24, 34, 48, 64],
            bounds: { minX: 4, minY: 4, maxX: 796, maxY: 796 }, markerHalf: 9, gap: 2, maxChars: 0, uppercase: false,
        }).values()]
        expect(labels).toHaveLength(10)
        expect(labels.find(l => l.text === 'averyveryverylongname')!.width).toBe(21 * 7 + 30)
        for (const [i, a] of labels.entries()) {
            expect(a.x).toBeGreaterThanOrEqual(4)
            expect(a.x + a.width).toBeLessThanOrEqual(796)
            for (const b of labels.slice(i + 1)) expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
        }
    })
})
