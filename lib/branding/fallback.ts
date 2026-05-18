/**
 * Runtime branding fallback.
 *
 * Produces a deterministic `TeamBranding` record from a team ID using the
 * same FNV-1a hash + palette as scripts/branding/extend_branding_all.py, so
 * a team that the script branded offline and a team that this module brands
 * at runtime land on the same colors.
 *
 * Used to:
 *  - backfill branding on existing TeamSaveData when a pre-branding save
 *    is loaded (engine/save-migrations.ts migrateToV7)
 *  - backfill branding on mod-loaded SnapshotTeam records (engine/mod-loader.ts)
 *  - supply colors at render time when a team object somehow reaches the
 *    UI without a branding block populated.
 */

import type { TeamBranding } from "@/data/snapshot-types"

const PALETTE: ReadonlyArray<Omit<TeamBranding, "logoStyle">> = [
    { primaryColor: "#3B82F6", secondaryColor: "#1E3A8A", accentColor: "#FFFFFF" },
    { primaryColor: "#EF4444", secondaryColor: "#7F1D1D", accentColor: "#FFFFFF" },
    { primaryColor: "#10B981", secondaryColor: "#064E3B", accentColor: "#FFFFFF" },
    { primaryColor: "#F59E0B", secondaryColor: "#78350F", accentColor: "#0B0B0B" },
    { primaryColor: "#8B5CF6", secondaryColor: "#3B0764", accentColor: "#FFFFFF" },
    { primaryColor: "#EC4899", secondaryColor: "#831843", accentColor: "#FFFFFF" },
    { primaryColor: "#06B6D4", secondaryColor: "#164E63", accentColor: "#FFFFFF" },
    { primaryColor: "#F97316", secondaryColor: "#7C2D12", accentColor: "#FFFFFF" },
    { primaryColor: "#84CC16", secondaryColor: "#365314", accentColor: "#0B0B0B" },
    { primaryColor: "#14B8A6", secondaryColor: "#134E4A", accentColor: "#FFFFFF" },
    { primaryColor: "#A855F7", secondaryColor: "#581C87", accentColor: "#FFFFFF" },
    { primaryColor: "#FACC15", secondaryColor: "#1F2937", accentColor: "#0B0B0B" },
    { primaryColor: "#22D3EE", secondaryColor: "#0E7490", accentColor: "#FFFFFF" },
    { primaryColor: "#DB2777", secondaryColor: "#500724", accentColor: "#FFFFFF" },
    { primaryColor: "#DC2626", secondaryColor: "#0B0B0B", accentColor: "#FFFFFF" },
    { primaryColor: "#0EA5E9", secondaryColor: "#0C4A6E", accentColor: "#FFFFFF" },
]

// Same buckets as the Python generator, so style choice stays stable
// across runtime and offline regeneration.
type Style = "octagon_mono" | "hex_shield" | "wordmark_block" | "disc_mono"
const STYLE_BUCKETS: ReadonlyArray<Style> = [
    "octagon_mono", "octagon_mono", "octagon_mono", "octagon_mono",
    "hex_shield", "hex_shield", "hex_shield",
    "wordmark_block", "wordmark_block", "wordmark_block",
    "disc_mono", "disc_mono",
]

const STYLE_TO_KIND: Record<Style, TeamBranding["logoStyle"]> = {
    octagon_mono: "monogram",
    hex_shield: "monogram",
    wordmark_block: "wordmark",
    disc_mono: "monogram",
}

function fnv1a(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

/**
 * Pick a deterministic branding record for a team that doesn't already
 * have one. Same `id` always returns the same record.
 */
export function defaultBrandingFor(id: string): TeamBranding {
    const h = fnv1a(id || "")
    const palette = PALETTE[h % PALETTE.length]
    const style = STYLE_BUCKETS[(h >>> 8) % STYLE_BUCKETS.length]
    return {
        primaryColor: palette.primaryColor,
        secondaryColor: palette.secondaryColor,
        accentColor: palette.accentColor,
        logoStyle: STYLE_TO_KIND[style],
    }
}

/**
 * Pick legible text color (black / white) for a given hex background.
 * Mirrors the helper in components/tournament/TournamentStandings.tsx so
 * any UI rendering a chip / pill on top of `primaryColor` reaches the
 * same contrast decision.
 */
export function textOnBrand(bgHex: string | undefined): string {
    if (!bgHex || !/^#?[0-9a-f]{6}$/i.test(bgHex)) return "#FFFFFF"
    const hex = bgHex.replace(/^#/, "")
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return L > 0.55 ? "#0B0B0B" : "#FFFFFF"
}
