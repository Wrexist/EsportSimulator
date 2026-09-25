/**
 * AI roster management — per-team weekly decisions to sign free
 * agents, release weakest players, and chase critical-role gaps.
 *
 * Four functions extracted from ai-manager.ts (Phase K3):
 *   - scoreSigningCandidate   pure scoring function (skill + growth
 *                             room + youth + role-fit) / value divisor
 *   - signFreeAgent           sign the best-scored affordable FA
 *   - releaseWorstPlayer      cut the lowest-value player from a
 *                             bloated roster, with a bounded contract
 *                             termination cost
 *   - manageRoster            orchestrate the three above — fill gaps
 *                             below 5, chase critical roles below 7,
 *                             trim down from over 7
 *
 * Pinned by K1 tests (9 cases) covering:
 *   - The decision tree (under-quorum → sign; over-cap → release;
 *     missing critical role → sign 6th UNLESS in financial pressure)
 *   - Sign-candidate preferences (skill + growth-room + youth bonus)
 *   - Edge cases (no free agents available, panic path)
 */

import type {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
} from "../save-types"
import { applyRosterChangePenalty } from "../chemistry-engine"
import { getPlayerIndex } from "./player-index"

import { academyHeldPlayerIds, recruitmentBudget, recruitmentRole, recruitmentSalary } from "../recruitment"
import { recalculateTeamSynergy } from "../processors/team-synergy-recalc"

const MAX_ROSTER_SIZE = 7
const CRITICAL_ROLE_BUDGET_THRESHOLD = 150_000
const CONTRACT_LENGTH_WEEKS = 52
const REQUIRED_ROLES = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]
// Only free-agent signings of players at/above this skill reach the live news
// feed — keeps routine depth-filling out of the feed (AUDIT_WAVE3 AI-churn item).
const STAR_FA_NEWS_SKILL = 78

/**
 * Score a candidate free agent / transfer target.
 *
 * Combines current skill, growth headroom (potential - skill), age
 * bonus for youth (capped at age 17), role-coverage bonus when the
 * team is missing the role, and a value-for-money divisor so AI
 * doesn't always go for the most expensive player.
 */
export function scoreSigningCandidate(
    player: PlayerSaveData,
    weeklySalary: number,
    missingRoles: Set<string>,
): number {
    const skill = player.skill ?? 50
    const potential = player.potential ?? skill
    const age = player.age ?? 22
    const growthRoom = Math.max(0, potential - skill)
    const youthBonus = Math.max(0, 25 - age) * 1.5
    const role = recruitmentRole(player.role)
    const roleBonus = [...missingRoles].some(r => recruitmentRole(r) === role) ? 20 : 0
    const valueDivisor = Math.max(500, weeklySalary) / 1000
    return (skill + growthRoom * 0.6 + youthBonus + roleBonus) / valueDivisor
}

/** Sign an affordable free agent; urgent vacancies prefer the lowest wage. */
export function signFreeAgent(team: TeamSaveData, save: GameSave, emergency = false): void {
    signFreeAgentWithQuotes(team, save, emergency, new Map())
}

