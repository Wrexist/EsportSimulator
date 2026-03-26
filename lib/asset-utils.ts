/**
 * Asset Utilities for Esports Simulator
 * Provides helper functions to load team logos, player images, and flags
 * with automatic fallback to placeholder images
 */

// Base paths
const TEAMS_PATH = '/assets/teams';
const FLAGS_PATH = '/assets/flags';
const PLACEHOLDER_PLAYER = '/player_placeholder.webp';
const PLACEHOLDER_STAFF = '/staff_placeholder.webp';
const PLACEHOLDER_LOGO = '/team_placeholder.webp';


// Country code mapping for flags
export const COUNTRY_CODES: Record<string, string> = {
    'france': 'fr', 'germany': 'de', 'united kingdom': 'gb', 'brazil': 'br',
    'russia': 'ru', 'ukraine': 'ua', 'sweden': 'se', 'denmark': 'dk',
    'poland': 'pl', 'united states': 'us', 'usa': 'us', 'canada': 'ca',
    'norway': 'no', 'finland': 'fi', 'netherlands': 'nl', 'belgium': 'be',
    'spain': 'es', 'portugal': 'pt', 'italy': 'it', 'australia': 'au',
    'new zealand': 'nz', 'china': 'cn', 'japan': 'jp', 'south korea': 'kr',
    'korea': 'kr', 'taiwan': 'tw', 'israel': 'il', 'turkey': 'tr',
    'argentina': 'ar', 'chile': 'cl', 'mexico': 'mx', 'peru': 'pe',
    'colombia': 'co', 'estonia': 'ee', 'latvia': 'lv', 'lithuania': 'lt',
    'czech republic': 'cz', 'czechia': 'cz', 'slovakia': 'sk', 'hungary': 'hu',
    'romania': 'ro', 'bulgaria': 'bg', 'serbia': 'rs', 'croatia': 'hr',
    'slovenia': 'si', 'bosnia and herzegovina': 'ba', 'north macedonia': 'mk',
    'montenegro': 'me', 'albania': 'al', 'greece': 'gr', 'austria': 'at',
    'switzerland': 'ch', 'ireland': 'ie', 'kazakhstan': 'kz', 'uzbekistan': 'uz',
    'mongolia': 'mn', 'indonesia': 'id', 'malaysia': 'my', 'singapore': 'sg',
    'thailand': 'th', 'vietnam': 'vn', 'philippines': 'ph', 'india': 'in',
    'pakistan': 'pk', 'south africa': 'za', 'morocco': 'ma', 'egypt': 'eg',
    'jordan': 'jo', 'lebanon': 'lb', 'saudi arabia': 'sa', 'uae': 'ae',
    'united arab emirates': 'ae', 'iceland': 'is', 'kosovo': 'xk',
    'hong kong': 'hk', 'malta': 'mt', 'cyprus': 'cy', 'luxembourg': 'lu',
    'belarus': 'by', 'georgia': 'ge', 'armenia': 'am', 'azerbaijan': 'az',
    'moldova': 'md', 'uruguay': 'uy', 'paraguay': 'py', 'bolivia': 'bo',
    'ecuador': 'ec', 'venezuela': 've', 'puerto rico': 'pr', 'cuba': 'cu'
};

/**
 * Sanitize a name for use in file paths
 */
export function sanitizeName(name: string): string {
    if (!name) return 'unknown';
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\-_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Get team logo URL with fallback
 * Prefers WebP format for smaller file sizes, falls back to PNG
 */
export function getTeamLogoUrl(teamName: string): string {
    const slug = sanitizeName(teamName);
    return `${TEAMS_PATH}/${slug}/logo.webp`;
}

/**
 * Get team logo URL with error handling for Next.js Image
 */
export function getTeamLogoUrlWithFallback(teamName: string): {
    src: string;
    fallback: string;
} {
    return {
        src: getTeamLogoUrl(teamName),
        fallback: PLACEHOLDER_LOGO
    };
}

/**
 * Get player image URL with fallback
 */
export function getPlayerImageUrl(playerName: string, teamName: string): string {
    const teamSlug = sanitizeName(teamName);
    const playerSlug = sanitizeName(playerName);
    return `${TEAMS_PATH}/${teamSlug}/players/${playerSlug}.webp`;
}

/**
 * Get player image URL with error handling for Next.js Image
 */
export function getPlayerImageUrlWithFallback(playerName: string, teamName: string): {
    src: string;
    fallback: string;
} {
    return {
        src: getPlayerImageUrl(playerName, teamName),
        fallback: PLACEHOLDER_PLAYER
    };
}

/**
 * Get country flag URL
 */
export function getFlagUrl(country: string): string | null {
    const code = COUNTRY_CODES[country?.toLowerCase()];
    if (!code) return null;
    return `${FLAGS_PATH}/${code}.svg`;
}

/**
 * Get country code from country name
 */
export function getCountryCode(country: string): string | null {
    return COUNTRY_CODES[country?.toLowerCase()] || null;
}

/**
 * Placeholder URLs
 */
export const PLACEHOLDERS = {
    player: PLACEHOLDER_PLAYER,
    staff: PLACEHOLDER_STAFF,
    logo: PLACEHOLDER_LOGO,
} as const;

