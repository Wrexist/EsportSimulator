/**
 * Adapter from what the live match / legacy series already has for a round
 * (RoundResult, lineups with roles, post-buy loadouts) to `RoundScriptInput`.
 *
 * Live screen: `useLiveMatch` holds `step.round` + `step.preRound` (bought
 * utility) when a round starts; the page holds the RoundResult on
 * `matchData.current.result.maps[i].rounds`, the lineups and the roster
 * (weapon / kit, no utility).
 */

import type { RoundResult } from "@/types/match"
import { deriveSeed } from "../rng"
import type { BuyLevel, RoundScriptInput, RoundScriptPlayer, Side, UtilityKind } from "./round-script-types"

export interface ResolverTeamLineup {
    teamId: string
    playstyle?: string
    players: readonly { id: string; role?: string }[]
}

export interface ResolverLoadout {
    weapon?: string
    utility?: readonly string[]
    hasKit?: boolean
}

export interface ResolverRoundSource {
    mapId: string
    /** Match seed; the script seed is derived from it plus match id, map index and round. */
    seed: number
    matchId?: string
    mapIndex?: number
    round: Pick<RoundResult, "roundNumber" | "winner" | "winType" | "ctTeam" | "events"> & Partial<Pick<RoundResult, "buys" | "playerEconomy">>
    home: ResolverTeamLineup
    away: ResolverTeamLineup
    /** Post-buy loadouts by player id: `LegacyRoundStep.preRound.home/away` (has utility) or the live roster. */
    loadouts?: Readonly<Record<string, ResolverLoadout | undefined>>
}

/** Per-round script seed, independent of the resolver's round stream. */
export function roundScriptSeed(matchSeed: number, matchId: string, mapIndex: number, round: number): number {
    return deriveSeed(matchSeed, matchId, "round-script", mapIndex, round)
}

const BUY_LEVELS: Record<string, BuyLevel> = {
    PISTOL: "pistol", ECO: "eco", FORCE: "force", SEMIBUY: "half", FULL: "full", "DOUBLE AWP": "full",
}

const UTILITY_ALIASES: Record<string, UtilityKind> = {
    smoke: "smoke", smokegrenade: "smoke", flash: "flash", flashbang: "flash",
    molotov: "molotov", incendiary: "molotov", incgrenade: "molotov", he: "he", hegrenade: "he", grenade: "he",
}

const PRIMARY = /^(ak47|m4a4|m4a1s?|m4a1_silencer|galil(ar)?|famas|aug|sg55[36]|awp|ssg08|scar20|g3sg1)$/
const SMG_OR_SHOTGUN = /^(mac10|mp9|mp7|mp5sd|ump45|p90|(pp)?bizon|nova|mag7|sawedoff|xm1014|negev|m249)$/

function weaponKey(w: string | undefined): string {
    return (w ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "")
}

/** Buy level from the weapons when the round has no recorded team buy. */
function inferBuy(weapons: string[], round: number): BuyLevel {
    if (round === 1 || round === 13) return "pistol"
    const rifles = weapons.filter(w => PRIMARY.test(weaponKey(w))).length
    const smgs = weapons.filter(w => SMG_OR_SHOTGUN.test(weaponKey(w))).length
    if (rifles >= 4) return "full"
    if (rifles >= 2) return "half"
    if (rifles + smgs >= 2) return "force"
    return "eco"
}

export function scriptInputFromResolverRound(src: ResolverRoundSource): RoundScriptInput {
    const { round } = src
    const homeIsCT = round.ctTeam === src.home.teamId
    const economy = new Map((round.playerEconomy ?? []).map(e => [e.playerId, e]))
    const lineup = (team: ResolverTeamLineup, side: Side): RoundScriptPlayer[] => team.players.map(p => {
        const loadout = src.loadouts?.[p.id]
        const utility: Partial<Record<UtilityKind, number>> = {}
        for (const u of loadout?.utility ?? []) {
            const kind = UTILITY_ALIASES[weaponKey(u)]
            if (kind) utility[kind] = (utility[kind] ?? 0) + 1
        }
        const kit = loadout?.hasKit ?? economy.get(p.id)?.hasKit
        return {
            id: p.id,
            teamId: team.teamId,
            side,
            role: p.role ?? "RIFLER",
            weapon: weaponKey(loadout?.weapon ?? economy.get(p.id)?.weapon) || (side === "CT" ? "usp" : "glock"),
            utility,
            ...(side === "CT" && kit !== undefined ? { hasKit: kit } : {}),
        }
    })
    const players = [...lineup(src.home, homeIsCT ? "CT" : "T"), ...lineup(src.away, homeIsCT ? "T" : "CT")]
    const buyOf = (team: "home" | "away", side: Side): BuyLevel =>
        BUY_LEVELS[(round.buys?.[team] ?? "").toUpperCase()] ?? inferBuy(players.filter(p => p.side === side).map(p => p.weapon), round.roundNumber)
    const ctPlaystyle = homeIsCT ? src.home.playstyle : src.away.playstyle
    const tPlaystyle = homeIsCT ? src.away.playstyle : src.home.playstyle
    const endReason: RoundScriptInput["endReason"] = round.winType === "BOMB_EXPLODED" ? "bomb_exploded"
        : round.winType === "BOMB_DEFUSE" ? "defused" : round.winType === "TIME" ? "time" : "elimination"

    return {
        mapId: src.mapId,
        round: round.roundNumber,
        seed: roundScriptSeed(src.seed, src.matchId ?? "", src.mapIndex ?? 0, round.roundNumber),
        players,
        buy: {
            CT: buyOf(homeIsCT ? "home" : "away", "CT"),
            T: buyOf(homeIsCT ? "away" : "home", "T"),
        },
        ...(tPlaystyle ? { tPlaystyle } : {}),
        ...(ctPlaystyle ? { ctPlaystyle } : {}),
        events: round.events ?? [],
        winnerSide: round.winner === "ct" ? "CT" : "T",
        endReason,
    }
}
