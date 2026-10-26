import { collectibleCatalogSize, collectionFromTrophies, TIER_ITEMS } from '@/lib/collectibles'
import { FULL_TOURNAMENT_CALENDAR } from '@/data/tournament-calendar'

describe('C11: tournament collectibles', () => {
    const s = FULL_TOURNAMENT_CALENDAR.find(c => c.tier === 'S_TIER')!
    const c = FULL_TOURNAMENT_CALENDAR.find(c => c.tier === 'C_TIER')!

    it('unlocks more and rarer items at bigger events', () => {
        const small = collectionFromTrophies([{ tournamentId: c.id, tournamentName: c.name, week: 5, tier: 'C_TIER' }])
        const big = collectionFromTrophies([{ tournamentId: s.id, tournamentName: s.name, week: 9, tier: 'S_TIER' }])
        expect(small.map(i => i.kind)).toEqual(['jersey'])
        expect(big.length).toBeGreaterThanOrEqual(TIER_ITEMS.S_TIER.length - 1)
        expect(big[0].rarity === 'LEGENDARY' || big[0].rarity === 'EPIC').toBe(true)
    })

    it('keeps one of each item per event and can find the keyboard on a later edition', () => {
        const editions = Array.from({ length: 12 }, (_, i) => ({ tournamentId: `${s.id}_s${i + 1}`, tournamentName: s.name, week: 40 + i * 52, tier: 'S_TIER' }))
        const items = collectionFromTrophies(editions)
        expect(new Set(items.map(i => i.id)).size).toBe(items.length)
        expect(items.length).toBe(TIER_ITEMS.S_TIER.length)
    })

    it('counts the whole calendar', () => {
        expect(collectibleCatalogSize()).toBeGreaterThan(FULL_TOURNAMENT_CALENDAR.filter(c => c.tier !== 'QUALIFIER').length)
    })
})
