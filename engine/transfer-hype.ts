/**
 * Transfer hype: what makes a signing feel like an event, built only from
 * facts the game already has.
 *
 *  - Market standing: Icon / Star / Wonderkid, from public market value
 *    (top 1% / top 5% of every active player; a Wonderkid is 20 or younger
 *    and in the top 20%). Value is public, so the badge never leaks a
 *    rating the club has not scouted.
 *  - The race: only Icons, Stars and Wonderkids draw rival clubs. The
 *    clubs in the conversation are the most reputable ones (top 16 for an
 *    Icon, 24 for a Star, 30 for a Wonderkid) that have a roster spot and
 *    would start him (he beats their fifth-best OVR). Each of them is in
 *    for him this week on a seeded roll (25% / 12% / 8%), so the race
 *    moves week to week but holds still within a week. Each club in the
 *    race pushes the selling club's price up 3%, up to four clubs (12%).
 *  - Best five: the average OVR of a squad's five strongest players, used
 *    by the signing reveal to show what the new player adds.
 */

import type { PlayerSaveData, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { deriveSeed, SeededRNG } from "./rng"
import { SENIOR_ROSTER_MAX } from "./roster-rules"

export type MarketStanding = "ICON" | "STAR" | "WONDERKID"

export const STANDING_LABEL: Record<MarketStanding, string> = {
    ICON: "Icon",
    STAR: "Star",
    WONDERKID: "Wonderkid",
}

const ICON_SHARE = 0.01
const STAR_SHARE = 0.05
const WONDERKID_SHARE = 0.2
const WONDERKID_MAX_AGE = 20

/** Fee premium per rival club in the race, and how many clubs count. */
export const RIVAL_FEE_STEP = 0.03
export const RIVAL_FEE_MAX_CLUBS = 4
/** How many of the most reputable eligible clubs are in the conversation, and each one's weekly chance to be in. */
const RACE_POOL: Record<MarketStanding, number> = { ICON: 16, STAR: 24, WONDERKID: 30 }
const RACE_CHANCE: Record<MarketStanding, number> = { ICON: 0.25, STAR: 0.12, WONDERKID: 0.08 }

/** OVR and market value of every player, cached per players array and week. */
const evalCache = new WeakMap<PlayerSaveData[], { week: number | undefined; map: Map<string, { ovr: number; value: number }> }>()
function evaluations(players: PlayerSaveData[], currentWeek: number | undefined): Map<string, { ovr: number; value: number }> {
    const hit = evalCache.get(players)
    if (hit && hit.week === currentWeek) return hit.map
    const map = new Map<string, { ovr: number; value: number }>()
    for (const p of players) {
        const e = evaluatePlayer(p, undefined, undefined, currentWeek)
        map.set(p.id, { ovr: e.overallRating, value: e.transferValue })
    }
    evalCache.set(players, { week: currentWeek, map })
    return map
}

/**
 * Standing for every active player, by market value. `values` may be passed
 * when the caller already evaluated some players (the market board does);
 * the rest are evaluated here.
 */
export function marketStandings(
    players: PlayerSaveData[],
    currentWeek: number,
    values?: Map<string, number>,
): Map<string, MarketStanding> {
    // Players missing from `values` (the manager's own, academy) are evaluated, so the cut-offs see everyone.
    let evals: Map<string, { ovr: number; value: number }> | undefined
    const valueOf = (p: PlayerSaveData) => values?.get(p.id) ?? (evals ??= evaluations(players, currentWeek)).get(p.id)?.value ?? 0
    const pool = players
        .filter(p => !p.isRetired)
        .map(p => ({ p, value: valueOf(p) }))
        .sort((a, b) => b.value - a.value || a.p.id.localeCompare(b.p.id))
    const out = new Map<string, MarketStanding>()
    if (pool.length === 0) return out
    const iconCut = Math.max(1, Math.round(pool.length * ICON_SHARE))
    const starCut = Math.max(iconCut, Math.round(pool.length * STAR_SHARE))
    const kidCut = Math.max(starCut, Math.round(pool.length * WONDERKID_SHARE))
    pool.forEach(({ p }, i) => {
        if (i < iconCut) out.set(p.id, "ICON")
        else if (i < starCut) out.set(p.id, "STAR")
        else if (i < kidCut && p.age <= WONDERKID_MAX_AGE) out.set(p.id, "WONDERKID")
    })
    return out
}

export interface RivalClub {
    id: string
    name: string
    reputation: number
    logoPath?: string
}

/**
 * AI clubs in the race for `player` this week (strongest reputation first).
 * Never the manager's club or the club that holds him; nobody races for a
 * player without a standing.
 */
export function rivalInterest(
    player: PlayerSaveData,
    ctx: {
        teams: TeamSaveData[]
        players: PlayerSaveData[]
        currentWeek: number
        playerTeamId: string | null
        saveId?: string | null
        /** The player's standing, when the caller already has it. */
        standing?: MarketStanding | null
    },
): RivalClub[] {
    if (player.isRetired) return []
    const standing = ctx.standing !== undefined ? ctx.standing : marketStandings(ctx.players, ctx.currentWeek).get(player.id)
    if (!standing) return []
    const evals = evaluations(ctx.players, ctx.currentWeek)
    const ovr = evals.get(player.id)?.ovr ?? evaluatePlayer(player, undefined, undefined, ctx.currentWeek).overallRating
    const holder = ctx.teams.find(t => t.rosterIds.includes(player.id))

    const eligible = ctx.teams
        .filter(team => {
            if (team.id === ctx.playerTeamId || team.id === holder?.id || team.rosterIds.length >= SENIOR_ROSTER_MAX) return false
            const five = team.rosterIds.map(id => evals.get(id)?.ovr ?? 0).sort((a, b) => b - a)
            // He starts for them: a free spot in the five, or better than their fifth.
            return five.length < 5 || ovr > five[4]
        })
        .sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0) || a.id.localeCompare(b.id))
        .slice(0, RACE_POOL[standing])

    return eligible
        .filter(team => new SeededRNG(deriveSeed(ctx.saveId || "local", "race", ctx.currentWeek, player.id, team.id)).next() < RACE_CHANCE[standing])
        .map(team => ({ id: team.id, name: team.name, reputation: team.reputation ?? 0, logoPath: (team as { logoPath?: string }).logoPath }))
}

/** Extra share the selling club asks with `rivalCount` clubs in the race (0 to 0.12). */
export function rivalFeePremium(rivalCount: number): number {
    return Math.min(RIVAL_FEE_MAX_CLUBS, Math.max(0, Math.floor(rivalCount))) * RIVAL_FEE_STEP
}

/** Average OVR of the five strongest players in `rosterIds`; null with nobody. */
export function bestFiveOvr(rosterIds: string[], players: PlayerSaveData[], currentWeek?: number): number | null {
    const byId = new Map(players.map(p => [p.id, p]))
    const ovrs = rosterIds
        .map(id => byId.get(id))
        .filter((p): p is PlayerSaveData => !!p && !p.isRetired)
        .map(p => evaluatePlayer(p, undefined, undefined, currentWeek).overallRating)
        .sort((a, b) => b - a)
        .slice(0, 5)
    if (ovrs.length === 0) return null
    return Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length)
}

/** "Natus Vincera", "A and B", "A, B and 2 other clubs". */
export function rivalLine(names: string[], total: number): string {
    if (names.length === 0) return ""
    const extra = Math.max(0, total - names.length)
    const shown = [...names]
    if (extra > 0) shown.push(`${extra} other club${extra === 1 ? "" : "s"}`)
    if (shown.length === 1) return shown[0]
    return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
}
