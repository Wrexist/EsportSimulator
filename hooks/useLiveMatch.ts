import { restoreTimeoutState, spendTimeout } from "@/engine/match/manager-controls"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { useShallow } from "zustand/react/shallow"
import { MapId, Player, MatchResult, MatchEvent, ActiveMatchState, LiveGameState, LogEntry, LivePlayerState, SimState } from "@/types"
import type { TeamSaveData } from "@/engine/save-types"
import { EconomyManager, WEAPONS, commentaryManager } from "@/engine"
import { LEGACY_MATCH_ENGINE, restoreLivePlayback, pendingLiveEvents, roundEndPending } from "@/engine/match/live-checkpoint"
import { sanitizeRestoredSimState, buildRestoredGameState } from "@/engine/match/live-match-init"
import {
    createLegacySeriesState,
    finalizeLegacySeries,
    normalizeRestoredSim,
    playLegacyRound,
    MANAGER_STRATEGIES,
    type LegacySeriesContext,
    type ManagerStrategy,
} from "@/engine/match/legacy-series"
import { prepareLegacySeries, buildManagementRecord } from "@/engine/match/legacy-prepare"
import { soundManager } from "@/lib/sound-manager"
import { resolveHomeStartsCT } from "@/lib/live-match-utils"
import { MAP_NAMES } from "@/data/map-pool"
import {
    ROUND_SECONDS,
    BOMB_SECONDS,
    ROUND_START_DELAY_MS,
    getNormalizedSeed,
    getActivePlayersByRosterOrder,
    buildCanonicalResultMaps,
    sanitizeRosterFromEconomy,
    sanitizeEconomyForActivePlayers,
} from "@/lib/live-match-builders"

type RoundStrategy = ManagerStrategy | "PISTOL"

/** Max kill/event-feed rows kept in state + DOM during a live match. */
const MAX_LIVE_LOG_ENTRIES = 200

interface LiveMatchRuntimeData {
    ownerSaveId: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    match: any
    result: MatchResult
    // home/awayTeam are stored as the on-disk TeamSaveData shape. The
    // engine entry points accept the runtime `Team` (from types/team.ts);
    // their read paths only touch fields TeamSaveData also has, so the
    // casts at the call sites are structurally safe. See ARCHITECTURE.md
    // "Known Type-System Debt".
    homeTeam: TeamSaveData
    awayTeam: TeamSaveData
    homePlayerIds: string[]
    awayPlayerIds: string[]
    canonicalMaps: MapId[]
    mapStartingSides?: Record<string, string>
    /** Canonical series context shared with instant simulation (L21/L14). */
    ctx: LegacySeriesContext
}


