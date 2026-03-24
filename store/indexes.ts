/**
 * Entity Index System
 * Provides O(1) lookups for game entities by ID, replacing O(n) .find() calls.
 * Indexes are transient (not persisted) and rebuilt on hydration and after state mutations.
 */

import type { TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData } from "@/engine/save-types"

export interface EntityIndexes {
  _teamIndex: Map<string, TeamSaveData>
  _playerIndex: Map<string, PlayerSaveData>
  _contractByPlayerIndex: Map<string, ContractSaveData>
  _staffIndex: Map<string, StaffSaveData>
  _completedMatchIds: Set<string>
}

/** Build all indexes from current state arrays */
export function buildEntityIndexes(
  teams: TeamSaveData[],
  players: PlayerSaveData[],
  contracts: ContractSaveData[],
  staff: StaffSaveData[],
  completedMatches: { id: string }[]
): EntityIndexes {
  const _teamIndex = new Map<string, TeamSaveData>()
  for (const team of teams) {
    _teamIndex.set(team.id, team)
  }

  const _playerIndex = new Map<string, PlayerSaveData>()
  for (const player of players) {
    _playerIndex.set(player.id, player)
  }

  const _contractByPlayerIndex = new Map<string, ContractSaveData>()
  for (const contract of contracts) {
    _contractByPlayerIndex.set(contract.playerId, contract)
  }

  const _staffIndex = new Map<string, StaffSaveData>()
  for (const s of staff) {
    _staffIndex.set(s.id, s)
  }

  const _completedMatchIds = new Set<string>()
  for (const match of completedMatches) {
    _completedMatchIds.add(match.id)
  }

  return { _teamIndex, _playerIndex, _contractByPlayerIndex, _staffIndex, _completedMatchIds }
}

/** Quick lookup helpers that fall back to linear scan if index is missing */
export function getTeamById(teams: TeamSaveData[], index: Map<string, TeamSaveData> | undefined, id: string): TeamSaveData | undefined {
  if (index) return index.get(id)
  return teams.find(t => t.id === id)
}

export function getPlayerById(players: PlayerSaveData[], index: Map<string, PlayerSaveData> | undefined, id: string): PlayerSaveData | undefined {
  if (index) return index.get(id)
  return players.find(p => p.id === id)
}

export function getStaffById(staff: StaffSaveData[], index: Map<string, StaffSaveData> | undefined, id: string): StaffSaveData | undefined {
  if (index) return index.get(id)
  return staff.find(s => s.id === id)
}

export function getContractByPlayerId(contracts: ContractSaveData[], index: Map<string, ContractSaveData> | undefined, playerId: string): ContractSaveData | undefined {
  if (index) return index.get(playerId)
  return contracts.find(c => c.playerId === playerId)
}

export function isMatchCompleted(completedMatchIds: Set<string> | undefined, completedMatches: { id: string }[], matchId: string): boolean {
  if (completedMatchIds) return completedMatchIds.has(matchId)
  return completedMatches.some(cm => cm.id === matchId)
}
