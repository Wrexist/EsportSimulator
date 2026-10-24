/**
 * Transfer-market filters as data, so a search can be saved and the week can
 * tell the manager when new players match it (G8). The market board and the
 * weekly alert both filter through `matchesMarketSearch`, so an alert never
 * names a player the board would not show for the same search.
 *
 * Criteria read only what the board shows: role, status, age, fee (market
 * value), contract weeks left, region and the text query. No hidden ratings.
 */

import type { GameEventSaveData, GameSave, PlayerSaveData, SavedMarketSearch, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { getPlayerRegion } from "./scouting-helpers"
import { getVisibleStats } from "./scouting-system"
import { academyHeldPlayerIds } from "./recruitment"

export type MarketStatus = "all" | "listed" | "free" | "scouted" | "watchlist"

export interface MarketCriteria {
    query: string
    role: string
    status: MarketStatus
    age: string
    maxFee: number
    contractMax: number
    region: string
}

export const DEFAULT_MARKET_CRITERIA: MarketCriteria = {
    query: "", role: "ALL", status: "all", age: "all", maxFee: 0, contractMax: 0, region: "ALL",
}

export const AGE_BANDS: Record<string, readonly [number, number]> = {
    all: [0, 99], young: [0, 21], prime: [22, 27], veteran: [28, 99],
}

/** Saved searches kept per career. */
export const MAX_SAVED_SEARCHES = 8
/** Shortlisted players get one notice when their contract has this many weeks left. */
export const SHORTLIST_CONTRACT_ALERT_WEEKS = 26
/** Names listed per search in an alert. */
const ALERT_NAMES = 3

export interface MarketCandidate {
    player: PlayerSaveData
    team: TeamSaveData | undefined
    /** Market value (the board's Value column). */
    value: number
    scouted: boolean
    watchlisted: boolean
    contractWeeksLeft: number | undefined
}

export function matchesMarketSearch(c: MarketCandidate, criteria: MarketCriteria): boolean {
    const { player, team } = c
    const q = criteria.query.trim().toLowerCase()
    if (q && !(player.nickname.toLowerCase().includes(q) || player.name?.toLowerCase().includes(q) || team?.name.toLowerCase().includes(q))) return false
    if (criteria.role !== "ALL" && player.role !== criteria.role) return false
    if (criteria.status === "listed" && !(team && player.forSale)) return false
    if (criteria.status === "free" && team) return false
    if (criteria.status === "scouted" && !c.scouted) return false
    if (criteria.status === "watchlist" && !c.watchlisted) return false
    const [lo, hi] = AGE_BANDS[criteria.age] ?? AGE_BANDS.all
    if (player.age < lo || player.age > hi) return false
    if (criteria.maxFee > 0 && team && c.value > criteria.maxFee) return false
    if (criteria.contractMax > 0 && (!team || (c.contractWeeksLeft ?? 999) > criteria.contractMax)) return false
    if (criteria.region !== "ALL" && getPlayerRegion(player.nationality) !== criteria.region) return false
    return true
}

/** True when any criterion narrows the market (an empty search is not worth saving). */
export function isNarrowing(criteria: MarketCriteria): boolean {
    return (Object.keys(DEFAULT_MARKET_CRITERIA) as (keyof MarketCriteria)[])
        .some(k => (k === "query" ? criteria.query.trim() !== "" : criteria[k] !== DEFAULT_MARKET_CRITERIA[k]))
}

/** Plain-words summary: "AWPer · ≤ 21 · free agents". */
export function describeCriteria(c: MarketCriteria, labels: { role?: (r: string) => string } = {}): string {
    const parts: string[] = []
    if (c.query.trim()) parts.push(`“${c.query.trim()}”`)
    if (c.role !== "ALL") parts.push(labels.role ? labels.role(c.role) : c.role)
    if (c.status === "listed") parts.push("listed")
    if (c.status === "free") parts.push("free agents")
    if (c.status === "scouted") parts.push("scouted")
    if (c.status === "watchlist") parts.push("watchlist")
    if (c.age === "young") parts.push("21 or younger")
    if (c.age === "prime") parts.push("22–27")
    if (c.age === "veteran") parts.push("28+")
    if (c.maxFee > 0) parts.push(`fee ≤ $${c.maxFee >= 1_000_000 ? `${c.maxFee / 1_000_000}M` : `${c.maxFee / 1000}k`}`)
    if (c.contractMax > 0) parts.push(`≤ ${c.contractMax} wks left`)
    if (c.region !== "ALL") parts.push(c.region)
    return parts.join(" · ") || "Whole market"
}

/** Everyone the managed club could approach, as the board lists them; `only` limits it to those players. */
export function marketCandidates(save: Pick<GameSave, "players" | "teams" | "contracts" | "currentWeek" | "scoutedPlayers" | "watchlistedPlayerIds" | "academyPlayers" | "academyPendingProspects" | "playerTeamId">, only?: ReadonlySet<string>): MarketCandidate[] {
    const myTeam = save.teams.find(t => t.id === save.playerTeamId)
    if (!myTeam) return []
    const own = new Set(myTeam.rosterIds)
    const held = academyHeldPlayerIds({ teams: save.teams, academyPlayers: save.academyPlayers ?? [], academyPendingProspects: save.academyPendingProspects ?? [] })
    const teamByPlayer = new Map<string, TeamSaveData>()
    for (const t of save.teams) for (const id of t.rosterIds) teamByPlayer.set(id, t)
    const weeksLeft = new Map<string, number>()
    for (const c of save.contracts) weeksLeft.set(c.playerId, Math.max(0, c.endWeek - save.currentWeek))
    const watch = new Set(save.watchlistedPlayerIds ?? [])
    const out: MarketCandidate[] = []
    for (const p of save.players) {
        if (own.has(p.id) || held.has(p.id) || p.isRetired || (only && !only.has(p.id))) continue
        out.push({
            player: p,
            team: teamByPlayer.get(p.id),
            value: evaluatePlayer(p, undefined, undefined, save.currentWeek).transferValue,
            scouted: getVisibleStats(p, save.scoutedPlayers ?? [], myTeam.rosterIds, save.currentWeek).scoutingLevel !== "NONE",
            watchlisted: watch.has(p.id),
            contractWeeksLeft: weeksLeft.get(p.id),
        })
    }
    return out
}

/**
 * Weekly market alert: one inbox message per week at most, naming new
 * matches for each saved search with alerts on and shortlisted players whose
 * contract just reached its final six months. Updates each search's
 * `seenIds` (a player who drops out and comes back counts as new again).
 */
export function processMarketAlerts(save: GameSave): GameEventSaveData | null {
    const searches = save.savedSearches ?? []
    const id = `market_alert_w${save.currentWeek}`
    if (save.eventsLog.some(e => e.id === id)) return null
    // Searches with alerts off still track what they have seen, so turning
    // alerts back on reports only later arrivals.
    if (!searches.length && !(save.watchlistedPlayerIds ?? []).length) return null

    // With no saved searches only the shortlist's contracts matter: skip rating the whole world.
    const candidates = marketCandidates(save, searches.length ? undefined : new Set(save.watchlistedPlayerIds ?? []))
    const lines: string[] = []
    const found: { searchId: string; playerIds: string[] }[] = []
    for (const s of searches) {
        const matches = candidates.filter(c => matchesMarketSearch(c, s.criteria)).map(c => c.player.id)
        if (s.alerts) {
            const seen = new Set(s.seenIds ?? [])
            const fresh = matches.filter(pid => !seen.has(pid))
            if (fresh.length) {
                const names = fresh.slice(0, ALERT_NAMES).map(pid => candidates.find(c => c.player.id === pid)!.player.nickname)
                const more = fresh.length > ALERT_NAMES ? ` and ${fresh.length - ALERT_NAMES} more` : ""
                lines.push(`${s.name}: ${names.join(", ")}${more}.`)
                found.push({ searchId: s.id, playerIds: fresh })
            }
        }
        s.seenIds = matches
    }

    const expiring = candidates.filter(c => c.watchlisted && c.team && c.contractWeeksLeft === SHORTLIST_CONTRACT_ALERT_WEEKS)
    for (const c of expiring) lines.push(`${c.player.nickname} (${c.team!.name}) has ${SHORTLIST_CONTRACT_ALERT_WEEKS} weeks left on his contract.`)
    if (!lines.length) return null

    const total = found.reduce((n, f) => n + f.playerIds.length, 0)
    const title = total > 0
        ? `${total} new player${total === 1 ? "" : "s"} match your saved searches`
        : expiring.length === 1 ? `${expiring[0].player.nickname}'s contract enters its final six months` : `${expiring.length} shortlisted contracts enter their final six months`
    const event: GameEventSaveData = {
        id, type: "MARKET_ALERT", week: save.currentWeek, acknowledged: false,
        data: {
            title,
            message: lines.join(" "),
            text: lines.join("\n"),
            searchId: found[0]?.searchId,
            ...(found.length === 0 && expiring.length === 1 ? { playerId: expiring[0].player.id, playerName: expiring[0].player.nickname } : {}),
        },
    }
    save.eventsLog.push(event)
    return event
}

export function newSavedSearch(name: string, criteria: MarketCriteria, week: number, seenIds: string[]): SavedMarketSearch {
    return { id: `search_${week}_${Math.abs(hash(name + JSON.stringify(criteria)))}`, name: name.trim() || describeCriteria(criteria), criteria: { ...criteria }, alerts: true, createdWeek: week, seenIds }
}

function hash(text: string): number {
    let h = 0
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
    return h
}
