import { PLACEHOLDERS } from "@/lib/asset-utils"
import { pickPooledPortrait } from "@/lib/safe-branding/portrait-pool"
import portraitAliases from "@/data/portrait-asset-aliases.json"
import portraitIdentities from "@/data/player-portrait-identities.json"
const stockPortraits = new Map<string, string>(Object.entries(portraitIdentities))

/** Correct only bundled stock assignments; never override explicit mod/custom art. */
export function stockPlayerPortrait(src?: string | null, playerId?: string): string | null | undefined {
    const stock = !src || src === PLACEHOLDERS.player || /^\/(?:branding\/portraits\/|assets\/teams\/[^/]+\/players\/)/i.test(src)
    return stock && playerId ? stockPortraits.get(playerId) || src : src
}

/** Old saves may reference archived source portraits; user/mod assets stay explicit. */
export function migrateLegacyPortraitSource(src?: string | null, playerId?: string): string | null | undefined {
    src = stockPlayerPortrait(src, playerId)
    if (!src) return src
    const retained = (portraitAliases as Record<string, string>)[src]
    if (retained) return retained
    if (/^\/assets\/teams\/[^/]+\/players\//i.test(src)) return pickPooledPortrait(playerId || src)
    return src
}

/** Keep an authored portrait; resolve absent or failed sources by permanent player ID. */
export function playerPortraitSource(src?: string | null, playerId?: string, failedSource?: string | null): string | null {
    src = migrateLegacyPortraitSource(src, playerId)
    const missing = !src || src === PLACEHOLDERS.player || src.endsWith(".svg") || src.includes("/legends/")
    if (src && !missing && src !== failedSource) return src
    return playerId ? pickPooledPortrait(playerId) : null
}
