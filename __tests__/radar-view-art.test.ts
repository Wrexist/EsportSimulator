/**
 * Phase 3 radar: zoom / pan maths, the fit-to-content home view and the
 * radar art source (baked manifest with fallback).
 */
import fs from 'node:fs'
import path from 'node:path'
import { clampView, DEFAULT_VIEW, fitView, MAX_ZOOM, panBy, roundMapBounds, screenToMap, viewTransform, zoomAt } from '@/lib/radar-view'
import { FALLBACK_RADAR_ART, normalizeRadarArtManifest, radarArtFor, radarArtKey } from '@/lib/radar-art'
import { getRoundMap } from '@/data/round-maps'
import { MapId } from '@/types/enums'
import manifest from '@/data/radar-art.json'

describe('radar view', () => {
    const W = 800, H = 800

    it('maps the radar square to the viewport and keeps the point under the cursor when zooming', () => {
        const tf = viewTransform(DEFAULT_VIEW, W, H)
        expect(tf).toEqual({ k: 8, ox: 0, oy: 0 })
        const before = screenToMap(DEFAULT_VIEW, W, H, 600, 200)
        const zoomed = zoomAt(DEFAULT_VIEW, 2, 600, 200, W, H)
        expect(zoomed.zoom).toBe(2)
        const after = screenToMap(zoomed, W, H, 600, 200)
        expect(after.x).toBeCloseTo(before.x, 6)
        expect(after.y).toBeCloseTo(before.y, 6)
    })

    it('clamps zoom and pan so the map always covers the viewport', () => {
        expect(clampView({ zoom: 10, cx: 50, cy: 50 }).zoom).toBe(MAX_ZOOM)
        expect(clampView({ zoom: 2, cx: 0, cy: 100 })).toEqual({ zoom: 2, cx: 25, cy: 75 })
        const z = zoomAt(DEFAULT_VIEW, 2, 400, 400, W, H)
        const moved = panBy(z, 10_000, 0, W, H)
        expect(moved.cx).toBe(25)
        // The home view does not pan; zooming back out returns to it.
        expect(panBy(DEFAULT_VIEW, 100, 0, W, H)).toBe(DEFAULT_VIEW)
        const home = fitView({ minX: 20, minY: 30, maxX: 70, maxY: 70 })
        expect(zoomAt(zoomAt(home, 1.5, 100, 100, W, H, home), 1 / 3, 100, 100, W, H, home)).toBe(home)
    })

    it('fits the playable area: Nuke zooms in, a full-frame box does not', () => {
        expect(fitView(null)).toEqual(DEFAULT_VIEW)
        expect(fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }).zoom).toBe(1)
        for (const id of Object.values(MapId)) {
            const b = roundMapBounds(getRoundMap(id))!
            expect(b.maxX).toBeGreaterThan(b.minX)
            const v = fitView(b)
            expect(v.zoom).toBeGreaterThanOrEqual(1)
            // Every bombsite stays in view.
            const half = 50 / v.zoom
            for (const s of ['A', 'B'] as const) {
                const c = getRoundMap(id)!.sites[s].center
                expect(Math.abs(c.x - v.cx)).toBeLessThanOrEqual(half)
                expect(Math.abs(c.y - v.cy)).toBeLessThanOrEqual(half)
            }
        }
        expect(fitView(roundMapBounds(getRoundMap(MapId.NUKE))).zoom).toBeGreaterThan(1.15)
    })
})

describe('radar art', () => {
    it('reads the baked manifest in any reasonable shape', () => {
        expect(normalizeRadarArtManifest({ Mirage: { upper: '/a.webp' } })).toEqual({ mirage: { upper: '/a.webp' } })
        expect(normalizeRadarArtManifest({ default: { maps: { de_nuke: { primary: '/u.webp', secondary: '/l.webp' } } } })).toEqual({ nuke: { upper: '/u.webp', lower: '/l.webp' } })
        expect(normalizeRadarArtManifest([{ mapId: 'Vertigo', upper: '/v1.webp', lower: '/v2.webp' }])).toEqual({ vertigo: { upper: '/v1.webp', lower: '/v2.webp' } })
        expect(normalizeRadarArtManifest({ Inferno: '/i.webp', Broken: { lower: '/x.webp' } })).toEqual({ inferno: { upper: '/i.webp' } })
        expect(normalizeRadarArtManifest(null)).toEqual({})
        expect(radarArtKey('de_Mirage')).toBe('mirage')
    })

    it('prefers the manifest and falls back to the same baked art, never to Valve overviews', () => {
        expect(radarArtFor('Mirage', { mirage: { upper: '/radar-art/Mirage-upper.webp' } })).toEqual({ upper: '/radar-art/Mirage-upper.webp', baked: true })
        expect(radarArtFor('Nuke', {})).toEqual(FALLBACK_RADAR_ART.Nuke)
        expect(radarArtFor('Nuke', null)).toEqual(FALLBACK_RADAR_ART.Nuke)
        expect(radarArtFor('NoSuchMap', null)).toBeUndefined()
        // Under Jest there is no require.context: the loader falls back without throwing.
        expect(radarArtFor('Mirage')).toEqual({ upper: '/radar-art/Mirage-upper.webp', baked: true })
        for (const [id, art] of Object.entries(FALLBACK_RADAR_ART)) {
            expect(art.baked).toBe(true)
            for (const url of [art.upper, art.lower].filter((u): u is string => !!u)) {
                expect(url).toMatch(/^\/radar-art\/[A-Za-z]+-(upper|lower)\.webp$/)
                expect(url).not.toMatch(/radar_psd/)
                expect(fs.existsSync(path.join(__dirname, '..', 'public', url))).toBe(true)
            }
            // The fallback mirrors the manifest exactly.
            expect(normalizeRadarArtManifest(manifest)[radarArtKey(id)]).toEqual({ upper: art.upper, ...(art.lower ? { lower: art.lower } : {}) })
        }
    })

    it('ships baked art for every map, both floors on Nuke and Vertigo, and the files exist', () => {
        const art = normalizeRadarArtManifest(manifest)
        for (const id of Object.values(MapId)) {
            const entry = radarArtFor(id, art)!
            expect(entry.baked).toBe(true)
            expect(fs.existsSync(path.join(__dirname, '..', 'public', entry.upper))).toBe(true)
            if (entry.lower) expect(fs.existsSync(path.join(__dirname, '..', 'public', entry.lower))).toBe(true)
            expect(!!entry.lower).toBe(id === MapId.NUKE || id === MapId.VERTIGO)
            expect(!!entry.lower).toBe(!!FALLBACK_RADAR_ART[id].lower)
        }
    })
})
