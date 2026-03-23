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
 * Reconcile roles for a single team.
 * 1. Resets everyone to RIFLER.
 * 2. Identifies potential specialists for each role.
 * 3. Assigns roles greedily to the best qualified player.
 */
export function reconcileTeamRoles(players: PlayerSaveData[]): void {
    if (!players || players.length === 0) return

    // 1. Clear secondary roles only; preserve existing primary roles
    players.forEach(p => {
        p.secondaryRole = undefined
    })

    // 2. Map potential for each role
    const potentialAssignments: Map<PlayerRole, { player: PlayerSaveData; score: number }[]> = new Map()

    SPECIALTIES.forEach(spec => {
        const candidates = players
            .filter(p => spec.criteria(p))
            .map(p => ({
                player: p,
                score: spec.calculateFit(p)
            }))
            .sort((a, b) => b.score - a.score)

        potentialAssignments.set(spec.id, candidates)
    })

    // 3. Greedy Assignment — assign specialist roles as primary role
    const assignedPlayerIds = new Set<string>()
    const remainingSpecialties = [...SPECIALTIES]

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
        const player = (bestGlobalCandidate as any).player as PlayerSaveData
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

    // 4. Unassigned players default to RIFLER
    players.forEach(p => {
        if (!assignedPlayerIds.has(p.id)) {
            p.role = PlayerRole.RIFLER
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
