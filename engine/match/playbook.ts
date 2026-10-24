/**
 * G1: the manager's playbook — named calls per map, side and buy.
 *
 * A call fixes what the round plan (round-sim choosePlan) would otherwise
 * roll: the T strategy and site, or the CT setup. The routes, utility and
 * timings are the ones the engine already plays for that plan. "Auto" (no
 * entry) leaves the IGL to mix calls as before.
 *
 * Fixed calls are predictable: every time a T call repeats on a map, the
 * opponent reads it more often, and a CT stack that keeps sitting on one
 * site gets hit on the other.
 */

import type { CtSetup, SiteId, TStrategy } from "./round-script-types"

export type PlaySituation = "pistol" | "force" | "full"
export type TCallStrategy = Exclude<TStrategy, "eco">

export interface TCall { strategy: TCallStrategy; site?: SiteId }

export interface MapPlaybook {
    t?: Partial<Record<PlaySituation, TCall>>
    ct?: Partial<Record<PlaySituation, CtSetup>>
}

/** Map id → that map's calls. */
export type Playbook = Partial<Record<string, MapPlaybook>>

export const PLAY_SITUATIONS: readonly PlaySituation[] = ["pistol", "force", "full"]
export const T_CALL_STRATEGIES: readonly TCallStrategy[] = ["default", "execute", "split", "fake", "rush"]
export const CT_SETUPS: readonly CtSetup[] = ["2-1-2", "stack-A", "stack-B", "aggressive"]

export const SITUATION_LABEL: Record<PlaySituation, string> = { pistol: "Pistol round", force: "Force / half buy", full: "Full buy" }
/** Plan names, shared with the Map data screen (which adds the eco plan). */
export const T_CALL_LABEL: Record<TCallStrategy, string> = { default: "Default", execute: "Execute", split: "Split", fake: "Fake", rush: "Rush" }
export const CT_SETUP_LABEL: Record<CtSetup, string> = { "2-1-2": "2-1-2", "stack-A": "Stack A", "stack-B": "Stack B", aggressive: "Aggressive mid" }
export const T_CALL_HINT: Record<TCallStrategy, string> = {
    default: "Spread out, take map control, hit late",
    execute: "Full utility on one site around the middle of the round",
    split: "Hit one site from two sides, late",
    fake: "Show the other site, then rotate onto this one",
    rush: "All five onto the site at once",
}
export const CT_SETUP_HINT: Record<CtSetup, string> = {
    "2-1-2": "Two on each site, one in the middle",
    "stack-A": "Three on A, one on B",
    "stack-B": "Three on B, one on A",
    aggressive: "2-1-2 with one player pushing for an early pick",
}

/** Buy → playbook situation. A T eco is always a save or an eco rush, so it has no call; a CT eco plays its force setup. */
export function playSituation(buy: "pistol" | "eco" | "force" | "half" | "full", side: "T" | "CT"): PlaySituation | null {
    if (buy === "pistol") return "pistol"
    if (buy === "full") return "full"
    if (buy === "eco") return side === "CT" ? "force" : null
    return "force"
}

/** Key a T call's repeats are counted under (site-free calls count apart from site calls). */
export function tCallKey(call: TCall): string {
    return `${call.strategy}:${call.site ?? "any"}`
}

/** Calls the round plan takes from the playbook this round (round-sim SimInput.calls). */
export interface RoundCalls {
    /** The T side's call and how often it already ran on this map. */
    t?: TCall & { seen: number }
    /** The CT side's setup and how often it already stacked each site on this map. */
    ct?: { setup: CtSetup; stacks: Record<SiteId, number> }
}

const STRATEGIES = new Set<string>(T_CALL_STRATEGIES)
const SETUPS = new Set<string>(CT_SETUPS)
const SITUATIONS = new Set<string>(PLAY_SITUATIONS)

