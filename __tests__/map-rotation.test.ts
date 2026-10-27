import { ACTIVE_MAP_POOL, ROTATION_MAP_POOL, setActiveMapPool } from '@/data/map-pool'
import { rotationForSeason, rotateSeasonMapPool } from '@/engine/season/map-rotation'
import { simulateMapVeto } from '@/engine/match/map-veto'
import { SeededRNG } from '@/engine/rng'
import type { GameSave } from '@/engine/save-types'

afterEach(() => setActiveMapPool(ROTATION_MAP_POOL))

describe('C6: seasonal map pool', () => {
    it('plays all seven maps in the first season', () => {
        expect(rotationForSeason('s', 1).active).toEqual([...ROTATION_MAP_POOL])
    })

    it('benches one map a season and never the same one twice running', () => {
        let prev = rotationForSeason('save-x', 1)
        for (let season = 2; season < 30; season++) {
            const r = rotationForSeason('save-x', season, prev)
            expect(r.benched).toHaveLength(1)
            expect(r.active).toHaveLength(6)
            expect(prev.benched).not.toContain(r.benched[0])
            expect(r.returning).toEqual(prev.benched)
            prev = r
        }
    })

    it('announces the new pool once and applies it', () => {
        const save = { saveId: 'abc', currentWeek: 53, eventsLog: [] } as unknown as GameSave
        const r = rotateSeasonMapPool(save)!
        expect(save.mapRotation?.season).toBe(2)
        expect(ACTIVE_MAP_POOL).toEqual(r.active)
        expect(save.eventsLog).toHaveLength(1)
        expect(rotateSeasonMapPool(save)).toBeNull()
        expect(save.eventsLog).toHaveLength(1)
    })

    it('ignores a pool too small to veto', () => {
        setActiveMapPool(ROTATION_MAP_POOL.slice(0, 3))
        expect(ACTIVE_MAP_POOL).toEqual([...ROTATION_MAP_POOL])
    })

    it.each(['BO1', 'BO3', 'BO5'])('vetoes %s from a six-map pool', format => {
        setActiveMapPool(ROTATION_MAP_POOL.slice(1))
        const { maps } = simulateMapVeto(new SeededRNG(7), 'h', 'a', [], [], undefined, undefined, undefined, undefined, format)
        expect(maps).toHaveLength(format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1)
        expect(new Set(maps).size).toBe(maps.length)
        for (const m of maps) expect(ROTATION_MAP_POOL.slice(1)).toContain(m)
    })
})
