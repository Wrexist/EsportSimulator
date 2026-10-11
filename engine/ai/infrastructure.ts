/**
 * AI infrastructure investment — per-team weekly decisions to hire
 * staff, sign sponsors, build/upgrade facilities, and invest in the
 * youth academy. Together these close the gameplay-parity gap from
 * D5–D8: previously the player could pursue all four progression
 * paths while AI teams remained on rails.
 *
 * All four functions share the same shape:
 *   - Roll a low-probability die for the action
 *   - Gate on team.financialState
 *   - Mutate team + save in place
 *   - Log to save.financeLedger so the player can see AI spending
 *
 * Extracted from ai-manager.ts (Phase H3). The static-method versions
 * on AIManager have been replaced with delegations to these exports.
 */

import type { GameSave, TeamSaveData, FacilitySaveData } from "../save-types"
import type { SeededRNG } from "../rng"
import { StaffGenerator } from "../staff-generator"
import { SponsorGenerator } from "../economy-manager"
import { EconomyEngine } from "../economy-engine"
import { AI_SQUAD_TUNING } from "@/lib/balance-tuning"
import { aiCanCommit, aiClubBudget } from "./club-budget"
import { aiRoll, hashTeamId } from "./rng-helpers"

/**
 * AI staff hiring. 3% per week, max 3 staff, priority order
 * coach > analyst > psychologist > scout. Skips teams in CRISIS / RISK
 * / INSOLVENT or with budget < $200k.
 */
export function manageStaff(team: TeamSaveData, save: GameSave, rng: SeededRNG) {
    if (aiRoll(rng) > 0.03) return
    if (team.budget < 200_000) return
    if (team.financialState === "CRISIS"
        || team.financialState === "INSOLVENT"
        || team.financialState === "RISK") return

    const currentStaff = save.staff.filter(s => s.teamId === team.id)
    const MAX_AI_STAFF = 3
    if (currentStaff.length >= MAX_AI_STAFF) return

    // Priority order: coach (tactic) → analyst (anti-strat) →
    // psychologist (morale) → scout (academy/scouting).
    const ownedRoles = new Set(currentStaff.map(s => s.role))
    const priorityRoles: Array<"coach" | "analyst" | "psychologist" | "scout"> = [
        "coach", "analyst", "psychologist", "scout",
    ]
    const targetRole = priorityRoles.find(role => !ownedRoles.has(role))
    if (!targetRole) return

    // Mix the team id into the seed so multiple AI teams get different
    // staff on the same tick.
    const staffSeed = rng.int(1, 2147483646) ^ hashTeamId(team.id)
    const newStaff = StaffGenerator.generateFakeStaff(targetRole, staffSeed, rng)
    newStaff.teamId = team.id
    newStaff.contractEndWeek = save.currentWeek + 52
    newStaff.yearsRemaining = 1

    // Sign-on fee = 2 weeks' salary (matches the player-team default).
    const signOnFee = newStaff.salaryPerWeek * 2
    if (!aiCanCommit(team, aiClubBudget(save, team), newStaff.salaryPerWeek, signOnFee)) return

    team.budget -= signOnFee
    save.staff.push(newStaff)
    team.staffIds.push(newStaff.id)

    save.financeLedger.push({
        id: `fin_ai_hire_${save.currentWeek}_${team.id}_${newStaff.id}`,
        week: save.currentWeek,
        teamId: team.id,
        type: "EXPENSE",
        category: "WAGES_STAFF",
        amount: signOnFee,
        description: `AI hired ${newStaff.name} (${newStaff.role})`,
        balance: team.budget,
    })
}

/**
 * AI sponsor signing. 5% per week, max 2 per team, tier-gated by ranking
 * (PREMIUM ≤30, ELITE ≤10 or S_TIER trophy/participation). Skips teams in
 * any financial trouble.
 */
