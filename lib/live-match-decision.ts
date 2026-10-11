/**
 * Between-round decision card data (Phase 3, stream K).
 *
 * `previewDecision` runs the next round's buy phase for each manager call
 * exactly as `playLegacyRound` will (same round RNG, same order: home buys
 * first, the same loadouts and economy-style thresholds), on copies of the
 * economies. So the card's per-player costs and weapons are what the call
 * really buys, and "Recommended" is the call the engine makes on its own
 * (auto tactics / no call), with the cash thresholds it uses.
 *
 * Nothing is mutated; nothing here changes how a round is played.
 */

import type { CustomTactics, SimState } from "@/types"
import { EconomyManager } from "@/engine/economy-manager"
import { createMatchRNG } from "@/engine/rng"
import { legacyRoundSeed, MANAGER_STRATEGIES, type LegacySeriesContext, type ManagerStrategy } from "@/engine/match/legacy-series"
import type { BuyStrategy } from "@/engine/match/buy-phase"
import type { PlayerSimulationState } from "@/engine/match/round-outcome"
import { managedLoadout } from "@/engine/match/manager-controls"
import { SCRIPT_ENGINE_VERSION } from "@/engine/match/engine-version"
import { ECON_OVERTIME_START_CASH, ECON_WIN_REWARD, lossBonusAt } from "@/engine/match/round-sim/economy"
import { ROUND_ECONOMY_TUNING } from "@/lib/balance-tuning"

export interface BuyPreviewPlayer {
    id: string
    /** Cash before the buy. */
    cash: number
    spend: number
    weapon: string
    armor: boolean
    helmet: boolean
    kit: boolean
    utility: string[]
}

export interface BuyPreviewOption {
    id: ManagerStrategy
    players: BuyPreviewPlayer[]
    total: number
    /** Buys exactly what a cheaper call buys (the button is redundant). */
    sameAs?: ManagerStrategy
}

export type EconomyStyle = "standard" | "force" | "eco"

export interface DecisionPreview {
    round: number
    side: "CT" | "T"
    overtime: boolean
    teamCash: number
    avgCash: number
    /** The call the engine makes without a manager call. */
    auto: BuyStrategy
    style: EconomyStyle
    /** Why `auto` (only thresholds and amounts the engine uses). */
    reason: string
    options: BuyPreviewOption[]
    /** script-v1: loss bonus paid per player if this round is lost. */
    lossBonus?: number
    /** script-v1: loss-bonus level (0–4). */
    lossLevel?: number
    /** script-v1: win reward per player (elimination / time; bomb outcomes pay $3,500). */
    winReward?: number
}

export const STRATEGY_LABEL: Record<ManagerStrategy, string> = {
    ECO: "Save",
    FORCE: "Force buy",
    SEMIBUY: "Half buy",
    FULL: "Full buy",
    "DOUBLE AWP": "2xAWP",
}

const BUY_SHORT: Record<string, string> = { PISTOL: "Pistol", ECO: "Save", FORCE: "Force", SEMIBUY: "Half", FULL: "Full", "DOUBLE AWP": "2×AWP" }
export const buyShortLabel = (id: string | undefined) => (id ? BUY_SHORT[id] ?? id : "—")

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

function cloneEconomy(ids: readonly string[], economy: Record<string, Partial<PlayerSimulationState>> | undefined, isCT: boolean): Record<string, PlayerSimulationState> {
    return Object.fromEntries(ids.map(id => {
        const e = economy?.[id]
        const cash = typeof e?.cash === "number" && Number.isFinite(e.cash) ? Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(e.cash))) : EconomyManager.ROUND_START_CASH
        return [id, {
            id, cash, weapon: typeof e?.weapon === "string" ? e.weapon : isCT ? "usp" : "glock",
            hasArmor: !!e?.hasArmor, hasHelmet: !!e?.hasHelmet, hasKit: !!e?.hasKit, utility: Array.isArray(e?.utility) ? [...e!.utility] : [],
        }]
    }))
}

const avg = (econ: Record<string, PlayerSimulationState>) => {
    const v = Object.values(econ)
    return v.length ? v.reduce((s, p) => s + p.cash, 0) / v.length : 0
}

const sameLoadout = (a: BuyPreviewOption, b: BuyPreviewOption) => a.players.every((p, i) => {
    const q = b.players[i]
    return q && p.weapon === q.weapon && p.armor === q.armor && p.helmet === q.helmet && p.kit === q.kit && p.spend === q.spend && p.utility.join() === q.utility.join()
})

/** Cash lines of the engine's own buy call (EconomyManager.getTeamStrategy). */
export function buyLines(style: EconomyStyle): { force: number; half: number; full: number } {
    const mod = style === "force" ? -500 : style === "eco" ? 500 : 0
    const T = ROUND_ECONOMY_TUNING
    return { force: T.FORCE_MIN_AVG_CASH + mod, half: T.SEMIBUY_MIN_AVG_CASH + mod, full: T.FULL_MIN_AVG_CASH + mod }
}

/**
 * The managed team's next-round decision, or null when there is none to
 * make (no managed team in this match, a pistol round, the series is over).
 */
