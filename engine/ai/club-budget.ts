/**
 * AI club budget and roster viability (Phase 4.6).
 *
 * Money pressure is meant for the managed club. AI clubs are run by prudent
 * owners so the world around the manager stays healthy and competitive:
 *
 *  - Budget: an AI club commits to a new recurring cost (a signing, a raise,
 *    staff, a facility, role training) only while its projected weekly net
 *    after that cost still keeps AI_ECONOMY_TUNING.SURPLUS_SHARE of its
 *    income in hand. Before, signings only needed 26 weeks of cash against
 *    the deficit they created, so clubs knowingly signed into a deficit and
 *    ran out of money in season 2.
 *  - Cost control: a club running a weekly deficit (or in debt) releases
 *    its highest-paid bench player (one a week, as the competent managed
 *    policy does), then, while its runway is under a season, lets staff go,
 *    closes facility levels and swaps its most overpaid starter for a
 *    cheaper free agent or a minimum-wage trialist.
 *  - Roster viability is a hard invariant: an AI club below five senior
 *    players signs free agents it can afford, then promotes its own
 *    academy, then signs the cheapest free agents on credit, and as a last
 *    resort fields a trialist from the local scene. It never forfeits for
 *    want of players.
 *
 * Deterministic: no week-RNG draws; trialists come from a hash-seeded RNG.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "../save-types"
import { EconomyEngine } from "../economy-engine"
import { AI_ECONOMY_TUNING } from "@/lib/balance-tuning"
import { academyHeldPlayerIds, recruitmentRole, recruitmentSalary, MIN_ASKING_WAGE } from "../recruitment"
import { applyRosterChangePenalty } from "../chemistry-engine"
import { recalculateTeamSynergy } from "../processors/team-synergy-recalc"
import { SeededRNG } from "../rng"
import { generateProspect, prospectToPlayerData } from "../prospect-generator"

export interface AIClubBudget {
    /** Weekly recurring income: league central payment, partners, fans and signed deals. */
    income: number
    /** Weekly running costs (wages, staff, facilities, gear, academy, operations) plus active role training. */
    costs: number
    /** income - costs. */
    net: number
    /** Surplus kept in hand before taking on a new recurring cost. */
    margin: number
    /** Recurring cost the club can still add per week: net - margin (negative = over budget). */
    headroom: number
}

/** Next week's settlement for an AI club, with the surplus it keeps in hand. */
export function aiClubBudget(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek">, team: TeamSaveData): AIClubBudget {
    const academy = (team.youthAcademyIds || []).length + (team.managementState?.academyPlayers || []).length
    const report = EconomyEngine.processWeeklyFinances(team, save.players, save.contracts, save.staff || [], save.currentWeek + 1, academy, { implicitGear: true })
    const training = (team.activeRoleTraining || []).reduce((sum, session) => sum + (Number.isFinite(session.weeklyCost) ? session.weeklyCost : 0), 0)
    const income = report.income.total
    const costs = report.expenses.total + training
    const margin = Math.round(AI_ECONOMY_TUNING.SURPLUS_SHARE * Math.max(0, income))
    return { income, costs, net: income - costs, margin, headroom: income - costs - margin }
}

/**
 * Can an AI club take on `weekly` more recurring cost and pay `fee` now?
 * Optional spending needs cash in hand, the surplus kept after the new cost,
 * and a fee may not eat into AI_ECONOMY_TUNING.FEE_RESERVE_WEEKS of costs.
 */
export function aiCanCommit(team: TeamSaveData, budget: AIClubBudget, weekly: number, fee = 0): boolean {
    if (!Number.isFinite(weekly) || weekly < 0 || !Number.isFinite(fee) || fee < 0 || !Number.isFinite(team.budget)) return false
    if (team.budget < 0 || budget.headroom < weekly) return false
    if (fee > 0 && team.budget - fee < AI_ECONOMY_TUNING.FEE_RESERVE_WEEKS * budget.costs) return false
    return team.budget >= fee
}

