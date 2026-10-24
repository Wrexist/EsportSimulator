import { restoreTimeoutState, spendTimeout } from "@/engine/match/manager-controls"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { useShallow } from "zustand/react/shallow"
import { MapId, Player, MatchResult, MatchEvent, ActiveMatchState, LiveGameState, LogEntry, LivePlayerState, SimState, RoundResult } from "@/types"
import type { TeamSaveData } from "@/engine/save-types"
import { EconomyManager, WEAPONS, commentaryManager } from "@/engine"
import { LEGACY_MATCH_ENGINE, restoreLivePlayback, pendingLiveEvents } from "@/engine/match/live-checkpoint"
import { isEngineVersion, resolveEngineVersion } from "@/engine/match/engine-version"
import { buildRestoredGameState } from "@/engine/match/live-match-init"
import {
    createLegacySeriesState,
    finalizeLegacySeries,
    playLegacyRound,
    MANAGER_STRATEGIES,
    type LegacySeriesContext,
    type ManagerStrategy,
} from "@/engine/match/legacy-series"
import { prepareLegacySeries, buildManagementRecord } from "@/engine/match/legacy-prepare"
import { soundManager } from "@/lib/sound-manager"
import { playMatchOutcomeCue } from "@/lib/match-outcome-sound"
import { annotateRoundEvents, buildLiveRoundScript, warmRoundMap, type LiveRoundScript } from "@/lib/live-round-script"
import { AUTO_CONFIRM_MS, BREAK_CARD_MS, PISTOL_START_MS, ROUND_BEAT_MS, computeRoundPacing, defaultLiveSpeed, type PacingMode, type RoundPacing } from "@/lib/live-match-pacing"
import { buildRoundTimeline, summarizeRound, type RoundSummary, type RoundTimeline } from "@/lib/live-match-roster"
import { LiveClock, liveWakeTimes, nextWakeAfter, roundBombTimes, roundClockSeconds, scorebugTime } from "@/lib/live-clock"
import type { LegacyTransition } from "@/engine/match/legacy-series"
import { MAP_NAMES } from "@/data/map-pool"
import { liveCheckpointStore, persistCommittedMatch } from "@/lib/live-checkpoint-store"
import {
    ROUND_SECONDS,
    BOMB_SECONDS,
    getNormalizedSeed,
    getActivePlayersByRosterOrder,
    sanitizeRosterFromEconomy,
    finishLegacySeriesFromState,
    restoreLiveSeriesState,
    tallyLivePlayerStats,
} from "@/lib/live-match-builders"

type RoundStrategy = ManagerStrategy | "PISTOL"

/** Max kill/event-feed rows kept in state + DOM during a live match. */
const MAX_LIVE_LOG_ENTRIES = 200
/** Longest single wait of the playback loop (wall ms) before it re-checks the clock. */
const MAX_WAKE_WAIT_MS = 1000
/** Longest gap between durable checkpoint writes while a round plays (wall ms). */
const DURABLE_CHECKPOINT_MS = 3000

/** What the screen shows about the round being played back (built once per round). */
export interface LiveRoundView {
    /** `${mapIndex}:${roundNumber}` */
    key: string
    mapIndex: number
    roundNumber: number
    pacing: RoundPacing
    timeline: RoundTimeline
    /** Round times at which the screen (outside the radar canvas) changes: the hook renders then. */
    wakes: number[]
    /** Post-buy weapon and kit by player id (radar glyphs); absent after a restore. */
    gear: Readonly<Record<string, { weapon?: string; hasKit?: boolean }>>
}

/** Round-end beat: who won, how, the MVP and callouts (shown for ROUND_BEAT_MS). */
export interface LiveRoundBeat {
    id: string
    mapIndex: number
    roundNumber: number
    summary: RoundSummary
    transition: LegacyTransition
    homeScore: number
    awayScore: number
}

/** Break card between halves, before overtime, or between maps. */
export interface LiveIntermission {
    kind: "halftime" | "overtime" | "overtime-switch" | "map-end"
    mapIndex: number
    homeScore: number
    awayScore: number
    /** map-end: the next map. */
    nextMapId?: string
    /** Wall-clock length (pistol rounds start on their own after it). */
    durationMs: number
}

/** Loss-bonus level per team (script-v1) in force for the round on screen. */
export interface LiveLossLevels { home?: number; away?: number }

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

/** Pacing windows and the HP / death / grenade timeline of one round. */
function makeRoundView(ids: { homePlayerIds: string[]; awayPlayerIds: string[] }, mapIndex: number, round: RoundResult, live: LiveRoundScript | null, events: MatchEvent[], loadouts?: Readonly<Record<string, { utility?: readonly string[]; weapon?: string; hasKit?: boolean } | undefined>>): LiveRoundView {
    const gear: Record<string, { weapon?: string; hasKit?: boolean }> = {}
    for (const [id, l] of Object.entries(loadouts ?? {})) if (l) gear[id] = { weapon: l.weapon, hasKit: l.hasKit }
    const pacing = computeRoundPacing(events, live?.script)
    const timeline = buildRoundTimeline({ round, homeIds: ids.homePlayerIds, awayIds: ids.awayPlayerIds, loadouts, script: live?.script })
    return {
        gear,
        key: `${mapIndex}:${round.roundNumber}`,
        mapIndex,
        roundNumber: round.roundNumber,
        pacing,
        timeline,
        wakes: liveWakeTimes({ events, timeline, pacing, script: live?.script }),
    }
}

export interface LiveMatchOptions {
    /**
     * Key of this match's intro (Phase 5.4a). A match that starts fresh (no
     * checkpoint to resume) and has not played its intro opens with
     * `introActive`; the pistol round and auto tactics wait until `endIntro`.
     */
    introKey?: string
}

