import type { GameSave, TeamSaveData } from './save-types'

export const CLUB_MANAGEMENT_KEYS = [
    'academyPlayers', 'academyMatchHistory', 'academyRoster', 'academyTrainingSchedule',
    'academyWeeklyReports', 'academyScoutingMissions', 'academyPendingProspects',
    'scoutedPlayers', 'activeScoutingMission', 'watchlistedPlayerIds', 'sponsorOffers',
    'declinedSponsorOfferIds', 'boardState',
] as const
export type ClubManagementState = Pick<GameSave, typeof CLUB_MANAGEMENT_KEYS[number]>

/** Club-owned plans and reports stay with the club when the manager changes jobs. */
export function switchClubManagement(save: GameSave, oldTeam: TeamSaveData | undefined, newTeam: TeamSaveData): void {
    const archived = Object.fromEntries(CLUB_MANAGEMENT_KEYS.map(key => [key, save[key]])) as ClubManagementState
    if (oldTeam) oldTeam.managementState = archived
    const incoming = newTeam.managementState
    const empty: ClubManagementState = {
        academyPlayers: [], academyMatchHistory: [], academyRoster: {}, academyTrainingSchedule: {},
        academyWeeklyReports: [], academyScoutingMissions: [], academyPendingProspects: [],
        scoutedPlayers: [], activeScoutingMission: undefined, watchlistedPlayerIds: [],
        sponsorOffers: [], declinedSponsorOfferIds: [], boardState: undefined,
    }
    Object.assign(save, empty, incoming)
    delete newTeam.managementState
    // Retirements can happen while another club is managed; do not resurrect enrollment.
    save.academyPlayers = save.academyPlayers.filter(p => save.players.some(player => player.id === p.playerId && !player.isRetired))
    const enrolled = new Set(save.academyPlayers.map(p => p.id))
    for (const role of Object.keys(save.academyRoster)) if (!enrolled.has(save.academyRoster[role] || '')) save.academyRoster[role] = null
    save.playerTeamId = newTeam.id
    save.pendingCelebration = null
    save.pendingSeasonRecap = null
    save.pendingLegendPick = null
}