/** Closure form for loops over many candidates: one projection, many checks. */
export function aiCommitCheck(save: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek">, team: TeamSaveData): (weekly: number, fee?: number) => boolean {
    const budget = aiClubBudget(save, team)
    return (weekly, fee = 0) => aiCanCommit(team, budget, weekly, fee)
}

/** Value the AI keeps a player for (same ordering as releases and renewals). */
export function aiKeepValue(p: Pick<PlayerSaveData, "skill" | "potential" | "age">): number {
    const skill = p.skill ?? 50
    const potential = p.potential ?? skill
    return skill + Math.max(0, potential - skill) * 0.5 - Math.max(0, (p.age ?? 22) - 28) * 2
}

/** Players by id for a handful of ids (no cache on the save: the store calls this on an immer draft). */
function playersById(save: Pick<GameSave, "players">, ids: readonly string[]): Map<string, PlayerSaveData> {
    const want = new Set(ids)
    const out = new Map<string, PlayerSaveData>()
    for (const p of save.players) if (want.has(p.id)) out.set(p.id, p)
    return out
}

function wageOf(save: Pick<GameSave, "contracts" | "currentWeek">, teamId: string, playerId: string): number {
    return save.contracts.find(c => c.playerId === playerId && c.teamId === teamId && c.endWeek > save.currentWeek)?.salaryPerWeek ?? 0
}

/** Free agents an AI club could sign now (not rostered, not academy-held, no live contract). */
export function signableFreeAgents(save: GameSave): PlayerSaveData[] {
    const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
    const held = academyHeldPlayerIds(save)
    const contracted = new Set(save.contracts.filter(c => c.endWeek > save.currentWeek).map(c => c.playerId))
    return save.players.filter(p => !p.isRetired && !rostered.has(p.id) && !held.has(p.id) && !contracted.has(p.id))
}

/** Release a player from an AI club to free agency (fee-free, as every release). */
export function releaseAIPlayer(team: TeamSaveData, save: GameSave, player: PlayerSaveData, reason: string, idPrefix = "release_ai"): void {
    team.rosterIds = team.rosterIds.filter(id => id !== player.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)
    if (team.activeRoleTraining) {
        team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== player.id)
        team.trainingSlotsUsed = team.activeRoleTraining.length
    }
    player.forSale = false
    player.transferListingPrice = undefined
    player.weeksOnTransferList = undefined
    save.contracts = save.contracts.filter(c => !(c.playerId === player.id && c.teamId === team.id))
    save.transferHistory?.push({
        id: `${idPrefix}_${save.currentWeek}_${player.id}`,
        week: save.currentWeek, type: "RELEASE", playerId: player.id, playerName: player.nickname,
        fromTeamId: team.id, fromTeamName: team.name, toTeamId: null, toTeamName: reason ? `Free Agent (${reason})` : "Free Agent", fee: 0,
    })
}

/** Sign a free agent onto an AI club (no fee). The caller has checked availability. */
export function signAIPlayer(team: TeamSaveData, save: GameSave, player: PlayerSaveData, salary: number, weeks: number, idPrefix = "transfer_ai"): void {
    if (team.rosterIds.includes(player.id)) return
    team.rosterIds.push(player.id)
    applyRosterChangePenalty(team, save.currentWeek, 1)
    save.contracts.push({
        playerId: player.id, teamId: team.id, salaryPerWeek: salary,
        startWeek: save.currentWeek, endWeek: save.currentWeek + weeks, buyout: salary * weeks,
    })
    player.forSale = false
    player.transferListingPrice = undefined
    player.weeksOnTransferList = undefined
    save.transferHistory?.push({
        id: `${idPrefix}_${save.currentWeek}_${player.id}`,
        week: save.currentWeek, type: "SIGNING", playerId: player.id, playerName: player.nickname,
        fromTeamId: null, fromTeamName: "Free Agent", toTeamId: team.id, toTeamName: team.name, fee: 0,
    })
}

// ---------------------------------------------------------------- cost control