export function useLiveMatch(id: string) {
    const router = useRouter()
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
    // Cap the kill/event feed (newest first).
    useEffect(() => {
        if (logs.length > MAX_LIVE_LOG_ENTRIES) {
            setLogs(prev => (prev.length > MAX_LIVE_LOG_ENTRIES ? prev.slice(0, MAX_LIVE_LOG_ENTRIES) : prev))
        }
    }, [logs])
    // Seed live-match playback speed from the user's Game Speed setting.
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

    // Tactical timeout: two per series, reduces our losing-streak pressure for
    // the next 2 rounds. The refs mirror state so the per-round step reads the
    // latest value outside React's render cycle.
    const [timeoutsRemaining, setTimeoutsRemaining] = useState(2)
    const timeoutsRemainingRef = useRef(2)
    timeoutsRemainingRef.current = timeoutsRemaining
    const [timeoutBoostRounds, setTimeoutBoostRounds] = useState(0)
    const timeoutBoostRoundsRef = useRef(0)
    timeoutBoostRoundsRef.current = timeoutBoostRounds

    // Timer State
    const [roundTime, setRoundTime] = useState(ROUND_SECONDS)
    const [isBombPlanted, setIsBombPlanted] = useState(false)
    const [bombTime, setBombTime] = useState(BOMB_SECONDS)

    const [simState, setSimState] = useState<SimState | null>(null)
    // Side of the round being played back. The canonical step applies the
    // halftime/overtime swap as soon as a round is computed, so the radar and
    // kill feed must use the side the round was actually played on.
    const [roundHomeIsCT, setRoundHomeIsCT] = useState(true)

    const currentRoundEvents = useRef<MatchEvent[]>([])
    const isSimulatingRef = useRef(false)
    const roundInFlightRef = useRef(false)
    const hasInitialized = useRef(false)
    const isMountedRef = useRef(true)
    const lastProcessedTime = useRef(-1)
    const pendingCheckpoint = useRef<ActiveMatchState | null>(null)
    const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
    const latestSimStateRef = useRef<SimState | null>(null)
    const latestGameStateRef = useRef<LiveGameState>(gameState)
    const latestHomeRosterRef = useRef<LivePlayerState[]>([])
    const latestAwayRosterRef = useRef<LivePlayerState[]>([])
    const startNextRoundRef = useRef<(playerStrategy?: RoundStrategy) => void>(() => {})

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            pendingTimers.current.forEach(id => clearTimeout(id))
            pendingTimers.current.clear()
        }
    }, [])

    useEffect(() => { latestSimStateRef.current = simState }, [simState])
    useEffect(() => { latestGameStateRef.current = gameState }, [gameState])
    useEffect(() => { latestHomeRosterRef.current = homeRoster }, [homeRoster])
    useEffect(() => { latestAwayRosterRef.current = awayRoster }, [awayRoster])

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

        // setActiveMatch(id) is armed only on the committed-init path below so a
        // match that cannot start never traps the player on the live screen.
        const foundMatch = scheduledMatches.find(m => m.id === id)
        if (!foundMatch) return

        const hTeam = teams.find(t => t.id === foundMatch.homeTeamId)
        const aTeam = teams.find(t => t.id === foundMatch.awayTeamId)
        if (!hTeam || !aTeam) return

        // HYBRID_DAILY day pacing: never start a current-week match before its day.
        if (timeMode === "HYBRID_DAILY" && foundMatch.week === currentWeek && (foundMatch.day ?? 6) > currentDay) {
            if (isMountedRef.current) router.replace(`/match/${id}/tactics`)
            return
        }

        const playerMap = new Map(players.map(p => [p.id, p]))
        const homePlayers = getActivePlayersByRosterOrder(hTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        const awayPlayers = getActivePlayersByRosterOrder(aTeam, players as Array<{ id: string }>, playerMap as Map<string, { id: string }>)
        // Need a full 5 a side; the week tick forfeits understrength rosters.
        if (homePlayers.length < 5 || awayPlayers.length < 5) {
            if (players.length > 0 && isMountedRef.current) router.replace(`/match/${id}/tactics`)
            return
        }

        let playback: ReturnType<typeof restoreLivePlayback> | null = null
        let ctx: LegacySeriesContext
        const restoring = activeMatchState?.matchId === id
        try {
            if (foundMatch.engineVersion && foundMatch.engineVersion !== LEGACY_MATCH_ENGINE) throw Error("Unsupported match engine")
            if (restoring) {
                playback = restoreLivePlayback(activeMatchState!)
                if (activeMatchState!.playback?.saveId !== undefined && activeMatchState!.playback.saveId !== useGameStore.getState().saveId) throw Error("This match checkpoint belongs to another career")
                if (JSON.stringify(playback.homeRoster) !== JSON.stringify(homePlayers.map(p => p.id)) || JSON.stringify(playback.awayRoster) !== JSON.stringify(awayPlayers.map(p => p.id))) throw Error("The saved match roster has changed. Restore the pre-match recovery save to continue.")
            }
            const seed = restoring && activeMatchState!.playback ? activeMatchState!.playback.seed : getNormalizedSeed(foundMatch.seed, foundMatch.id)
            // The persisted veto (or the checkpoint's recorded order) is the only
            // map authority; URL hints are ignored so a stale link cannot change
            // the series (L21.A2). Same preparation as instant simulation.
            const savedMaps = playback?.maps.length ? playback.maps : Array.isArray(foundMatch.maps) && foundMatch.maps.length ? foundMatch.maps : undefined
            ctx = prepareLegacySeries({
                match: { ...foundMatch, seed, maps: savedMaps },
                homeTeam: hTeam,
                awayTeam: aTeam,
                homePlayers,
                awayPlayers,
                staff,
                customTactics,
                managedTeamId: useGameStore.getState().playerTeamId ?? undefined,
            })
        } catch (error) {
            hasInitialized.current = true
            useGameStore.getState().addToast({ message: error instanceof Error ? error.message : "Could not restore match", type: "warning" })
            setActiveMatch(null)
            router.replace(`/match/${id}/tactics`)
            return
        }

        hasInitialized.current = true
        setActiveMatch(id)

        const seed = ctx.seed
        const bestOf = foundMatch.format === "BO3" ? 3 : foundMatch.format === "BO5" ? 5 : 1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runtimeMatch: any = { ...foundMatch, seed, format: foundMatch.format, bestOf }
        const canonicalMaps = ctx.maps
        const mapStartingSides = foundMatch.mapStartingSides
        const activeHomeIds = homePlayers.map(player => player.id)
        const activeAwayIds = awayPlayers.map(player => player.id)
        const fresh = createLegacySeriesState(ctx)
        const shellResult: MatchResult = {
            engineVersion: LEGACY_MATCH_ENGINE,
            lineups: { [hTeam.id]: activeHomeIds, [aTeam.id]: activeAwayIds },
            winnerId: null, homeScore: 0, awayScore: 0, maps: fresh.maps, mvpPlayerId: "", playerStats: {},
        }

        if (restoring && playback) {
            const restoredSim = activeMatchState!.simState as SimState | undefined
            const requestedMapIndex = restoredSim?.currentMapIndex ?? activeMatchState!.gameState?.currentMapIndex ?? 0
            const currentMapIndex = Math.max(0, Math.min(canonicalMaps.length - 1, requestedMapIndex))
            const currentMapId = canonicalMaps[currentMapIndex] || MapId.SANDSTONE
            const homeStartsCT = typeof restoredSim?.homeStartsCT === "boolean"
                ? restoredSim.homeStartsCT
                : resolveHomeStartsCT({ mapId: currentMapId, mapStartingSides, homeTeamId: hTeam.id, awayTeamId: aTeam.id, seed, mapIndex: currentMapIndex })

            const restoredHomeEconomy = sanitizeEconomyForActivePlayers(homePlayers, restoredSim?.homeEconomy, homeStartsCT)
            const restoredAwayEconomy = sanitizeEconomyForActivePlayers(awayPlayers, restoredSim?.awayEconomy, !homeStartsCT)
            const inFlight = roundEndPending(playback.events, playback.processedTime) && !activeMatchState!.isWaitingForStrategy
            // Pre-v2 checkpoints applied halftime/overtime/map transitions at
            // ROUND_END playback; normalise them exactly once.
            const sanitizedSimState: SimState = normalizeRestoredSim(ctx, {
                ...sanitizeRestoredSimState({ restoredSim, homeEconomy: restoredHomeEconomy, awayEconomy: restoredAwayEconomy, homeStartsCT, currentMapIndex }),
                ...(restoredSim?.rulesVersion ? { rulesVersion: restoredSim.rulesVersion } : {}),
                ...(restoredSim?.lastRound ? { lastRound: restoredSim.lastRound } : {}),
            }, inFlight)

            const restoredResultSource = (activeMatchState!.matchResult as unknown as MatchResult | undefined) || shellResult
            const restoredResult: MatchResult = {
                ...restoredResultSource,
                engineVersion: LEGACY_MATCH_ENGINE,
                lineups: shellResult.lineups,
                homeScore: sanitizedSimState.homeSeriesScore,
                awayScore: sanitizedSimState.awaySeriesScore,
                maps: buildCanonicalResultMaps(restoredResultSource.maps, canonicalMaps, hTeam.id, aTeam.id, mapStartingSides, seed),
            }
            const restoredGameState = buildRestoredGameState({ savedGameState: activeMatchState!.gameState, simState: sanitizedSimState, currentMapIndex: inFlight && sanitizedSimState.lastRound ? sanitizedSimState.lastRound.mapIndex : currentMapIndex })

            // Side the in-flight round was played on (from its recorded round).
            const lastMap = inFlight && sanitizedSimState.lastRound ? restoredResult.maps[sanitizedSimState.lastRound.mapIndex] : undefined
            const lastRecorded = lastMap?.rounds[lastMap.rounds.length - 1]
            setRoundHomeIsCT(lastRecorded ? lastRecorded.ctTeam === hTeam.id : sanitizedSimState.homeStartsCT)

            matchData.current = {
                ownerSaveId: useGameStore.getState().saveId,
                match: runtimeMatch, result: restoredResult, homeTeam: hTeam, awayTeam: aTeam,
                homePlayerIds: activeHomeIds, awayPlayerIds: activeAwayIds, canonicalMaps, mapStartingSides, ctx,
            }

            latestSimStateRef.current = sanitizedSimState
            setGameState(restoredGameState)
            setSimState(sanitizedSimState)
            // Visible mid-round inventories/deaths, not the resolved end-of-round economy.
            setHomeRoster(structuredClone(activeMatchState!.homeRoster))
            setAwayRoster(structuredClone(activeMatchState!.awayRoster))
            currentRoundEvents.current = playback.events
            lastProcessedTime.current = playback.processedTime
            roundInFlightRef.current = inFlight
            setLogs(Array.isArray(activeMatchState!.logs) ? activeMatchState!.logs : [])
            setRoundTime(typeof activeMatchState!.roundTime === "number" ? activeMatchState!.roundTime : ROUND_SECONDS)
            setIsBombPlanted(Boolean(activeMatchState!.isBombPlanted))
            setBombTime(typeof activeMatchState!.bombTime === "number" ? activeMatchState!.bombTime : BOMB_SECONDS)
            // Between rounds after a reload: always offer the next decision
            // (pistol rounds auto-start) rather than stalling on a lost timer.
            setIsWaitingForStrategy(!inFlight && restoredGameState.status === "IN_PROGRESS" ? true : Boolean(activeMatchState!.isWaitingForStrategy))
            const restoredTimeouts = restoreTimeoutState(activeMatchState!.timeoutsRemaining, activeMatchState!.timeoutBoostRounds)
            timeoutsRemainingRef.current = restoredTimeouts.remaining
            timeoutBoostRoundsRef.current = restoredTimeouts.rounds
            setTimeoutsRemaining(restoredTimeouts.remaining)
            setTimeoutBoostRounds(restoredTimeouts.rounds)
            setOriginalHomePlayers(homePlayers)
            setOriginalAwayPlayers(awayPlayers)
            setIsPlaying(false)
            return
        }

        matchData.current = {
            ownerSaveId: useGameStore.getState().saveId,
            match: runtimeMatch, result: shellResult, homeTeam: hTeam, awayTeam: aTeam,
            homePlayerIds: activeHomeIds, awayPlayerIds: activeAwayIds, canonicalMaps, mapStartingSides, ctx,
        }

        latestSimStateRef.current = fresh.sim
        setSimState(fresh.sim)
        setRoundHomeIsCT(fresh.sim.homeStartsCT)
        setHomeRoster(sanitizeRosterFromEconomy(homePlayers, fresh.sim.homeEconomy, fresh.sim.homeStartsCT))
        setAwayRoster(sanitizeRosterFromEconomy(awayPlayers, fresh.sim.awayEconomy, !fresh.sim.homeStartsCT))
        setOriginalHomePlayers(homePlayers)
        setOriginalAwayPlayers(awayPlayers)

        const initialMapId = canonicalMaps[0] || MapId.SANDSTONE
        const startMsg = commentaryManager.generate("MATCH_START", { map: MAP_NAMES[initialMapId] || initialMapId })
        setLogs([{ type: "SYSTEM", message: startMsg }])
        setGameState(prev => ({ ...prev, status: "IN_PROGRESS", time: -1, isPaused: false }))
        setIsPlaying(false)
        setIsWaitingForStrategy(true)
    }, [scheduledMatches, teams, players, id, setActiveMatch, activeMatchState, staff, router, currentWeek, currentDay, timeMode, customTactics])

    // Persistence
    useEffect(() => {
        if (!simState || !gameState) return
        // A finished match is owned by the result/teardown path.
        if (gameState.status === "FINISHED") { pendingCheckpoint.current = null; return }

        const currentResult = matchData.current?.result
        if (!currentResult) return

        const state: ActiveMatchState = {
            matchId: id,
            playback: {
                version: 1, engine: LEGACY_MATCH_ENGINE, saveId: matchData.current!.ownerSaveId,
                events: currentRoundEvents.current, processedTime: lastProcessedTime.current,
                maps: matchData.current!.canonicalMaps, seed: matchData.current!.match.seed,
                homeRoster: matchData.current!.homePlayerIds, awayRoster: matchData.current!.awayPlayerIds,
            },
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
            // Legacy duplicated type shapes; structurally identical at runtime.
            originalHomePlayers: originalHomePlayers as unknown as ActiveMatchState["originalHomePlayers"],
            originalAwayPlayers: originalAwayPlayers as unknown as ActiveMatchState["originalAwayPlayers"],
            matchResult: currentResult as unknown as ActiveMatchState["matchResult"],
        }

        pendingCheckpoint.current = state
    }, [id, gameState, simState, homeRoster, awayRoster, logs, roundTime, isBombPlanted, bombTime, isWaitingForStrategy, timeoutsRemaining, timeoutBoostRounds, originalHomePlayers, originalAwayPlayers])

    // Fixed cadence cannot be starved by fast playback. Clone at the ownership boundary.
    useEffect(() => {
        const flush = () => {
            const snapshot = pendingCheckpoint.current
            pendingCheckpoint.current = null
            if (snapshot) updateActiveMatchState(structuredClone(snapshot))
        }
        const timer = setInterval(flush, 500)
        return () => { clearInterval(timer); flush() }
    }, [id, updateActiveMatchState])

    const isPlayerHome = !!playerTeam && matchData.current?.homeTeam.id === playerTeam.id

    const startNextRound = useCallback((playerStrategy?: RoundStrategy) => {
        const runtime = matchData.current
        const currentSimState = latestSimStateRef.current
        if (!runtime || !currentSimState) return
        // One round at a time: a queued pistol start, the auto-tactics timer and
        // a click can otherwise race and play two rounds from one decision.
        if (roundInFlightRef.current || latestGameStateRef.current.status === "FINISHED") return

        const { homeTeam, awayTeam } = runtime
        const regrouping = timeoutBoostRoundsRef.current > 0
        const strategy = playerStrategy && (MANAGER_STRATEGIES as readonly string[]).includes(playerStrategy) ? playerStrategy as ManagerStrategy : undefined
        const sideBefore = currentSimState.homeStartsCT
        const mapIndex = currentSimState.currentMapIndex
        const currentRoundNumber = currentSimState.currentRound

        const step = playLegacyRound(runtime.ctx, { sim: currentSimState, maps: runtime.result.maps, finished: false }, { strategy, regroup: regrouping, customTactics })

        // Consume one round of regroup pressure relief.
        if (timeoutBoostRoundsRef.current > 0) {
            timeoutBoostRoundsRef.current -= 1
            setTimeoutBoostRounds(b => Math.max(0, b - 1))
        }

        runtime.result.maps = step.state.maps
        latestSimStateRef.current = step.state.sim
        roundInFlightRef.current = true
        setSimState(step.state.sim)
        setRoundHomeIsCT(sideBefore)
        currentRoundEvents.current = step.round.events || []

        const getStratName = (stratId: string, side: "ct" | "t", managed: boolean) => {
            const tactic = managed ? customTactics[stratId as keyof typeof customTactics]?.[side] : undefined
            return tactic?.name ? tactic.name.toUpperCase() : stratId
        }
        const managedHome = runtime.ctx.managedTeamId === homeTeam.id
        const buys = step.round.buys ?? { home: "", away: "" }
        const buyLogEntries: LogEntry[] = [
            { type: "BUY", message: `${homeTeam.name}: ${getStratName(buys.home, sideBefore ? "ct" : "t", managedHome)}` },
            { type: "BUY", message: `${awayTeam.name}: ${getStratName(buys.away, !sideBefore ? "ct" : "t", !managedHome)}` },
        ]
        if (step.round.managerCall?.regroup) buyLogEntries.push({ type: "SYSTEM", message: "Regroup: losing-streak pressure eased this round" })

        setGameState(prev => ({ ...prev, round: currentRoundNumber, time: 0, status: "IN_PROGRESS" }))
        const roundStartMsg = commentaryManager.generate("ROUND_START", { round: currentRoundNumber })
        setLogs(prev => [...buyLogEntries.reverse(), { type: "SYSTEM", message: roundStartMsg }, ...prev])

        const historyStats: Record<string, { kills: number, deaths: number, assists: number, headshots: number }> = {}
        const bump = (pid: string) => (historyStats[pid] ??= { kills: 0, deaths: 0, assists: 0, headshots: 0 })
        runtime.result.maps.forEach((mapData, iterMapIdx) => {
            mapData.rounds.forEach(roundData => {
                if (iterMapIdx === mapIndex && roundData.roundNumber === currentRoundNumber) return
                roundData.kills.forEach(kill => { bump(kill.playerId).kills += kill.kills })
                roundData.deaths?.forEach(death => { bump(death.playerId).deaths += death.deaths })
                roundData.events?.forEach((event: MatchEvent) => {
                    if (event.type !== "KILL") return
                    if (event.assisterId) bump(event.assisterId).assists += 1
                    if (event.isHeadshot && event.playerId) bump(event.playerId).headshots += 1
                })
            })
        })

        const roster = (econ: typeof step.preRound.home, isCT: boolean) => (prev: LivePlayerState[]) => prev.map(player => ({
            ...player,
            money: econ[player.id]?.cash ?? 0,
            weapon: econ[player.id]?.weapon ?? (isCT ? "usp" : "glock"),
            hasArmor: econ[player.id]?.hasArmor ?? false,
            hasHelmet: econ[player.id]?.hasHelmet ?? false,
            hasKit: econ[player.id]?.hasKit ?? false,
            isDead: false,
            kills: historyStats[player.id]?.kills || 0,
            deaths: historyStats[player.id]?.deaths || 0,
            assists: historyStats[player.id]?.assists || 0,
            headshots: historyStats[player.id]?.headshots || 0,
        }))
        setHomeRoster(roster(step.preRound.home, sideBefore))
        setAwayRoster(roster(step.preRound.away, !sideBefore))

        setIsPlaying(true)
        setIsWaitingForStrategy(false)
        setRoundTime(ROUND_SECONDS)
        setIsBombPlanted(false)
        setBombTime(BOMB_SECONDS)
        lastProcessedTime.current = -1
    }, [customTactics])

    useEffect(() => {
        startNextRoundRef.current = startNextRound
    }, [startNextRound])

    // --- MAIN EVENT PROCESSING ---
    const processNextEvent = useCallback((currentTime: number) => {
        const runtime = matchData.current
        const sim = latestSimStateRef.current || simState
        if (!runtime || !sim) return

        const fromTime = lastProcessedTime.current
        const events = currentRoundEvents.current
        const eventsToProcess = pendingLiveEvents(events, fromTime, currentTime)

        eventsToProcess.forEach(nextEvent => {
            if (nextEvent.type === "KILL") {
                const weaponId = nextEvent.weapon?.toLowerCase()
                const weaponKey = (nextEvent.weapon || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
                const weaponDef = WEAPONS[weaponKey]
                const reward = weaponDef?.killReward ?? 300

                const applyKill = (prev: LivePlayerState[]) => prev.map(player => {
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
                })
                setHomeRoster(applyKill)
                setAwayRoster(applyKill)

                const currentHomeRoster = latestHomeRosterRef.current
                const currentAwayRoster = latestAwayRosterRef.current
                // Side of the round being played back (last recorded round).
                const lastMap = sim.lastRound ? runtime.result.maps[sim.lastRound.mapIndex] : undefined
                const playedRound = lastMap?.rounds[lastMap.rounds.length - 1]
                const homeWasCT = playedRound ? playedRound.ctTeam === runtime.homeTeam.id : sim.homeStartsCT
                setLogs(prev => {
                    const isHomeKiller = currentHomeRoster.some(player => player.id === nextEvent.playerId)
                    const side: "CT" | "T" = isHomeKiller ? (homeWasCT ? "CT" : "T") : (homeWasCT ? "T" : "CT")

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
                setLogs(prev => [{ type: "PLANT", time: nextEvent.time, message: commentaryManager.generate("PLANT", {}) }, ...prev])
                setIsBombPlanted(true)
                setBombTime(BOMB_SECONDS)
            } else if (nextEvent.type === "DEFUSE") {
                setLogs(prev => [{ type: "DEFUSE", time: nextEvent.time, message: commentaryManager.generate("DEFUSE", {}) }, ...prev])
                setIsBombPlanted(false)
            } else if (nextEvent.type === "EXPLODE") {
                setLogs(prev => [{ type: "EXPLODE", time: nextEvent.time, message: commentaryManager.generate("EXPLODE", {}) }, ...prev])
                setIsBombPlanted(false)
            } else if (nextEvent.type === "CLUTCH") {
                const playersInRound = [...latestHomeRosterRef.current, ...latestAwayRosterRef.current]
                const player = playersInRound.find(roundPlayer => roundPlayer.id === nextEvent.playerId)
                setLogs(prev => [{ type: "CLUTCH", time: nextEvent.time, message: `${player?.name || "Player"} won a ${nextEvent.details} clutch!`, playerId: nextEvent.playerId }, ...prev])
            } else if (nextEvent.type === "SAVE") {
                setLogs(prev => [{ type: "SAVE", time: nextEvent.time, message: nextEvent.details || "Players saving" }, ...prev])
            } else if (nextEvent.type === "ROUND_END") {
                // The canonical step already applied scores, economy and any
                // side/map transition; playback only reveals them.
                const roundState = latestSimStateRef.current || sim
                const last = roundState.lastRound
                roundInFlightRef.current = false
                if (!last) return
                const transition = last.transition
                const isHomeWinner = last.winner === "HOME"

                setRoundHomeIsCT(roundState.homeStartsCT)
                setGameState(prev => ({
                    ...prev,
                    homeScore: last.homeRounds,
                    awayScore: last.awayRounds,
                    homeSeriesScore: roundState.homeSeriesScore,
                    awaySeriesScore: roundState.awaySeriesScore
                }))
                const resetRoster = (econ: Record<string, { cash?: number; weapon?: string; hasArmor?: boolean; hasHelmet?: boolean; hasKit?: boolean }>, isCT: boolean) => (prev: LivePlayerState[]) => prev.map(player => ({
                    ...player,
                    money: econ[player.id]?.cash ?? player.money,
                    weapon: econ[player.id]?.weapon ?? (isCT ? "usp" : "glock"),
                    hasArmor: econ[player.id]?.hasArmor ?? false,
                    hasHelmet: econ[player.id]?.hasHelmet ?? false,
                    hasKit: econ[player.id]?.hasKit ?? false,
                    isDead: false
                }))
                setHomeRoster(resetRoster(roundState.homeEconomy, roundState.homeStartsCT))
                setAwayRoster(resetRoster(roundState.awayEconomy, !roundState.homeStartsCT))

                const winnerName = isHomeWinner ? runtime.homeTeam.name : runtime.awayTeam.name
                const lastMap = runtime.result.maps[last.mapIndex]
                const playedRound = lastMap?.rounds[lastMap.rounds.length - 1]
                const winnerIsCT = playedRound ? playedRound.winner === "ct" : isHomeWinner === roundState.homeStartsCT
                const roundEndMessage = commentaryManager.generate(winnerIsCT ? "ROUND_WIN_CT" : "ROUND_WIN_T", { team: winnerName })
                setLogs(prev => [{ type: "ROUND_END", message: `${roundEndMessage} (Winner: ${winnerName})` }, ...prev])

                const mapClinched = transition === "MAP_END" || transition === "SERIES_END"
                const playerIsHomeSide = runtime.homeTeam.id === playerTeam?.id
                const playerIsAwaySide = runtime.awayTeam.id === playerTeam?.id
                // Only cue on normal playback (instant simulate runs at speed 100).
                if (!mapClinched && (playerIsHomeSide || playerIsAwaySide) && speed <= 5) {
                    soundManager.play((playerIsHomeSide ? isHomeWinner : !isHomeWinner) ? "roundWin" : "roundLose")
                }

                const settle = () => { setRoundTime(ROUND_SECONDS); setIsBombPlanted(false); setBombTime(BOMB_SECONDS) }
                runtime.result.homeScore = roundState.homeSeriesScore
                runtime.result.awayScore = roundState.awaySeriesScore
                if (transition === "SERIES_END") {
                    runtime.result.winnerId = roundState.homeSeriesScore > roundState.awaySeriesScore ? runtime.homeTeam.id : runtime.awayTeam.id
                    setGameState(prev => ({ ...prev, status: "FINISHED", homeSeriesScore: roundState.homeSeriesScore, awaySeriesScore: roundState.awaySeriesScore }))
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    const playerWon = (playerIsHomeSide && roundState.homeSeriesScore > roundState.awaySeriesScore) || (playerIsAwaySide && roundState.awaySeriesScore > roundState.homeSeriesScore)
                    soundManager.play(playerWon ? "victory" : "defeat")
                } else if (transition === "MAP_END") {
                    const nextMapId = runtime.canonicalMaps[roundState.currentMapIndex]
                    setGameState(prev => ({ ...prev, currentMapIndex: roundState.currentMapIndex, homeScore: 0, awayScore: 0, round: 1, time: -1 }))
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    setLogs(prev => [{ type: "SYSTEM", message: `--- NEXT MAP: ${(MAP_NAMES[nextMapId] || nextMapId).toUpperCase()} ---` }, ...prev])
                    queueRoundStart("PISTOL")
                } else if (transition === "OVERTIME") {
                    setLogs(prev => [{ type: "SYSTEM", message: "--- OVERTIME: 12-12 · MR3 · FIRST TO 16 ---" }, ...prev])
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(true)
                } else if (transition === "HALFTIME") {
                    setLogs(prev => [{ type: "SYSTEM", message: "--- HALF TIME: SWITCHING SIDES ---" }, ...prev])
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    queueRoundStart("PISTOL")
                } else if (transition === "OVERTIME_SWITCH") {
                    const newSet = (roundState.currentRound - 25) % 6 === 0
                    setLogs(prev => [{ type: "SYSTEM", message: newSet ? "--- OVERTIME: TIED SET · NEW MR3 SET ---" : "--- OVERTIME: SWITCHING SIDES ---" }, ...prev])
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(true)
                } else {
                    setIsWaitingForStrategy(true)
                    setIsPlaying(false)
                    settle()
                }
            }
        })

        lastProcessedTime.current = currentTime
    }, [simState, originalHomePlayers, originalAwayPlayers, queueRoundStart, playerTeam, speed])

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
                const endEvent = currentRoundEvents.current.find(e => e.type === "ROUND_END")
                if (endEvent) processNextEvent(Math.max(nextTime, Math.ceil(endEvent.time)))
            }
        }, delay)

        return () => window.clearTimeout(timer)
    }, [gameState.status, gameState.round, gameState.time, gameState.isPaused, speed, isPlaying, isWaitingForStrategy, isBombPlanted, roundTime, bombTime, processNextEvent])

    // --- AUTO ACTIONS ---
    // Auto/skip makes no manager call: the managed team buys by its economy
    // style exactly as an instant simulation would, so skipping a match and
    // simulating it instantly agree (L14.A1).
    useEffect(() => {
        if (!isAutoTactics || !isWaitingForStrategy || !simState || gameState.status !== "IN_PROGRESS") return
        if (!simState.isOvertime && (simState.currentRound === 1 || simState.currentRound === 13)) return
        const timer = setTimeout(() => { startNextRound() }, 500)
        return () => clearTimeout(timer)
    }, [isAutoTactics, isWaitingForStrategy, simState, gameState.status, startNextRound])

    useEffect(() => {
        if (gameState.status === "IN_PROGRESS" && isWaitingForStrategy && simState && !simState.isOvertime && (simState.currentRound === 1 || simState.currentRound === 13)) {
            const timer = setTimeout(() => { startNextRound("PISTOL") }, 1000)
            return () => clearTimeout(timer)
        }
    }, [gameState.status, isWaitingForStrategy, simState, startNextRound])

    // --- HANDLERS ---
    const simulateRoundInstant = useCallback(() => {
        if (isSimulatingRef.current) return
        isSimulatingRef.current = true
        if (isWaitingForStrategy) startNextRound()
        // Fast-forward: process all remaining events by jumping time to the end of the round
        const events = currentRoundEvents.current
        if (events.length > 0) {
            const maxTime = Math.max(...events.map(e => Math.ceil(e.time))) + 1
            processNextEvent(maxTime)
            setRoundTime(0)
            setBombTime(0)
            setGameState(prev => ({ ...prev, time: maxTime }))
            lastProcessedTime.current = maxTime
        }
        setSpeed(100)
        setIsPlaying(true)
        isSimulatingRef.current = false
    }, [isWaitingForStrategy, startNextRound, processNextEvent])

    const simulateMatchInstant = useCallback(() => {
        setSpeed(100)
        setIsAutoTactics(true)
        setIsPlaying(true)
    }, [])

    const callTimeout = useCallback(() => {
        const next = spendTimeout({ remaining: timeoutsRemainingRef.current, rounds: timeoutBoostRoundsRef.current }, isWaitingForStrategy, latestGameStateRef.current?.status || '')
        if (!next) return
        timeoutsRemainingRef.current = next.remaining
        timeoutBoostRoundsRef.current = next.rounds
        setTimeoutsRemaining(next.remaining)
        setTimeoutBoostRounds(next.rounds)
        setIsPlaying(false)
        setIsAutoTactics(false)
        soundManager.play("notification")
    }, [isWaitingForStrategy])

    const handleFinish = useCallback(() => {
        const runtime = matchData.current
        const sim = latestSimStateRef.current
        if (!runtime || !sim || latestGameStateRef.current?.status !== "FINISHED") return

        // Canonical result from the rounds actually played (same finaliser as
        // instant simulation: map MVPs, stats stream, lineups, management).
        const result = finalizeLegacySeries(runtime.ctx, { sim, maps: runtime.result.maps, finished: true }, buildManagementRecord({
            ctx: runtime.ctx, match: runtime.match, mode: "live", timeoutsUsed: 2 - timeoutsRemainingRef.current, maps: runtime.result.maps,
        }))
        saveMatchResult(runtime.match.id, result)
        if (!useGameStore.getState().completedMatches.some(m => m.id === runtime.match.id)) {
            useGameStore.getState().addToast({ message: "The result could not be committed. Your match checkpoint has been preserved.", type: "warning" })
            return
        }
        pendingCheckpoint.current = null
        clearActiveMatchState()
        router.push(`/match/${id}/result`)
    }, [id, saveMatchResult, clearActiveMatchState, router])

    // Own-team view for the strategy panel and loadout editor (home OR away).
    const ownEconomy = useMemo(() => (simState ? (isPlayerHome ? simState.homeEconomy : simState.awayEconomy) : {}) as Record<string, { cash: number }>, [simState, isPlayerHome])
    const ownIsCT = simState ? (isPlayerHome ? simState.homeStartsCT : !simState.homeStartsCT) : true

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
        teams,
        updateCustomTactic,
        roundHomeIsCT,
        isPlayerHome,
        ownEconomy,
        ownIsCT,
    }
}
