/**
 * Project-made trophy art (public/trophy-art), drawn as SVG by
 * scripts/key-art/trophy-svg.ts and rendered to 512² WebP by
 * scripts/key-art/render-key-art.ts. No third-party or generated imagery.
 *
 *   major   ornate lidded gold cup (majors / world finals)
 *   S A B C tier cups: gold, silver, bronze, pewter
 *   league  shield on a plinth (league titles)
 *   award   gold medal on a ribbon (season awards)
 */

export type TrophyArtKind = "major" | "S" | "A" | "B" | "C" | "league" | "award"
export type TrophyMetal = "gold" | "silver" | "bronze" | "pewter"

export interface TrophyArt {
    kind: TrophyArtKind
    /** 512² WebP with transparency — use with next/image or <img>. */
    src: string
    /** The vector source (same art), for large or crisp placements. */
    svg: string
    width: 512
    height: 512
    metal: TrophyMetal
    /** Short accessible description, e.g. "Gold major trophy". */
    label: string
}

const ART: Record<TrophyArtKind, { file: string; metal: TrophyMetal; label: string }> = {
    major: { file: "major", metal: "gold", label: "Gold major trophy" },
    S: { file: "s", metal: "gold", label: "Gold S-tier trophy" },
    A: { file: "a", metal: "silver", label: "Silver A-tier trophy" },
    B: { file: "b", metal: "bronze", label: "Bronze B-tier trophy" },
    C: { file: "c", metal: "pewter", label: "Pewter C-tier trophy" },
    league: { file: "league", metal: "silver", label: "League title shield" },
    award: { file: "award", metal: "gold", label: "Season award medal" },
}

export const TROPHY_ART_KINDS = Object.keys(ART) as TrophyArtKind[]

export function trophyArtFor(kind: TrophyArtKind): TrophyArt {
    const art = ART[kind] ?? ART.C
    const resolved = (ART[kind] ? kind : "C") as TrophyArtKind
    return {
        kind: resolved,
        src: `/trophy-art/${art.file}.webp`,
        svg: `/trophy-art/${art.file}.svg`,
        width: 512,
        height: 512,
        metal: art.metal,
        label: art.label,
    }
}

/**
 * Art kind for a tournament: majors get the major cup, leagues the shield,
 * everything else its tier cup. Accepts "S" or "S_TIER" style tiers; unknown → C.
 */
export function trophyKindForTournament(tier: string | null | undefined, opts: { major?: boolean; league?: boolean } = {}): TrophyArtKind {
    if (opts.major) return "major"
    if (opts.league) return "league"
    const t = String(tier ?? "").trim().toUpperCase().replace(/_TIER$/, "").replace(/^TIER_/, "")
    return t === "S" || t === "A" || t === "B" || t === "C" ? t : "C"
}
