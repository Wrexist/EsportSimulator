/**
 * Weapon model for the script-v1 round resolver.
 *
 * Every economy weapon id (engine/economy-manager.ts WEAPONS) maps to a duel
 * class. A class carries its duel power (rating points), how much an
 * opponent's kevlar / helmet blunts it, the chip damage it deals when its
 * holder loses a duel but lands shots first, and its headshot share.
 *
 * Numbers are rating points on the duel scale (see duel.ts DUEL_SCALE): a
 * gap of DUEL_SCALE points is a 73/27 duel.
 */

export type WeaponClass = "awp" | "scout" | "rifle" | "rifleB" | "smg" | "heavy" | "deagle" | "pistolB" | "pistol" | "knife"

export interface WeaponClassSpec {
    /** Duel power when both players are armoured. */
    power: number
    /** Lost when the opponent wears kevlar. */
    vsKevlar: number
    /** Lost when the opponent wears a helmet. */
    vsHelmet: number
    /** Chip damage range dealt by a losing holder of this weapon. */
    chip: readonly [number, number]
    /** Base headshot share of this weapon's kills. */
    hs: number
    /** Attribute that scales aim with this weapon. */
    skill: "rifle" | "awp" | "pistol" | "mixed"
}

export const WEAPON_CLASSES: Record<WeaponClass, WeaponClassSpec> = {
    awp: { power: 21, vsKevlar: 0, vsHelmet: 0, chip: [35, 80], hs: 0.12, skill: "awp" },
    scout: { power: 10, vsKevlar: 2, vsHelmet: 1, chip: [30, 70], hs: 0.45, skill: "awp" },
    rifle: { power: 18, vsKevlar: 2, vsHelmet: 1, chip: [22, 80], hs: 0.54, skill: "rifle" },
    rifleB: { power: 13, vsKevlar: 3, vsHelmet: 2, chip: [20, 70], hs: 0.5, skill: "rifle" },
    smg: { power: 12, vsKevlar: 5, vsHelmet: 2, chip: [15, 60], hs: 0.4, skill: "mixed" },
    heavy: { power: 6, vsKevlar: 4, vsHelmet: 0, chip: [20, 75], hs: 0.22, skill: "mixed" },
    deagle: { power: 6, vsKevlar: 2, vsHelmet: 2, chip: [25, 70], hs: 0.66, skill: "pistol" },
    pistolB: { power: 2, vsKevlar: 5, vsHelmet: 3, chip: [12, 50], hs: 0.58, skill: "pistol" },
    pistol: { power: 0, vsKevlar: 7, vsHelmet: 4, chip: [10, 45], hs: 0.62, skill: "pistol" },
    knife: { power: -30, vsKevlar: 0, vsHelmet: 0, chip: [20, 40], hs: 0, skill: "mixed" },
}

const CLASS_BY_ID: Record<string, WeaponClass> = {
    awp: "awp", ssg08: "scout", scar20: "awp", g3sg1: "awp",
    ak47: "rifle", m4a4: "rifle", m4a1s: "rifle", m4a1: "rifle", aug: "rifle", sg553: "rifle",
    galil: "rifleB", galilar: "rifleB", famas: "rifleB",
    mac10: "smg", mp9: "smg", mp7: "smg", mp5sd: "smg", ump45: "smg", ppbizon: "smg", bizon: "smg", p90: "smg",
    nova: "heavy", xm1014: "heavy", mag7: "heavy", sawedoff: "heavy",
    deagle: "deagle", r8: "deagle",
    p250: "pistolB", tec9: "pistolB", fiveseven: "pistolB", cz75: "pistolB", cz75a: "pistolB", dualies: "pistolB",
    glock: "pistol", usp: "pistol", usps: "pistol", p2000: "pistol",
}

const cache = new Map<string, WeaponClass>()

/** Duel class of an economy weapon id ("ak47", "AWP", "usp_s", …); unknown ids count as a basic pistol. */
export function weaponClassOf(weapon: string | undefined): WeaponClass {
    const key = weapon ?? ""
    const hit = cache.get(key)
    if (hit) return hit
    const id = key.toLowerCase().replace(/[^a-z0-9]/g, "")
    const cls = CLASS_BY_ID[id] ?? (id.startsWith("knife") ? "knife" : "pistol")
    cache.set(key, cls)
    return cls
}

/** Long-range weapons that profit from holding an angle. */
export const isSniperClass = (c: WeaponClass) => c === "awp" || c === "scout"

/** Primary weapons a player would try to save. */
export function isSaveWorthy(c: WeaponClass): boolean {
    return c === "awp" || c === "rifle" || c === "rifleB"
}

/**
 * Kill reward by the killing weapon, CS2 rules: knife 1500, shotguns 900
 * (XM1014 600), SMGs 600 (P90 300), rifles/pistols 300 (CZ75 100), AWP 100,
 * grenades 300.
 */
export function killRewardFor(weapon: string | undefined): number {
    const id = (weapon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    if (id === "he" || id === "molotov" || id === "incendiary" || id === "hegrenade") return 300
    if (id === "p90") return 300
    if (id === "xm1014") return 600
    if (id === "cz75" || id === "cz75a") return 100
    switch (weaponClassOf(id)) {
        case "knife": return 1500
        case "heavy": return 900
        case "smg": return 600
        case "awp": return 100
        default: return 300
    }
}
