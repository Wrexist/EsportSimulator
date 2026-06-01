/**
 * Asset Constants for Esports Simulator
 * Centralized paths to all game assets
 */

// =============================================================================
// PLACEHOLDER IMAGES
// =============================================================================
export const PLACEHOLDERS = {
    player: '/player_placeholder.png',
    staff: '/staff_placeholder.png',
    team: '/team_placeholder.png',
} as const;

// =============================================================================
// TROPHY ASSETS (using existing high-quality tournament assets)
// =============================================================================
export const TROPHIES = {
    // S-Tier / Major trophies
    major: '/assets/tournaments/s_tier_trophy.png',
    majorAlt: '/assets/tournaments/s_tier_trophy_1.png',
    goldTrophy: '/assets/tournaments/trophy_gold_new.png',
    // A-Tier trophies  
    aTier: '/assets/tournaments/a_tier_trophy.png',
    aTierAlt: '/assets/tournaments/a_tier_trophy_1.png',
    silverTrophy: '/assets/tournaments/trophy_silver_new.png',
    // B-Tier trophies
    bTier: '/assets/tournaments/b_tier_trophy.png',
    bTierAlt: '/assets/tournaments/b_tier_trophy_1.png',
    // Medals (generated - kept as they work well)
    medalGold: '/assets/trophies/medal_gold.png',
    medalSilver: '/assets/trophies/medal_silver.png',
    medalBronze: '/assets/trophies/medal_bronze.png',
    mvpStar: '/assets/trophies/mvp_star.png',
} as const;

// =============================================================================
// STATUS BADGES
// =============================================================================
export const BADGES = {
    fire: '/assets/badges/fire.png',       // Hot form
    ice: '/assets/badges/ice.png',         // Cold form
    injury: '/assets/badges/injury.png',   // Injured player
    legend: '/assets/badges/legend.png',   // Legend status
} as const;

// =============================================================================
// MATCH EVENT ICONS
// =============================================================================
export const EVENTS = {
    headshot: '/assets/events/headshot.png',
    clutch: '/assets/events/clutch.png',
    ace: '/assets/events/ace.png',
    defuse: '/assets/events/defuse.png',
} as const;

// =============================================================================
// FACILITY IMAGES
// =============================================================================
export const FACILITIES = {
    fanZone: '/assets/facilities/fan-zone.png',
    hqOverview: '/assets/facilities/hq-overview.png',
    recoveryHub: '/assets/facilities/recovery-hub.png',
    tacticalSuite: '/assets/facilities/tactical-suite.png',
    trainingRoom: '/assets/facilities/training-room.png',
} as const;

// =============================================================================
// MAP WALLPAPERS
// =============================================================================
export const MAPS = {
    ancient: '/maps/ancient.png',
    anubis: '/maps/anubis.png',
    sandstone: '/maps/dust2.png',
    inferno: '/maps/inferno.png',
    mirage: '/maps/mirage.png',
    nuke: '/maps/nuke.png',
    overpass: '/maps/overpass.png',
    vertigo: '/maps/vertigo.png',
} as const;

// =============================================================================
// TOURNAMENT ASSETS
// =============================================================================
export const TOURNAMENTS = {
    // Tier trophies (generic; not tournament-specific)
    aTierTrophy: '/assets/tournaments/a_tier_trophy.png',
    bTierTrophy: '/assets/tournaments/b_tier_trophy.png',
    sTierTrophy: '/assets/tournaments/s_tier_trophy.png',
    // Procedurally-generated tournament logos. Each entry resolves via the
    // sanitize pipeline so the filename never contains a trademarked slug.
    northernMajor: '/assets/tournaments/logo_northern_major_2025.svg',
    summerOpenColone: '/assets/tournaments/logo_summer_open_colone_2025.svg',
    winterOpenKatova: '/assets/tournaments/logo_winter_open_katova_2025.svg',
    easternMajor: '/assets/tournaments/logo_eastern_major_2025.svg',
} as const;

// =============================================================================
// SPONSOR LOGOS
// =============================================================================
// Sponsors are fictional. The shipped build never includes real brand logos.
export const SPONSORS = {} as const;

// =============================================================================
// UI ASSETS
// =============================================================================
export const UI = {
    ctLoadout: '/assets/ui/CT_Loadout.jpg',
    tLoadout: '/assets/ui/T_Loadout.jpg',
    phoneWallpaper: '/assets/ui/phone-wallpaper.png',
} as const;

// =============================================================================
// WEAPON ICONS
// =============================================================================
export const WEAPONS = {
    ak47: '/assets/weapons/weapon_ak47.png',
    m4a4: '/assets/weapons/weapon_m4a4.png',
    m4a1s: '/assets/weapons/weapon_m4a1s.png',
    galil: '/assets/weapons/weapon_galil.png',
    famas: '/assets/weapons/weapon_famas.png',
    aug: '/assets/weapons/weapon_aug.png',
    awp: '/assets/weapons/weapon_awp.png',
    deagle: '/assets/weapons/weapon_deagle.png',
    glock: '/assets/weapons/weapon_glock.png',
    usp: '/assets/weapons/weapon_usp.png',
    p250: '/assets/weapons/weapon_p250.png',
    fiveseven: '/assets/weapons/weapon_fiveseven.png',
    mac10: '/assets/weapons/weapon_mac10.png',
    mp9: '/assets/weapons/weapon_mp9.png',
    mp7: '/assets/weapons/weapon_mp7.png',
    p90: '/assets/weapons/weapon_p90.png',
    xm1014: '/assets/weapons/weapon_xm1014.png',
    mag7: '/assets/weapons/weapon_mag7.png',
} as const;

// =============================================================================
// EQUIPMENT ICONS
// =============================================================================
export const EQUIPMENT = {
    armor: '/assets/equipment/equipment_armor.png',
    armorKevlar: '/assets/equipment/equipment_armor_kevlar.png', // New Kevlar-only icon
    defuse: '/assets/equipment/equipment_defuse.png',
} as const;

// =============================================================================
// GRENADE ICONS
// =============================================================================
export const GRENADES = {
    flash: '/assets/grenades/grenade_flash.png',
    he: '/assets/grenades/grenade_he.png',
    molotov: '/assets/grenades/grenade_molotov.png',
    smoke: '/assets/grenades/grenade_smoke.png',
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get trophy image based on tournament tier
 */
export function getTrophyByTier(tier: string): string {
    switch (tier?.toUpperCase()) {
        case 'S':
        case 'S-TIER':
        case 'MAJOR':
            return TROPHIES.major;
        case 'A':
        case 'A-TIER':
            return TROPHIES.aTier;
        case 'B':
        case 'B-TIER':
            return TROPHIES.bTier;
        default:
            return TROPHIES.bTier;
    }
}

/**
 * Get medal image based on placement
 */
export function getMedalByPlacement(placement: number): string | null {
    switch (placement) {
        case 1:
            return TROPHIES.medalGold;
        case 2:
            return TROPHIES.medalSilver;
        case 3:
            return TROPHIES.medalBronze;
        default:
            return null;
    }
}

/**
 * Get form badge based on recent performance
 */
export function getFormBadge(winRate: number): string | null {
    if (winRate >= 0.7) return BADGES.fire;    // Hot streak (70%+ wins)
    if (winRate <= 0.3) return BADGES.ice;     // Cold streak (30% or less)
    return null;
}
