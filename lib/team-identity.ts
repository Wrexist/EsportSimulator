import type { TeamBranding } from '@/data/snapshot-types'
import catalog from '@/data/team-identity-catalog.json'
import { PLACEHOLDERS } from '@/lib/asset-utils'
import { getTeamLogoRedesign } from '@/lib/team-logo-redesigns'

export const TEAM_IDENTITY_VERSION = '2026-09-14.v1'
export const TEAM_IDENTITY_CATALOG = catalog as Array<{ id: string; name: string; shortName: string; logoPath: string; branding?: TeamBranding }>
export type TeamIdentityInput = {
    id?: string; name: string; logoPath?: string
    customTeamData?: { logoData?: string }
}
const byId = new Map(TEAM_IDENTITY_CATALOG.map(team => [team.id, team]))
const byName = new Map(TEAM_IDENTITY_CATALOG.map(team => [team.name.toLocaleLowerCase('en-US'), team]))

export function findTeamIdentity(name: string, id?: string) {
    return id ? byId.get(id) : byName.get(name.toLocaleLowerCase('en-US'))
}

/** No source-only references or guessed paths enter the fallback chain. */
export function teamLogoSources(team: TeamIdentityInput): string[] {
    const sources: string[] = []
    if (team.customTeamData?.logoData) sources.push(team.customTeamData.logoData)
    const source = team.logoPath
    if (!source || source === PLACEHOLDERS.logo || /\.original\./i.test(source)) return sources
    // Downloaded legacy raster logos are source references, never release fallbacks.
    if (/^\/assets\/teams\/[^/]+\/logo[^/]*\.(?:png|webp|jpe?g|gif|avif)$/i.test(source)) return sources
    const canonical = team.id ? byId.get(team.id) : undefined
    const isLegacyStock = canonical?.logoPath === source && !team.customTeamData
    if (isLegacyStock) {
        const redesign = getTeamLogoRedesign(team.id, source)
        if (redesign) sources.push(redesign)
        // Other stock legacy files have monograms; the shared letter-free vector is authoritative.
    } else {
        // Explicit mod/user art, including SVG, wins over generated branding.
        sources.push(source)
    }
    return [...new Set(sources)]
}
