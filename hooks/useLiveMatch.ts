import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { MapId, Team, Player, MatchResult, MatchEvent, ActiveMatchState, LiveGameState, LogEntry, LivePlayerState, CustomTactics, SimState } from "@/types"
import { createCoach, createAnalyst, createPsychologist } from "@/types"
import { simulationEngineV2, EconomyManager, WEAPONS, createMatchRNG, commentaryManager } from "@/engine"
import { collectTeamTalentBonuses, applyTalentMoraleFloor } from "@/engine/talent-trees"
import { soundManager } from "@/lib/sound-manager"
import {
    applyRoundEconomy,
    createRoundStartEconomy,
    getMapsToWinForFormat,
    resolveCanonicalSeriesMaps,
    resolveHomeStartsCT,
    selectActiveRosterIds
} from "@/lib/live-match-utils"

const ACTIVE_PLAYERS_PER_TEAM = 5
const ROUND_SECONDS = 115
const BOMB_SECONDS = 40
const ROUND_START_DELAY_MS = 1500

type RoundStrategy = "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL"

interface LiveMatchRuntimeData {
    match: any
    result: MatchResult
    homeTeam: any
    awayTeam: any
    homePlayerIds: string[]
    awayPlayerIds: string[]
    canonicalMaps: MapId[]
    mapStartingSides?: Record<string, string>
}

interface TeamStaffState {
    coach?: ReturnType<typeof createCoach>
    analyst?: ReturnType<typeof createAnalyst>
    psychologist?: ReturnType<typeof createPsychologist>
}

const MAP_NAMES: Record<string, string> = {
    [MapId.DUST2]: "Dust II",
    [MapId.MIRAGE]: "Mirage",
    [MapId.INFERNO]: "Inferno",
    [MapId.NUKE]: "Nuke",
    [MapId.OVERPASS]: "Overpass",
    [MapId.VERTIGO]: "Vertigo",
    [MapId.ANCIENT]: "Ancient",
    [MapId.ANUBIS]: "Anubis",
    "cache": "Cache",
    "train": "Train",
    "cobblestone": "Cobblestone"
}

function getNormalizedSeed(rawSeed: unknown, matchId: string): number {
    if (typeof rawSeed === "number" && Number.isFinite(rawSeed) && rawSeed > 0) {
        return Math.floor(rawSeed)
    }

    const fallback = Array.from(matchId).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0)
    return Math.max(1, fallback)
}

function getActivePlayersByRosterOrder(
    team: { rosterIds?: string[]; roster?: string[] },
    allPlayers: Array<{ id: string }>,
    playerMap?: Map<string, { id: string }>
): Player[] {
    const rosterIds = Array.isArray(team.rosterIds) ? team.rosterIds : (Array.isArray(team.roster) ? team.roster : [])
    const activeRosterIds = selectActiveRosterIds(rosterIds, ACTIVE_PLAYERS_PER_TEAM)
    const resolvedPlayers: Player[] = []
    for (const playerId of activeRosterIds) {
        const player = playerMap?.get(playerId) ?? allPlayers.find(p => p.id === playerId)
        if (player) resolvedPlayers.push(player as unknown as Player)
    }
    return resolvedPlayers
}

function createMapResultShell(mapId: MapId, homeStartsCT: boolean, homeTeamId: string, awayTeamId: string): any {
    return {
        map: mapId,
        ctStartTeamId: homeStartsCT ? homeTeamId : awayTeamId,
        tStartTeamId: homeStartsCT ? awayTeamId : homeTeamId,
        rounds: [],
        finalScore: { team1: 0, team2: 0 },
        homeScore: 0,
        awayScore: 0,
        mvpPlayerId: ""
    }
}

function buildCanonicalResultMaps(
    existingMaps: any[] | undefined,
    canonicalMaps: MapId[],
    homeTeamId: string,
    awayTeamId: string,
    mapStartingSides: Record<string, string> | undefined,
    seed: number
): any[] {
    const sourceMaps = Array.isArray(existingMaps) ? existingMaps : []
    return canonicalMaps.map((mapId, mapIndex) => {
        const existing = sourceMaps[mapIndex]
        if (existing && existing.map === mapId) {
            return {
                ...existing,
                map: mapId,
                rounds: Array.isArray(existing.rounds) ? existing.rounds : [],
                homeScore: typeof existing.homeScore === "number" ? existing.homeScore : (existing.finalScore?.team1 ?? 0),
                awayScore: typeof existing.awayScore === "number" ? existing.awayScore : (existing.finalScore?.team2 ?? 0),
            }
        }

        const homeStartsCT = resolveHomeStartsCT({
            mapId,
            mapStartingSides,
            homeTeamId,
            awayTeamId,
            seed,
            mapIndex
        })
        return createMapResultShell(mapId, homeStartsCT, homeTeamId, awayTeamId)
    })
}

function sanitizeRosterFromEconomy(
    activePlayers: Player[],
    economy: Record<string, any>,
    isCT: boolean,
    existingRoster?: LivePlayerState[]
): LivePlayerState[] {
    const existingById = new Map((existingRoster || []).map(player => [player.id, player]))
    const defaultWeapon = isCT ? "usp" : "glock"

    return activePlayers.map(player => {
        const prev = existingById.get(player.id)
        const econ = economy[player.id] || {}
        return {
            id: player.id,
            name: player.nickname,
            kills: prev?.kills || 0,
            deaths: prev?.deaths || 0,
            assists: prev?.assists || 0,
            headshots: prev?.headshots || 0,
            money: typeof econ.cash === "number" ? econ.cash : (prev?.money ?? EconomyManager.ROUND_START_CASH),
            isDead: false,
            weapon: typeof econ.weapon === "string" ? econ.weapon : (prev?.weapon || defaultWeapon),
            hasArmor: Boolean(econ.hasArmor ?? prev?.hasArmor ?? false),
            hasHelmet: Boolean(econ.hasHelmet ?? prev?.hasHelmet ?? false),
            hasKit: Boolean(econ.hasKit ?? prev?.hasKit ?? false)
        }
    })
}

function sanitizeEconomyForActivePlayers(
    activePlayers: Player[],
    existingEconomy: Record<string, any> | undefined,
    isCT: boolean
): Record<string, any> {
    const defaultEconomy = createRoundStartEconomy(
        activePlayers.map(player => player.id),
        isCT
    )

    return activePlayers.reduce<Record<string, any>>((acc, player) => {
        const current = existingEconomy?.[player.id]
        acc[player.id] = {
            ...defaultEconomy[player.id],
            ...(current || {}),
            cash: typeof current?.cash === "number" ? Math.max(0, Math.min(EconomyManager.MAX_CASH, Math.floor(current.cash))) : defaultEconomy[player.id].cash
        }
        return acc
    }, {})
}

