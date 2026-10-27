/**
 * Tournament collectibles for the trophy room (C11).
 *
 * Every title unlocks club items for that event, more and rarer at bigger
 * events: an event jersey for any title, a signed poster from B-tier up, a
 * medal and the MVP's signed mousepad from A-tier, a ring, replica trophy,
 * final confetti and the MVP's signed jersey at S-tier. Each S-tier title
 * also has a one-in-four chance of the final's match-worn keyboard; a missed
 * one can come with a later win of the same event.
 *
 * Derived from the club's trophies (no save field), so older careers get
 * their collection at once. Deterministic: the keyboard roll hashes the
 * trophy's tournament id.
 */
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { deriveSeed } from "@/engine/rng"

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY"
export type ItemKind = "jersey" | "poster" | "medal" | "mousepad" | "ring" | "replica" | "confetti" | "signed_jersey" | "keyboard"

export interface CollectibleDef { kind: ItemKind; label: string; rarity: Rarity; chance?: number }

const ITEMS: Record<ItemKind, CollectibleDef> = {
    jersey: { kind: "jersey", label: "Event jersey", rarity: "COMMON" },
    poster: { kind: "poster", label: "Signed team poster", rarity: "UNCOMMON" },
    medal: { kind: "medal", label: "Champions' medal", rarity: "UNCOMMON" },
    mousepad: { kind: "mousepad", label: "MVP's signed mousepad", rarity: "RARE" },
    ring: { kind: "ring", label: "Champions' ring", rarity: "EPIC" },
    replica: { kind: "replica", label: "Replica trophy", rarity: "RARE" },
    confetti: { kind: "confetti", label: "Confetti from the final", rarity: "RARE" },
    signed_jersey: { kind: "signed_jersey", label: "MVP's signed match jersey", rarity: "EPIC" },
    keyboard: { kind: "keyboard", label: "Match-worn keyboard from the final", rarity: "LEGENDARY", chance: 0.25 },
}

/** Items each tier's titles unlock (bigger events add to the smaller ones' set). */
export const TIER_ITEMS: Record<string, ItemKind[]> = {
    QUALIFIER: ["jersey"],
    C_TIER: ["jersey"],
    B_TIER: ["jersey", "poster"],
    A_TIER: ["jersey", "poster", "medal", "mousepad"],
    S_TIER: ["jersey", "poster", "medal", "mousepad", "ring", "replica", "confetti", "signed_jersey", "keyboard"],
}

export const RARITY_ORDER: Rarity[] = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"]
export const RARITY_LABEL: Record<Rarity, string> = { COMMON: "Common", UNCOMMON: "Uncommon", RARE: "Rare", EPIC: "Epic", LEGENDARY: "Legendary" }

export interface Collectible extends CollectibleDef {
    id: string
    eventId: string
    eventName: string
    tier: string
    /** Week of the title that unlocked it. */
    week: number
}

interface TrophyLike { tournamentId?: string; tournamentName?: string; week?: number; tier?: string }

const baseId = (id: string) => id.replace(/_s\d+$/, "")
const displayName = (name: string) => name.replace(/\s+\d{4}$/, "")

/** The calendar's full set: every item every event can unlock (for "x of y"). */
export function collectibleCatalogSize(): number {
    return FULL_TOURNAMENT_CALENDAR.filter(c => c.tier !== "QUALIFIER").reduce((n, c) => n + (TIER_ITEMS[c.tier]?.length ?? 1), 0)
}

/** The club's collection from its trophies, one of each item per event, oldest unlock kept. */
export function collectionFromTrophies(trophies: readonly TrophyLike[] | undefined): Collectible[] {
    const out = new Map<string, Collectible>()
    const sorted = [...(trophies ?? [])].sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
    for (const t of sorted) {
        if (!t.tournamentId) continue
        const eventId = baseId(t.tournamentId)
        const cal = FULL_TOURNAMENT_CALENDAR.find(c => c.id === eventId || c.id === t.tournamentId)
        const tier = t.tier || cal?.tier || "C_TIER"
        const eventName = displayName(t.tournamentName || cal?.name || "Tournament")
        for (const kind of TIER_ITEMS[tier] ?? TIER_ITEMS.C_TIER) {
            const def = ITEMS[kind]
            const id = `${eventId}:${kind}`
            if (out.has(id)) continue
            if (def.chance !== undefined && (deriveSeed(t.tournamentId, "collectible", kind) % 1000) / 1000 >= def.chance) continue
            out.set(id, { ...def, id, eventId, eventName, tier, week: t.week ?? 0 })
        }
    }
    return [...out.values()].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.week - a.week)
}
