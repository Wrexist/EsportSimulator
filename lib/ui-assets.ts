/** Presentation assets only. No player identity, store or simulation mutations. */
export const UI_ASSETS = {
    hq: '/esport-ui-assets/backgrounds/club-overview-hq.webp',
    arena: '/esport-ui-assets/backgrounds/match-command-arena.webp',
    scouting: '/esport-ui-assets/backgrounds/scouting-war-room.webp',
    campus: '/esport-ui-assets/backgrounds/club-campus-dusk.webp',
    facilities: {
        TRAINING: '/esport-ui-assets/facilities/facility-a-00.webp',
        TACTICAL: '/esport-ui-assets/facilities/facility-a-01.webp',
        RECOVERY: '/esport-ui-assets/facilities/facility-a-02.webp',
        FANZONE: '/esport-ui-assets/facilities/facility-a-03.webp',
    },
} as const

export function routeAtmosphere(path: string): string {
    if (/^\/(match|tournaments|rankings|trophies|hall-of-fame)/.test(path)) return UI_ASSETS.arena
    if (/^\/(scouting|transfers|player|staff)/.test(path)) return UI_ASSETS.scouting
    if (/^\/(basecamp|equipment|academy|training)/.test(path)) return UI_ASSETS.campus
    return UI_ASSETS.hq
}

export function equipmentArtwork(type: string, tier: number, fallback: string): string {
    const family = ['MOUSE', 'KEYBOARD', 'HEADSET', 'MONITOR', 'CHAIR', 'PC'].includes(type)
    const finish = ({ 1: 'standard', 2: 'pro', 3: 'elite' } as Record<number, string>)[tier]
    return family && finish
        ? `/esport-ui-assets/equipment/tiers/${type.toLowerCase()}-${finish}.webp`
        : fallback
}
