import { MapId } from "@/types"
import { EconomyManager, WEAPONS } from "@/engine/economy-manager"
import { SeededRNG } from "@/engine/rng"

export interface LiveEconomyState {
  cash: number
  weapon: string
  hasArmor: boolean
  hasHelmet: boolean
  hasKit: boolean
  utility?: string[]
}

export interface RoundKillEntry {
  playerId: string
  kills: number
  weapon?: string
}

export interface RoundDeathEntry {
  playerId: string
  deaths: number
}

export interface RoundEconomyResult {
  winner: "HOME" | "AWAY"
  winType: string
  kills?: RoundKillEntry[]
  deaths?: RoundDeathEntry[]
}

const MAP_POOL: MapId[] = Object.values(MapId) as MapId[]
const MAP_SET = new Set<MapId>(MAP_POOL)

function clampCash(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(value)))
}

function normalizeMapId(input: unknown): MapId | null {
  if (typeof input !== "string") return null
  const exact = MAP_POOL.find(map => map === input)
  if (exact) return exact
  const lower = input.toLowerCase()
  return MAP_POOL.find(map => map.toLowerCase() === lower) ?? null
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1
  const normalized = Math.floor(seed) >>> 0
  return Math.max(1, normalized)
}

function getDefaultWeaponForSide(isCT: boolean): string {
  return isCT ? "usp" : "glock"
}

function normalizeWeaponLookupKey(weaponId: string | undefined): string {
  if (!weaponId) return "AK47"
  return weaponId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
}

function buildDeterministicMapOrder(seed: number): MapId[] {
  const rng = new SeededRNG(normalizeSeed(seed))
  const maps = [...MAP_POOL]
  for (let i = maps.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const tmp = maps[i]
    maps[i] = maps[j]
    maps[j] = tmp
  }
  return maps
}

export function getRequiredMapsForFormat(format?: string): number {
  if (format === "BO5") return 5
  if (format === "BO3") return 3
  return 1
}

export function getMapsToWinForFormat(format?: string): number {
  if (format === "BO5") return 3
  if (format === "BO3") return 2
  return 1
}

export function selectActiveRosterIds(rosterIds: string[] | undefined, maxPlayers = 5): string[] {
  if (!Array.isArray(rosterIds) || maxPlayers <= 0) return []
  const seen = new Set<string>()
  const active: string[] = []
  for (const id of rosterIds) {
    if (typeof id !== "string" || seen.has(id)) continue
    seen.add(id)
    active.push(id)
    if (active.length >= maxPlayers) break
  }
  return active
}

export function resolveCanonicalSeriesMaps(options: {
  format?: string
  seed: number
  urlMaps?: unknown[]
  savedMaps?: unknown[]
  fallbackMaps?: unknown[]
}): MapId[] {
  const requiredMaps = getRequiredMapsForFormat(options.format)
  const selected: MapId[] = []
  const seen = new Set<MapId>()

  const pushMaps = (candidateMaps: unknown[] | undefined) => {
    if (!Array.isArray(candidateMaps)) return
    for (const entry of candidateMaps) {
      if (selected.length >= requiredMaps) break
      const normalized = normalizeMapId(entry)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      selected.push(normalized)
    }
  }

  pushMaps(options.urlMaps)
  pushMaps(options.savedMaps)
  pushMaps(options.fallbackMaps)

  if (selected.length < requiredMaps) {
    const mapOrder = buildDeterministicMapOrder(options.seed)
    for (const mapId of mapOrder) {
      if (selected.length >= requiredMaps) break
      if (seen.has(mapId)) continue
      seen.add(mapId)
      selected.push(mapId)
    }
  }

  if (selected.length === 0) {
    selected.push(MapId.SANDSTONE)
  }

  return selected.slice(0, requiredMaps)
}

export function resolveHomeStartsCT(options: {
  mapId: MapId
  mapStartingSides?: Record<string, string>
  homeTeamId: string
  awayTeamId: string
  seed: number
  mapIndex: number
}): boolean {
  const forcedCTTeam = options.mapStartingSides?.[options.mapId]
  if (forcedCTTeam === options.homeTeamId) return true
  if (forcedCTTeam === options.awayTeamId) return false

  const baseSeed = normalizeSeed(options.seed)
  const mapHash = Array.from(options.mapId).reduce((acc, char) => {
    return (Math.imul(acc, 31) + char.charCodeAt(0)) >>> 0
  }, 7)
  const sideSeed = Math.max(1, (baseSeed + mapHash + (options.mapIndex + 1) * 7919) >>> 0)
  const rng = new SeededRNG(sideSeed)
  return rng.bool(0.5)
}

export function createRoundStartEconomy(playerIds: string[], isCT: boolean): Record<string, LiveEconomyState> {
  const economy: Record<string, LiveEconomyState> = {}
  const defaultWeapon = getDefaultWeaponForSide(isCT)
  for (const playerId of playerIds) {
    economy[playerId] = {
      cash: EconomyManager.ROUND_START_CASH,
      weapon: defaultWeapon,
      hasArmor: false,
      hasHelmet: false,
      hasKit: false,
      utility: []
    }
  }
  return economy
}