/**
 * Weekly cost control for an AI club running a deficit, or in debt. One step
 * a week:
 *   1. release the highest-paid bench player (beyond five);
 *   2. while the runway is short, let the highest-paid staff member go;
 *   3. while the runway is short, close a level of its costliest facility
 *      (no refund; a level-1 facility closes);
 *   4. while the runway is short, swap the most overpaid starter for a
 *      cheaper free agent (at most once per SWAP_EVERY_WEEKS).
 * "Short" is CUT_RUNWAY_WEEKS of the deficit; a club in debt is always
 * short. Returns what it did (for tests and the campaign trace).
 */
export function aiCostControl(save: GameSave, team: TeamSaveData, pool?: () => PlayerSaveData[]): "bench" | "staff" | "facility" | "swap" | null {
    const budget = aiClubBudget(save, team)
    const inDebt = team.budget < 0
    if (budget.net >= 0 && !inDebt) return null
    // 1. Bench beyond five, highest wage first.
    if (team.rosterIds.length > 5) {
        const players = playersById(save, team.rosterIds)
        const bench = team.rosterIds.slice(5).map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p)
            .sort((a, b) => wageOf(save, team.id, b.id) - wageOf(save, team.id, a.id) || a.id.localeCompare(b.id))[0]
        if (bench) {
            releaseAIPlayer(team, save, bench, "")
            recalculateTeamSynergy(team, save.players)
            return "bench"
        }
    }
    const runway = inDebt || budget.net >= 0 ? 0 : team.budget / -budget.net
    if (runway >= AI_ECONOMY_TUNING.CUT_RUNWAY_WEEKS) return null
    // 2. Staff, highest-paid first.
    if (team.staffIds.length) {
        const staffById = new Map(save.staff.map(s => [s.id, s]))
        const priciest = [...team.staffIds].sort((a, b) => (staffById.get(b)?.salaryPerWeek ?? 0) - (staffById.get(a)?.salaryPerWeek ?? 0) || a.localeCompare(b))[0]
        team.staffIds = team.staffIds.filter(id => id !== priciest)
        save.staff = save.staff.filter(s => !(s.id === priciest && s.teamId === team.id))
        return "staff"
    }
    // 3. Facilities: the highest level first (the costliest upkeep).
    const facility = [...(team.facilities || [])].filter(f => f.level > 0)
        .sort((a, b) => b.level - a.level || a.type.localeCompare(b.type))[0]
    if (facility) {
        team.facilities = facility.level > 1
            ? team.facilities!.map(f => f === facility ? { ...f, level: f.level - 1, monthlyCost: Math.floor(Math.pow(f.level - 1, 1.25) * 2000) } : f)
            : team.facilities!.filter(f => f !== facility)
        return "facility"
    }
    // 4. Overpaid starter for a cheaper free agent.
    if (save.currentWeek - (team.aiWageSwapWeek ?? -999) >= AI_ECONOMY_TUNING.SWAP_EVERY_WEEKS) {
        if (swapOverpaidStarter(save, team, pool?.())) return "swap"
    }
    return null
}

/**
 * Replace the starter with the highest wage per unit of value by the best
 * free agent asking at most SWAP_MAX_WAGE_SHARE of that wage (the same role
 * preferred), and release the starter; the replacement takes his lineup
 * slot. When free agency has nobody that cheap, a trialist from the local
 * scene on the minimum wage takes the place (campaign 2026-10-11: with the
 * pool down to ~115 players, nobody asked under ~$1,100 and relegated clubs
 * drained their cash over a season without being able to cut).
 */