const introSessionKey = (key: string) => `esm:${key}`

/** Has this intro played (saved key, or this session before the next save)? */
function introPlayed(key: string): boolean {
    if (useGameStore.getState().seenMomentKeys?.includes(key)) return true
    try { return typeof sessionStorage !== "undefined" && sessionStorage.getItem(introSessionKey(key)) === "1" } catch { return false }
}

/** Record the intro as played: saved with the career, and for this session. */
function markIntroPlayed(key: string): void {
    useGameStore.getState().markMomentSeen(key)
    try { sessionStorage.setItem(introSessionKey(key), "1") } catch { /* storage denied: the saved key still holds */ }
}

export function useLiveMatch(id: string, options: LiveMatchOptions = {}) {
    const introKeyRef = useRef(options.introKey)
    introKeyRef.current = options.introKey
    // The intro is decided where the match is set up: only a fresh start shows it.
    const [introActive, setIntroActive] = useState(false)
    const holdStart = introActive
    const endIntro = useCallback(() => setIntroActive(false), [])
    const router = useRouter()
    const { scheduledMatches, teams, players, staff, getPlayerTeam, customTactics, setActiveMatch, updateActiveMatchState, saveMatchResult, clearActiveMatchState, updateCustomTactic, currentWeek, currentDay, timeMode, isAutoTactics, setIsAutoTactics } = useGameStore(useShallow(state => ({
        scheduledMatches: state.scheduledMatches,
        teams: state.teams,
        players: state.players,
        staff: state.staff,
        getPlayerTeam: state.getPlayerTeam,
        customTactics: state.customTactics,
        setActiveMatch: state.setActiveMatch,
        updateActiveMatchState: state.updateActiveMatchState,
        saveMatchResult: state.saveMatchResult,
        clearActiveMatchState: state.clearActiveMatchState,
        updateCustomTactic: state.updateCustomTactic,
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        // Auto tactics is saved with the career, so it survives a reload and the next match.
        isAutoTactics: state.autoTactics,
        setIsAutoTactics: state.setAutoTactics,
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
    // Pacing: key moments at speed with the quiet stretches fast-forwarded
    // (default), or every second at speed. The choice is a persisted setting.
    const livePacing = useSettingsStore(s => s.livePacing)
    const setLivePacing = useSettingsStore(s => s.setLivePacing)
    const pacingMode: PacingMode = livePacing === "full" ? "full" : "moments"
    // Seed live-match playback speed from the user's Live match speed setting.
    const gameSpeedSetting = useSettingsStore(s => s.gameSpeed)
    // Always one of LIVE_SPEED_PRESETS so the control bar label is exact.
    const [speed, setSpeed] = useState<number>(() => defaultLiveSpeed(pacingMode, gameSpeedSetting))
    const [isPlaying, setIsPlaying] = useState(false)

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
    // The round on screen: pacing windows and the HP / death / grenade timeline.
    const [roundView, setRoundViewState] = useState<LiveRoundView | null>(null)
    const roundViewRef = useRef<LiveRoundView | null>(null)
    const setRoundView = useCallback((view: LiveRoundView | null) => {
        roundViewRef.current = view
        setRoundViewState(view)
    }, [])
    const [roundBeat, setRoundBeat] = useState<LiveRoundBeat | null>(null)
    const [intermission, setIntermission] = useState<LiveIntermission | null>(null)
    // Auto tactics: the decision card confirms itself unless held (Space / Hold).
    const [decisionHold, setDecisionHold] = useState(false)
    // Economy state shown on the scorebug: the levels the round on screen was
    // played with (the canonical step has already applied its result).
    const [shownLossLevels, setShownLossLevels] = useState<LiveLossLevels>({})
    // Side of the round being played back. The canonical step applies the
    // halftime/overtime swap as soon as a round is computed, so the radar and
    // kill feed must use the side the round was actually played on.
    const [roundHomeIsCT, setRoundHomeIsCT] = useState(true)

    const currentRoundEvents = useRef<MatchEvent[]>([])
    // Round script of the round on screen (radar positions, duels, utility,
    // bomb). Built once per round from the resolved round and rebuilt on
    // restore; never part of the checkpoint (deterministic from seed + round).
    const [roundScript, setRoundScriptState] = useState<LiveRoundScript | null>(null)
    const roundScriptRef = useRef<LiveRoundScript | null>(null)
    const setRoundScript = useCallback((live: LiveRoundScript | null) => {
        roundScriptRef.current = live
        setRoundScriptState(live)
    }, [])
    const isSimulatingRef = useRef(false)
    // Set while "Skip match" reveals a round: no per-round win/lose cue.
    const silentPlaybackRef = useRef(false)
    const roundInFlightRef = useRef(false)
    const hasInitialized = useRef(false)
    const isMountedRef = useRef(true)
    const lastProcessedTime = useRef(-1)
    // Continuous round clock (lib/live-clock): the radar samples it every
    // frame; the loop below reveals events when it reaches their time.
    // `uiTimeRef` mirrors gameState.time, the round time the screen shows.
    const [liveClock] = useState(() => new LiveClock())
    const uiTimeRef = useRef(-1)
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

    // A queued (pistol) round start; any round start cancels it, so skipping
    // a break card cannot start a second round later.
    const queuedStartRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const queueRoundStart = useCallback((strategy: RoundStrategy, delayMs: number) => {
        const timerId = setTimeout(() => {
            pendingTimers.current.delete(timerId)
            if (queuedStartRef.current === timerId) queuedStartRef.current = null
            if (!isMountedRef.current) return
            startNextRoundRef.current(strategy)
        }, delayMs)
        pendingTimers.current.add(timerId)
        queuedStartRef.current = timerId
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
        // Read, not subscribed: the 500 ms checkpoint flush below rewrites
        // activeMatchState, and subscribing re-rendered the whole live page
        // twice a second. It is only needed once, to restore.
        const activeMatchState = useGameStore.getState().activeMatchState
        const restoring = activeMatchState?.matchId === id
        try {
            if (foundMatch.engineVersion && !isEngineVersion(foundMatch.engineVersion)) throw Error("Unsupported match engine")
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
            // A resumed match keeps the engine its checkpoint was written with
            // (every pre-script-v1 checkpoint is legacy-v2); a new one uses the
            // match's recorded engine or the default.
            const engineVersion = playback ? playback.engine : resolveEngineVersion(foundMatch.engineVersion)
            ctx = prepareLegacySeries({
                match: { ...foundMatch, seed, maps: savedMaps, engineVersion },
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
            engineVersion: ctx.engineVersion ?? LEGACY_MATCH_ENGINE,
            lineups: { [hTeam.id]: activeHomeIds, [aTeam.id]: activeAwayIds },
            winnerId: null, homeScore: 0, awayScore: 0, maps: fresh.maps, mvpPlayerId: "", playerStats: {},
        }

        if (restoring && playback) {
            const restored = restoreLiveSeriesState({ ctx, checkpoint: activeMatchState!, playback, homePlayers, awayPlayers, mapStartingSides })
            const { inFlight, currentMapIndex, sim: sanitizedSimState } = restored
            const currentMapId = canonicalMaps[currentMapIndex] || MapId.SANDSTONE
            const restoredResultSource = (activeMatchState!.matchResult as unknown as MatchResult | undefined) || shellResult
            const restoredResult: MatchResult = {
                ...restoredResultSource,
                engineVersion: ctx.engineVersion ?? LEGACY_MATCH_ENGINE,
                lineups: shellResult.lineups,
                homeScore: sanitizedSimState.homeSeriesScore,
                awayScore: sanitizedSimState.awaySeriesScore,
                maps: restored.maps,
            }
            const restoredGameState = buildRestoredGameState({ savedGameState: activeMatchState!.gameState, simState: sanitizedSimState, currentMapIndex: inFlight && sanitizedSimState.lastRound ? sanitizedSimState.lastRound.mapIndex : currentMapIndex })

            // Side the in-flight round was played on (from its recorded round).
            const lastMap = inFlight && sanitizedSimState.lastRound ? restoredResult.maps[sanitizedSimState.lastRound.mapIndex] : undefined
            const lastRecorded = lastMap?.rounds[lastMap.rounds.length - 1]
            setRoundHomeIsCT(lastRecorded ? lastRecorded.ctTeam === hTeam.id : sanitizedSimState.homeStartsCT)
            // Pre-round loss levels of an in-flight round are not checkpointed.
            setShownLossLevels(inFlight ? {} : { home: sanitizedSimState.homeLossLevel, away: sanitizedSimState.awayLossLevel })

            // Radar: rebuild the shown round's script from its recorded round
            // (the bought utility is not checkpointed, so no grenades).
            const shown = sanitizedSimState.lastRound
            const shownRounds = shown ? restoredResult.maps[shown.mapIndex]?.rounds ?? [] : []
            const shownRound = shown ? shownRounds.find(r => r.roundNumber === shown.roundNumber) ?? shownRounds[shownRounds.length - 1] : undefined
            const restoredScript = shown && shownRound
                ? buildLiveRoundScript({ ctx, mapId: canonicalMaps[shown.mapIndex] ?? restoredResult.maps[shown.mapIndex]?.map ?? "", mapIndex: shown.mapIndex, round: shownRound })
                : null
            setRoundScript(restoredScript)
            warmRoundMap(currentMapId)

            matchData.current = {
                ownerSaveId: useGameStore.getState().saveId,
                match: runtimeMatch, result: restoredResult, homeTeam: hTeam, awayTeam: aTeam,
                homePlayerIds: activeHomeIds, awayPlayerIds: activeAwayIds, canonicalMaps, mapStartingSides, ctx,
            }

            // An in-flight round resumes exactly where its playback stopped.
            const resumeAt = inFlight ? playback.processedTime : restoredGameState.time
            latestSimStateRef.current = sanitizedSimState
            setGameState(inFlight ? { ...restoredGameState, time: resumeAt } : restoredGameState)
            setSimState(sanitizedSimState)
            // Visible mid-round inventories/deaths, not the resolved end-of-round economy.
            setHomeRoster(structuredClone(activeMatchState!.homeRoster))
            setAwayRoster(structuredClone(activeMatchState!.awayRoster))
            currentRoundEvents.current = annotateRoundEvents(playback.events, restoredScript)
            const restoredView = shown && shownRound
                ? makeRoundView({ homePlayerIds: activeHomeIds, awayPlayerIds: activeAwayIds }, shown.mapIndex, shownRound, restoredScript, currentRoundEvents.current)
                : null
            setRoundView(restoredView)
            lastProcessedTime.current = playback.processedTime
            uiTimeRef.current = resumeAt
            liveClock.startRound(restoredView?.pacing ?? null, resumeAt)
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
        setShownLossLevels({ home: fresh.sim.homeLossLevel, away: fresh.sim.awayLossLevel })
        setRoundView(null)
        setHomeRoster(sanitizeRosterFromEconomy(homePlayers, fresh.sim.homeEconomy, fresh.sim.homeStartsCT))
        setAwayRoster(sanitizeRosterFromEconomy(awayPlayers, fresh.sim.awayEconomy, !fresh.sim.homeStartsCT))
        setOriginalHomePlayers(homePlayers)
        setOriginalAwayPlayers(awayPlayers)

        const initialMapId = canonicalMaps[0] || MapId.SANDSTONE
        setRoundScript(null)
        warmRoundMap(initialMapId)
        const startMsg = commentaryManager.generate("MATCH_START", { map: MAP_NAMES[initialMapId] || initialMapId })
        setLogs([{ type: "SYSTEM", message: startMsg }])
        setGameState(prev => ({ ...prev, status: "IN_PROGRESS", time: -1, isPaused: false }))
        setIsPlaying(false)
        setIsWaitingForStrategy(true)
        const introKey = introKeyRef.current
        if (introKey && !introPlayed(introKey)) {
            markIntroPlayed(introKey)
            setIntroActive(true)
        }
    }, [scheduledMatches, teams, players, id, setActiveMatch, staff, router, currentWeek, currentDay, timeMode, customTactics, setRoundScript, setRoundView, liveClock])

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
                version: 1, engine: matchData.current!.ctx.engineVersion ?? LEGACY_MATCH_ENGINE, saveId: matchData.current!.ownerSaveId,
                events: currentRoundEvents.current, processedTime: lastProcessedTime.current, exactTime: true,
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
    // The page only renders when the screen changes, so while a round plays the
    // flush also stamps the live clock: a reload resumes where playback was,
    // not at the last event. Nothing is revealed between the last processed
    // time and the next wake, so the stamped state is exactly the shown one.
    const lastCheckpoint = useRef<ActiveMatchState | null>(null)
    // Set once the result is committed: no checkpoint may be written after it.
    const matchCommittedRef = useRef(false)
    useEffect(() => {
        const stamp = (s: ActiveMatchState | null): ActiveMatchState | null => {
            const view = roundViewRef.current
            if (!s?.playback || !liveClock.isRunning || !view || view.mapIndex !== s.gameState.currentMapIndex || view.roundNumber !== s.gameState.round) return null
            const from = s.playback.processedTime
            const t = Math.min(liveClock.now(), nextWakeAfter(view.wakes, from) - 0.001)
            if (!(t > from + 0.05) || t <= (s.gameState.time ?? -1)) return null
            const { plantAt, bombEndAt } = roundBombTimes(s.playback.events)
            const shown = scorebugTime(t, plantAt, bombEndAt)
            return {
                ...s,
                playback: { ...s.playback, processedTime: t },
                gameState: { ...s.gameState, time: t },
                roundTime: roundClockSeconds(t, plantAt),
                isBombPlanted: shown.planted,
                bombTime: shown.planted ? shown.seconds : BOMB_SECONDS,
            }
        }
        // Durable copy (lib/live-checkpoint-store): at once when a round is
        // decided or the decision card opens, otherwise every few seconds of
        // playback, and when the page goes away.
        const durable = { at: 0, key: "" }
        const writeDurable = (s: ActiveMatchState | null, force = false) => {
            const saveId = matchData.current?.ownerSaveId
            if (!s || !saveId || matchCommittedRef.current || s.gameState.status === "FINISHED") return
            const key = `${s.gameState.currentMapIndex}:${s.gameState.round}:${s.isWaitingForStrategy ? 1 : 0}`
            const now = Date.now()
            if (!force && key === durable.key && now - durable.at < DURABLE_CHECKPOINT_MS) return
            durable.key = key
            durable.at = now
            void liveCheckpointStore.write(saveId, s)
        }
        const flush = (force = false) => {
            const pending = pendingCheckpoint.current
            pendingCheckpoint.current = null
            if (pending) lastCheckpoint.current = pending
            const stamped = stamp(lastCheckpoint.current)
            if (stamped) lastCheckpoint.current = stamped
            const snapshot = stamped ?? pending
            if (snapshot) {
                const copy = structuredClone(snapshot)
                updateActiveMatchState(copy)
                writeDurable(copy, force)
            } else if (force) writeDurable(lastCheckpoint.current, true)
        }
        const timer = setInterval(() => flush(), 500)
        const onPageHide = () => flush(true)
        window.addEventListener("pagehide", onPageHide)
        return () => { clearInterval(timer); window.removeEventListener("pagehide", onPageHide); flush(true) }
    }, [id, updateActiveMatchState, liveClock])

    const isPlayerHome = !!playerTeam && matchData.current?.homeTeam.id === playerTeam.id

    const startNextRound = useCallback((playerStrategy?: RoundStrategy) => {
        const runtime = matchData.current
        const currentSimState = latestSimStateRef.current
        if (!runtime || !currentSimState) return
        // One round at a time: a queued pistol start, the auto-tactics timer and
        // a click can otherwise race and play two rounds from one decision.
        if (roundInFlightRef.current || latestGameStateRef.current.status === "FINISHED") return
        if (queuedStartRef.current) {
            clearTimeout(queuedStartRef.current)
            pendingTimers.current.delete(queuedStartRef.current)
            queuedStartRef.current = null
        }

        const { homeTeam, awayTeam } = runtime
        const regrouping = timeoutBoostRoundsRef.current > 0
        const strategy = playerStrategy && (MANAGER_STRATEGIES as readonly string[]).includes(playerStrategy) ? playerStrategy as ManagerStrategy : undefined
        const sideBefore = currentSimState.homeStartsCT
        const mapIndex = currentSimState.currentMapIndex
        const currentRoundNumber = currentSimState.currentRound
        // Kickoff cue once per match (shares the countdown's once-per-kickoff gate with the match intro).
        if (mapIndex === 0 && currentRoundNumber === 1) soundManager.play("matchStart", { key: `kickoff:${id}` })

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
        setShownLossLevels({ home: currentSimState.homeLossLevel, away: currentSimState.awayLossLevel })
        setRoundBeat(null)
        setIntermission(null)
        setDecisionHold(false)
        // The round is decided: describe it once for the radar (~1 ms warm),
        // and once for the screen (pacing windows, HP / death / grenade timeline).
        const loadouts = { ...step.preRound.home, ...step.preRound.away }
        const live = buildLiveRoundScript({
            ctx: runtime.ctx,
            mapId: runtime.canonicalMaps[mapIndex] ?? step.state.maps[mapIndex]?.map ?? "",
            mapIndex,
            round: step.round,
            loadouts,
        })
        setRoundScript(live)
        currentRoundEvents.current = annotateRoundEvents(step.round.events || [], live)
        const view = makeRoundView(runtime, mapIndex, step.round, live, currentRoundEvents.current, loadouts)
        setRoundView(view)
        // The clock starts at 0 (paused until the render that starts playback).
        liveClock.startRound(view.pacing, 0)
        uiTimeRef.current = 0

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

        const historyStats = tallyLivePlayerStats(runtime.result.maps, { mapIndex, roundNumber: currentRoundNumber })

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
    }, [customTactics, setRoundScript, setRoundView, liveClock, id])

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
        const playerName = (playerId: string | undefined) => playerId
            ? [...latestHomeRosterRef.current, ...latestAwayRosterRef.current].find(p => p.id === playerId)?.name
            : undefined

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
                        location: nextEvent.location,
                        reward
                    }, ...prev]
                })
            } else if (nextEvent.type === "PLANT") {
                const site = nextEvent.site
                const planter = playerName(roundScriptRef.current?.script.bomb.plant?.planterId)
                const message = site ? `Bomb planted at ${site}${planter ? ` by ${planter}` : ""}` : commentaryManager.generate("PLANT", {})
                setLogs(prev => [{ type: "PLANT", time: nextEvent.time, message, site }, ...prev])
                if (!silentPlaybackRef.current) soundManager.play("bombPlant")
            } else if (nextEvent.type === "DEFUSE") {
                const site = nextEvent.site
                const defuser = playerName(roundScriptRef.current?.script.bomb.defuse?.defuserId)
                const message = site ? `Bomb defused at ${site}${defuser ? ` by ${defuser}` : ""}` : commentaryManager.generate("DEFUSE", {})
                setLogs(prev => [{ type: "DEFUSE", time: nextEvent.time, message, site }, ...prev])
                if (!silentPlaybackRef.current) soundManager.play("bombDefuse")
            } else if (nextEvent.type === "EXPLODE") {
                const site = nextEvent.site
                setLogs(prev => [{ type: "EXPLODE", time: nextEvent.time, message: site ? `Bomb exploded at ${site}` : commentaryManager.generate("EXPLODE", {}), site }, ...prev])
                if (!silentPlaybackRef.current) soundManager.play("bombExplode")
            } else if (nextEvent.type === "CLUTCH") {
                const playersInRound = [...latestHomeRosterRef.current, ...latestAwayRosterRef.current]
                const player = playersInRound.find(roundPlayer => roundPlayer.id === nextEvent.playerId)
                setLogs(prev => [{ type: "CLUTCH", time: nextEvent.time, message: `${player?.name || "Player"} won a ${nextEvent.details} clutch!`, playerId: nextEvent.playerId }, ...prev])
                // Sting only for the manager's own side.
                const clutchForHome = latestHomeRosterRef.current.some(p => p.id === nextEvent.playerId)
                const ownSide = clutchForHome ? runtime.homeTeam.id === playerTeam?.id : runtime.awayTeam.id === playerTeam?.id
                if (ownSide && !silentPlaybackRef.current) soundManager.play("clutch")
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
                setShownLossLevels({ home: roundState.homeLossLevel, away: roundState.awayLossLevel })
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

                // Round-end beat (not while "Skip match" resolves the rest).
                const silent = silentPlaybackRef.current
                if (!silent && playedRound) {
                    const beatId = `${last.mapIndex}:${last.roundNumber}`
                    setRoundBeat({
                        id: beatId, mapIndex: last.mapIndex, roundNumber: last.roundNumber, transition,
                        homeScore: last.homeRounds, awayScore: last.awayRounds,
                        summary: summarizeRound(playedRound, runtime.homeTeam.id, runtime.homePlayerIds, runtime.awayPlayerIds),
                    })
                    const beatTimer = setTimeout(() => {
                        pendingTimers.current.delete(beatTimer)
                        if (isMountedRef.current) setRoundBeat(b => (b?.id === beatId ? null : b))
                    }, ROUND_BEAT_MS)
                    pendingTimers.current.add(beatTimer)
                }
                const breakAt = (kind: LiveIntermission["kind"], nextMapId?: string) => {
                    if (!silent) setIntermission({ kind, mapIndex: last.mapIndex, homeScore: last.homeRounds, awayScore: last.awayRounds, nextMapId, durationMs: BREAK_CARD_MS })
                }

                const mapClinched = transition === "MAP_END" || transition === "SERIES_END"
                const playerIsHomeSide = runtime.homeTeam.id === playerTeam?.id
                const playerIsAwaySide = runtime.awayTeam.id === playerTeam?.id
                // Only cue on normal playback, not while "Skip match" resolves.
                if (!mapClinched && (playerIsHomeSide || playerIsAwaySide) && !silentPlaybackRef.current) {
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
                    // Once per match: the result screen will not repeat it.
                    if (playerIsHomeSide || playerIsAwaySide) playMatchOutcomeCue(runtime.match.id, playerWon)
                } else if (transition === "MAP_END") {
                    const nextMapId = runtime.canonicalMaps[roundState.currentMapIndex]
                    uiTimeRef.current = -1
                    setGameState(prev => ({ ...prev, currentMapIndex: roundState.currentMapIndex, homeScore: 0, awayScore: 0, round: 1, time: -1 }))
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    setLogs(prev => [{ type: "SYSTEM", message: `--- NEXT MAP: ${(MAP_NAMES[nextMapId] || nextMapId).toUpperCase()} ---` }, ...prev])
                    // Warm the next map's walk graph before its pistol round is built.
                    if (nextMapId) warmRoundMap(nextMapId)
                    breakAt("map-end", nextMapId)
                    queueRoundStart("PISTOL", ROUND_BEAT_MS + BREAK_CARD_MS)
                } else if (transition === "OVERTIME") {
                    setLogs(prev => [{ type: "SYSTEM", message: "--- OVERTIME: 12-12 · MR3 · FIRST TO 16 ---" }, ...prev])
                    breakAt("overtime")
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(true)
                } else if (transition === "HALFTIME") {
                    setLogs(prev => [{ type: "SYSTEM", message: "--- HALF TIME: SWITCHING SIDES ---" }, ...prev])
                    breakAt("halftime")
                    settle()
                    setIsPlaying(false)
                    setIsWaitingForStrategy(false)
                    queueRoundStart("PISTOL", ROUND_BEAT_MS + BREAK_CARD_MS)
                } else if (transition === "OVERTIME_SWITCH") {
                    const newSet = (roundState.currentRound - 25) % 6 === 0
                    setLogs(prev => [{ type: "SYSTEM", message: newSet ? "--- OVERTIME: TIED SET · NEW MR3 SET ---" : "--- OVERTIME: SWITCHING SIDES ---" }, ...prev])
                    breakAt("overtime-switch")
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
    }, [simState, originalHomePlayers, originalAwayPlayers, queueRoundStart, playerTeam, id])

    // --- GAME LOOP ---
    // The round plays on a continuous clock (lib/live-clock): key moments at
    // speed, quiet stretches fast-forwarded with an ease, or full rounds at
    // `speed`. The radar samples the clock every animation frame and the
    // scorebug timer reads it on its own (≤ 8×/s); the page only renders when
    // what it shows changes: at each event / HP step / grenade / pacing
    // boundary (the round's `wakes`), revealed when the clock reaches them
    // (time <= now, the rule the radar uses too). The checkpoint stamps the
    // clock in between (see the flush). A hidden window pauses the clock, so
    // a round never plays unseen.
    const [pageVisible, setPageVisible] = useState(true)
    useEffect(() => {
        const sync = () => setPageVisible(!document.hidden)
        sync()
        document.addEventListener("visibilitychange", sync)
        return () => document.removeEventListener("visibilitychange", sync)
    }, [])
    const running = gameState.status === "IN_PROGRESS" && !gameState.isPaused && isPlaying && !isWaitingForStrategy && gameState.time >= 0 && pageVisible

    // Scorebug timers at the shown round time (checkpointed; the live scorebug
    // reads the clock itself): the round clock stops at the plant, the bomb
    // counts down from it.
    const syncRoundClock = useCallback((t: number) => {
        const { plantAt, bombEndAt } = roundBombTimes(currentRoundEvents.current)
        const s = scorebugTime(t, plantAt, bombEndAt)
        setIsBombPlanted(s.planted)
        setBombTime(s.planted ? s.seconds : BOMB_SECONDS)
        setRoundTime(roundClockSeconds(t, plantAt))
    }, [])

    /** Moves the screen to round time `t`: scorebug, then the events up to `t`. */
    const advanceTo = useCallback((t: number) => {
        uiTimeRef.current = t
        setGameState(prev => (prev.time === t ? prev : { ...prev, time: t }))
        syncRoundClock(t)
        processNextEvent(t)
    }, [processNextEvent, syncRoundClock])
    const advanceRef = useRef(advanceTo)
    advanceRef.current = advanceTo

    // Speed / pacing changes keep the round time and continue at the new rate
    // (declared before the loop so the loop reschedules with the new rate).
    useEffect(() => { liveClock.configure(speed, pacingMode) }, [liveClock, speed, pacingMode])
    useEffect(() => { liveClock.setRunning(running) }, [liveClock, running])

    useEffect(() => {
        if (!running) return
        let timer = 0
        // Without a round view (a restore that could not rebuild it) the events alone.
        const fallback = roundViewRef.current ? null : [...new Set(currentRoundEvents.current.map(e => e.time))].sort((a, b) => a - b)
        const schedule = () => {
            const wake = nextWakeAfter(roundViewRef.current?.wakes ?? fallback ?? undefined, uiTimeRef.current)
            const now = performance.now()
            const due = liveClock.wallAt(wake, now)
            if (!Number.isFinite(due)) return
            // A long timer re-checks now and then (the clock may have been re-anchored).
            timer = window.setTimeout(() => fire(wake, due), Math.min(MAX_WAKE_WAIT_MS, Math.max(0, due - now + 1)))
        }
        const fire = (wake: number, due: number) => {
            const now = performance.now()
            // Timer jitter: a wake that is due is reached.
            const t = now >= due - 2 ? Math.max(wake, liveClock.now(now)) : liveClock.now(now)
            if (t >= wake) advanceRef.current(t)
            schedule()
        }
        schedule()
        return () => window.clearTimeout(timer)
    }, [running, liveClock, speed, pacingMode])

    // --- AUTO ACTIONS ---
    // Auto/skip makes no manager call: the managed team buys by its economy
    // style exactly as an instant simulation would, so skipping a match and
    // simulating it instantly agree (L14.A1).
    // The decision card confirms itself AUTO_CONFIRM_MS after it appears (after
    // the round-end beat) unless the manager holds it.
    const roundBeatShown = roundBeat !== null
    useEffect(() => {
        if (!isAutoTactics || !isWaitingForStrategy || !simState || gameState.status !== "IN_PROGRESS" || roundBeatShown || decisionHold || holdStart) return
        if (!simState.isOvertime && (simState.currentRound === 1 || simState.currentRound === 13)) return
        const timer = setTimeout(() => { startNextRound() }, AUTO_CONFIRM_MS)
        return () => clearTimeout(timer)
    }, [isAutoTactics, isWaitingForStrategy, simState, gameState.status, startNextRound, roundBeatShown, decisionHold, holdStart])

    useEffect(() => {
        if (holdStart) return
        if (gameState.status === "IN_PROGRESS" && isWaitingForStrategy && !roundBeatShown && simState && !simState.isOvertime && (simState.currentRound === 1 || simState.currentRound === 13)) {
            const timer = setTimeout(() => { startNextRound("PISTOL") }, PISTOL_START_MS)
            return () => clearTimeout(timer)
        }
    }, [gameState.status, isWaitingForStrategy, simState, startNextRound, roundBeatShown, holdStart])

    // --- HANDLERS ---
    const simulateRoundInstant = useCallback(() => {
        if (isSimulatingRef.current) return
        isSimulatingRef.current = true
        if (isWaitingForStrategy) startNextRound()
        // Reveal the rest of the round at once: its outcome was fixed when the
        // round was computed. ROUND_END settles timers and queues the next
        // decision, so playback speed is left untouched (it used to be forced
        // to 100x and never restored).
        const events = currentRoundEvents.current
        if (roundInFlightRef.current && events.length > 0) {
            const maxTime = Math.max(...events.map(e => Math.ceil(e.time))) + 1
            // The radar jumps to the end of the round with the rest of the screen.
            liveClock.seek(maxTime)
            advanceTo(maxTime)
        }
        isSimulatingRef.current = false
    }, [isWaitingForStrategy, startNextRound, advanceTo, liveClock])

    // Space / play button. Mid-round it pauses playback; between rounds it
    // holds (or releases) the auto-tactics countdown on the decision card.
    const waitingRef = useRef(isWaitingForStrategy)
    waitingRef.current = isWaitingForStrategy
    const togglePlayback = useCallback(() => {
        if (latestGameStateRef.current.status !== "IN_PROGRESS") return
        if (waitingRef.current && !roundInFlightRef.current) { setDecisionHold(hold => !hold); return }
        setIsPlaying(playing => !playing)
    }, [])

    const setPacingMode = useCallback((mode: PacingMode) => setLivePacing(mode), [setLivePacing])

    // "Skip match": finish every remaining round now. Same per-round step as
    // the live loop with no manager call (what auto tactics does), so the
    // result is the one letting the match play out on auto would give.
    const simulateMatchInstant = useCallback(() => {
        const runtime = matchData.current
        if (!runtime || !latestSimStateRef.current || latestGameStateRef.current.status !== "IN_PROGRESS") return
        if (isSimulatingRef.current) return
        isSimulatingRef.current = true
        silentPlaybackRef.current = true
        try {
            // 1. The round in flight is already decided; reveal it (scores, feed).
            if (roundInFlightRef.current) {
                const events = currentRoundEvents.current
                const endTime = events.length ? Math.max(...events.map(e => Math.ceil(e.time))) + 1 : 0
                processNextEvent(endTime)
                lastProcessedTime.current = endTime
            }
            // A queued pistol-round start is played by the loop below instead.
            pendingTimers.current.forEach(timer => clearTimeout(timer))
            pendingTimers.current.clear()

            const startSim = latestSimStateRef.current
            const start = { sim: startSim, maps: runtime.result.maps, finished: startSim.lastRound?.transition === "SERIES_END" }
            // The revealed round ended the series: its ROUND_END already finished up.
            if (start.finished) return
            const done = finishLegacySeriesFromState(runtime.ctx, start, { regroupRounds: timeoutBoostRoundsRef.current, customTactics })
            const finalRound = done.lastStep?.round
            const last = done.state.sim.lastRound
            if (!finalRound || !last) return

            const sim = done.state.sim
            const { homeTeam, awayTeam } = runtime
            const homeWon = sim.homeSeriesScore > sim.awaySeriesScore
            runtime.result.maps = done.state.maps
            runtime.result.homeScore = sim.homeSeriesScore
            runtime.result.awayScore = sim.awaySeriesScore
            runtime.result.winnerId = homeWon ? homeTeam.id : awayTeam.id
            latestSimStateRef.current = sim
            setSimState(sim)
            timeoutBoostRoundsRef.current = done.regroupRounds
            setTimeoutBoostRounds(done.regroupRounds)

            // Leave the radar and feed on the end of the deciding round.
            const finalEvents = finalRound.events || []
            const endTime = finalEvents.length ? Math.max(...finalEvents.map(e => Math.ceil(e.time))) + 1 : 0
            const finalScript = buildLiveRoundScript({
                ctx: runtime.ctx,
                mapId: runtime.canonicalMaps[last.mapIndex] ?? done.state.maps[last.mapIndex]?.map ?? "",
                mapIndex: last.mapIndex,
                round: finalRound,
                loadouts: done.lastStep ? { ...done.lastStep.preRound.home, ...done.lastStep.preRound.away } : undefined,
            })
            setRoundScript(finalScript)
            currentRoundEvents.current = annotateRoundEvents(finalEvents, finalScript)
            const finalView = makeRoundView(runtime, last.mapIndex, finalRound, finalScript, currentRoundEvents.current, done.lastStep ? { ...done.lastStep.preRound.home, ...done.lastStep.preRound.away } : undefined)
            setRoundView(finalView)
            liveClock.startRound(finalView.pacing, endTime)
            uiTimeRef.current = endTime
            lastProcessedTime.current = endTime
            roundInFlightRef.current = false
            setRoundHomeIsCT(finalRound.ctTeam === homeTeam.id)
            const finished: Partial<LiveGameState> = {
                status: "FINISHED", round: last.roundNumber, time: endTime, currentMapIndex: last.mapIndex,
                homeScore: last.homeRounds, awayScore: last.awayRounds,
                homeSeriesScore: sim.homeSeriesScore, awaySeriesScore: sim.awaySeriesScore,
            }
            // Synchronously too: handleFinish / startNextRound read the ref.
            latestGameStateRef.current = { ...latestGameStateRef.current, ...finished }
            setGameState(prev => ({ ...prev, ...finished }))

            const stats = tallyLivePlayerStats(done.state.maps)
            const finalRoster = (econ: SimState["homeEconomy"], isCT: boolean) => (prev: LivePlayerState[]) => prev.map(player => {
                const e = (econ as Record<string, { cash?: number; weapon?: string; hasArmor?: boolean; hasHelmet?: boolean; hasKit?: boolean }>)[player.id]
                return {
                    ...player,
                    money: e?.cash ?? player.money,
                    weapon: e?.weapon ?? (isCT ? "usp" : "glock"),
                    hasArmor: e?.hasArmor ?? false,
                    hasHelmet: e?.hasHelmet ?? false,
                    hasKit: e?.hasKit ?? false,
                    isDead: false,
                    kills: stats[player.id]?.kills || 0,
                    deaths: stats[player.id]?.deaths || 0,
                    assists: stats[player.id]?.assists || 0,
                    headshots: stats[player.id]?.headshots || 0,
                }
            })
            setHomeRoster(finalRoster(sim.homeEconomy, sim.homeStartsCT))
            setAwayRoster(finalRoster(sim.awayEconomy, !sim.homeStartsCT))

            const mapScores = done.state.maps
                .filter(m => m.rounds.length > 0)
                .map(m => `${MAP_NAMES[m.map] || m.map} ${m.homeScore ?? 0}-${m.awayScore ?? 0}`)
                .join(", ")
            const winnerName = homeWon ? homeTeam.name : awayTeam.name
            const seriesScore = homeWon ? `${sim.homeSeriesScore}-${sim.awaySeriesScore}` : `${sim.awaySeriesScore}-${sim.homeSeriesScore}`
            setLogs(prev => [
                { type: "SYSTEM", message: `--- FINAL: ${winnerName} win ${seriesScore} (${mapScores}) ---` },
                { type: "SYSTEM", message: `Skipped to the end: ${done.roundsPlayed} remaining round${done.roundsPlayed === 1 ? "" : "s"} simulated` },
                ...prev,
            ])
            setIsPlaying(false)
            setIsWaitingForStrategy(false)
            setRoundTime(ROUND_SECONDS)
            setIsBombPlanted(false)
            setBombTime(BOMB_SECONDS)
            setRoundBeat(null)
            setIntermission(null)
            setShownLossLevels({ home: sim.homeLossLevel, away: sim.awayLossLevel })

            const playerIsHome = homeTeam.id === playerTeam?.id
            const playerIsAway = awayTeam.id === playerTeam?.id
            if (playerIsHome || playerIsAway) playMatchOutcomeCue(runtime.match.id, playerIsHome === homeWon)
        } finally {
            silentPlaybackRef.current = false
            isSimulatingRef.current = false
        }
    }, [processNextEvent, customTactics, playerTeam, setRoundScript, setRoundView, liveClock, id])

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
    }, [isWaitingForStrategy, setIsAutoTactics])

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
        matchCommittedRef.current = true
        pendingCheckpoint.current = null
        clearActiveMatchState()
        // Save the career now: until then a reload would load the save from
        // before this match and play it again.
        void persistCommittedMatch(runtime.ownerSaveId, runtime.match.id, useGameStore.getState().saveGame)
        router.push(`/match/${id}/result`)
    }, [id, saveMatchResult, clearActiveMatchState, router])

    // The finished series as the result screen will record it (same pure
    // finaliser handleFinish commits): the end-of-match beat's score and MVP.
    const finishedResult = useMemo(() => {
        const runtime = matchData.current
        const sim = latestSimStateRef.current
        if (gameState.status !== "FINISHED" || !runtime || !sim) return null
        try {
            return finalizeLegacySeries(runtime.ctx, { sim, maps: runtime.result.maps, finished: true })
        } catch {
            return null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the series is final once status is FINISHED
    }, [gameState.status, simState])

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
        roundScript,
        originalHomePlayers,
        originalAwayPlayers,
        setSpeed,
        setIsPlaying,
        setIsAutoTactics,
        togglePlayback,
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
        pacingMode,
        setPacingMode,
        /** Continuous round clock for the radar (stable object). */
        liveClock,
        roundView,
        roundBeat,
        intermission,
        decisionHold,
        setDecisionHold,
        shownLossLevels,
        finishedResult,
        introActive,
        endIntro,
    }
}