// Quotes live for one synchronous roster fill only. Free candidates' ability and
// week cannot change between its hires; affordability/ownership are rebuilt each time.
function signFreeAgentWithQuotes(team: TeamSaveData, save: GameSave, emergency: boolean, quotes: Map<PlayerSaveData, number>): void {
    if (team.rosterIds.length >= MAX_ROSTER_SIZE) return

    const allRosteredIds = new Set(save.teams.flatMap(t => t.rosterIds))

    const academyHeldIds = academyHeldPlayerIds(save)

    const contractedIds = new Set(save.contracts.filter(c => c.endWeek > save.currentWeek).map(c => c.playerId))
    const freeAgents = save.players.filter(p =>
        !allRosteredIds.has(p.id) && !p.isRetired && !academyHeldIds.has(p.id)
        && !contractedIds.has(p.id))

    if (freeAgents.length === 0) return

    const canAfford = recruitmentBudget(save, team)

    // Build the missing-roles set so the scorer can prefer role-fit hires.
    const playerIndex = getPlayerIndex(save)
    const currentRoles = new Set<string>()
    for (const id of team.rosterIds) {
        const p = playerIndex.get(id)
        if (p?.role) currentRoles.add(recruitmentRole(p.role))
    }
    const missingRoles = new Set(REQUIRED_ROLES.filter(r => !currentRoles.has(r)))

    const salaries = new Map(freeAgents.map(p => {
        let salary = quotes.get(p)
        if (salary === undefined) { salary = recruitmentSalary(p, save.currentWeek); quotes.set(p, salary) }
        return [p.id, salary]
    }))
    const affordable = freeAgents.filter(p => canAfford(salaries.get(p.id)!)
        && (team.rosterIds.length < 5 || missingRoles.has(recruitmentRole(p.role))))
    if (affordable.length === 0) return

    // Pick the highest-scoring affordable candidate.
    let target: PlayerSaveData | undefined
    let bestScore = -Infinity
    for (const p of affordable) {
        const salary = salaries.get(p.id)!
        const score = emergency ? -salary + scoreSigningCandidate(p, salary, missingRoles) / 1000
            : scoreSigningCandidate(p, salary, missingRoles)
        if (score > bestScore) {
            bestScore = score
            target = p
        }
    }

    if (!target) return

    const salary = salaries.get(target.id)!

    // Defensive guard against double-add — stale roster could already
    // contain this player.
    if (team.rosterIds.includes(target.id)) return
    team.rosterIds.push(target.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)

    // Free agency has no transfer fee, exactly as in the human signing flow.
    save.contracts.push({
        playerId: target.id,
        teamId: team.id,
        salaryPerWeek: salary,
        startWeek: save.currentWeek,
        endWeek: save.currentWeek + CONTRACT_LENGTH_WEEKS,
        buyout: salary * CONTRACT_LENGTH_WEEKS,
    })

    target.forSale = false
    target.transferListingPrice = undefined
    target.weeksOnTransferList = undefined
    recalculateTeamSynergy(team, save.players)

    if (save.transferHistory) {
        save.transferHistory.push({
            id: `transfer_ai_${save.currentWeek}_${target.id}`,
            week: save.currentWeek,
            type: "SIGNING",
            playerId: target.id,
            playerName: target.nickname,
            fromTeamId: null,
            fromTeamName: "Free Agent",
            toTeamId: team.id,
            toTeamName: team.name,
            fee: 0,
        })
    }

    // Surface only MARQUEE free-agent signings (star skill) in the live news
    // feed so the AI market feels alive without flooding it — routine
    // depth-filling stays out of the feed (it's still recorded in
    // transferHistory above). Deterministic id + dedup guard keep it replay-safe;
    // capped at 50 like the AI-to-AI transfer news.
    if (save.newsFeed && (target.skill ?? 0) >= STAR_FA_NEWS_SKILL) {
        const newsId = `news_ai_signing_${save.currentWeek}_${target.id}`
        if (!save.newsFeed.some(n => n.id === newsId)) {
            const skill = target.skill ?? 50
            save.newsFeed.unshift({
                id: newsId,
                title: `${target.nickname} signs with ${team.name}`,
                content: `Free agent ${target.nickname} has joined ${team.name}.`,
                category: "TRANSFER",
                playerId: target.id,
                teamId: team.id,
                week: save.currentWeek,
                // Engagement is cosmetic; derive deterministically (no rng here).
                engagement: { likes: 100 + skill * 20, views: 1000 + skill * 100 },
            })
            if (save.newsFeed.length > 50) save.newsFeed.pop()
        }
    }
}

