/**
 * Memoized Store Selectors
 * Provides commonly-used derived data with O(1) lookups via entity indexes.
 * Use with useGameStore(selector) to minimize re-renders.
 */

import type { TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData } from "@/engine/save-types"

interface StoreState {
  playerTeamId: string
  teams: TeamSaveData[]
  players: PlayerSaveData[]
  contracts: ContractSaveData[]
  staff: StaffSaveData[]
  _teamIndex?: Map<string, TeamSaveData>
  _playerIndex?: Map<string, PlayerSaveData>
  _contractByPlayerIndex?: Map<string, ContractSaveData>
  _staffIndex?: Map<string, StaffSaveData>
}

/** Select the player's team (O(1) with index) */
export const selectPlayerTeam = (state: StoreState): TeamSaveData | undefined =>
  state._teamIndex?.get(state.playerTeamId) ?? state.teams.find(t => t.id === state.playerTeamId)

/** Select a team by ID (O(1) with index) */
export const selectTeamById = (id: string) => (state: StoreState): TeamSaveData | undefined =>
  state._teamIndex?.get(id) ?? state.teams.find(t => t.id === id)

/** Select a player by ID (O(1) with index) */
export const selectPlayerById = (id: string) => (state: StoreState): PlayerSaveData | undefined =>
  state._playerIndex?.get(id) ?? state.players.find(p => p.id === id)

/** Select roster players for a team (O(1) per player with index) */
export const selectTeamRoster = (teamId: string) => (state: StoreState): PlayerSaveData[] => {
  const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
  if (!team) return []
  return team.rosterIds
    .map(id => state._playerIndex?.get(id) ?? state.players.find(p => p.id === id))
    .filter((p): p is PlayerSaveData => p !== undefined)
}

/** Select staff for a team (O(1) per staff with index) */
export const selectTeamStaff = (teamId: string) => (state: StoreState): StaffSaveData[] => {
  const team = state._teamIndex?.get(teamId) ?? state.teams.find(t => t.id === teamId)
  if (!team) return []
  return (team.staffIds || [])
    .map(id => state._staffIndex?.get(id) ?? state.staff.find(s => s.id === id))
    .filter((s): s is StaffSaveData => s !== undefined)
}

/** Select a contract by player ID (O(1) with index) */
export const selectContractByPlayerId = (playerId: string) => (state: StoreState): ContractSaveData | undefined =>
  state._contractByPlayerIndex?.get(playerId) ?? state.contracts.find(c => c.playerId === playerId)
