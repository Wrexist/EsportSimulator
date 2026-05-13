import { PlayerSaveData } from "./save-types"
import { PlayerRole } from "@/types/enums"

/**
 * Specialty role definitions with their criteria and fit score formulas
 */
const SPECIALTIES = [
    {
        id: PlayerRole.AWPER,
        criteria: (p: PlayerSaveData) => {
            const firepower = ((p.skill || 0) + (p.rifle || 0)) / 2
            return (p.awp || 0) > 70 && (p.awp || 0) > firepower
        },
        calculateFit: (p: PlayerSaveData) => (p.awp || 0) * 0.7 + (p.reaction || 0) * 0.3
    },
    {
        id: PlayerRole.IGL,
        criteria: (p: PlayerSaveData) => (p.leader || 0) > 75 && (p.tactic || 0) > 75,
        calculateFit: (p: PlayerSaveData) => (p.leader || 0) * 0.5 + (p.tactic || 0) * 0.5
    },
    {
        id: PlayerRole.ENTRY_FRAGGER,
        criteria: (p: PlayerSaveData) => (p.reaction || 0) > 75 && (p.rifle || 0) > 75,
        calculateFit: (p: PlayerSaveData) => (p.reaction || 0) * 0.6 + (p.rifle || 0) * 0.4
    },
    {
        id: PlayerRole.SUPPORT,
        criteria: (p: PlayerSaveData) => (p.grenades || 0) > 75 && (p.teamwork || 0) > 75,
        calculateFit: (p: PlayerSaveData) => (p.grenades || 0) * 0.6 + (p.teamwork || 0) * 0.4
    }
]

/**
 * Reconcile roles for a single team — with hysteresis.
 *
 * Without hysteresis, this function ran every AI tick and recomputed roles
 * from scratch, clobbering any role a player had been deliberately trained
 * into (via considerRoleTraining or a manual assignment), and flapping
 * between roles when stats dipped below threshold for a tick (fatigue, form
 * penalty).
 *
 * Fix: a player who *already* has a specialty role keeps it as long as
 * they still meet that role's criteria — even if a fresh candidate would
 * currently score higher. Only roles without a qualifying incumbent are
 * filled by the greedy pass.
 */
export function reconcileTeamRoles(players: PlayerSaveData[]): void {
    if (!players || players.length === 0) return

    // 1. Clear secondary roles only; primary roles are decided below.
    players.forEach(p => {
        p.secondaryRole = undefined
    })

    const specialtyIdSet = new Set<PlayerRole>(SPECIALTIES.map(s => s.id))
    const assignedPlayerIds = new Set<string>()
    const remainingSpecialties: typeof SPECIALTIES = []

    // 2. Hysteresis pass: keep an incumbent if they still qualify for their
    //    current role. Their slot is locked — no other candidate competes.
    for (const spec of SPECIALTIES) {
        const incumbent = players.find(p =>
            !assignedPlayerIds.has(p.id) &&
            p.role === spec.id &&
            spec.criteria(p)
        )
        if (incumbent) {
            assignedPlayerIds.add(incumbent.id)
        } else {
            remainingSpecialties.push(spec)
        }
    }

    // 3. Greedy pass for the unassigned roles only. Excludes already-locked
    //    incumbents so their stats don't count toward another role.
    const potentialAssignments: Map<PlayerRole, { player: PlayerSaveData; score: number }[]> = new Map()

    remainingSpecialties.forEach(spec => {
        const candidates = players
            .filter(p => !assignedPlayerIds.has(p.id) && spec.criteria(p))
            .map(p => ({
                player: p,
                score: spec.calculateFit(p)
            }))
            .sort((a, b) => b.score - a.score)

        potentialAssignments.set(spec.id, candidates)
    })

    while (remainingSpecialties.length > 0) {
        let bestGlobalCandidate: { specId: PlayerRole; player: PlayerSaveData; score: number } | null = null

        for (const spec of remainingSpecialties) {
            const topCandidate = potentialAssignments.get(spec.id)?.[0]
            if (topCandidate && !assignedPlayerIds.has(topCandidate.player.id)) {
                if (!bestGlobalCandidate || topCandidate.score > bestGlobalCandidate.score) {
                    bestGlobalCandidate = {
                        specId: spec.id,
                        player: topCandidate.player,
                        score: topCandidate.score
                    }
                }
            }
        }

        if (!bestGlobalCandidate) break // No more qualifying candidates for remaining roles

        // Assign the specialty as primary role (not secondary)
        const specId = bestGlobalCandidate.specId
        const player = bestGlobalCandidate.player
        player.role = specId
        assignedPlayerIds.add(player.id)

        // Remove the role and update the potential assignments
        const specIndex = remainingSpecialties.findIndex(s => s.id === specId)
        remainingSpecialties.splice(specIndex, 1)

        // Filter out this player from other roles
        potentialAssignments.forEach((candidates, roleId) => {
            potentialAssignments.set(roleId, candidates.filter(c => c.player.id !== player.id))
        })
    }

    // 4. Anyone unassigned at this point either (a) had no role at all, or
    //    (b) held a specialty role they no longer qualify for. Both fall
    //    back to RIFLER. Players who were already RIFLER stay RIFLER.
    players.forEach(p => {
        if (!assignedPlayerIds.has(p.id)) {
            if (specialtyIdSet.has(p.role as PlayerRole) || !p.role) {
                p.role = PlayerRole.RIFLER
            }
        }
    })
}

/**
 * Global sweep to reconcile all teams in a save
 */
export function reconcileAllRoles(teams: { rosterIds: string[] }[], allPlayers: PlayerSaveData[]): void {
    const playerMap = new Map(allPlayers.map(p => [p.id, p]))

    teams.forEach(team => {
        const roster = team.rosterIds
            .map(id => playerMap.get(id))
            .filter((p): p is PlayerSaveData => !!p)

        reconcileTeamRoles(roster)
    })
}
