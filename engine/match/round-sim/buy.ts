/**
 * script-v1 buy phase: the shared weapon / armour / kit logic
 * (engine/match/buy-phase.ts) plus grenades. AI teams used to buy none;
 * now every player without an explicit utility plan buys a role-based set
 * with the money left after the gun:
 *
 *   support  smoke, flash, flash, molotov      igl    smoke, flash, molotov, HE
 *   entry    flash, flash, HE, smoke           awp    smoke, flash
 *   rifler   smoke, flash, HE, molotov
 *
 * Force buys take one or two cheap grenades, ecos and pistol rounds none.
 * A managed loadout with a non-empty utility list is bought exactly as set
 * (by performBuyPhase); an empty list means "automatic".
 * CS rules: 4 grenades max, 2 flashes, 1 of each other kind.
 */

import type { CustomTactics, PlayerLoadout, TacticalStrategy } from "@/types"
import type { SeededRNG } from "../../rng"
import { WEAPONS } from "../../economy-manager"
import { performBuyPhase, type BuyStrategy } from "../buy-phase"
import type { PlayerSimulationState } from "../round-outcome"
import { roleOf, type SimRole } from "./profile"

type Nade = "smoke" | "flash" | "molotov" | "he"

const PLAN: Record<SimRole, Nade[]> = {
    support: ["smoke", "flash", "flash", "molotov"],
    igl: ["smoke", "flash", "molotov", "he"],
    entry: ["flash", "flash", "he", "smoke"],
    awp: ["smoke", "flash"],
    rifler: ["smoke", "flash", "he", "molotov"],
}

const FORCE_PLAN: Record<SimRole, Nade[]> = {
    support: ["flash", "smoke"],
    igl: ["smoke", "flash"],
    entry: ["flash"],
    awp: ["flash"],
    rifler: ["flash"],
}

export function grenadePrice(kind: string, isCT: boolean): number {
    switch (kind) {
        case "flash": return 200
        case "smoke": return 300
        case "he": return 300
        case "molotov": return isCT ? 600 : 400
        default: return 0
    }
}

const LIMIT: Record<Nade, number> = { flash: 2, smoke: 1, molotov: 1, he: 1 }

function explicitLoadout(customTactics: CustomTactics | undefined, strategy: BuyStrategy, isCT: boolean, slot: number): PlayerLoadout | undefined {
    const forStrategy = customTactics ? customTactics[strategy as keyof CustomTactics] : undefined
    const tactic: TacticalStrategy | undefined = forStrategy?.[isCT ? "ct" : "t"]
    return tactic?.playerLoadouts?.find(l => l.slotIndex === slot)
}

export function scriptBuyPhase(
    players: { id: string; role: string }[],
    economy: Record<string, PlayerSimulationState>,
    strategy: BuyStrategy,
    isCT: boolean,
    rng: SeededRNG,
    customTactics?: CustomTactics,
): void {
    const before = new Map(players.map(p => [p.id, economy[p.id]?.weapon]))
    performBuyPhase(players, economy, strategy, isCT, rng, customTactics)
    if (strategy === "PISTOL" || strategy === "ECO") return
    if (strategy === "FULL" || strategy === "DOUBLE AWP") {
        keepSavedAwps(players, economy, before, strategy === "DOUBLE AWP" ? 2 : 1)
        dropRifles(players, economy, isCT, customTactics, strategy)
    }
    players.forEach((p, slot) => {
        const state = economy[p.id]
        if (!state) return
        const loadout = explicitLoadout(customTactics, strategy, isCT, slot)
        if (loadout?.utility && loadout.utility.length > 0) return
        const plan = (strategy === "FORCE" ? FORCE_PLAN : PLAN)[roleOf(p.role)]
        const held = state.utility ?? (state.utility = [])
        for (const kind of plan) {
            if (held.length >= 4) break
            if (held.filter(u => u === kind).length >= LIMIT[kind]) continue
            const cost = grenadePrice(kind, isCT)
            if (state.cash < cost) continue
            state.cash -= cost
            held.push(kind)
        }
    })
}

/**
 * An AWP saved from the last round counts toward the team's AWPs: an AWP
 * bought on top of it (beyond the plan's one, or two on a double-AWP buy)
 * goes back, and the buyer takes a rifle instead.
 */
function keepSavedAwps(players: { id: string }[], economy: Record<string, PlayerSimulationState>, before: Map<string, string | undefined>, allowed: number): void {
    const awp = WEAPONS.AWP
    const held = players.filter(p => economy[p.id]?.weapon === awp.id)
    let extra = held.length - allowed
    for (const p of held) {
        if (extra <= 0) break
        const st = economy[p.id]
        const had = before.get(p.id)
        if (!st || had === awp.id) continue
        st.cash += awp.price
        st.weapon = had ?? st.weapon
        extra--
    }
}

/**
 * On a full buy, a teammate with money to spare buys a rifle for a mate who
 * cannot afford one (a "drop"): the richest player pays, keeping enough for
 * their own armour and grenades. Managed per-player loadouts are left alone.
 */
function dropRifles(players: { id: string; role: string }[], economy: Record<string, PlayerSimulationState>, isCT: boolean, customTactics: CustomTactics | undefined, strategy: BuyStrategy): void {
    const rifle = isCT ? WEAPONS.M4A4 : WEAPONS.AK47
    players.forEach((p, slot) => {
        const st = economy[p.id]
        if (!st || explicitLoadout(customTactics, strategy, isCT, slot)) return
        const w = WEAPONS[st.weapon.toUpperCase()]
        if (w && (w.type === "RIFLE" || w.type === "SNIPER")) return
        const giver = players
            .filter(q => q.id !== p.id && economy[q.id])
            .sort((a, b) => economy[b.id].cash - economy[a.id].cash)[0]
        const gs = giver ? economy[giver.id] : undefined
        if (!gs || gs.cash < rifle.price + DROP_RESERVE) return
        gs.cash -= rifle.price
        st.weapon = rifle.id
        if (!st.hasArmor && st.cash >= 1000) { st.cash -= 1000; st.hasArmor = true; st.hasHelmet = true }
    })
}

/** What a player keeps after buying a teammate's rifle (their own armour and grenades). */
const DROP_RESERVE = 1400
