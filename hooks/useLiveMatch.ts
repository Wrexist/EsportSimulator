import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { useShallow } from "zustand/react/shallow"
import { MapId, Team, Player, MatchResult, MatchEvent, ActiveMatchState, LiveGameState, LogEntry, LivePlayerState, CustomTactics, SimState, Coach, Analyst, Psychologist } from "@/types"
import type { TeamSaveData } from "@/engine/save-types"
import { simulationEngineV2, EconomyManager, WEAPONS, createMatchRNG, commentaryManager } from "@/engine"
import { applyPreMatchTalents } from "@/engine/match/apply-talents"
import { pickAutoStrategy } from "@/engine/match/auto-tactics"
import { buildRuntimeStaff } from "@/engine/match/live-staff-adapter"
import { buildFreshLiveResult, buildInitialSimState, sanitizeRestoredSimState, buildRestoredGameState } from "@/engine/match/live-match-init"
import { generateMatchStats, determineMVP } from "@/engine/match/match-stats"
import { soundManager } from "@/lib/sound-manager"
import {
    applyRoundEconomy,
    createRoundStartEconomy,
    createOvertimeEconomy,
    getMapsToWinForFormat,
    getOvertimeMapWinThreshold,
    resolveCanonicalSeriesMaps,
    resolveHomeStartsCT,
} from "@/lib/live-match-utils"
import { MAP_NAMES } from "@/data/map-pool"
import {
    ACTIVE_PLAYERS_PER_TEAM,
    ROUND_SECONDS,
    BOMB_SECONDS,
    ROUND_START_DELAY_MS,
    getNormalizedSeed,
    getActivePlayersByRosterOrder,
    buildCanonicalResultMaps,
    sanitizeRosterFromEconomy,
    sanitizeEconomyForActivePlayers,
} from "@/lib/live-match-builders"

type RoundStrategy = "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL"

/** Max kill/event-feed rows kept in state + DOM during a live match. */
const MAX_LIVE_LOG_ENTRIES = 200

interface LiveMatchRuntimeData {
    match: any
    result: MatchResult
    // home/awayTeam are stored as the on-disk TeamSaveData shape. The
    // engine entry points accept the runtime `Team` (from types/team.ts);
    // their read paths only touch fields TeamSaveData also has (`id`,
    // `playstyle`), so the `as unknown as Team` casts at the call sites
    // are structurally safe. See ARCHITECTURE.md "Known Type-System Debt".
    homeTeam: TeamSaveData
    awayTeam: TeamSaveData
    homePlayerIds: string[]
    awayPlayerIds: string[]
    canonicalMaps: MapId[]
    mapStartingSides?: Record<string, string>
}

