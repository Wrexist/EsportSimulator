/**
 * CS2 round economy for script-v1 matches (legacy-v2 keeps
 * lib/live-match-utils applyRoundEconomy):
 *
 *   win            $3,250; $3,500 for a bomb explosion or a defuse
 *   loss bonus     $1,400 → $3,400 in $500 steps; each loss moves the team
 *                  one level up, each WIN one level DOWN (not a reset).
 *                  Halves and overtime halves start at level 1 ($1,900 for a
 *                  lost pistol round).
 *   time loss      Ts still alive when the clock runs out get no loss bonus
 *   plant          Ts get +$800 each when they planted and lost; planter +$300
 *   defuse         defuser +$300
 *   kills          by weapon: knife 1500, shotguns 900 (XM 600), SMGs 600
 *                  (P90 300), rifles / pistols / grenades 300, AWP 100
 *   CT kill bonus  +$50 to every CT per CT kill (as the legacy rules)
 *   max $16,000; the dead lose their gear; thrown grenades are consumed.
 */

import type { MatchEvent } from "@/types"
import { EconomyManager } from "../../economy-manager"
import { ROUND_ECONOMY_TUNING } from "@/lib/balance-tuning"
import type { PlayerSimulationState } from "../round-outcome"
import { killRewardFor } from "./weapons"

export const CS2_LOSS_LADDER = ROUND_ECONOMY_TUNING.LOSS_BONUS_LADDER
export const CS2_START_LOSS_LEVEL = 1
export const CS2_OVERTIME_START_CASH = 12_500
export const CS2_WIN_REWARD = 3250
export const CS2_OBJECTIVE_WIN_REWARD = 3500
export const CS2_PLANT_LOSS_BONUS = 800
export const CS2_PLANTER_REWARD = 300
export const CS2_DEFUSER_REWARD = 300

export function lossBonusAt(level: number): number {
    return CS2_LOSS_LADDER[Math.max(0, Math.min(CS2_LOSS_LADDER.length - 1, Math.floor(level)))]
}

export function nextLossLevel(level: number, won: boolean): number {
    const max = CS2_LOSS_LADDER.length - 1
    return won ? Math.max(0, level - 1) : Math.min(max, level + 1)
}

const clampCash = (v: number) => Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(Number.isFinite(v) ? v : 0)))

export function applyCs2RoundEconomy(input: {
    homeEconomy: Record<string, PlayerSimulationState>
    awayEconomy: Record<string, PlayerSimulationState>
    winner: "HOME" | "AWAY"
    winType: string
    events: readonly MatchEvent[]
    homeIsCT: boolean
    homeLossLevel: number
    awayLossLevel: number
    utilityUsed?: Readonly<Record<string, readonly string[]>>
}): {
    homeEconomy: Record<string, PlayerSimulationState>
    awayEconomy: Record<string, PlayerSimulationState>
    homeLossLevel: number
    awayLossLevel: number
} {
    const copy = (e: Record<string, PlayerSimulationState>) => Object.fromEntries(Object.entries(e).map(([id, s]) => [id, { ...s, utility: [...(s.utility ?? [])] }]))
    const home = copy(input.homeEconomy)
    const away = copy(input.awayEconomy)
    const sideOf = (id: string): "home" | "away" | null => (id in home ? "home" : id in away ? "away" : null)
    const stateOf = (id: string) => home[id] ?? away[id]

    // Thrown grenades are gone.
    for (const [id, used] of Object.entries(input.utilityUsed ?? {})) {
        const s = stateOf(id)
        if (!s) continue
        for (const kind of used) {
            const k = s.utility.findIndex(u => u === kind || (kind === "molotov" && (u === "incendiary" || u === "fire")))
            if (k >= 0) s.utility.splice(k, 1)
        }
    }

    const homeWon = input.winner === "HOME"
    const dead = new Set<string>()
    let planted = false
    const ctTeam = input.homeIsCT ? home : away
    for (const e of input.events) {
        if (e.type === "KILL" && e.playerId && e.victimId) {
            dead.add(e.victimId)
            const k = stateOf(e.playerId)
            const side = sideOf(e.playerId)
            if (k) k.cash = clampCash(k.cash + killRewardFor(e.weapon ?? k.weapon))
            const killerCT = side === "home" ? input.homeIsCT : side === "away" ? !input.homeIsCT : false
            if (killerCT) for (const s of Object.values(ctTeam)) s.cash = clampCash(s.cash + EconomyManager.getCTTeamKillBonus())
        } else if (e.type === "PLANT") {
            planted = true
            const p = e.playerId ? stateOf(e.playerId) : undefined
            if (p) p.cash = clampCash(p.cash + CS2_PLANTER_REWARD)
        } else if (e.type === "DEFUSE") {
            const p = e.playerId ? stateOf(e.playerId) : undefined
            if (p) p.cash = clampCash(p.cash + CS2_DEFUSER_REWARD)
        }
    }

    const winReward = input.winType === "BOMB_EXPLODED" || input.winType === "BOMB_DEFUSE" ? CS2_OBJECTIVE_WIN_REWARD : CS2_WIN_REWARD
    const settle = (team: Record<string, PlayerSimulationState>, won: boolean, level: number, isCT: boolean) => {
        for (const [id, s] of Object.entries(team)) {
            if (won) { s.cash = clampCash(s.cash + winReward); continue }
            // Ts who survive a round lost on time get nothing.
            if (!isCT && input.winType === "TIME" && !dead.has(id)) continue
            s.cash = clampCash(s.cash + lossBonusAt(level) + (!isCT && planted ? CS2_PLANT_LOSS_BONUS : 0))
        }
    }
    settle(home, homeWon, input.homeLossLevel, input.homeIsCT)
    settle(away, !homeWon, input.awayLossLevel, !input.homeIsCT)

    for (const id of dead) {
        const s = stateOf(id)
        if (!s) continue
        const isCT = sideOf(id) === "home" ? input.homeIsCT : !input.homeIsCT
        s.weapon = isCT ? "usp" : "glock"
        s.hasArmor = false
        s.hasHelmet = false
        s.hasKit = false
        s.utility = []
    }
    return {
        homeEconomy: home, awayEconomy: away,
        homeLossLevel: nextLossLevel(input.homeLossLevel, homeWon),
        awayLossLevel: nextLossLevel(input.awayLossLevel, !homeWon),
    }
}
