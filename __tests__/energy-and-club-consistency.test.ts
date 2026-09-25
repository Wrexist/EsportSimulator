import catalog from '@/data/team-identity-catalog.json'
import { teamEmblemIdentity } from '@/lib/team-emblem-identity'
import { playerEnergyPercent } from '@/lib/player-energy'

it('uses training energy rather than inverse fatigue, including exhausted players', () => {
    expect(playerEnergyPercent({ energy: 72 })).toBe(72)
    expect(playerEnergyPercent({ energy: 0 })).toBe(0)
    expect(playerEnergyPercent({})).toBe(100)
    expect(playerEnergyPercent({ energy: NaN })).toBe(100)
    expect(playerEnergyPercent({ energy: -5 })).toBe(0)
    expect(playerEnergyPercent({ energy: 105 })).toBe(100)
})

it('gives every stock club a distinct silhouette/color combination stable across renames', () => {
    const identities = catalog.map(team => {
        const primary = team.branding?.primaryColor || '#38bdf8'
        const identity = teamEmblemIdentity(team.id, team.name, primary)
        expect(teamEmblemIdentity(team.id, 'Renamed', primary)).toEqual(identity)
        return `${identity.primary.toLowerCase()}:${identity.motif}`
    })
    expect(new Set(identities).size).toBe(catalog.length)
})

it('preserves a custom club color', () => {
    expect(teamEmblemIdentity(catalog[0].id, catalog[0].name, '#123456').primary).toBe('#123456')
})