/** Release excess depth under the same fee-free release rules as the human club. */
export function releaseWorstPlayer(team: TeamSaveData, save: GameSave): void {
    const playerIndex = getPlayerIndex(save)
    const players = team.rosterIds
        .map(id => playerIndex.get(id))
        .filter((p): p is PlayerSaveData => !!p)

    if (players.length <= 5) return

    // Age 30+ players get penalized so the AI doesn't permanently keep
    // declining veterans over high-skill youngsters.
    const valueScore = (p: PlayerSaveData) => {
        const skill = p.skill ?? 50
        const potential = p.potential ?? skill
        const age = p.age ?? 22
        const declinePenalty = Math.max(0, age - 28) * 2
        return skill + Math.max(0, potential - skill) * 0.5 - declinePenalty
    }
    const worst = players.reduce((min, p) => (valueScore(p) < valueScore(min) ? p : min), players[0])

    team.rosterIds = team.rosterIds.filter(id => id !== worst.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)

    if (team.activeRoleTraining) {
        team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== worst.id)
        team.trainingSlotsUsed = team.activeRoleTraining.length
    }
    recalculateTeamSynergy(team, save.players)
    worst.forSale = false
    worst.transferListingPrice = undefined
    worst.weeksOnTransferList = undefined
    // Bug fix retained: scope contract deletion by (playerId, teamId) to
    // avoid clobbering historical / ghost contracts on other teams.
    save.contracts = save.contracts.filter(c => !(c.playerId === worst.id && c.teamId === team.id))

    if (save.transferHistory) {
        save.transferHistory.push({
            id: `release_ai_${save.currentWeek}_${worst.id}`,
            week: save.currentWeek,
            type: "RELEASE",
            playerId: worst.id,
            playerName: worst.nickname,
            fromTeamId: team.id,
            fromTeamName: team.name,
            toTeamId: null,
            toTeamName: "Free Agent",
            fee: 0,
        })
    }
}

/**
 * Per-tick roster orchestration:
 *   1. Below quorum (5 players): sign one free agent
 *   2. At 5-6 players with no IGL / no AWPER AND budget OK AND not in
 *      financial pressure: sign one free agent to fill the gap
 *   3. Above cap (7+): release one player
 *
 * The middle path is gated on financial state to prevent the AI from
 * bankrupting itself chasing role coverage in CRISIS/RISK/INSOLVENT.
 */
export function manageRoster(team: TeamSaveData, save: GameSave): void {
    const rosterSize = team.rosterIds.length

    // Fill every vacancy this week if affordable candidates exist. Never invent cash.
    if (rosterSize < 5) {
        const quotes = new Map<PlayerSaveData, number>()
        while (team.rosterIds.length < 5) {
            const before = team.rosterIds.length
            signFreeAgentWithQuotes(team, save, true, quotes)
            if (team.rosterIds.length === before) break
        }
        return
    }

    // Depth is optional. Shed bench wages before an existing deficit consumes the reserve.
    if (rosterSize > 5 && !recruitmentBudget(save, team)(1)) {
        releaseWorstPlayer(team, save)
        return
    }

    // 2. Critical role coverage at 5-6 players.
    const inFinancialPressure =
        team.financialState === "RISK" ||
        team.financialState === "CRISIS" ||
        team.financialState === "INSOLVENT"
    if (rosterSize < MAX_ROSTER_SIZE && !inFinancialPressure && team.budget > CRITICAL_ROLE_BUDGET_THRESHOLD) {
        const playerIndex = getPlayerIndex(save)
        const roles = new Set<string>()
        for (const id of team.rosterIds) {
            const p = playerIndex.get(id)
            if (p?.role) roles.add(recruitmentRole(p.role))
        }
        const missingCritical = !roles.has("IGL") || !roles.has("AWPER")
        if (missingCritical) {
            signFreeAgent(team, save)
            return
        }
    }

    // 3. Trim excess above cap.
    if (rosterSize > MAX_ROSTER_SIZE) {
        releaseWorstPlayer(team, save)
    }
}