export function manageSponsors(team: TeamSaveData, save: GameSave, rng: SeededRNG): void {
    // Pass 2: AI clubs fill sponsor slots like the managed club (3 slots).
    // Phase 4.6: an AI club with an open slot it is eligible for looks at
    // offers every week, as the managed club can from the Sponsorships
    // screen. At a 25% weekly look a lapsed deal stayed unsigned for ~4
    // weeks and top AI clubs averaged 1.5-2 of their 3 deals (campaign
    // 2026-10-11), while the managed top club kept all three.
    const MAX_AI_SPONSORS = AI_SQUAD_TUNING.MAX_SPONSORS
    if (!team.sponsors) team.sponsors = []
    if (team.sponsors.length >= MAX_AI_SPONSORS) return
    const ranking = team.worldRanking || 999
    const ownedTiers = new Set(team.sponsors.map(s => s.tier))
    // PREMIUM needs Top-30; ELITE needs Top-10 OR S_TIER trophy/participation.
    const eliteEligible = () => {
        if (ranking <= 10 || (team.trophies || []).some(t => t.tier === "S_TIER")) return true
        const majors = new Set(save.tournaments.filter(t => t.tier === "S_TIER").map(t => t.id))
        return majors.size > 0 && save.completedMatches.some(m => (m.homeTeamId === team.id || m.awayTeamId === team.id) && !!m.tournamentId && majors.has(m.tournamentId))
    }
    const open = (["STANDARD", "PREMIUM", "ELITE"] as const).filter(tier => !ownedTiers.has(tier)
        && (tier === "STANDARD" || (tier === "PREMIUM" ? ranking <= 30 : eliteEligible())))
    if (!open.length) return
    if (AI_SQUAD_TUNING.SPONSOR_LOOK_CHANCE < 1 && aiRoll(rng) > AI_SQUAD_TUNING.SPONSOR_LOOK_CHANCE) return

    const offers = SponsorGenerator.generateVariedOffers(team, save.currentWeek, rng,
        EconomyEngine.sponsorCostBase(team, save.contracts, save.staff || [], save.currentWeek + 1))
    const eligible = offers.filter(offer => (open as readonly string[]).includes(offer.tier))
    if (eligible.length === 0) return

    const tierRank = { ELITE: 3, PREMIUM: 2, STANDARD: 1 } as const
    eligible.sort((a, b) => (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0) || b.weeklyPayout - a.weeklyPayout)

    // Phase 4.4: fill every open eligible slot in one look (one deal per
    // tier), as the managed club can from the Sponsorships screen. Signing a
    // single deal per look left AI clubs a slot or two short for months,
    // which the new economy (sponsors sized to running costs) turned into a
    // structural deficit for top AI clubs.
    for (const picked of eligible) {
        if (team.sponsors.length >= MAX_AI_SPONSORS) break
        if (team.sponsors.some(s => s.tier === picked.tier)) continue
        team.sponsors.push({
            ...picked,
            signedWeek: save.currentWeek,
            followerCheckpoint: team.followers || 0,
            lastProcessedWeek: undefined,
            remainingWeeks: Math.max(1, Math.floor(picked.remainingWeeks || 0)),
        })
    }
}

/**
 * AI facility builds + upgrades. 4% per week, STABLE-only. Two passes:
 *   1. Build any missing facility ($10k) — biggest impact comes from
 *      filling all four types before upgrading any one.
 *   2. Upgrade the lowest-level facility (cost = level × $25k, cap 5).
 *      Tiebreak by FACILITY_TYPES order (TRAINING > RECOVERY > TACTICAL
 *      > FANZONE).
 */
export function manageFacilities(team: TeamSaveData, save: GameSave, rng: SeededRNG): void {
    if (aiRoll(rng) > 0.04) return
    if (team.financialState !== "STABLE") return

    if (!team.facilities) team.facilities = []

    const FACILITY_TYPES: FacilitySaveData["type"][] = ["TRAINING", "RECOVERY", "TACTICAL", "FANZONE"]
    const BUILD_COST = 10_000
    const UPGRADE_BASE_COST = 25_000
    const MAX_LEVEL = 5

    // Pass 1: build any missing facility type.
    const missingType = FACILITY_TYPES.find(t => !team.facilities!.some(f => f.type === t))
    const fits = (projected: TeamSaveData, cost: number) => {
        const before = aiClubBudget(save, team), after = aiClubBudget(save, projected)
        return aiCanCommit(team, before, Math.max(0, before.net - after.net), cost)
    }
    if (missingType && fits({ ...team, facilities: [...team.facilities, { id: "projected", type: missingType, level: 1, monthlyCost: 2000, description: "" }] }, BUILD_COST)) {
        team.budget -= BUILD_COST
        team.facilities.push({
            id: `fac_ai_${team.id}_${missingType}_${save.currentWeek}`,
            type: missingType,
            level: 1,
            description: `${missingType} facility`,
            monthlyCost: 2000,
        })
        save.financeLedger.push({
            id: `fin_ai_facbuild_${save.currentWeek}_${team.id}_${missingType}`,
            week: save.currentWeek,
            teamId: team.id,
            type: "EXPENSE",
            category: "FACILITIES",
            amount: BUILD_COST,
            description: `AI built ${missingType} facility`,
            balance: team.budget,
        })
        return
    }

    // Pass 2: upgrade the lowest-level facility.
    const upgradable = team.facilities
        .filter(f => f.level < MAX_LEVEL)
        .sort((a, b) =>
            a.level - b.level
            || FACILITY_TYPES.indexOf(a.type) - FACILITY_TYPES.indexOf(b.type)
        )
    const target = upgradable[0]
    if (!target) return

    const upgradeCost = target.level * UPGRADE_BASE_COST
    if (!fits({ ...team, facilities: team.facilities.map(f => f === target ? { ...f, level: f.level + 1 } : f) }, upgradeCost)) return

    team.budget -= upgradeCost
    target.level += 1
    target.monthlyCost = Math.floor(Math.pow(target.level, 1.25) * 2000)
    save.financeLedger.push({
        id: `fin_ai_facup_${save.currentWeek}_${team.id}_${target.type}_${target.level}`,
        week: save.currentWeek,
        teamId: team.id,
        type: "EXPENSE",
        category: "FACILITIES",
        amount: upgradeCost,
        description: `AI upgraded ${target.type} facility to Level ${target.level}`,
        balance: team.budget,
    })
}