export function resetEconomyForMapStart(
  economy: Record<string, LiveEconomyState>,
  isCT: boolean
): Record<string, LiveEconomyState> {
  const reset: Record<string, LiveEconomyState> = {}
  const defaultWeapon = getDefaultWeaponForSide(isCT)
  for (const [playerId] of Object.entries(economy)) {
    reset[playerId] = {
      cash: EconomyManager.ROUND_START_CASH,
      weapon: defaultWeapon,
      hasArmor: false,
      hasHelmet: false,
      hasKit: false,
      utility: []
    }
  }
  return reset
}

export function applyRoundEconomy(input: {
  homeEconomy: Record<string, LiveEconomyState>
  awayEconomy: Record<string, LiveEconomyState>
  roundResult: RoundEconomyResult
  homeIsCT: boolean
  homeLossStreakBefore: number
  awayLossStreakBefore: number
  homePlayerIds: string[]
  awayPlayerIds: string[]
}): {
  homeEconomy: Record<string, LiveEconomyState>
  awayEconomy: Record<string, LiveEconomyState>
} {
  const nextHomeEconomy: Record<string, LiveEconomyState> = {}
  const nextAwayEconomy: Record<string, LiveEconomyState> = {}
  for (const [playerId, state] of Object.entries(input.homeEconomy)) {
    nextHomeEconomy[playerId] = { ...state, utility: [...(state.utility || [])] }
  }
  for (const [playerId, state] of Object.entries(input.awayEconomy)) {
    nextAwayEconomy[playerId] = { ...state, utility: [...(state.utility || [])] }
  }

  const homeWonRound = input.roundResult.winner === "HOME"
  const nextHomeLossStreak = homeWonRound ? 0 : input.homeLossStreakBefore + 1
  const nextAwayLossStreak = homeWonRound ? input.awayLossStreakBefore + 1 : 0
  // Use pre-increment streak for getLossBonus (0-indexed: first loss = 0 → $1900)
  const homeBonus = homeWonRound
    ? EconomyManager.getWinBonus(input.roundResult.winType)
    : EconomyManager.getLossBonus(input.homeLossStreakBefore)
  const awayBonus = !homeWonRound
    ? EconomyManager.getWinBonus(input.roundResult.winType)
    : EconomyManager.getLossBonus(input.awayLossStreakBefore)

  const homePlayerIdSet = new Set(input.homePlayerIds)
  const awayPlayerIdSet = new Set(input.awayPlayerIds)

  for (const kill of input.roundResult.kills || []) {
    if (typeof kill.playerId !== "string" || !Number.isFinite(kill.kills) || kill.kills <= 0) continue
    const killerIsHome = homePlayerIdSet.has(kill.playerId)
    const killerEconomy = killerIsHome ? nextHomeEconomy : awayPlayerIdSet.has(kill.playerId) ? nextAwayEconomy : null
    const killerState = killerEconomy?.[kill.playerId]
    const key = normalizeWeaponLookupKey(kill.weapon || killerState?.weapon)
    const weapon = WEAPONS[key] || WEAPONS.AK47
    if (killerState) {
      killerState.cash = clampCash(killerState.cash + weapon.killReward * kill.kills)
    }

    const killerOnCT = killerIsHome ? input.homeIsCT : !input.homeIsCT
    if (killerOnCT && killerEconomy) {
      for (const playerState of Object.values(killerEconomy)) {
        playerState.cash = clampCash(playerState.cash + EconomyManager.getCTTeamKillBonus() * kill.kills)
      }
    }
  }

  if (input.roundResult.winType === "BOMB_DEFUSE") {
    const tSideEconomy = input.homeIsCT ? nextAwayEconomy : nextHomeEconomy
    for (const playerState of Object.values(tSideEconomy)) {
      playerState.cash = clampCash(playerState.cash + EconomyManager.getTPlantLossBonus())
    }
  }

  for (const playerState of Object.values(nextHomeEconomy)) {
    playerState.cash = clampCash(playerState.cash + homeBonus)
  }
  for (const playerState of Object.values(nextAwayEconomy)) {
    playerState.cash = clampCash(playerState.cash + awayBonus)
  }

  for (const death of input.roundResult.deaths || []) {
    if (!death || death.deaths <= 0 || typeof death.playerId !== "string") continue
    const isHomePlayer = homePlayerIdSet.has(death.playerId)
    const state = isHomePlayer
      ? nextHomeEconomy[death.playerId]
      : awayPlayerIdSet.has(death.playerId)
        ? nextAwayEconomy[death.playerId]
        : undefined
    if (!state) continue
    const isCT = isHomePlayer ? input.homeIsCT : !input.homeIsCT
    state.weapon = getDefaultWeaponForSide(isCT)
    state.hasArmor = false
    state.hasHelmet = false
    state.hasKit = false
    state.utility = []
  }

  return { homeEconomy: nextHomeEconomy, awayEconomy: nextAwayEconomy }
}

export function isValidMapId(mapId: unknown): mapId is MapId {
  return typeof mapId === "string" && MAP_SET.has(mapId as MapId)
}
