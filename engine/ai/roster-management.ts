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

const MAX_ROSTER_SIZE = 7
const CRITICAL_ROLE_BUDGET_THRESHOLD = 150_000
const SIGNING_MIN_BUDGET = 50_000
const SIGNING_RUNWAY_WEEKS = 26
const CONTRACT_LENGTH_WEEKS = 52
const TERMINATION_CAP_WEEKS = 26
const REQUIRED_ROLES = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]

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
    const role = (player.role ?? "RIFLER").toString().toUpperCase()
    const roleBonus = missingRoles.has(role) ? 20 : 0
    const valueDivisor = Math.max(500, weeklySalary) / 1000
    return (skill + growthRoom * 0.6 + youthBonus + roleBonus) / valueDivisor
}

/**
 * Skill-based salary projection used by the AI for affordability
 * checks. Matches the player-facing salary formula closely so
 * AI-signed players cost roughly the same as player-signed equivalents.
 */
function calculateAiSalary(player: PlayerSaveData): number {
    const baseSalary = (player.skill ?? 50) * 50
    const tierMultiplier = player.tier === "ELITE" ? 3 : player.tier === "PRO" ? 2 : 1
    return Math.floor(baseSalary * tierMultiplier)
}

/**
 * Sign the best free agent the team can afford. Affordable = team has
 * 26 weeks of runway after the new wage. Best = highest score per the
 * scoreSigningCandidate formula. No-op if the roster is at the
 * MAX_ROSTER_SIZE cap, no FAs exist, or none fit the budget.
 */
export function signFreeAgent(team: TeamSaveData, save: GameSave): void {
    if (team.rosterIds.length >= MAX_ROSTER_SIZE) return

    const allRosteredIds = new Set(save.teams.flatMap(t => t.rosterIds))
    const freeAgents = save.players.filter(p => !allRosteredIds.has(p.id) && !p.isRetired)

    if (freeAgents.length === 0) return

    // Existing weekly costs feed the runway check.
    const existingWageBill = save.contracts
        .filter(c => c.teamId === team.id)
        .reduce((sum, c) => sum + (c.salaryPerWeek || 0), 0)
    const staffCosts = (team.staffIds || []).length * 2000
    const existingWeeklyCosts = existingWageBill + staffCosts

    // Build the missing-roles set so the scorer can prefer role-fit hires.
    const playerIndex = getPlayerIndex(save)
    const currentRoles = new Set<string>()
    for (const id of team.rosterIds) {
        const p = playerIndex.get(id)
        if (p?.role) currentRoles.add(p.role.toString().toUpperCase())
    }
    const missingRoles = new Set(REQUIRED_ROLES.filter(r => !currentRoles.has(r)))

    // Affordability filter: needs SIGNING_RUNWAY_WEEKS of runway AND
    // an absolute SIGNING_MIN_BUDGET floor.
    const affordable = freeAgents.filter(p => {
        const weeklySalary = calculateAiSalary(p)
        const totalWeeklyCost = existingWeeklyCosts + weeklySalary
        const runwayCost = totalWeeklyCost * SIGNING_RUNWAY_WEEKS
        return team.budget > runwayCost && team.budget > SIGNING_MIN_BUDGET
    })
    if (affordable.length === 0) return

    // Pick the highest-scoring affordable candidate.
    let target: PlayerSaveData | undefined
    let bestScore = -Infinity
    for (const p of affordable) {
        const score = scoreSigningCandidate(p, calculateAiSalary(p), missingRoles)
        if (score > bestScore) {
            bestScore = score
            target = p
        }
    }

    if (!target) return

    const salary = calculateAiSalary(target)

    // Defensive guard against double-add — stale roster could already
    // contain this player.
    if (team.rosterIds.includes(target.id)) return
    team.rosterIds.push(target.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)

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
}

/**
 * Release the lowest-value player on a bloated roster. Value =
 * skill + (growth headroom × 0.5) - age-decline penalty. Releases the
 * one player who gives the least future value, charging a bounded
 * contract-termination fee (capped at 26 weeks of remaining wage, at
 * 50% rate). The cap mirrors the player-facing buyout cap so AI
 * follows similar rules to the user.
 */
export function releaseWorstPlayer(team: TeamSaveData, save: GameSave): void {
    const playerIndex = getPlayerIndex(save)
    const players = team.rosterIds
        .map(id => playerIndex.get(id))
        .filter((p): p is PlayerSaveData => !!p)

    if (players.length === 0) return

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

    // Bounded termination cost (capped at 26 weeks at 50%).
    const contract = save.contracts.find(c => c.playerId === worst.id && c.teamId === team.id)
    if (contract) {
        const weeksRemaining = Math.max(0, contract.endWeek - save.currentWeek)
        const cappedWeeks = Math.min(weeksRemaining, TERMINATION_CAP_WEEKS)
        const terminationCost = Math.round(contract.salaryPerWeek * cappedWeeks * 0.5)
        team.budget -= terminationCost
    }
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

    // 1. Fill gaps below quorum.
    if (rosterSize < 5) {
        signFreeAgent(team, save)
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
            if (p?.role) roles.add(p.role.toString().toUpperCase())
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