export function previewDecision(ctx: LegacySeriesContext, sim: SimState, customTactics?: CustomTactics): DecisionPreview | null {
    const managedHome = !!ctx.managedTeamId && ctx.managedTeamId === ctx.home.team.id
    const managedAway = !!ctx.managedTeamId && ctx.managedTeamId === ctx.away.team.id
    if (!managedHome && !managedAway) return null
    const mapIndex = sim.currentMapIndex
    if (!ctx.maps[mapIndex]) return null
    const roundNum = sim.currentRound
    const pistol = !sim.isOvertime && (roundNum === 1 || roundNum === 13)
    if (pistol) return null
    const homeIsCT = sim.homeStartsCT
    const homeIds = ctx.home.players.map(p => p.id)
    const awayIds = ctx.away.players.map(p => p.id)
    const tactics = customTactics ?? ctx.customTactics
    const auto = (econ: Record<string, PlayerSimulationState>, style: EconomyStyle | undefined): BuyStrategy =>
        sim.isOvertime ? "FULL" : EconomyManager.getTeamStrategy(avg(econ), style)

    const own = managedHome ? ctx.home : ctx.away
    const ownIds = managedHome ? homeIds : awayIds
    const ownIsCT = managedHome ? homeIsCT : !homeIsCT
    const style: EconomyStyle = own.team.economyStyle === "force" || own.team.economyStyle === "eco" ? own.team.economyStyle : "standard"

    const run = (call: ManagerStrategy): BuyPreviewOption => {
        const rng = createMatchRNG(legacyRoundSeed(ctx.seed, ctx.matchId ?? "", mapIndex, roundNum))
        const hEcon = cloneEconomy(homeIds, sim.homeEconomy, homeIsCT)
        const aEcon = cloneEconomy(awayIds, sim.awayEconomy, !homeIsCT)
        const before = managedHome ? cloneEconomy(homeIds, sim.homeEconomy, homeIsCT) : cloneEconomy(awayIds, sim.awayEconomy, !homeIsCT)
        const homeStrategy: BuyStrategy = managedHome ? call : auto(hEcon, ctx.home.team.economyStyle as EconomyStyle | undefined)
        ctx.engine.performBuyPhase(ctx.home.players, hEcon, homeStrategy, homeIsCT, rng, managedLoadout(tactics, ctx.home.team.id, ctx.managedTeamId))
        if (managedAway) {
            ctx.engine.performBuyPhase(ctx.away.players, aEcon, call, !homeIsCT, rng, managedLoadout(tactics, ctx.away.team.id, ctx.managedTeamId))
        }
        const after = managedHome ? hEcon : aEcon
        const players = ownIds.map(id => {
            const b = before[id], a = after[id]
            return { id, cash: b.cash, spend: b.cash - a.cash, weapon: a.weapon, armor: a.hasArmor, helmet: a.hasHelmet, kit: a.hasKit, utility: [...(a.utility ?? [])] }
        })
        return { id: call, players, total: players.reduce((s, p) => s + p.spend, 0) }
    }

    const options = MANAGER_STRATEGIES.map(run)
    for (let i = 1; i < options.length; i++) {
        const twin = options.slice(0, i).find(o => sameLoadout(o, options[i]))
        if (twin) options[i].sameAs = twin.id
    }

    const startEcon = cloneEconomy(ownIds, managedHome ? sim.homeEconomy : sim.awayEconomy, ownIsCT)
    const teamCash = Object.values(startEcon).reduce((s, p) => s + p.cash, 0)
    const avgCash = teamCash / Math.max(1, ownIds.length)
    const autoCall = auto(startEcon, style)

    const script = ctx.engineVersion === SCRIPT_ENGINE_VERSION
    const lossLevel = script ? (managedHome ? sim.homeLossLevel : sim.awayLossLevel) : undefined
    const lossBonus = script && typeof lossLevel === "number" ? lossBonusAt(lossLevel) : undefined

    const reason = recommendReason({ auto: autoCall, avgCash, style, overtime: sim.isOvertime, lossBonus, saveOption: options[0] })
    return {
        round: roundNum, side: ownIsCT ? "CT" : "T", overtime: sim.isOvertime, teamCash, avgCash: Math.floor(avgCash),
        auto: autoCall, style, reason, options,
        ...(lossBonus !== undefined ? { lossBonus, lossLevel } : {}),
        ...(script ? { winReward: ECON_WIN_REWARD } : {}),
    }
}

function recommendReason(a: { auto: BuyStrategy; avgCash: number; style: EconomyStyle; overtime: boolean; lossBonus?: number; saveOption: BuyPreviewOption }): string {
    const lines = buyLines(a.style)
    const avgText = `Avg ${money(a.avgCash)}`
    const styleText = a.style === "standard" ? "" : ` (${a.style} economy style)`
    if (a.overtime) return `Overtime: everyone starts each half with ${money(ECON_OVERTIME_START_CASH)}, so the engine full-buys.`
    switch (a.auto) {
        case "ECO": {
            if (a.lossBonus === undefined) return `${avgText} is under the ${money(lines.force)} force-buy line${styleText}.`
            const left = a.saveOption.players.reduce((s, p) => s + p.cash - p.spend, 0) / Math.max(1, a.saveOption.players.length)
            const next = left + a.lossBonus
            return `${avgText} is under the ${money(lines.force)} force-buy line${styleText}. Saving leaves avg ${money(next)} next round even after a loss (+${money(a.lossBonus)} loss bonus; full-buy line ${money(lines.full)}).`
        }
        case "FORCE": return `${avgText} is between the ${money(lines.force)} force line and the ${money(lines.half)} half-buy line${styleText}.`
        case "SEMIBUY": return `${avgText} is between the ${money(lines.half)} half-buy line and the ${money(lines.full)} full-buy line${styleText}.`
        case "FULL": return `${avgText} clears the ${money(lines.full)} full-buy line${styleText}.`
        case "PISTOL": return `${avgText} is $800 or less: the engine buys pistols and armour only.`
        default: return `${avgText}.`
    }
}
