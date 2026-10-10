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
    performBuyPhase(players, economy, strategy, isCT, rng, customTactics)
    if (strategy === "PISTOL" || strategy === "ECO") return
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