/** Keeps only valid entries (saves, share codes). */
export function sanitizePlaybook(value: unknown): Playbook {
    const out: Playbook = {}
    if (!value || typeof value !== "object") return out
    for (const [mapId, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") continue
        const src = raw as { t?: Record<string, unknown>; ct?: Record<string, unknown> }
        const map: MapPlaybook = {}
        for (const [sit, call] of Object.entries(src.t ?? {})) {
            const c = call as Partial<TCall> | undefined
            if (!SITUATIONS.has(sit) || !c || !STRATEGIES.has(c.strategy as string)) continue
            map.t = { ...map.t, [sit]: { strategy: c.strategy as TCallStrategy, ...(c.site === "A" || c.site === "B" ? { site: c.site } : {}) } }
        }
        for (const [sit, setup] of Object.entries(src.ct ?? {})) {
            if (!SITUATIONS.has(sit) || !SETUPS.has(setup as string)) continue
            map.ct = { ...map.ct, [sit]: setup as CtSetup }
        }
        if (map.t || map.ct) out[mapId] = map
    }
    return out
}

// ─── G12: share codes ──────────────────────────────────────────────────────
//
// "PB1 Mirage:r.r.eA/2.g.g Nuke:-.-.e/-.-.A" — one block per map with calls,
// T slots then CT slots in PLAY_SITUATIONS order. T: strategy letter plus an
// optional site, "-" for the IGL. CT: 2 (2-1-2), A / B (stack), g (aggressive).

const CODE_PREFIX = "PB1"
const T_LETTER: Record<TCallStrategy, string> = { default: "d", execute: "e", split: "s", fake: "f", rush: "r" }
const CT_LETTER: Record<CtSetup, string> = { "2-1-2": "2", "stack-A": "A", "stack-B": "B", aggressive: "g" }
const LETTER_T = Object.fromEntries(Object.entries(T_LETTER).map(([k, v]) => [v, k])) as Record<string, TCallStrategy>
const LETTER_CT = Object.fromEntries(Object.entries(CT_LETTER).map(([k, v]) => [v, k])) as Record<string, CtSetup>

export function encodePlaybook(playbook: Playbook): string {
    const blocks: string[] = []
    for (const [mapId, book] of Object.entries(sanitizePlaybook(playbook))) {
        if (!book || /[\s:/.]/.test(mapId)) continue
        const t = PLAY_SITUATIONS.map(s => { const c = book.t?.[s]; return c ? T_LETTER[c.strategy] + (c.site ?? "") : "-" }).join(".")
        const ct = PLAY_SITUATIONS.map(s => { const c = book.ct?.[s]; return c ? CT_LETTER[c] : "-" }).join(".")
        blocks.push(`${mapId}:${t}/${ct}`)
    }
    return [CODE_PREFIX, ...blocks].join(" ")
}

/** Reads a share code; null when it is not one. Unknown maps are kept only when `maps` is not given. */
export function decodePlaybook(code: string, maps?: readonly string[]): Playbook | null {
    const parts = code.trim().split(/\s+/)
    if (parts[0] !== CODE_PREFIX) return null
    const out: Playbook = {}
    for (const block of parts.slice(1)) {
        const m = /^([^:/.\s]+):([^/]*)\/(.*)$/.exec(block)
        if (!m) return null
        const [, mapId, tPart, ctPart] = m
        const known = maps?.find(x => x.toLowerCase() === mapId.toLowerCase())
        if (maps && !known) continue
        const tSlots = tPart.split("."), ctSlots = ctPart.split(".")
        if (tSlots.length !== PLAY_SITUATIONS.length || ctSlots.length !== PLAY_SITUATIONS.length) return null
        const book: MapPlaybook = {}
        for (const [i, sit] of PLAY_SITUATIONS.entries()) {
            const ts = tSlots[i], cs = ctSlots[i]
            if (ts !== "-") {
                const strategy = LETTER_T[ts[0]]
                const site = ts.slice(1)
                if (!strategy || (site && site !== "A" && site !== "B")) return null
                book.t = { ...book.t, [sit]: { strategy, ...(site ? { site: site as SiteId } : {}) } }
            }
            if (cs !== "-") {
                const setup = LETTER_CT[cs]
                if (!setup) return null
                book.ct = { ...book.ct, [sit]: setup }
            }
        }
        if (book.t || book.ct) out[known ?? mapId] = book
    }
    return out
}