/**
 * AI academy investment. 3% per week, STABLE-only. Build at level 1 if
 * no academy exists; otherwise upgrade to the next level (cost table
 * matches the player's exactly: 25k / 75k / 150k / 300k / 500k).
 */
export function manageAcademy(team: TeamSaveData, save: GameSave, rng: SeededRNG): void {
    // Academies are bought while sponsor income is high; when that income
    // lapses the upkeep (up to $40k/week) left low-reputation AI clubs in a
    // permanent deficit that also blocked every free-agent signing. Shed one
    // level per week (no refund) while the club cannot cover its running costs.
    if (team.academyFacility && team.academyFacility.level > 0 && aiClubBudget(save, team).net < 0) {
        team.academyFacility = { ...team.academyFacility, level: team.academyFacility.level - 1, lastUpgradeWeek: save.currentWeek }
        return
    }
    if (aiRoll(rng) > 0.03) return
    if (team.financialState !== "STABLE") return

    const ACADEMY_LEVEL_BUILD_COSTS: Record<number, number> = {
        1: 25_000,
        2: 75_000,
        3: 150_000,
        4: 300_000,
        5: 500_000,
    }
    const MAX_ACADEMY_LEVEL = 5

    const fits = (projected: TeamSaveData, cost: number) => {
        const before = aiClubBudget(save, team), after = aiClubBudget(save, projected)
        return aiCanCommit(team, before, Math.max(0, before.net - after.net), cost)
    }
    // Build level 1 if no academy.
    if (!team.academyFacility || team.academyFacility.level === 0) {
        const cost = ACADEMY_LEVEL_BUILD_COSTS[1]
        if (!fits({ ...team, academyFacility: { level: 1, builtWeek: save.currentWeek } }, cost)) return
        team.budget -= cost
        team.academyFacility = { level: 1, builtWeek: save.currentWeek }
        save.financeLedger.push({
            id: `fin_ai_academy_${save.currentWeek}_${team.id}_build`,
            week: save.currentWeek,
            teamId: team.id,
            type: "EXPENSE",
            category: "FACILITIES",
            amount: cost,
            description: "AI built Youth Academy",
            balance: team.budget,
        })
        return
    }

    // Upgrade to next level if affordable + below max.
    const currentLevel = team.academyFacility.level
    if (currentLevel >= MAX_ACADEMY_LEVEL) return

    const nextLevel = currentLevel + 1
    const cost = ACADEMY_LEVEL_BUILD_COSTS[nextLevel]
    if (!fits({ ...team, academyFacility: { ...team.academyFacility, level: nextLevel } }, cost)) return

    team.budget -= cost
    team.academyFacility.level = nextLevel
    team.academyFacility.lastUpgradeWeek = save.currentWeek
    save.financeLedger.push({
        id: `fin_ai_academy_${save.currentWeek}_${team.id}_up_${nextLevel}`,
        week: save.currentWeek,
        teamId: team.id,
        type: "EXPENSE",
        category: "FACILITIES",
        amount: cost,
        description: `AI upgraded Youth Academy to Level ${nextLevel}`,
        balance: team.budget,
    })
}
