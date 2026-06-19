/**
 * Team-strength calculation: avgSkill × (energy × form × fatigue) +
 * additive bonuses (role coverage, chemistry, morale, staff, equipment,
 * facilities, tactical/mental prep, playstyle, targetPlayer tunneling).
 *
 * Extracted from match-simulation.ts (Phase J3). Hybrid multiplicative
 * core × additive secondary scheme prevents small individual debuffs
 * from cascading catastrophically — the multiplicative core handles
 * physical readiness (energy/form/fatigue) while everything else is
 * additive, summed once, and floored at 0.7× to keep results positive
 * even with pathological inputs.
 *
 * Pure function. No mutation. Called every round from simulateMap +
 * useLiveMatch for live strength tracking.
 *
 * Pinned by 10 J1 tests covering empty roster, monotonic skill, the
 * energy<20 exhausted penalty, staff/equipment/tactical/mental
 * additions, the targetPlayerId tunneling penalty, and the 0.7× floor
 * for pathological inputs.
 */

import type { Player, Team, Coach, Analyst, Psychologist } from "@/types"
import { calculateTeamChemistry } from "@/types"

interface StaffBundle {
    coach?: Coach
    analyst?: Analyst
    psychologist?: Psychologist
}

export function calculateTeamStrength(
    team: Team,
    players: Player[],
    staff: StaffBundle,
    mentalPrep?: boolean,
): number {
    if (players.length === 0) return 0

    // Facility level comes from the facilities ARRAY the player actually
    // upgrades (upgradeFacility mutates facilities[].level). The legacy
    // team.facilitiesLevel scalar is set once at init and never mutated -
    // reading only it meant paid facility upgrades never reached match day.
    // Runtime reality: callers cast the SAVE team straight in, so
    // `facilities` is the save-shaped array ({type, level}[]) - the local
    // Team type's object shape never exists at runtime.
    const facilityArr = (team as unknown as { facilities?: { level?: number }[] }).facilities
    // Average across the facility array so investing in ALL facilities matters
    // (was max-of-one, so a single maxed facility handed out the full bonus).
    // Falls back to the legacy scalar when the array is absent.
    const facilityLevels = Array.isArray(facilityArr) && facilityArr.length > 0
        ? facilityArr.map(f => f.level || 1)
        : [(team as unknown as { facilitiesLevel?: number }).facilitiesLevel || 1]
    const avgFacilityLevel = facilityLevels.reduce((s, l) => s + l, 0) / facilityLevels.length

    // Average skill: the headline number — 0-100, normalized output.
    const avgSkill = players.reduce((sum, p) => sum + p.skill, 0) / players.length

    // Energy multiplier 0.8-1.0; -15% extra if avg energy is critical.
    const avgEnergy = players.reduce((sum, p) => sum + (p.energy ?? 100), 0) / players.length
    let energyMod = 0.8 + (avgEnergy / 100) * 0.2
    if (avgEnergy < 20) {
        energyMod *= 0.85
    }

    // Form multiplier 0.9-1.1.
    const avgForm = players.reduce((sum, p) => sum + (p.form ?? 50), 0) / players.length
    const formMod = 0.9 + (avgForm / 100) * 0.2

    // Role coverage 0.8-1.0 (5 unique roles is max bonus).
    const roles = new Set(players.map(p => p.role))
    const roleCoverage = 0.8 + (roles.size / 5) * 0.2

    // Chemistry 0.85-1.15. Cached on team if available; otherwise recompute.
    const chemistry = team.chemistry ?? calculateTeamChemistry(players)
    const chemistryMod = 0.85 + (chemistry / 100) * 0.3

    // Morale 0.8-1.2.
    const avgMorale = players.reduce((sum, p) => sum + (p.morale ?? 50), 0) / players.length
    const moraleMod = 0.8 + (avgMorale / 100) * 0.4

    // Fatigue 1.0-0.7 (higher fatigue is worse).
    const avgFatigue = players.reduce((sum, p) => sum + (p.fatigue ?? 0), 0) / players.length
    const fatigueMod = 1.0 - (avgFatigue / 100) * 0.3

    // Staff bonuses. Coach uses tacticBonus if present (set by anti_strat
    // adjustment upstream), else falls back to level × 2.
    let staffMod = 1.0
    if (staff.coach) {
        staffMod += (staff.coach.tacticBonus || (staff.coach.level * 2)) / 100
    }
    if (staff.analyst) {
        staffMod += (staff.analyst.level * 2.0) / 100
    }
    if (staff.psychologist) {
        staffMod += (staff.psychologist.level * 1.5) / 100
    }

    // Equipment: each stat-point gives ~0.5% strength.
    let equipMod = 1.0
    if (team.equipment && team.equipment.length > 0) {
        team.equipment.forEach((item) => {
            const bonusValue = item.bonus?.value || 0
            equipMod += (bonusValue / 80)
        })
    }

    // +2% per average facility level, capped at +10% (reached when every
    // facility hits the level-5 cap). The old /100 capped at +5% — half the
    // documented bonus — because facilities cap at 5, not the assumed 10.
    const facilitiesMod = 1.0 + Math.min(0.10, avgFacilityLevel / 50)

    // Tactical prep up to +25% at 100% prep; mental prep adds +3%.
    let tacticalMod = 1.0
    if (team.tacticalPrep) {
        tacticalMod += (team.tacticalPrep / 400)
    }
    if (mentalPrep) {
        tacticalMod += 0.03
    }

    // Quick-Sim differential (B4): one-click simulating from the dashboard skips
    // the match-day prep flow (veto / tactics / live calls), forgoing a small
    // edge. Only ever set on a transient sim copy of the player's team, never
    // persisted — so it's 0 for every AI match and every prepared player.
    if (team.prepPenalty) {
        tacticalMod -= team.prepPenalty
    }

    // Playstyle specialization bonuses.
    if (team.playstyle === "aggressive" && avgMorale > 80) {
        tacticalMod += 0.05
    } else if (team.playstyle === "structured" && chemistry > 80) {
        tacticalMod += 0.05
    }

    // Antistratting tunnel-vision self-penalty.
    if (team.targetPlayerId) {
        tacticalMod *= 0.95
    }

    // Hybrid: multiplicative physical-readiness core × additive secondary
    // bonuses, floored at 0.7×. Prevents the equipment + tactical + staff
    // stack from cascading into negative territory under pathological
    // inputs.
    const coreMod = energyMod * formMod * fatigueMod
    const additiveBonus = (roleCoverage - 1) + (chemistryMod - 1) + (moraleMod - 1) + (staffMod - 1) + (equipMod - 1) + (facilitiesMod - 1) + (tacticalMod - 1)
    return avgSkill * coreMod * Math.max(0.7, 1 + additiveBonus)
}
