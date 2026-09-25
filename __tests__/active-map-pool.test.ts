import { ACTIVE_MAP_POOL, getMapAssetName } from '@/data/map-pool'
import { MapId } from '@/types'
import { resolveCanonicalSeriesMaps, isValidMapId } from '@/lib/live-match-utils'
import { simulateMapVeto } from '@/engine/match/map-veto'
import { SeededRNG } from '@/engine/rng'

describe('retired competitive maps', () => {
    it('uses seven unique active maps with Sandstone and without Nuke', () => {
        expect(ACTIVE_MAP_POOL).toHaveLength(7)
        expect(new Set(ACTIVE_MAP_POOL).size).toBe(7)
        expect(ACTIVE_MAP_POOL).toContain(MapId.SANDSTONE)
        expect(ACTIVE_MAP_POOL).not.toContain(MapId.NUKE)
    })
    it.each(['BO1', 'BO3', 'BO5'])('never rolls Nuke for new %s series, including URL hints', format => {
        for (let seed = 1; seed <= 100; seed++) {
            const maps = resolveCanonicalSeriesMaps({ format, seed, urlMaps: [MapId.NUKE], fallbackMaps: [MapId.NUKE] })
            expect(maps).not.toContain(MapId.NUKE)
            expect(new Set(maps).size).toBe(maps.length)
            const veto = simulateMapVeto(new SeededRNG(seed), 'home', 'away', [], [], undefined, undefined, undefined, undefined, format)
            expect(veto.maps).not.toContain(MapId.NUKE)
            expect(veto.veto.every(event => event.map !== MapId.NUKE)).toBe(true)
            expect(veto.maps).toHaveLength(format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1)
        }
    })
    it('keeps persisted Nuke series and their assets valid', () => {
        expect(resolveCanonicalSeriesMaps({ format: 'BO3', seed: 42, savedMaps: [MapId.NUKE, MapId.MIRAGE, MapId.ANUBIS] })).toEqual([MapId.NUKE, MapId.MIRAGE, MapId.ANUBIS])
        expect(isValidMapId(MapId.NUKE)).toBe(true)
        expect(getMapAssetName(MapId.NUKE)).toBe('nuke')
    })
})