export function swapOverpaidStarter(save: GameSave, team: TeamSaveData, pool?: PlayerSaveData[]): boolean {
    const players = playersById(save, team.rosterIds)
    const starters = team.rosterIds.slice(0, 5).map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p)
    const share = AI_ECONOMY_TUNING.SWAP_MAX_WAGE_SHARE
    const ranked = starters.map(p => ({ p, wage: wageOf(save, team.id, p.id) })).filter(x => Math.floor(x.wage * share) >= MIN_ASKING_WAGE)
        .sort((a, b) => b.wage / Math.max(20, aiKeepValue(b.p)) - a.wage / Math.max(20, aiKeepValue(a.p)) || a.p.id.localeCompare(b.p.id))
    const target = ranked[0]
    if (!target) return false
    const maxAsk = Math.floor(target.wage * share)
    const role = recruitmentRole(target.p.role)
    const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
    const candidates = (pool ?? signableFreeAgents(save)).filter(p => !p.isRetired && !rostered.has(p.id))
    let best: { p: PlayerSaveData; ask: number; score: number } | undefined
    for (const p of candidates) {
        const ask = recruitmentSalary(p, save.currentWeek, team)
        if (ask > maxAsk) continue
        const score = aiKeepValue(p) + (recruitmentRole(p.role) === role ? 5 : 0)
        if (!best || score > best.score || (score === best.score && p.id < best.p.id)) best = { p, ask, score }
    }
    const slot = team.rosterIds.indexOf(target.p.id)
    let incoming: PlayerSaveData
    if (best) {
        signAIPlayer(team, save, best.p, best.ask, 52)
        incoming = best.p
        if (pool) { const i = pool.indexOf(best.p); if (i >= 0) pool.splice(i, 1) }
    } else {
        const prefix = `trialist_${team.id}_${save.currentWeek}_`
        incoming = createTrialist(save, team, save.players.filter(p => p.id.startsWith(prefix)).length)
        signAIPlayer(team, save, incoming, MIN_ASKING_WAGE, 52, "trialist_ai")
    }
    releaseAIPlayer(team, save, target.p, "wage cut")
    const at = team.rosterIds.indexOf(incoming.id)
    if (slot >= 0 && at > slot) {
        team.rosterIds.splice(at, 1)
        team.rosterIds.splice(slot, 0, incoming.id)
    }
    recalculateTeamSynergy(team, save.players)
    team.aiWageSwapWeek = save.currentWeek
    return true
}

// ---------------------------------------------------------------- roster viability

function hashSeed(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return (h % 2147483646) + 1
}

/** A trialist from the local scene, for a club that finds free agency empty. */
export function createTrialist(save: GameSave, team: TeamSaveData, n: number): PlayerSaveData {
    const rng = new SeededRNG(hashSeed(`trialist|${team.id}|${save.currentWeek}|${n}`))
    const identity = generateProspect("LOCAL", undefined, rng)
    const base = prospectToPlayerData(identity, save.currentWeek, rng) as unknown as PlayerSaveData
    const [lo, hi] = AI_ECONOMY_TUNING.TRIALIST_SKILL
    const [aLo, aHi] = AI_ECONOMY_TUNING.TRIALIST_AGE
    const skill = rng.int(lo, hi)
    const player: PlayerSaveData = {
        ...base,
        id: `trialist_${team.id}_${save.currentWeek}_${n}`,
        age: rng.int(aLo, aHi),
        tier: "SEMI_PRO",
        skill,
        potential: Math.max(skill, Math.min(90, (base.potential ?? skill) || skill)),
        morale: 70, form: 50, fatigue: 0, health: 100, energy: 100, maxEnergy: 100,
    }
    save.players.push(player)
    return player
}

/**
 * Bring an AI club to five senior players. In order: the best free agent
 * its budget allows (headroom shared between the open places); its own academy prospect on a normal quote within
 * budget; the cheapest free agent on credit (the club may go into debt to
 * field a team); its best academy prospect on credit; a trialist. Returns
 * the number of players added.
 */