export function useLiveMatch(id: string) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { scheduledMatches, teams, players, staff, getPlayerTeam, customTactics, setActiveMatch, updateActiveMatchState, activeMatchState, saveMatchResult, clearActiveMatchState, updateCustomTactic } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
        teams: state.teams,
        players: state.players,
        staff: state.staff,
        getPlayerTeam: state.getPlayerTeam,
        customTactics: state.customTactics,
        setActiveMatch: state.setActiveMatch,
        updateActiveMatchState: state.updateActiveMatchState,
        activeMatchState: state.activeMatchState,
        saveMatchResult: state.saveMatchResult,
        clearActiveMatchState: state.clearActiveMatchState,
        updateCustomTactic: state.updateCustomTactic,
    })))
    const playerTeam = getPlayerTeam()

    // Data Refs
    const matchData = useRef<LiveMatchRuntimeData | null>(null)

    // State
    const [gameState, setGameState] = useState<LiveGameState>({
        round: 0,
        homeScore: 0,
        awayScore: 0,
        homeSeriesScore: 0,
        awaySeriesScore: 0,
        status: "NOT_STARTED",
        time: -1,
        isPaused: true,
        currentMapIndex: 0
    })

    const [homeRoster, setHomeRoster] = useState<LivePlayerState[]>([])
    const [awayRoster, setAwayRoster] = useState<LivePlayerState[]>([])
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [speed, setSpeed] = useState(1)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isAutoTactics, setIsAutoTactics] = useState(false)

    // INTERACTIVITY
    const [isWaitingForStrategy, setIsWaitingForStrategy] = useState(false)
    const [originalHomePlayers, setOriginalHomePlayers] = useState<Player[]>([])
    const [originalAwayPlayers, setOriginalAwayPlayers] = useState<Player[]>([])

    // Timer State
    const [roundTime, setRoundTime] = useState(ROUND_SECONDS) // 1:55 round time
    const [isBombPlanted, setIsBombPlanted] = useState(false)
    const [bombTime, setBombTime] = useState(BOMB_SECONDS) // 40s bomb timer

    const [simState, setSimState] = useState<SimState | null>(null)

    const currentRoundEvents = useRef<MatchEvent[]>([])
    const isSimulatingRef = useRef(false)
    const hasInitialized = useRef(false)
    const isMountedRef = useRef(true)
    const lastProcessedTime = useRef(-1)
    const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
    const latestSimStateRef = useRef<SimState | null>(null)
    const latestGameStateRef = useRef<LiveGameState>(gameState)
    const latestHomeRosterRef = useRef<LivePlayerState[]>([])
    const latestAwayRosterRef = useRef<LivePlayerState[]>([])
    const startNextRoundRef = useRef<(playerStrategy?: RoundStrategy) => void>(() => {})
    const playerMapRef = useRef<Map<string, typeof players[0]>>(new Map())

    // Reset mounted flag on unmount to prevent state updates after navigation
    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            // Clear all orphaned timers on unmount
            pendingTimers.current.forEach(id => clearTimeout(id))
            pendingTimers.current.clear()
        }
    }, [])

    useEffect(() => {
        latestSimStateRef.current = simState
    }, [simState])

    useEffect(() => {
        latestGameStateRef.current = gameState
    }, [gameState])

    useEffect(() => {
        latestHomeRosterRef.current = homeRoster
    }, [homeRoster])

    useEffect(() => {
        latestAwayRosterRef.current = awayRoster
    }, [awayRoster])

    const queueRoundStart = useCallback((strategy: RoundStrategy, delayMs = ROUND_START_DELAY_MS) => {
        const timerId = setTimeout(() => {
            pendingTimers.current.delete(timerId)
            if (!isMountedRef.current) return
            startNextRoundRef.current(strategy)
        }, delayMs)
        pendingTimers.current.add(timerId)
    }, [])

    // Initialization
    useEffect(() => {
        if (hasInitialized.current) return
        if (!isMountedRef.current) return
        hasInitialized.current = true

        setActiveMatch(id)

        const foundMatch = scheduledMatches.find(m => m.id === id)
        if (!foundMatch) return

        const hTeam = teams.find(t => t.id === foundMatch.homeTeamId)
        const aTeam = teams.find(t => t.id === foundMatch.awayTeamId)
        if (!hTeam || !aTeam) return

        // Build player lookup map for O(1) roster resolution
        const playerMap = new Map(players.map(p => [p.id, p]))
        playerMapRef.current = playerMap as Map<string, typeof players[0]>
        const homePlayers = getActivePlayersByRosterOrder(hTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        const awayPlayers = getActivePlayersByRosterOrder(aTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        if (homePlayers.length === 0 || awayPlayers.length === 0) return

        const seed = getNormalizedSeed((foundMatch as any).seed, foundMatch.id)
        const bestOf = foundMatch.format === "BO3" ? 3 : foundMatch.format === "BO5" ? 5 : 1
        const runtimeMatch: any = {
            ...foundMatch,
            id: foundMatch.id,
            homeTeamId: hTeam.id,
            awayTeamId: aTeam.id,
            seed,
            format: foundMatch.format,
            bestOf
        }

        const hStaffData = staff.filter(s => hTeam.staffIds.includes(s.id))
        const aStaffData = staff.filter(s => aTeam.staffIds.includes(s.id))
        const mapStaff = (sData: any[]): TeamStaffState => {
            const coachData = sData.find(s => s.role === "coach")
            const analystData = sData.find(s => s.role === "analyst")
            const psychData = sData.find(s => s.role === "psychologist")
            return {
                coach: coachData ? createCoach(coachData.id, coachData.name, coachData.level, coachData.salaryPerWeek) : undefined,
                analyst: analystData ? createAnalyst(analystData.id, analystData.name, analystData.level, analystData.salaryPerWeek) : undefined,
                psychologist: psychData ? createPsychologist(psychData.id, psychData.name, psychData.level, psychData.salaryPerWeek) : undefined,
            }
        }
        const homeStaff = mapStaff(hStaffData)
        const awayStaff = mapStaff(aStaffData)

        // Apply staff talent passive bonuses
        const hBonuses = collectTeamTalentBonuses(hStaffData)
        const aBonuses = collectTeamTalentBonuses(aStaffData)
        applyTalentMoraleFloor(homePlayers, hBonuses)
        applyTalentMoraleFloor(awayPlayers, aBonuses)

        // anti_strat: reduce opponent coach tactic bonus (multiplicative)
        const homeAntiStrat = (hBonuses["anti_strat"] || 0) / 100
        const awayAntiStrat = (aBonuses["anti_strat"] || 0) / 100
        if (homeAntiStrat > 0 && awayStaff.coach) {
            awayStaff.coach.tacticBonus = Math.round(awayStaff.coach.tacticBonus * (1 - homeAntiStrat))
        }
        if (awayAntiStrat > 0 && homeStaff.coach) {
            homeStaff.coach.tacticBonus = Math.round(homeStaff.coach.tacticBonus * (1 - awayAntiStrat))
        }

        const engineFallback = simulationEngineV2.simulateMatch(
            runtimeMatch,
            hTeam as unknown as Team,
            aTeam as unknown as Team,
            homePlayers,
            awayPlayers,
            homeStaff as any,
            awayStaff as any
        )

        const queryMaps = searchParams
            .get("maps")
            ?.split(",")
            .map(map => map.trim())
            .filter(Boolean) || []
        const canonicalMaps = resolveCanonicalSeriesMaps({
            format: foundMatch.format,
            seed,
            urlMaps: queryMaps,
            savedMaps: Array.isArray((foundMatch as any).maps) ? (foundMatch as any).maps : undefined,
            fallbackMaps: engineFallback.maps.map(map => map.map)
        })

        const baseResult = simulationEngineV2.simulateMatch(
            runtimeMatch,
            hTeam as unknown as Team,
            aTeam as unknown as Team,
            homePlayers,
            awayPlayers,
            homeStaff as any,
            awayStaff as any,
            canonicalMaps
        )

        const activeHomeIds = homePlayers.map(player => player.id)
        const activeAwayIds = awayPlayers.map(player => player.id)
        const mapStartingSides = (foundMatch as any).mapStartingSides as Record<string, string> | undefined

        if (activeMatchState && activeMatchState.matchId === id) {
            const restoredSim = activeMatchState.simState as SimState | undefined
            const requestedMapIndex = restoredSim?.currentMapIndex ?? activeMatchState.gameState?.currentMapIndex ?? 0
            const currentMapIndex = Math.max(0, Math.min(canonicalMaps.length - 1, requestedMapIndex))
            const currentMapId = canonicalMaps[currentMapIndex] || MapId.DUST2
            const homeStartsCT = typeof restoredSim?.homeStartsCT === "boolean"
                ? restoredSim.homeStartsCT
                : resolveHomeStartsCT({
                    mapId: currentMapId,
                    mapStartingSides,
                    homeTeamId: hTeam.id,
                    awayTeamId: aTeam.id,
                    seed,
                    mapIndex: currentMapIndex
                })

            const restoredHomeEconomy = sanitizeEconomyForActivePlayers(homePlayers, restoredSim?.homeEconomy, homeStartsCT)
            const restoredAwayEconomy = sanitizeEconomyForActivePlayers(awayPlayers, restoredSim?.awayEconomy, !homeStartsCT)

            const sanitizedSimState: SimState = {
                homeEconomy: restoredHomeEconomy,
                awayEconomy: restoredAwayEconomy,
                homeWinStreak: restoredSim?.homeWinStreak ?? 0,
                awayWinStreak: restoredSim?.awayWinStreak ?? 0,
                homeLossStreak: restoredSim?.homeLossStreak ?? 0,
                awayLossStreak: restoredSim?.awayLossStreak ?? 0,
                homeRounds: restoredSim?.homeRounds ?? 0,
                awayRounds: restoredSim?.awayRounds ?? 0,
                currentMapIndex,
                currentRound: Math.max(1, restoredSim?.currentRound ?? 1),
                homeSeriesScore: restoredSim?.homeSeriesScore ?? 0,
                awaySeriesScore: restoredSim?.awaySeriesScore ?? 0,
                isOvertime: Boolean(restoredSim?.isOvertime ?? false),
                currentOTSet: restoredSim?.currentOTSet ?? 0,
                homeStartsCT,
                homeMomentumScore: restoredSim?.homeMomentumScore ?? 0,
                awayMomentumScore: restoredSim?.awayMomentumScore ?? 0
            }

            const restoredResultSource = (activeMatchState.matchResult as unknown as MatchResult | undefined) || baseResult
            const restoredResult: MatchResult = {
                ...restoredResultSource,
                homeScore: sanitizedSimState.homeSeriesScore,
                awayScore: sanitizedSimState.awaySeriesScore,
                maps: buildCanonicalResultMaps(
                    restoredResultSource.maps as any[],
                    canonicalMaps,
                    hTeam.id,
                    aTeam.id,
                    mapStartingSides,
                    seed
                )
            }

            const restoredGameState: LiveGameState = {
                round: activeMatchState.gameState?.round ?? Math.max(1, sanitizedSimState.currentRound - 1),
                homeScore: activeMatchState.gameState?.homeScore ?? sanitizedSimState.homeRounds,
                awayScore: activeMatchState.gameState?.awayScore ?? sanitizedSimState.awayRounds,
                homeSeriesScore: sanitizedSimState.homeSeriesScore,
                awaySeriesScore: sanitizedSimState.awaySeriesScore,
                status: activeMatchState.gameState?.status ?? "IN_PROGRESS",
                time: typeof activeMatchState.gameState?.time === "number" ? activeMatchState.gameState.time : -1,
                isPaused: Boolean(activeMatchState.gameState?.isPaused ?? false),
                currentMapIndex
            }

            matchData.current = {
                match: runtimeMatch,
                result: restoredResult,
                homeTeam: hTeam,
                awayTeam: aTeam,
                homePlayerIds: activeHomeIds,
                awayPlayerIds: activeAwayIds,
                canonicalMaps,
                mapStartingSides
            }

            setGameState(restoredGameState)
            setSimState(sanitizedSimState)
            setHomeRoster(sanitizeRosterFromEconomy(homePlayers, restoredHomeEconomy, homeStartsCT, activeMatchState.homeRoster))
            setAwayRoster(sanitizeRosterFromEconomy(awayPlayers, restoredAwayEconomy, !homeStartsCT, activeMatchState.awayRoster))
            setLogs(Array.isArray(activeMatchState.logs) ? activeMatchState.logs : [])
            setRoundTime(typeof activeMatchState.roundTime === "number" ? activeMatchState.roundTime : ROUND_SECONDS)
            setIsBombPlanted(Boolean(activeMatchState.isBombPlanted))
            setBombTime(typeof activeMatchState.bombTime === "number" ? activeMatchState.bombTime : BOMB_SECONDS)
            setIsWaitingForStrategy(Boolean(activeMatchState.isWaitingForStrategy))
            setOriginalHomePlayers(homePlayers)
            setOriginalAwayPlayers(awayPlayers)
            setIsPlaying(false)
            return
        }

        const initialMapId = canonicalMaps[0] || MapId.DUST2
        const initialHomeStartsCT = resolveHomeStartsCT({
            mapId: initialMapId,
            mapStartingSides,
            homeTeamId: hTeam.id,
            awayTeamId: aTeam.id,
            seed,
            mapIndex: 0
        })
        const homeEconomy = createRoundStartEconomy(activeHomeIds, initialHomeStartsCT)
        const awayEconomy = createRoundStartEconomy(activeAwayIds, !initialHomeStartsCT)

        const initialResultMaps = buildCanonicalResultMaps(
            baseResult.maps as any[],
            canonicalMaps,
            hTeam.id,
            aTeam.id,
            mapStartingSides,
            seed
        ).map((mapData: any) => ({
            ...mapData,
            rounds: [],
            homeScore: 0,
            awayScore: 0,
            winner: undefined,
            finalScore: { team1: 0, team2: 0 }
        }))

        const liveResult: MatchResult = {
            ...baseResult,
            winnerId: null,
            homeScore: 0,
            awayScore: 0,
            maps: initialResultMaps
        }

        matchData.current = {
            match: runtimeMatch,
            result: liveResult,
            homeTeam: hTeam,
            awayTeam: aTeam,
            homePlayerIds: activeHomeIds,
            awayPlayerIds: activeAwayIds,
            canonicalMaps,
            mapStartingSides
        }

        setSimState({
            homeEconomy,
            awayEconomy,
            homeWinStreak: 0,
            awayWinStreak: 0,
            homeLossStreak: 0,
            awayLossStreak: 0,
            homeRounds: 0,
            awayRounds: 0,
            currentMapIndex: 0,
            currentRound: 1,
            homeSeriesScore: 0,
            awaySeriesScore: 0,
            isOvertime: false,
            currentOTSet: 0,
            homeStartsCT: initialHomeStartsCT,
            homeMomentumScore: 0,
            awayMomentumScore: 0
        })

        setHomeRoster(sanitizeRosterFromEconomy(homePlayers, homeEconomy, initialHomeStartsCT))
        setAwayRoster(sanitizeRosterFromEconomy(awayPlayers, awayEconomy, !initialHomeStartsCT))
        setOriginalHomePlayers(homePlayers)
        setOriginalAwayPlayers(awayPlayers)

        const startMsg = commentaryManager.generate("MATCH_START", { map: MAP_NAMES[initialMapId] || initialMapId })
        setLogs([{ type: "SYSTEM", message: startMsg }])
        setGameState(prev => ({ ...prev, status: "IN_PROGRESS", time: -1, isPaused: false }))
        setIsPlaying(false)
        setIsWaitingForStrategy(true)
    }, [scheduledMatches, teams, players, id, searchParams, setActiveMatch, activeMatchState, staff])

    // Persistence
    useEffect(() => {
        if (!simState || !gameState) return

        const state: ActiveMatchState = {
            matchId: id,
            gameState,
            simState: simState as any,
            homeRoster,
            awayRoster,
            logs,
            roundTime,
            isBombPlanted,
            bombTime,
            isWaitingForStrategy,
            originalHomePlayers,
            originalAwayPlayers,
            matchResult: matchData.current?.result as any
        }

        const timer = setTimeout(() => {
            updateActiveMatchState(state)
        }, 500)

        return () => clearTimeout(timer)
    }, [id, gameState, simState, homeRoster, awayRoster, logs, roundTime, isBombPlanted, bombTime, isWaitingForStrategy, originalHomePlayers, originalAwayPlayers, updateActiveMatchState])

    // Index staff by teamId once per `staff` array ref, so each live-match
    // round doesn't re-scan every staff member to build home/away coach/analyst/psych.
    const staffByTeamId = useMemo(() => {
        const map = new Map<string, typeof staff>()
        for (const s of staff) {
            const teamId = s.teamId
            if (!teamId) continue
            const list = map.get(teamId)
            if (list) list.push(s)
            else map.set(teamId, [s])
        }
        return map
    }, [staff])

    const getTeamStaff = useCallback((teamId: string) => {
        const teamStaff = staffByTeamId.get(teamId) ?? []
        let coachData: typeof teamStaff[number] | undefined
        let analystData: typeof teamStaff[number] | undefined
        let psychData: typeof teamStaff[number] | undefined
        for (const s of teamStaff) {
            if (!coachData && s.role === "coach") coachData = s
            else if (!analystData && s.role === "analyst") analystData = s
            else if (!psychData && s.role === "psychologist") psychData = s
        }

        return {
            coach: coachData ? createCoach(coachData.id, coachData.name, coachData.level, coachData.salaryPerWeek) : undefined,
            analyst: analystData ? createAnalyst(analystData.id, analystData.name, analystData.level, analystData.salaryPerWeek) : undefined,
            psychologist: psychData ? createPsychologist(psychData.id, psychData.name, psychData.level, psychData.salaryPerWeek) : undefined,
        }
    }, [staffByTeamId])

    const startNextRound = useCallback((playerStrategy?: RoundStrategy) => {
        const runtime = matchData.current
        const currentSimState = latestSimStateRef.current
        if (!runtime || !currentSimState) return

        const { homeTeam, awayTeam, homePlayerIds, awayPlayerIds, canonicalMaps } = runtime
        const pMap = playerMapRef.current
        const hPlayers = homePlayerIds.map(playerId => pMap.get(playerId)).filter(Boolean) as Player[]
        const aPlayers = awayPlayerIds.map(playerId => pMap.get(playerId)).filter(Boolean) as Player[]
        if (hPlayers.length === 0 || aPlayers.length === 0) return

        const isPlayerHome = homeTeam.id === playerTeam?.id

        let homeStrategy: RoundStrategy
        let awayStrategy: RoundStrategy
        if (currentSimState.currentRound === 1 || currentSimState.currentRound === 13) {
            homeStrategy = "PISTOL"
            awayStrategy = "PISTOL"
        } else {
            const homeAvgCash = Object.values(currentSimState.homeEconomy).reduce((sum: number, econ: any) => sum + (econ?.cash || 0), 0) / Math.max(1, hPlayers.length)
            const awayAvgCash = Object.values(currentSimState.awayEconomy).reduce((sum: number, econ: any) => sum + (econ?.cash || 0), 0) / Math.max(1, aPlayers.length)
            homeStrategy = isPlayerHome && playerStrategy ? playerStrategy : EconomyManager.getTeamStrategy(homeAvgCash) as RoundStrategy
            awayStrategy = !isPlayerHome && playerStrategy ? playerStrategy : EconomyManager.getTeamStrategy(awayAvgCash) as RoundStrategy
        }

        const mapIndex = currentSimState.currentMapIndex
        const currentRoundNumber = currentSimState.currentRound
        const roundSeed = (runtime.match.seed as number) + (mapIndex * 1000) + currentRoundNumber
        const rng = createMatchRNG(roundSeed)

        const hEcon: Record<string, any> = {}
        const aEcon: Record<string, any> = {}
        Object.keys(currentSimState.homeEconomy).forEach(playerId => {
            hEcon[playerId] = { ...currentSimState.homeEconomy[playerId] }
        })
        Object.keys(currentSimState.awayEconomy).forEach(playerId => {
            aEcon[playerId] = { ...currentSimState.awayEconomy[playerId] }
        })

        simulationEngineV2.performBuyPhase(hPlayers, hEcon, homeStrategy, currentSimState.homeStartsCT, rng, customTactics)
        simulationEngineV2.performBuyPhase(aPlayers, aEcon, awayStrategy, !currentSimState.homeStartsCT, rng, customTactics)

        const startOfRoundHomeEcon: Record<string, number> = {}
        const startOfRoundAwayEcon: Record<string, number> = {}
        Object.keys(hEcon).forEach(playerId => { startOfRoundHomeEcon[playerId] = hEcon[playerId].cash })
        Object.keys(aEcon).forEach(playerId => { startOfRoundAwayEcon[playerId] = aEcon[playerId].cash })

        const hStaff = getTeamStaff(homeTeam.id)
        const aStaff = getTeamStaff(awayTeam.id)

        const homeBaseStrength = simulationEngineV2.calculateTeamStrength(homeTeam, hPlayers, hStaff)
        const awayBaseStrength = simulationEngineV2.calculateTeamStrength(awayTeam, aPlayers, aStaff)
        const currentMapId = canonicalMaps[mapIndex] || runtime.result.maps[mapIndex]?.map || MapId.DUST2
        const homeMapStrength = simulationEngineV2.calculateMapStrengths(hPlayers).get(currentMapId) || 50
        const awayMapStrength = simulationEngineV2.calculateMapStrengths(aPlayers).get(currentMapId) || 50

        const roundResult = simulationEngineV2.simulateRound(
            rng,
            hPlayers,
            aPlayers,
            homeBaseStrength,
            awayBaseStrength,
            homeMapStrength,
            awayMapStrength,
            currentSimState.homeStartsCT,
            currentSimState.homeWinStreak,
            currentSimState.awayWinStreak,
            currentSimState.homeLossStreak,
            currentSimState.awayLossStreak,
            currentRoundNumber,
            hEcon as any,
            aEcon as any,
            homeStrategy,
            awayStrategy,
            false,
            homeTeam as any,
            awayTeam as any,
            homeTeam.id,
            awayTeam.id,
            customTactics,
            currentSimState.homeMomentumScore,
            currentSimState.awayMomentumScore,
            hStaff as any,
            aStaff as any,
            currentMapId
        )

        const appliedEconomy = applyRoundEconomy({
            homeEconomy: hEcon,
            awayEconomy: aEcon,
            roundResult: {
                winner: roundResult.winner,
                winType: roundResult.winType,
                kills: roundResult.kills,
                deaths: roundResult.deaths
            },
            homeIsCT: currentSimState.homeStartsCT,
            homeLossStreakBefore: currentSimState.homeLossStreak,
            awayLossStreakBefore: currentSimState.awayLossStreak,
            homePlayerIds,
            awayPlayerIds
        })

        const nextHomeEconomy = appliedEconomy.homeEconomy
        const nextAwayEconomy = appliedEconomy.awayEconomy
        const isHomeWinner = roundResult.winner === "HOME"
        const nextHomeRounds = currentSimState.homeRounds + (isHomeWinner ? 1 : 0)
        const nextAwayRounds = currentSimState.awayRounds + (isHomeWinner ? 0 : 1)
        const nextHomeWinStreak = isHomeWinner ? currentSimState.homeWinStreak + 1 : 0
        const nextAwayWinStreak = !isHomeWinner ? currentSimState.awayWinStreak + 1 : 0
        const nextHomeLossStreak = !isHomeWinner ? currentSimState.homeLossStreak + 1 : 0
        const nextAwayLossStreak = isHomeWinner ? currentSimState.awayLossStreak + 1 : 0
        const nextHomeMomentum = isHomeWinner ? Math.min(10, currentSimState.homeMomentumScore + (homeStrategy === "ECO" ? 4 : 1)) : 0
        const nextAwayMomentum = !isHomeWinner ? Math.min(10, currentSimState.awayMomentumScore + (awayStrategy === "ECO" ? 4 : 1)) : 0

        setSimState(prev => prev ? ({
            ...prev,
            homeEconomy: nextHomeEconomy,
            awayEconomy: nextAwayEconomy,
            homeRounds: nextHomeRounds,
            awayRounds: nextAwayRounds,
            homeWinStreak: nextHomeWinStreak,
            awayWinStreak: nextAwayWinStreak,
            homeLossStreak: nextHomeLossStreak,
            awayLossStreak: nextAwayLossStreak,
            currentRound: currentRoundNumber + 1,
            homeMomentumScore: nextHomeMomentum,
            awayMomentumScore: nextAwayMomentum
        }) : null)

        currentRoundEvents.current = roundResult.events || []

        const buyLogEntries: LogEntry[] = []
        const getStratName = (stratId: string, side: "ct" | "t") => {
            const tactic = customTactics[stratId as keyof typeof customTactics]?.[side]
            if (tactic?.name) return tactic.name.toUpperCase()
            return stratId
        }
        buyLogEntries.push({ type: "BUY", message: `${homeTeam.name}: ${getStratName(homeStrategy, currentSimState.homeStartsCT ? "ct" : "t")}` })
        buyLogEntries.push({ type: "BUY", message: `${awayTeam.name}: ${getStratName(awayStrategy, !currentSimState.homeStartsCT ? "ct" : "t")}` })

        setGameState(prev => ({
            ...prev,
            round: currentRoundNumber,
            time: 0,
            status: "IN_PROGRESS"
        }))

        const roundStartMsg = commentaryManager.generate("ROUND_START", { round: currentRoundNumber })
        setLogs(prev => [...buyLogEntries.reverse(), { type: "SYSTEM", message: roundStartMsg }, ...prev])

        if (runtime.result.maps[mapIndex]) {
            const winningSide = isHomeWinner
                ? (currentSimState.homeStartsCT ? "ct" : "t")
                : (currentSimState.homeStartsCT ? "t" : "ct")
            const fullRoundResult: any = {
                ...roundResult,
                roundNumber: currentRoundNumber,
                ctTeam: currentSimState.homeStartsCT ? homeTeam.id : awayTeam.id,
                tTeam: currentSimState.homeStartsCT ? awayTeam.id : homeTeam.id,
                winner: winningSide,
                winningTeamId: isHomeWinner ? homeTeam.id : awayTeam.id
            }
            runtime.result.maps[mapIndex].rounds.push(fullRoundResult)
            if (isHomeWinner) runtime.result.maps[mapIndex].homeScore = (runtime.result.maps[mapIndex].homeScore || 0) + 1
            else runtime.result.maps[mapIndex].awayScore = (runtime.result.maps[mapIndex].awayScore || 0) + 1
        }

        const historyStats: Record<string, { kills: number, deaths: number, assists: number, headshots: number }> = {}
        runtime.result.maps.forEach((mapData: any, iterMapIdx: number) => {
            mapData.rounds.forEach((roundData: any) => {
                if (iterMapIdx === mapIndex && roundData.roundNumber === currentRoundNumber) return
                roundData.kills.forEach((kill: any) => {
                    if (!historyStats[kill.playerId]) historyStats[kill.playerId] = { kills: 0, deaths: 0, assists: 0, headshots: 0 }
                    historyStats[kill.playerId].kills += kill.kills
                })
                roundData.deaths?.forEach((death: any) => {
                    if (!historyStats[death.playerId]) historyStats[death.playerId] = { kills: 0, deaths: 0, assists: 0, headshots: 0 }
                    historyStats[death.playerId].deaths += death.deaths
                })
                roundData.events?.forEach((event: MatchEvent) => {
                    if (event.type !== "KILL") return
                    if (event.assisterId) {
                        if (!historyStats[event.assisterId]) historyStats[event.assisterId] = { kills: 0, deaths: 0, assists: 0, headshots: 0 }
                        historyStats[event.assisterId].assists += 1
                    }
                    if (event.isHeadshot && event.playerId) {
                        if (!historyStats[event.playerId]) historyStats[event.playerId] = { kills: 0, deaths: 0, assists: 0, headshots: 0 }
                        historyStats[event.playerId].headshots += 1
                    }
                })
            })
        })

        const homeDefaultWeapon = currentSimState.homeStartsCT ? "usp" : "glock"
        const awayDefaultWeapon = currentSimState.homeStartsCT ? "glock" : "usp"
        // Use hEcon/aEcon (post-buy, pre-round) for weapon/armor display at round start,
        // not nextHomeEconomy (post-round, where dead players' equipment is already reset)
        setHomeRoster(prev => prev.map(player => ({
            ...player,
            money: startOfRoundHomeEcon[player.id] ?? 0,
            weapon: hEcon[player.id]?.weapon ?? homeDefaultWeapon,
            hasArmor: hEcon[player.id]?.hasArmor ?? false,
            hasHelmet: hEcon[player.id]?.hasHelmet ?? false,
            hasKit: hEcon[player.id]?.hasKit ?? false,
            isDead: false,
            kills: historyStats[player.id]?.kills || 0,
            deaths: historyStats[player.id]?.deaths || 0,
            assists: historyStats[player.id]?.assists || 0,
            headshots: historyStats[player.id]?.headshots || 0
        })))
        setAwayRoster(prev => prev.map(player => ({
            ...player,
            money: startOfRoundAwayEcon[player.id] ?? 0,
            weapon: aEcon[player.id]?.weapon ?? awayDefaultWeapon,
            hasArmor: aEcon[player.id]?.hasArmor ?? false,
            hasHelmet: aEcon[player.id]?.hasHelmet ?? false,
            hasKit: aEcon[player.id]?.hasKit ?? false,
            isDead: false,
            kills: historyStats[player.id]?.kills || 0,
            deaths: historyStats[player.id]?.deaths || 0,
            assists: historyStats[player.id]?.assists || 0,
            headshots: historyStats[player.id]?.headshots || 0
        })))

        setIsPlaying(true)
        setIsWaitingForStrategy(false)
        setRoundTime(ROUND_SECONDS)
        setIsBombPlanted(false)
        setBombTime(BOMB_SECONDS)
        lastProcessedTime.current = -1
    }, [players, playerTeam, customTactics, getTeamStaff])

    useEffect(() => {
        startNextRoundRef.current = startNextRound
    }, [startNextRound])

    // --- MAIN EVENT PROCESSING ---
    const processNextEvent = useCallback((currentTime: number) => {
        const runtime = matchData.current
        const sim = latestSimStateRef.current || simState
        if (!runtime || !sim) return

        const fromTime = lastProcessedTime.current
        const toTime = currentTime

        const events = currentRoundEvents.current
        const eventsToProcess = events.filter(event => {
            const eventTime = Math.floor(event.time)
            return eventTime > fromTime && eventTime <= toTime
        }).sort((a, b) => a.time - b.time)

        eventsToProcess.forEach(nextEvent => {
            if (nextEvent.type === "KILL") {
                const weaponId = nextEvent.weapon?.toLowerCase()
                const weaponKey = (nextEvent.weapon || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
                const weaponDef = WEAPONS[weaponKey]
                const reward = weaponDef?.killReward ?? 300

                setHomeRoster(prev => prev.map(player => {
                    if (player.id === nextEvent.playerId) {
                        return {
                            ...player,
                            kills: (player.kills || 0) + 1,
                            headshots: (player.headshots || 0) + (nextEvent.isHeadshot ? 1 : 0),
                            money: Math.min(EconomyManager.MAX_CASH, (player.money || 0) + reward)
                        }
                    }
                    if (player.id === nextEvent.victimId) return { ...player, isDead: true, deaths: (player.deaths || 0) + 1 }
                    if (player.id === nextEvent.assisterId) return { ...player, assists: (player.assists || 0) + 1 }
                    return player
                }))
                setAwayRoster(prev => prev.map(player => {
                    if (player.id === nextEvent.playerId) {
                        return {
                            ...player,
                            kills: (player.kills || 0) + 1,
                            headshots: (player.headshots || 0) + (nextEvent.isHeadshot ? 1 : 0),
                            money: Math.min(EconomyManager.MAX_CASH, (player.money || 0) + reward)
                        }
                    }
                    if (player.id === nextEvent.victimId) return { ...player, isDead: true, deaths: (player.deaths || 0) + 1 }
                    if (player.id === nextEvent.assisterId) return { ...player, assists: (player.assists || 0) + 1 }
                    return player
                }))

                const currentHomeRoster = latestHomeRosterRef.current
                const currentAwayRoster = latestAwayRosterRef.current
                setLogs(prev => {
                    const isHomeKiller = currentHomeRoster.some(player => player.id === nextEvent.playerId)
                    const side: "CT" | "T" = isHomeKiller
                        ? (sim.homeStartsCT ? "CT" : "T")
                        : (sim.homeStartsCT ? "T" : "CT")

                    // Build O(1) lookup maps instead of repeated .find() on combined arrays
                    const livePlayerMap = new Map<string, LivePlayerState>()
                    for (const p of currentHomeRoster) livePlayerMap.set(p.id, p)
                    for (const p of currentAwayRoster) livePlayerMap.set(p.id, p)
                    const origPlayerMap = new Map<string, Player>()
                    for (const p of originalHomePlayers) origPlayerMap.set(p.id, p)
                    for (const p of originalAwayPlayers) origPlayerMap.set(p.id, p)

                    const killer = nextEvent.playerId ? livePlayerMap.get(nextEvent.playerId) : undefined
                    const victim = nextEvent.victimId ? livePlayerMap.get(nextEvent.victimId) : undefined
                    const assister = nextEvent.assisterId ? livePlayerMap.get(nextEvent.assisterId) : undefined

                    const killerPlayer = nextEvent.playerId ? origPlayerMap.get(nextEvent.playerId) : undefined
                    const victimPlayer = nextEvent.victimId ? origPlayerMap.get(nextEvent.victimId) : undefined
                    const assisterPlayer = nextEvent.assisterId ? origPlayerMap.get(nextEvent.assisterId) : undefined

                    let killType = "KILL_GENERIC"
                    if (weaponId === "awp") killType = "KILL_AWP"
                    if (weaponId === "knife") killType = "KILL_KNIFE"

                    const message = commentaryManager.generate(killType as any, {
                        player: killer?.name || "Player",
                        victim: victim?.name || "Player",
                        weapon: nextEvent.weapon?.toUpperCase(),
                        assister: assister?.name
                    })

                    return [{
                        type: "KILL",
                        time: nextEvent.time,
                        message,
                        killerName: killer?.name || "Player",
                        killerImage: killerPlayer?.portraitPath,
                        killerSide: side,
                        victimName: victim?.name || "Player",
                        victimImage: victimPlayer?.portraitPath,
                        assisterName: assister?.name || assisterPlayer?.nickname,
                        assisterImage: assisterPlayer?.portraitPath,
                        weapon: nextEvent.weapon?.toUpperCase(),
                        isHeadshot: nextEvent.isHeadshot,
                        isUtility: nextEvent.isUtility,
                        isTrade: nextEvent.isTrade,
                        isFlashAssist: nextEvent.isFlashAssist,
                        reward
                    }, ...prev]
                })
            } else if (nextEvent.type === "PLANT") {
                const message = commentaryManager.generate("PLANT", {})
                setLogs(prev => [{ type: "PLANT", time: nextEvent.time, message }, ...prev])
                setIsBombPlanted(true)
                setBombTime(BOMB_SECONDS)
            } else if (nextEvent.type === "DEFUSE") {
                const message = commentaryManager.generate("DEFUSE", {})
                setLogs(prev => [{ type: "DEFUSE", time: nextEvent.time, message }, ...prev])
                setIsBombPlanted(false)
            } else if (nextEvent.type === "EXPLODE") {
                const message = commentaryManager.generate("EXPLODE", {})
                setLogs(prev => [{ type: "EXPLODE", time: nextEvent.time, message }, ...prev])
                setIsBombPlanted(false)
            } else if (nextEvent.type === "CLUTCH") {
                const playersInRound = [...latestHomeRosterRef.current, ...latestAwayRosterRef.current]
                const player = playersInRound.find(roundPlayer => roundPlayer.id === nextEvent.playerId)
                setLogs(prev => [{ type: "CLUTCH", time: nextEvent.time, message: `${player?.name || "Player"} won a ${nextEvent.details} clutch!`, playerId: nextEvent.playerId }, ...prev])
            } else if (nextEvent.type === "SAVE") {
                setLogs(prev => [{ type: "SAVE", time: nextEvent.time, message: nextEvent.details || "Players saving" }, ...prev])
            } else if (nextEvent.type === "ROUND_END") {
                const roundState = latestSimStateRef.current || sim
                setGameState(prev => ({
                    ...prev,
                    homeScore: roundState.homeRounds,
                    awayScore: roundState.awayRounds,
                    homeSeriesScore: roundState.homeSeriesScore,
                    awaySeriesScore: roundState.awaySeriesScore
                }))

                const homeSideDefaultWeapon = roundState.homeStartsCT ? "usp" : "glock"
                const awaySideDefaultWeapon = roundState.homeStartsCT ? "glock" : "usp"
                setHomeRoster(prev => prev.map(player => ({
                    ...player,
                    money: roundState.homeEconomy[player.id]?.cash ?? player.money,
                    weapon: roundState.homeEconomy[player.id]?.weapon ?? homeSideDefaultWeapon,
                    hasArmor: roundState.homeEconomy[player.id]?.hasArmor ?? false,
                    hasHelmet: roundState.homeEconomy[player.id]?.hasHelmet ?? false,
                    hasKit: roundState.homeEconomy[player.id]?.hasKit ?? false,
                    isDead: false
                })))
                setAwayRoster(prev => prev.map(player => ({
                    ...player,
                    money: roundState.awayEconomy[player.id]?.cash ?? player.money,
                    weapon: roundState.awayEconomy[player.id]?.weapon ?? awaySideDefaultWeapon,
                    hasArmor: roundState.awayEconomy[player.id]?.hasArmor ?? false,
                    hasHelmet: roundState.awayEconomy[player.id]?.hasHelmet ?? false,
                    hasKit: roundState.awayEconomy[player.id]?.hasKit ?? false,
                    isDead: false
                })))

                const isHomeWinner = roundState.homeWinStreak > 0
                const winnerName = isHomeWinner ? runtime.homeTeam.name : runtime.awayTeam.name
                const winnerIsCT = (isHomeWinner && roundState.homeStartsCT) || (!isHomeWinner && !roundState.homeStartsCT)
                const winType = winnerIsCT ? "ROUND_WIN_CT" : "ROUND_WIN_T"
                const roundEndMessage = commentaryManager.generate(winType, { team: winnerName })
                setLogs(prev => [{ type: "ROUND_END", message: `${roundEndMessage} (Winner: ${winnerName})` }, ...prev])

                if (roundState.homeRounds >= 13 || roundState.awayRounds >= 13) {
                    const homeWonMap = roundState.homeRounds > roundState.awayRounds
                    const newHomeSeries = roundState.homeSeriesScore + (homeWonMap ? 1 : 0)
                    const newAwaySeries = roundState.awaySeriesScore + (homeWonMap ? 0 : 1)
                    const mapIndex = roundState.currentMapIndex
                    const currentMap = runtime.result.maps[mapIndex]
                    if (currentMap) {
                        currentMap.homeScore = roundState.homeRounds
                        currentMap.awayScore = roundState.awayRounds
                        currentMap.finalScore = { team1: roundState.homeRounds, team2: roundState.awayRounds }
                        currentMap.winner = homeWonMap ? runtime.homeTeam.id : runtime.awayTeam.id
                    }
                    runtime.result.homeScore = newHomeSeries
                    runtime.result.awayScore = newAwaySeries

                    const mapsToWin = getMapsToWinForFormat(runtime.match.format)
                    if (newHomeSeries >= mapsToWin || newAwaySeries >= mapsToWin) {
                        runtime.result.winnerId = newHomeSeries > newAwaySeries ? runtime.homeTeam.id : runtime.awayTeam.id
                        setGameState(prev => ({
                            ...prev,
                            status: "FINISHED",
                            homeSeriesScore: newHomeSeries,
                            awaySeriesScore: newAwaySeries
                        }))
                        setIsPlaying(false)
                        setIsWaitingForStrategy(false)
                        const isPlayerHome = runtime.homeTeam.id === playerTeam?.id
                        const playerWon = (isPlayerHome && newHomeSeries > newAwaySeries) || (!isPlayerHome && newAwaySeries > newHomeSeries)
                        if (playerWon) soundManager.play("victory")
                        else soundManager.play("defeat")
                    } else {
                        const nextMapIndex = mapIndex + 1
                        const nextMapId = runtime.canonicalMaps[nextMapIndex]
                        if (!nextMapId) {
                            runtime.result.winnerId = newHomeSeries > newAwaySeries ? runtime.homeTeam.id : runtime.awayTeam.id
                            setGameState(prev => ({ ...prev, status: "FINISHED", homeSeriesScore: newHomeSeries, awaySeriesScore: newAwaySeries }))
                            setIsPlaying(false)
                            setIsWaitingForStrategy(false)
                            return
                        }

                        const nextHomeStartsCT = resolveHomeStartsCT({
                            mapId: nextMapId,
                            mapStartingSides: runtime.mapStartingSides,
                            homeTeamId: runtime.homeTeam.id,
                            awayTeamId: runtime.awayTeam.id,
                            seed: runtime.match.seed,
                            mapIndex: nextMapIndex
                        })
                        const nextHomeEconomy = createRoundStartEconomy(runtime.homePlayerIds, nextHomeStartsCT)
                        const nextAwayEconomy = createRoundStartEconomy(runtime.awayPlayerIds, !nextHomeStartsCT)
                        const nextHomeDefault = nextHomeStartsCT ? "usp" : "glock"
                        const nextAwayDefault = nextHomeStartsCT ? "glock" : "usp"

                        setSimState(prev => prev ? ({
                            ...prev,
                            homeEconomy: nextHomeEconomy,
                            awayEconomy: nextAwayEconomy,
                            homeRounds: 0,
                            awayRounds: 0,
                            currentMapIndex: nextMapIndex,
                            currentRound: 1,
                            homeSeriesScore: newHomeSeries,
                            awaySeriesScore: newAwaySeries,
                            homeWinStreak: 0,
                            awayWinStreak: 0,
                            homeLossStreak: 0,
                            awayLossStreak: 0,
                            homeStartsCT: nextHomeStartsCT,
                            homeMomentumScore: 0,
                            awayMomentumScore: 0
                        }) : null)
                        setGameState(prev => ({
                            ...prev,
                            currentMapIndex: nextMapIndex,
                            homeScore: 0,
                            awayScore: 0,
                            homeSeriesScore: newHomeSeries,
                            awaySeriesScore: newAwaySeries,
                            round: 1,
                            time: -1
                        }))
                        setHomeRoster(prev => prev.map(player => ({
                            ...player,
                            money: nextHomeEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                            weapon: nextHomeEconomy[player.id]?.weapon ?? nextHomeDefault,
                            hasArmor: false,
                            hasHelmet: false,
                            hasKit: false,
                            isDead: false
                        })))
                        setAwayRoster(prev => prev.map(player => ({
                            ...player,
                            money: nextAwayEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                            weapon: nextAwayEconomy[player.id]?.weapon ?? nextAwayDefault,
                            hasArmor: false,
                            hasHelmet: false,
                            hasKit: false,
                            isDead: false
                        })))
                        setRoundTime(ROUND_SECONDS)
                        setIsBombPlanted(false)
                        setBombTime(BOMB_SECONDS)
                        setIsPlaying(false)
                        setIsWaitingForStrategy(false)
                        const nextMapName = MAP_NAMES[nextMapId] || nextMapId
                        setLogs(prev => [{ type: "SYSTEM", message: `--- NEXT MAP: ${nextMapName.toUpperCase()} ---` }, ...prev])
                        queueRoundStart("PISTOL")
                    }
                } else if (roundState.currentRound === 13) {
                    const switchedHomeStartsCT = !roundState.homeStartsCT
                    const halftimeHomeEconomy = createRoundStartEconomy(runtime.homePlayerIds, switchedHomeStartsCT)
                    const halftimeAwayEconomy = createRoundStartEconomy(runtime.awayPlayerIds, !switchedHomeStartsCT)
                    const halftimeHomeDefault = switchedHomeStartsCT ? "usp" : "glock"
                    const halftimeAwayDefault = switchedHomeStartsCT ? "glock" : "usp"

                    setLogs(prev => [{ type: "SYSTEM", message: "--- HALF TIME: SWITCHING SIDES ---" }, ...prev])
                    setSimState(prev => prev ? ({
                        ...prev,
                        homeStartsCT: switchedHomeStartsCT,
                        homeEconomy: halftimeHomeEconomy,
                        awayEconomy: halftimeAwayEconomy,
                        homeWinStreak: 0,
                        awayWinStreak: 0,
                        homeLossStreak: 0,
                        awayLossStreak: 0,
                        homeMomentumScore: 0,
                        awayMomentumScore: 0
                    }) : null)
                    setHomeRoster(prev => prev.map(player => ({
                        ...player,
                        money: halftimeHomeEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: halftimeHomeEconomy[player.id]?.weapon ?? halftimeHomeDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setAwayRoster(prev => prev.map(player => ({
                        ...player,
                        money: halftimeAwayEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: halftimeAwayEconomy[player.id]?.weapon ?? halftimeAwayDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setRoundTime(ROUND_SECONDS)
                    setIsBombPlanted(false)
                    setBombTime(BOMB_SECONDS)
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    queueRoundStart("PISTOL")
                } else {
                    setIsWaitingForStrategy(true)
                    setIsPlaying(false)
                    setRoundTime(ROUND_SECONDS)
                    setIsBombPlanted(false)
                    setBombTime(BOMB_SECONDS)
                }
            }
        })

        lastProcessedTime.current = currentTime
    }, [simState, originalHomePlayers, originalAwayPlayers, queueRoundStart, playerTeam])

    // --- GAME LOOP ---
    useEffect(() => {
        if (gameState.status !== "IN_PROGRESS" || gameState.isPaused || !isPlaying || isWaitingForStrategy) return

        const delay = 1000 / speed
        const timer = window.setTimeout(() => {
            const nextTime = gameState.time + 1
            if (isBombPlanted) setBombTime(prev => Math.max(0, prev - 1))
            else setRoundTime(prev => Math.max(0, prev - 1))

            setGameState(prev => ({ ...prev, time: nextTime }))
            processNextEvent(nextTime)

            if ((roundTime === 0 && !isBombPlanted) || (bombTime === 0 && isBombPlanted)) {
                const events = currentRoundEvents.current
                const endEvent = events.find(e => e.type === "ROUND_END")
                if (endEvent) processNextEvent(Math.max(nextTime, Math.ceil(endEvent.time)))
            }
        }, delay)

        return () => window.clearTimeout(timer)
    }, [gameState.status, gameState.round, gameState.time, gameState.isPaused, speed, isPlaying, isWaitingForStrategy, isBombPlanted, roundTime, bombTime, processNextEvent])

    // --- AUTO ACTIONS ---
    useEffect(() => {
        if (!isAutoTactics || !isWaitingForStrategy || !simState || gameState.status !== "IN_PROGRESS") return
        if (simState.currentRound === 1 || simState.currentRound === 13) return

        const homeCount = Math.max(1, Object.keys(simState.homeEconomy).length)
        const avgCash = Math.floor(Object.values(simState.homeEconomy).reduce((s: number, p: any) => s + (p?.cash || 0), 0) / homeCount)
        let bestStrategy = "ECO"
        if (avgCash > 4500) bestStrategy = "FULL"
        else if (avgCash > 2000) bestStrategy = "SEMIBUY"
        else if (avgCash > 1400) bestStrategy = "FORCE"

        const timer = setTimeout(() => {
            startNextRound(bestStrategy as any)
        }, 500)
        return () => clearTimeout(timer)
    }, [isAutoTactics, isWaitingForStrategy, simState, gameState.status, customTactics, startNextRound])

    useEffect(() => {
        if (gameState.status === "IN_PROGRESS" && isWaitingForStrategy && (simState?.currentRound === 1 || simState?.currentRound === 13)) {
            const timer = setTimeout(() => {
                startNextRound("PISTOL")
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [gameState.status, isWaitingForStrategy, simState?.currentRound, startNextRound])


    // --- HANDLERS ---
    const simulateRoundInstant = () => {
        if (isSimulatingRef.current) return
        isSimulatingRef.current = true
        if (isWaitingForStrategy) startNextRound()
        // Fast-forward: process all remaining events by jumping time to the end of the round
        const events = currentRoundEvents.current
        if (events.length > 0) {
            const maxTime = Math.max(...events.map(e => Math.ceil(e.time))) + 1
            // Process everything up to the last event time
            processNextEvent(maxTime)
            setRoundTime(0)
            setBombTime(0)
            setGameState(prev => ({ ...prev, time: maxTime }))
            lastProcessedTime.current = maxTime
        }
        // Fallback: ensure playback continues for round-end processing
        setSpeed(100)
        setIsPlaying(true)
        isSimulatingRef.current = false
    }

    const simulateMatchInstant = () => {
        setSpeed(100)
        setIsAutoTactics(true)
        setIsPlaying(true)
    }

    const handleFinish = () => {
        if (!matchData.current) return
        saveMatchResult(matchData.current.match.id, matchData.current.result)
        clearActiveMatchState()
        router.push(`/match/${id}/result`)
    }

    return {
        gameState,
        simState,
        homeRoster,
        awayRoster,
        logs,
        setLogs,
        speed,
        isPlaying,
        isAutoTactics,
        isWaitingForStrategy,
        roundTime,
        isBombPlanted,
        bombTime,
        matchData,
        playerTeam,
        currentRoundEvents, // Ref
        originalHomePlayers,
        originalAwayPlayers,
        setSpeed,
        setIsPlaying,
        setIsAutoTactics,
        startNextRound,
        simulateRoundInstant,
        simulateMatchInstant,
        handleFinish,
        customTactics,
        teams, // Should be passed? no used by UI
        updateCustomTactic
    }
}