export function useLiveMatch(id: string) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { scheduledMatches, teams, players, staff, getPlayerTeam, customTactics, setActiveMatch, updateActiveMatchState, activeMatchState, saveMatchResult, clearActiveMatchState, updateCustomTactic, currentWeek, currentDay, timeMode } = useGameStore(useShallow(state => ({
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
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
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
    // Cap the kill/event feed. Entries are prepended newest-first from ~10 call
    // sites; a fast-forwarded BO5 can produce 400+ rows, all kept in state and
    // in the DOM (kill feed visibly chugs on Steam Deck). One trim effect bounds
    // it regardless of source — keep the newest MAX_LIVE_LOG_ENTRIES.
    useEffect(() => {
        if (logs.length > MAX_LIVE_LOG_ENTRIES) {
            setLogs(prev => (prev.length > MAX_LIVE_LOG_ENTRIES ? prev.slice(0, MAX_LIVE_LOG_ENTRIES) : prev))
        }
    }, [logs])
    // Seed live-match playback speed from the user's Game Speed setting
    // (the only thing that setting drives — was previously inert).
    const gameSpeedSetting = useSettingsStore(s => s.gameSpeed)
    const [speed, setSpeed] = useState(() =>
        gameSpeedSetting === "very-fast" ? 3 : gameSpeedSetting === "fast" ? 2 : 1
    )
    const [isPlaying, setIsPlaying] = useState(false)
    const [isAutoTactics, setIsAutoTactics] = useState(false)

    // INTERACTIVITY
    const [isWaitingForStrategy, setIsWaitingForStrategy] = useState(false)
    const [originalHomePlayers, setOriginalHomePlayers] = useState<Player[]>([])
    const [originalAwayPlayers, setOriginalAwayPlayers] = useState<Player[]>([])

    // Tactical Timeout (B5): 2 per match; arms a small round-win boost (0.06) for
    // the next 2 rounds. The ref mirrors state so the per-round sim call reads the
    // latest value outside React's render cycle.
    const [timeoutsRemaining, setTimeoutsRemaining] = useState(2)
    const [timeoutBoostRounds, setTimeoutBoostRounds] = useState(0)
    const timeoutBoostRoundsRef = useRef(0)
    timeoutBoostRoundsRef.current = timeoutBoostRounds

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

        // NOTE: setActiveMatch(id) is deliberately NOT called up here. Arming the
        // navigation lock before the init guards below would trap the player on a
        // permanently "Warming up servers…" live screen whenever the match can't
        // actually start (missing team, understrength roster). The lock is armed
        // only on the committed-init path (next to hasInitialized.current = true).

        const foundMatch = scheduledMatches.find(m => m.id === id)
        if (!foundMatch) return

        const hTeam = teams.find(t => t.id === foundMatch.homeTeamId)
        const aTeam = teams.find(t => t.id === foundMatch.awayTeamId)
        if (!hTeam || !aTeam) return

        // HYBRID_DAILY day pacing: refuse to start (and never arm the lock) a
        // current-week match whose scheduled day hasn't arrived yet. This is the
        // authoritative gate for the live path — matching the store-level guard
        // in simulateInstantMatch — so a UI bypass (e.g. the result-screen "Play
        // Next Match" CTA) can't jump the day order. Route the player out cleanly.
        if (timeMode === "HYBRID_DAILY" && foundMatch.week === currentWeek && (foundMatch.day ?? 6) > currentDay) {
            if (isMountedRef.current) router.replace(`/match/${id}/tactics`)
            return
        }

        // Build player lookup map for O(1) roster resolution
        const playerMap = new Map(players.map(p => [p.id, p]))
        playerMapRef.current = playerMap as Map<string, typeof players[0]>
        const homePlayers = getActivePlayersByRosterOrder(hTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        const awayPlayers = getActivePlayersByRosterOrder(aTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        // Need a full 5 a side: simulateMatch's pickWeighted throws on an empty
        // pool, and a 3v5 isn't a real match. The week tick forfeits understrength
        // rosters (match-forfeit.ts). Since setActiveMatch is NOT armed yet, the
        // player isn't trapped — route them back to the tactics screen (a clean
        // exit) so they can advance the week to resolve it by forfeit. Guard on a
        // populated player list so a mid-hydration render doesn't false-trip this.
        if (homePlayers.length < 5 || awayPlayers.length < 5) {
            if (players.length > 0 && isMountedRef.current) {
                router.replace(`/match/${id}/tactics`)
            }
            return
        }

        // All match data resolved — commit init exactly once. The flag is set
        // HERE, not before the guards above: on the first render the store may
        // still be hydrating (empty scheduledMatches/teams/players). Setting it
        // early would permanently block this effect when it re-runs with
        // populated data, stranding the user on a blank live-match screen.
        hasInitialized.current = true

        // Arm the navigation lock only now that init is guaranteed to succeed.
        setActiveMatch(id)

        const seed = getNormalizedSeed(foundMatch.seed, foundMatch.id)
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
        // Staff adapter extracted to engine/match/live-staff-adapter.ts (L4).
        const homeStaff = buildRuntimeStaff(hStaffData)
        const awayStaff = buildRuntimeStaff(aStaffData)

        // Pre-match staff-talent application (morale_floor + timeout_morale
        // + anti_strat). Centralized in engine/match/apply-talents.ts so
        // the slice + match-engine paths stay in lockstep.
        const { homeAntiStrat, awayAntiStrat } = applyPreMatchTalents(
            homePlayers, awayPlayers, hStaffData, aStaffData,
        )
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
            // RuntimeTeamStaff (from live-staff-adapter) has the same
            // {coach?, analyst?, psychologist?} bundle shape the engine
            // expects. The `as unknown as` cast bridges the runtime-vs-
            // builder type identity without `as any`.
            homeStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
            awayStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
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
            savedMaps: Array.isArray(foundMatch.maps) ? foundMatch.maps : undefined,
            fallbackMaps: engineFallback.maps.map(map => map.map)
        })

        const baseResult = simulationEngineV2.simulateMatch(
            runtimeMatch,
            hTeam as unknown as Team,
            aTeam as unknown as Team,
            homePlayers,
            awayPlayers,
            homeStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
            awayStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
            canonicalMaps
        )

        const activeHomeIds = homePlayers.map(player => player.id)
        const activeAwayIds = awayPlayers.map(player => player.id)
        const mapStartingSides = foundMatch.mapStartingSides

        if (activeMatchState && activeMatchState.matchId === id) {
            const restoredSim = activeMatchState.simState as SimState | undefined
            const requestedMapIndex = restoredSim?.currentMapIndex ?? activeMatchState.gameState?.currentMapIndex ?? 0
            const currentMapIndex = Math.max(0, Math.min(canonicalMaps.length - 1, requestedMapIndex))
            const currentMapId = canonicalMaps[currentMapIndex] || MapId.SANDSTONE
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

            // Restored SimState sanitization extracted to live-match-init.ts (L5).
            const sanitizedSimState = sanitizeRestoredSimState({
                restoredSim,
                homeEconomy: restoredHomeEconomy,
                awayEconomy: restoredAwayEconomy,
                homeStartsCT,
                currentMapIndex,
            })

            const restoredResultSource = (activeMatchState.matchResult as unknown as MatchResult | undefined) || baseResult
            const restoredResult: MatchResult = {
                ...restoredResultSource,
                homeScore: sanitizedSimState.homeSeriesScore,
                awayScore: sanitizedSimState.awaySeriesScore,
                maps: buildCanonicalResultMaps(
                    restoredResultSource.maps,
                    canonicalMaps,
                    hTeam.id,
                    aTeam.id,
                    mapStartingSides,
                    seed
                )
            }

            // Restored GameState build extracted to live-match-init.ts (L5).
            const restoredGameState = buildRestoredGameState({
                savedGameState: activeMatchState.gameState,
                simState: sanitizedSimState,
                currentMapIndex,
            })

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
            // Restore Tactical Timeout state so a reload mid-match can't mint
            // extra timeouts (fresh defaults only when the snapshot predates this).
            setTimeoutsRemaining(typeof activeMatchState.timeoutsRemaining === "number" ? activeMatchState.timeoutsRemaining : 2)
            setTimeoutBoostRounds(typeof activeMatchState.timeoutBoostRounds === "number" ? activeMatchState.timeoutBoostRounds : 0)
            setOriginalHomePlayers(homePlayers)
            setOriginalAwayPlayers(awayPlayers)
            setIsPlaying(false)
            return
        }

        const initialMapId = canonicalMaps[0] || MapId.SANDSTONE
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

        // Live result + initial sim state extracted to
        // engine/match/live-match-init.ts (Phase L5).
        const liveResult = buildFreshLiveResult({
            baseResult,
            canonicalMaps,
            homeTeamId: hTeam.id,
            awayTeamId: aTeam.id,
            mapStartingSides,
            seed,
        })

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

        setSimState(buildInitialSimState({
            homeEconomy,
            awayEconomy,
            homeStartsCT: initialHomeStartsCT,
        }))

        setHomeRoster(sanitizeRosterFromEconomy(homePlayers, homeEconomy, initialHomeStartsCT))
        setAwayRoster(sanitizeRosterFromEconomy(awayPlayers, awayEconomy, !initialHomeStartsCT))
        setOriginalHomePlayers(homePlayers)
        setOriginalAwayPlayers(awayPlayers)

        const startMsg = commentaryManager.generate("MATCH_START", { map: MAP_NAMES[initialMapId] || initialMapId })
        setLogs([{ type: "SYSTEM", message: startMsg }])
        setGameState(prev => ({ ...prev, status: "IN_PROGRESS", time: -1, isPaused: false }))
        setIsPlaying(false)
        setIsWaitingForStrategy(true)
    }, [scheduledMatches, teams, players, id, searchParams, setActiveMatch, activeMatchState, staff, router, currentWeek, currentDay, timeMode])

    // Persistence
    useEffect(() => {
        if (!simState || !gameState) return
        // Don't checkpoint a match that's already finished — the
        // result/teardown path owns post-match state. Without this guard,
        // the 500ms debounce can fire AFTER the user has navigated to the
        // result screen and saveMatchResult ran, overwriting the cleared
        // activeMatchState with stale "still playing" data.
        if (gameState.status === "FINISHED") return

        const currentResult = matchData.current?.result
        if (!currentResult) return // No match in flight — nothing to checkpoint.

        const state: ActiveMatchState = {
            matchId: id,
            gameState,
            simState,
            homeRoster,
            awayRoster,
            logs,
            roundTime,
            isBombPlanted,
            bombTime,
            isWaitingForStrategy,
            timeoutsRemaining,
            timeoutBoostRounds,
            // ActiveMatchState comes from types/game which carries its own
            // legacy Player[] and MatchResult shapes (see ARCHITECTURE.md
            // "Known Type-System Debt"). The runtime values are
            // structurally identical to the canonical types/match versions
            // — the casts bridge that duplication without changing data.
            originalHomePlayers: originalHomePlayers as unknown as ActiveMatchState["originalHomePlayers"],
            originalAwayPlayers: originalAwayPlayers as unknown as ActiveMatchState["originalAwayPlayers"],
            matchResult: currentResult as unknown as ActiveMatchState["matchResult"],
        }

        const timer = setTimeout(() => {
            // Re-check the mount flag at fire time. Unmounting between
            // schedule and fire (route change, fast nav) shouldn't trigger
            // a write to a stale slot.
            if (!isMountedRef.current) return
            updateActiveMatchState(state)
        }, 500)

        return () => clearTimeout(timer)
    }, [id, gameState, simState, homeRoster, awayRoster, logs, roundTime, isBombPlanted, bombTime, isWaitingForStrategy, timeoutsRemaining, timeoutBoostRounds, originalHomePlayers, originalAwayPlayers, updateActiveMatchState])

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
        return buildRuntimeStaff(staffByTeamId.get(teamId) ?? [])
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

        // Tactical Timeout (B5): while armed, boost the player's round-win chance
        // AND neutralise the opponent's momentum (regroup stops their run). The
        // momentum override is per-round only — persistent sim state is untouched.
        const boostActive = timeoutBoostRoundsRef.current > 0
        const activeBoost = boostActive ? 0.06 : 0
        const homeTacticalBoost = isPlayerHome ? activeBoost : -activeBoost
        const homeMomentumArg = boostActive && !isPlayerHome ? 0 : currentSimState.homeMomentumScore
        const awayMomentumArg = boostActive && isPlayerHome ? 0 : currentSimState.awayMomentumScore

        let homeStrategy: RoundStrategy
        let awayStrategy: RoundStrategy
        if (currentSimState.currentRound === 1 || currentSimState.currentRound === 13) {
            homeStrategy = "PISTOL"
            awayStrategy = "PISTOL"
        } else {
            const homeAvgCash = Object.values(currentSimState.homeEconomy).reduce((sum: number, econ: any) => sum + (econ?.cash || 0), 0) / Math.max(1, hPlayers.length)
            const awayAvgCash = Object.values(currentSimState.awayEconomy).reduce((sum: number, econ: any) => sum + (econ?.cash || 0), 0) / Math.max(1, aPlayers.length)
            homeStrategy = isPlayerHome && playerStrategy ? playerStrategy : EconomyManager.getTeamStrategy(homeAvgCash, homeTeam.economyStyle) as RoundStrategy
            awayStrategy = !isPlayerHome && playerStrategy ? playerStrategy : EconomyManager.getTeamStrategy(awayAvgCash, awayTeam.economyStyle) as RoundStrategy
        }

        const mapIndex = currentSimState.currentMapIndex
        const currentRoundNumber = currentSimState.currentRound
        const roundSeed = (runtime.match.seed as number) + (mapIndex * 1000) + currentRoundNumber
        const rng = createMatchRNG(roundSeed)

        // PlayerSimulationState shape — economy carries cash + bought items.
        // Typed explicitly here so the as-any casts at the simulateRound /
        // performBuyPhase call sites can be dropped.
        type EconomyState = import("@/engine/match/round-outcome").PlayerSimulationState
        const hEcon: Record<string, EconomyState> = {}
        const aEcon: Record<string, EconomyState> = {}
        Object.keys(currentSimState.homeEconomy).forEach(playerId => {
            hEcon[playerId] = { ...currentSimState.homeEconomy[playerId] } as EconomyState
        })
        Object.keys(currentSimState.awayEconomy).forEach(playerId => {
            aEcon[playerId] = { ...currentSimState.awayEconomy[playerId] } as EconomyState
        })

        simulationEngineV2.performBuyPhase(hPlayers, hEcon, homeStrategy, currentSimState.homeStartsCT, rng, customTactics)
        simulationEngineV2.performBuyPhase(aPlayers, aEcon, awayStrategy, !currentSimState.homeStartsCT, rng, customTactics)

        const startOfRoundHomeEcon: Record<string, number> = {}
        const startOfRoundAwayEcon: Record<string, number> = {}
        Object.keys(hEcon).forEach(playerId => { startOfRoundHomeEcon[playerId] = hEcon[playerId].cash })
        Object.keys(aEcon).forEach(playerId => { startOfRoundAwayEcon[playerId] = aEcon[playerId].cash })

        const hStaff = getTeamStaff(homeTeam.id)
        const aStaff = getTeamStaff(awayTeam.id)

        const homeBaseStrength = simulationEngineV2.calculateTeamStrength(homeTeam as unknown as Team, hPlayers, hStaff)
        const awayBaseStrength = simulationEngineV2.calculateTeamStrength(awayTeam as unknown as Team, aPlayers, aStaff)
        const currentMapId = canonicalMaps[mapIndex] || runtime.result.maps[mapIndex]?.map || MapId.SANDSTONE
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
            hEcon,
            aEcon,
            homeStrategy,
            awayStrategy,
            false,
            homeTeam as unknown as Team,
            awayTeam as unknown as Team,
            homeTeam.id,
            awayTeam.id,
            customTactics,
            homeMomentumArg,
            awayMomentumArg,
            hStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
            aStaff as unknown as { coach?: Coach; analyst?: Analyst; psychologist?: Psychologist },
            currentMapId,
            undefined, // matchStage
            undefined, // cachedHomeStressRes
            undefined, // cachedAwayStressRes
            undefined, // cachedPlayerMap
            homeTacticalBoost
        )

        // Consume one round of the Tactical Timeout boost (B5).
        if (timeoutBoostRoundsRef.current > 0) {
            timeoutBoostRoundsRef.current -= 1
            setTimeoutBoostRounds(b => Math.max(0, b - 1))
        }

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

                    let killType: "KILL_GENERIC" | "KILL_AWP" | "KILL_KNIFE" = "KILL_GENERIC"
                    if (weaponId === "awp") killType = "KILL_AWP"
                    if (weaponId === "knife") killType = "KILL_KNIFE"

                    const message = commentaryManager.generate(killType, {
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

                // Map-win threshold: MR12 regulation is first-to-13; once a map is
                // in MR3 overtime it climbs (first-to-16, then 19, 22 …). A 12-12
                // regulation is NOT a clinch — it triggers overtime below.
                const inOvertime = roundState.isOvertime
                const mapWinThreshold = inOvertime
                    ? getOvertimeMapWinThreshold(roundState.currentOTSet)
                    : 13

                // Per-round audio feedback for the player's team — the most
                // repeated beat on the centerpiece screen was silent. Skip the
                // map-clinching round (it gets the victory/defeat cue below, so
                // the two don't stack). soundManager self-gates on the setting.
                const mapClinched = roundState.homeRounds >= mapWinThreshold || roundState.awayRounds >= mapWinThreshold
                const playerIsHomeSide = runtime.homeTeam.id === playerTeam?.id
                const playerIsAwaySide = runtime.awayTeam.id === playerTeam?.id
                if (!mapClinched && (playerIsHomeSide || playerIsAwaySide)) {
                    const playerWonRound = playerIsHomeSide ? isHomeWinner : !isHomeWinner
                    soundManager.play(playerWonRound ? "roundWin" : "roundLose")
                }

                if (mapClinched) {
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
                            awayMomentumScore: 0,
                            // A fresh map starts in regulation regardless of whether
                            // the previous map went to overtime.
                            isOvertime: false,
                            currentOTSet: 0
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
                } else if (!inOvertime && roundState.homeRounds === 12 && roundState.awayRounds === 12) {
                    // Regulation finished 12-12 → enter MR3 overtime. Reset both
                    // economies to $10k, swap sides, and clear streaks/momentum,
                    // mirroring match-simulation.ts. The clinch threshold climbs to
                    // 16 (then 19, 22 … per additional tied set) via mapWinThreshold.
                    const otHomeStartsCT = !roundState.homeStartsCT
                    const otHomeEconomy = createOvertimeEconomy(runtime.homePlayerIds, otHomeStartsCT)
                    const otAwayEconomy = createOvertimeEconomy(runtime.awayPlayerIds, !otHomeStartsCT)
                    const otHomeDefault = otHomeStartsCT ? "usp" : "glock"
                    const otAwayDefault = otHomeStartsCT ? "glock" : "usp"

                    setLogs(prev => [{ type: "SYSTEM", message: "--- OVERTIME: 12-12 · MR3 · FIRST TO 16 ---" }, ...prev])
                    setSimState(prev => prev ? ({
                        ...prev,
                        isOvertime: true,
                        currentOTSet: 1,
                        homeStartsCT: otHomeStartsCT,
                        homeEconomy: otHomeEconomy,
                        awayEconomy: otAwayEconomy,
                        homeWinStreak: 0,
                        awayWinStreak: 0,
                        homeLossStreak: 0,
                        awayLossStreak: 0,
                        homeMomentumScore: 0,
                        awayMomentumScore: 0
                    }) : null)
                    setHomeRoster(prev => prev.map(player => ({
                        ...player,
                        money: otHomeEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: otHomeEconomy[player.id]?.weapon ?? otHomeDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setAwayRoster(prev => prev.map(player => ({
                        ...player,
                        money: otAwayEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: otAwayEconomy[player.id]?.weapon ?? otAwayDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setRoundTime(ROUND_SECONDS)
                    setIsBombPlanted(false)
                    setBombTime(BOMB_SECONDS)
                    setIsPlaying(false)
                    setIsWaitingForStrategy(true)
                } else if (!inOvertime && roundState.currentRound === 13) {
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
                } else if (inOvertime && roundState.currentRound > 25 && (roundState.currentRound - 25) % 3 === 0) {
                    // Overtime half / set boundary (every 3 OT rounds): swap sides
                    // and reset economy to $10k. A whole set (6 rounds) elapsed
                    // without a clinch means it's tied → advance to the next MR3 set
                    // (threshold climbs), mirroring match-simulation.ts.
                    const isNewSet = (roundState.currentRound - 25) % 6 === 0
                    const otHomeStartsCT = !roundState.homeStartsCT
                    const otHomeEconomy = createOvertimeEconomy(runtime.homePlayerIds, otHomeStartsCT)
                    const otAwayEconomy = createOvertimeEconomy(runtime.awayPlayerIds, !otHomeStartsCT)
                    const otHomeDefault = otHomeStartsCT ? "usp" : "glock"
                    const otAwayDefault = otHomeStartsCT ? "glock" : "usp"

                    setLogs(prev => [{ type: "SYSTEM", message: isNewSet ? "--- OVERTIME: TIED SET · NEW MR3 SET ---" : "--- OVERTIME: SWITCHING SIDES ---" }, ...prev])
                    setSimState(prev => prev ? ({
                        ...prev,
                        currentOTSet: isNewSet ? (prev.currentOTSet || 1) + 1 : prev.currentOTSet,
                        homeStartsCT: otHomeStartsCT,
                        homeEconomy: otHomeEconomy,
                        awayEconomy: otAwayEconomy,
                        homeWinStreak: 0,
                        awayWinStreak: 0,
                        homeLossStreak: 0,
                        awayLossStreak: 0,
                        homeMomentumScore: 0,
                        awayMomentumScore: 0
                    }) : null)
                    setHomeRoster(prev => prev.map(player => ({
                        ...player,
                        money: otHomeEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: otHomeEconomy[player.id]?.weapon ?? otHomeDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setAwayRoster(prev => prev.map(player => ({
                        ...player,
                        money: otAwayEconomy[player.id]?.cash ?? EconomyManager.ROUND_START_CASH,
                        weapon: otAwayEconomy[player.id]?.weapon ?? otAwayDefault,
                        hasArmor: false,
                        hasHelmet: false,
                        hasKit: false,
                        isDead: false
                    })))
                    setRoundTime(ROUND_SECONDS)
                    setIsBombPlanted(false)
                    setBombTime(BOMB_SECONDS)
                    setIsPlaying(false)
                    setIsWaitingForStrategy(true)
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

        // Auto-tactics strategy pick (Phase L2 extraction).
        const bestStrategy = pickAutoStrategy(simState.homeEconomy)

        const timer = setTimeout(() => {
            startNextRound(bestStrategy)
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
    // Wrapped in useCallback so identity is stable across renders. Without this
    // any child that takes these as props (e.g. LiveMatchControlBar) re-renders
    // on every parent tick, defeating React.memo.
    const simulateRoundInstant = useCallback(() => {
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
    }, [isWaitingForStrategy, startNextRound, processNextEvent])

    const simulateMatchInstant = useCallback(() => {
        setSpeed(100)
        setIsAutoTactics(true)
        setIsPlaying(true)
    }, [])

    // Tactical Timeout (B5): spend one to arm the boost for the next 2 rounds.
    const callTimeout = useCallback(() => {
        if (timeoutsRemaining <= 0) return
        // Don't burn a charge while a boost is already running — it would just
        // reset the window to 2 rounds with no added benefit.
        if (timeoutBoostRoundsRef.current > 0) return
        setTimeoutsRemaining(t => Math.max(0, t - 1))
        setTimeoutBoostRounds(2)
        soundManager.play("notification")
    }, [timeoutsRemaining])

    const handleFinish = useCallback(() => {
        const runtime = matchData.current
        if (!runtime) return

        // Recompute player stats + MVP from the rounds ACTUALLY played live,
        // rather than shipping baseResult's quick-sim stats (which were produced
        // with a different starting-side decision + overtime path, so they can
        // contradict the scoreboard the player just watched — even crowning an
        // MVP on the losing team). Reuse the canonical helpers over the live maps.
        const pMap = playerMapRef.current
        const hPlayers = runtime.homePlayerIds.map(pid => pMap.get(pid)).filter(Boolean) as Player[]
        const aPlayers = runtime.awayPlayerIds.map(pid => pMap.get(pid)).filter(Boolean) as Player[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const playedMaps = (runtime.result.maps as any[]).filter(m => Array.isArray(m.rounds) && m.rounds.length > 0)
        if (hPlayers.length > 0 && aPlayers.length > 0 && playedMaps.length > 0) {
            const homeWon = runtime.result.homeScore > runtime.result.awayScore
            const statsRng = createMatchRNG(runtime.match.seed as number)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const liveStats = generateMatchStats(statsRng, hPlayers, aPlayers, playedMaps as any, homeWon)
            runtime.result.playerStats = liveStats
            runtime.result.mvpPlayerId = determineMVP(liveStats, homeWon ? hPlayers : aPlayers)
        }

        saveMatchResult(runtime.match.id, runtime.result)
        clearActiveMatchState()
        router.push(`/match/${id}/result`)
    }, [id, saveMatchResult, clearActiveMatchState, router])

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
        timeoutsRemaining,
        timeoutActive: timeoutBoostRounds > 0,
        callTimeout,
        customTactics,
        teams, // Should be passed? no used by UI
        updateCustomTactic
    }
}