export function fillAIRosterToFive(save: GameSave, team: TeamSaveData, pool?: PlayerSaveData[], maxSignings = 5): number {
    let added = 0
    const free = pool ?? signableFreeAgents(save)
    const players = playersById(save, [...team.rosterIds, ...(team.youthAcademyIds || [])])
    const weeks = AI_ECONOMY_TUNING.EMERGENCY_CONTRACT_WEEKS
    const quotes = new Map<string, number>()
    const quote = (p: PlayerSaveData) => {
        let q = quotes.get(p.id)
        if (q === undefined) { q = recruitmentSalary(p, save.currentWeek, team); quotes.set(p.id, q) }
        return q
    }
    const take = (p: PlayerSaveData) => { const i = free.indexOf(p); if (i >= 0) free.splice(i, 1) }
    const prospects = () => (team.youthAcademyIds || []).map(id => players.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
        .sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0) || a.id.localeCompare(b.id))
    const promote = (p: PlayerSaveData, salary: number) => {
        team.youthAcademyIds = (team.youthAcademyIds || []).filter(id => id !== p.id)
        team.rosterIds.push(p.id)
        save.contracts.push({ playerId: p.id, teamId: team.id, salaryPerWeek: salary, startWeek: save.currentWeek, endWeek: save.currentWeek + 104, buyout: 0 })
        applyRosterChangePenalty(team, save.currentWeek, 1)
    }
    const roles = new Set(team.rosterIds.map(id => recruitmentRole(players.get(id)?.role)))
    const sign = (p: PlayerSaveData, ask: number, contractWeeks: number, prefix?: string) => {
        signAIPlayer(team, save, p, ask, contractWeeks, prefix)
        roles.add(recruitmentRole(p.role))
        take(p)
        added++
    }
    for (let guard = 0; team.rosterIds.length < 5 && added < maxSignings && guard < 10; guard++) {
        const budget = aiClubBudget(save, team)
        const rostered = new Set(save.teams.flatMap(t => t.rosterIds))
        const live = free.filter(p => !p.isRetired && !rostered.has(p.id))
        // 1. The best player the budget allows, the headroom shared between
        //    the open places (a missing role counts; cheaper breaks ties).
        const share = Math.floor(budget.headroom / Math.max(1, 5 - team.rosterIds.length))
        let pick: { p: PlayerSaveData; ask: number; score: number } | undefined
        for (const p of live) {
            const ask = quote(p)
            if (ask > share || !aiCanCommit(team, budget, ask)) continue
            const score = aiKeepValue(p) + (roles.has(recruitmentRole(p.role)) ? 0 : 5)
            if (!pick || score > pick.score || (score === pick.score && (ask < pick.ask || (ask === pick.ask && p.id < pick.p.id)))) pick = { p, ask, score }
        }
        if (pick) { sign(pick.p, pick.ask, 52); continue }
        // 2. Own academy within budget.
        const youth = prospects()[0]
        if (youth && aiCanCommit(team, budget, quote(youth))) { promote(youth, quote(youth)); roles.add(recruitmentRole(youth.role)); added++; continue }
        // 3. Cheapest free agent on credit.
        let cheapest: { p: PlayerSaveData; ask: number } | undefined
        for (const p of live) {
            const ask = quote(p)
            if (!cheapest || ask < cheapest.ask || (ask === cheapest.ask && ((p.skill ?? 0) > (cheapest.p.skill ?? 0) || ((p.skill ?? 0) === (cheapest.p.skill ?? 0) && p.id < cheapest.p.id)))) cheapest = { p, ask }
        }
        if (cheapest) { sign(cheapest.p, cheapest.ask, weeks); continue }
        // 4. Own academy on credit; 5. a trialist.
        if (youth) { promote(youth, quote(youth)); roles.add(recruitmentRole(youth.role)); added++; continue }
        const prefix = `trialist_${team.id}_${save.currentWeek}_`
        sign(createTrialist(save, team, save.players.filter(p => p.id.startsWith(prefix)).length), MIN_ASKING_WAGE, weeks, "trialist_ai")
    }
    if (added) recalculateTeamSynergy(team, save.players)
    return added
}

/**
 * The roster invariant for every AI club: at least five senior players.
 * Run after anything that can remove players (contract expiry, retirement,
 * administration, transfers) and before matches are played.
 */
export function ensureAIRosterViability(save: GameSave, playerTeamId: string | null | undefined): string[] {
    const short = save.teams.filter(t => t.id !== playerTeamId && t.rosterIds.length < 5)
    if (!short.length) return []
    const pool = signableFreeAgents(save)
    const filled: string[] = []
    for (const team of short) if (fillAIRosterToFive(save, team, pool) > 0) filled.push(team.id)
    return filled
}
