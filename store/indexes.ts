/**
 * Entity Index System
 * Provides O(1) lookups for game entities by ID, replacing O(n) .find() calls.
 * Indexes are transient (not persisted) and rebuilt on hydration and after state mutations.
 */

import type { TeamSaveData, PlayerSaveData, ContractSaveData, StaffSaveData, TournamentSaveData, CompletedMatchSaveData, GameSave } from "@/engine/save-types"

export interface EntityIndexes {
  _teamIndex: Map<string, TeamSaveData>
  _playerIndex: Map<string, PlayerSaveData>
  _contractByPlayerIndex: Map<string, ContractSaveData>
  _staffIndex: Map<string, StaffSaveData>
  _completedMatchIds: Set<string>
}

/**
 * Extended indexes for engine use (includes tournament data).
 * Built once per processWeek() call for O(1) lookups across the entire save.
 */
export interface SaveIndexes {
  teamIndex: Map<string, TeamSaveData>
  playerIndex: Map<string, PlayerSaveData>
  contractIndex: Map<string, ContractSaveData>
  staffIndex: Map<string, StaffSaveData>
  tournamentIndex: Map<string, TournamentSaveData>
  completedMatchIndex: Map<string, CompletedMatchSaveData>
}

/** Build all indexes from a GameSave object (for engine use) */
export function buildSaveIndexes(save: GameSave): SaveIndexes {
  const teamIndex = new Map<string, TeamSaveData>()
  for (const team of save.teams) {
    teamIndex.set(team.id, team)
  }

  const playerIndex = new Map<string, PlayerSaveData>()
  for (const player of save.players) {
    playerIndex.set(player.id, player)
  }

  const contractIndex = new Map<string, ContractSaveData>()
  for (const contract of save.contracts) {
    contractIndex.set(contract.playerId, contract)
  }

  const staffIndex = new Map<string, StaffSaveData>()
  for (const s of save.staff) {
    staffIndex.set(s.id, s)
  }

  const tournamentIndex = new Map<string, TournamentSaveData>()
  for (const t of save.tournaments) {
    tournamentIndex.set(t.id, t)
  }

  const completedMatchIndex = new Map<string, CompletedMatchSaveData>()
  for (const m of save.completedMatches) {
    completedMatchIndex.set(m.id, m)
  }

  return { teamIndex, playerIndex, contractIndex, staffIndex, tournamentIndex, completedMatchIndex }
}

/**
 * Build a bracket lookup map for a tournament's playoff bracket.
 * Call once per tournament processing to avoid repeated .find() on bracket arrays.
 */
export function buildBracketIndex<T extends { id: string }>(bracket: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const match of bracket) {
    map.set(match.id, match)
  }
  return map
}

/** Build all indexes from current state arrays (for store use) */
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

/** Get a tournament by ID, falling back to linear scan */
export function getTournamentById(tournaments: TournamentSaveData[], index: Map<string, TournamentSaveData> | undefined, id: string): TournamentSaveData | undefined {
  if (index) return index.get(id)
  return tournaments.find(t => t.id === id)
}
