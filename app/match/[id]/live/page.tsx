"use client"

import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { LoadingState } from "@/components/ui/loading"
import { useLiveMatch } from "@/hooks/useLiveMatch"
import { LiveMatchScoreboard, type ScorebugRound } from "@/components/match/LiveMatchScoreboard"
import { LiveMatchControlBar } from "@/components/match/LiveMatchControlBar"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { DerbyBanner } from "@/components/match/DerbyBanner"
import { TacticalLoadoutEditor } from "@/components/match/TacticalLoadoutEditor"
import { LiveRosterCard, type RosterCardRowProps } from "@/components/match/live/LiveRosterCard"
import { LiveFeedPanel } from "@/components/match/live/LiveFeed"
import { RoundsPanel } from "@/components/match/live/RoundsPanel"
import { DecisionCard } from "@/components/match/live/DecisionCard"
import { RoundEndBanner } from "@/components/match/live/RoundEndBanner"
import { MomentCallout, type MomentCalloutData } from "@/components/match/live/MomentCallout"
import { IntermissionCard, type HalfStat } from "@/components/match/live/IntermissionCard"
import { CoachCallBanner, CoachCallBar } from "@/components/match/live/CoachCallBar"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CustomTactics, LivePlayerState, MapId, Team } from "@/types"
import { liveRoundMap } from "@/lib/live-round-script"
import { roundBombTimes } from "@/lib/live-clock"
import { MAP_NAMES } from "@/data/map-pool"
import { AUTO_CONFIRM_MS, FAST_FORWARD_LEAD, inMoment } from "@/lib/live-match-pacing"
import { adrOf, samplePlayer, tallyMatchDamage } from "@/lib/live-match-roster"
import { previewDecision } from "@/lib/live-match-decision"
import type { ManagerStrategy } from "@/engine/match/legacy-series"
import { MatchIntro } from "@/components/match/MatchIntro"
import { MatchEndBeat } from "@/components/match/MatchEndBeat"
import { competitionOf } from "@/lib/match-framing"
import { headToHeadOf, introContextLine } from "@/lib/match-intro"

declare global {
    interface Window { __liveCommits?: number }
}

export default function LiveMatchPage() {
    const params = useParams<{ id: string }>()
    const [endBeatDone, setEndBeatDone] = useState(false)
    const {
        gameState,
        simState,
        homeRoster,
        awayRoster,
        logs,
        matchData,
        isAutoTactics,
        setIsAutoTactics,
        isPlaying,
        togglePlayback,
        setIsPlaying,
        speed,
        setSpeed,
        isWaitingForStrategy,
        startNextRound,
        simulateRoundInstant,
        simulateMatchInstant,
        handleFinish,
        customTactics,
        updateCustomTactic,
        originalHomePlayers,
        originalAwayPlayers,
        currentRoundEvents,
        roundScript,
        roundTime,
        isBombPlanted,
        bombTime,
        timeoutsRemaining,
        timeoutActive,
        callTimeout,
        roundHomeIsCT,
        isPlayerHome,
        ownEconomy,
        ownIsCT,
        pacingMode,
        setPacingMode,
        keyRoundsOnly,
        setKeyRoundsOnly,
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
        callCoach,
        coachCalls,
    } = useLiveMatch(params.id, { introKey: `intro:${params.id}` })
    const router = useRouter()
    // Dev builds count the page's commits on window.__liveCommits (perf tooling).
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") window.__liveCommits = (window.__liveCommits ?? 0) + 1
    })
    // A loaded career without this fixture (stale link, already resolved):
    // the hook never initialises, so explain instead of spinning forever.
    const matchMissing = useGameStore(state => state.teams.length > 0 && !state.scheduledMatches.some(m => m.id === params.id))

    // Local UI State for Loadout Editor (UI Concern)
    const [isEditingLoadout, setIsEditingLoadout] = useState(false)
    const [editingSide, setEditingSide] = useState<"ct" | "t">("ct")
    const [editingStrategy, setEditingStrategy] = useState<keyof CustomTactics>("FULL")

    // Space = pause / resume mid-round, hold / release the auto call between
    // rounds. Text fields and open dialogs keep their own Space handling.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== " " || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
            const target = e.target as HTMLElement | null
            const tag = target?.tagName
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return
            if (target?.closest('[role="switch"], [role="slider"], [role="combobox"], [role="textbox"]')) return
            if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
            e.preventDefault()
            // A focused button would also be clicked by Space on keyup.
            if (target && target !== document.body) target.blur()
            togglePlayback()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [togglePlayback])

    // Radar (hooks before the early return). The round on screen is described
    // by its round script, built once per round by useLiveMatch; the radar
    // samples it on every animation frame at the hook's continuous clock, so
    // the page only hands over the script and the clock (and re-renders only
    // when the feed, roster or scorebug change).
    const currentMapId = matchData.current?.result.maps[gameState.currentMapIndex]?.map || MapId.SANDSTONE
    const roundMap = useMemo(() => liveRoundMap(currentMapId) ?? null, [currentMapId])
    const radarScript = roundScript && roundScript.mapId === currentMapId && gameState.time >= 0 ? roundScript.script : null

    // Names, cash, and the round's weapon / kit (from the post-buy loadout;
    // the roster after a restore) by player id. Rebuilt only when one of those
    // changes, not on every roster update, so the memoized radar panel is not
    // re-rendered by unrelated roster changes.
    const gearOf = (p: LivePlayerState) => roundView?.gear[p.id] ?? { weapon: p.weapon, hasKit: p.hasKit }
    const radarPlayersKey = [...homeRoster, ...awayRoster].map(p => { const g = gearOf(p); return `${p.id}:${p.name}:${p.money}:${g.weapon}:${g.hasKit ? 1 : 0}` }).join("|")
    const radarPlayers = useMemo(
        () => Object.fromEntries([...homeRoster, ...awayRoster].map(p => { const g = gearOf(p); return [p.id, { name: p.name, money: p.money, weapon: g.weapon, hasKit: !!g.hasKit }] })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [radarPlayersKey]
    )
    // Recorded rounds of the map on screen: HP / weapons for the live round and
    // the radar's own review scrubber for earlier rounds (it never shows the
    // round in flight beyond the playback clock).
    const reviewRounds = matchData.current?.result.maps[gameState.currentMapIndex]?.rounds
    const reviewCtx = matchData.current?.ctx
    const radarReview = useMemo(
        () => (reviewCtx && reviewRounds ? { ctx: reviewCtx, mapIndex: gameState.currentMapIndex, rounds: reviewRounds } : null),
        [reviewCtx, reviewRounds, gameState.currentMapIndex]
    )
    // The round shown on the radar has been decided (its ROUND_END was played
    // back): no live clutch banner over the end-of-round positions.
    const roundEndEvent = currentRoundEvents.current.find(e => e.type === "ROUND_END")
    const roundOver = gameState.status === "FINISHED" || isWaitingForStrategy
        || (roundEndEvent != null && gameState.time >= roundEndEvent.time)
    // The round in flight: the scorebug timer reads the live clock itself.
    const roundLive = !roundOver && gameState.time >= 0
    const { plantAt, bombEndAt } = roundBombTimes(currentRoundEvents.current)
    const scorebugClock = useMemo(
        () => (roundLive ? { source: liveClock, plantAt, bombEndAt } : null),
        [roundLive, liveClock, plantAt, bombEndAt]
    )

    const originalHomeMap = useMemo(() => new Map((originalHomePlayers || []).map(p => [p.id, p])), [originalHomePlayers])
    const originalAwayMap = useMemo(() => new Map((originalAwayPlayers || []).map(p => [p.id, p])), [originalAwayPlayers])
    const names = useMemo(
        () => Object.fromEntries([...(originalHomePlayers || []), ...(originalAwayPlayers || [])].map(p => [p.id, p.nickname || p.name])) as Record<string, string>,
        [originalHomePlayers, originalAwayPlayers]
    )

    // Revealed rounds of the map on screen (the in-flight round is recorded
    // before playback reaches its end, so only the first `revealed`).
    const resultMaps = matchData.current?.result.maps
    const shownMap = resultMaps?.[gameState.currentMapIndex]
    const revealed = gameState.homeScore + gameState.awayScore
    const homeTeamId = matchData.current?.homeTeam.id
    const shownRoundCount = shownMap?.rounds.length ?? 0
    const roundHistory: ScorebugRound[] = useMemo(() => {
        let home = 0, away = 0
        return (shownMap?.rounds ?? []).slice(0, revealed).map(r => {
            const winnerId = r.winningTeamId ?? (r.winner === "ct" ? r.ctTeam : r.tTeam)
            const winner = winnerId === homeTeamId ? "home" as const : "away" as const
            if (winner === "home") home++
            else away++
            return { round: r.roundNumber, winner, side: r.winner, winType: r.winType, homeBuy: r.buys?.home, awayBuy: r.buys?.away, homeScore: home, awayScore: away }
        })
        // The map's rounds array is appended to in place; its length is the change signal.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shownMap, shownRoundCount, revealed, homeTeamId])

    // Damage over the revealed rounds of the match → ADR per player.
    const damageTally = useMemo(
        () => tallyMatchDamage(resultMaps ?? [], gameState.currentMapIndex, revealed),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [resultMaps, gameState.currentMapIndex, revealed, gameState.status]
    )

    // Between rounds: the managed team's buy decision, previewed with the
    // engine's own buy phase (exact per-player costs).
    const choosingStrategy = isWaitingForStrategy && !roundBeat && gameState.status === "IN_PROGRESS"
    const preview = useMemo(
        () => (choosingStrategy && matchData.current && simState ? previewDecision(matchData.current.ctx, simState, customTactics) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [choosingStrategy, simState, customTactics]
    )

    const openLoadoutEditor = useCallback((strategy: ManagerStrategy) => {
        setEditingStrategy(strategy as keyof CustomTactics)
        setEditingSide(ownIsCT ? "ct" : "t")
        setIsEditingLoadout(true)
        setDecisionHold(true)
    }, [ownIsCT, setDecisionHold])
    const toggleHold = useCallback(() => setDecisionHold(h => !h), [setDecisionHold])
    const pickStrategy = useCallback((strategy: ManagerStrategy) => startNextRound(strategy), [startNextRound])

    // The buy decision sits in the radar's overlay slot, above its scrubber
    // (null while a round plays: the slot then is not in the DOM at all).
    // Built here (memoized) so the radar panel's memo holds between renders.
    const overtimeNote = intermission && (intermission.kind === "overtime" || intermission.kind === "overtime-switch")
        ? intermission.kind === "overtime" ? "Overtime · MR3 · $12,500 each" : "Overtime · sides switched"
        : simState?.isOvertime ? "Overtime" : undefined
    const timeoutDisabled = timeoutsRemaining <= 0 || timeoutActive || !isWaitingForStrategy || gameState.status !== "IN_PROGRESS"
    const decisionKey = `${gameState.currentMapIndex}-${preview?.round ?? 0}`
    const decisionOverlay = useMemo(() => (preview
        ? (
            <DecisionCard
                key={`decision-${decisionKey}`}
                preview={preview}
                names={names}
                onPick={pickStrategy}
                onEditLoadout={openLoadoutEditor}
                auto={{ on: isAutoTactics, hold: decisionHold, durationMs: AUTO_CONFIRM_MS, onToggleHold: toggleHold, key: `${decisionKey}-${decisionHold}` }}
                timeout={{ remaining: timeoutsRemaining, active: timeoutActive, disabled: timeoutDisabled, onCall: callTimeout }}
                overtimeNote={overtimeNote}
            />
        )
        : null
    ), [preview, decisionKey, names, pickStrategy, openLoadoutEditor, isAutoTactics, decisionHold, toggleHold, timeoutsRemaining, timeoutActive, timeoutDisabled, callTimeout, overtimeNote])
    const leaveToHub = useCallback(() => router.push(`/match/${params.id}/tactics`), [router, params.id])

    // Match intro (Phase 5.4a): once per match, before the first round of a
    // fresh start (useLiveMatch decides; a resumed match never shows it). Its
    // facts: competition, head-to-head from the recorded meetings, and one
    // true line of context.
    const introReady = introActive && !!matchData.current && !!simState && originalHomePlayers.length > 0
    const introData = useMemo(() => {
        if (!introReady || !matchData.current) return null
        const { homeTeam, awayTeam, match, canonicalMaps } = matchData.current
        const st = useGameStore.getState()
        const competition = competitionOf(match, st.tournaments)
        const h2h = headToHeadOf(st.completedMatches, homeTeam.id, awayTeam.id)
        const context = introContextLine({ home: homeTeam, away: awayTeam, playerTeamId: st.playerTeamId, stage: match.stage, competitionName: competition.name, h2h })
        return { competition, h2h, context, maps: canonicalMaps as string[] }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- built once when the match is ready
    }, [introReady])
    const endBeat = useCallback(() => setEndBeatDone(true), [])
    const pauseForLeave = useCallback(() => setIsPlaying(false), [setIsPlaying])

    if (!matchData.current || !simState) {
        if (matchMissing) {
            return (
                <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
                    <p className="font-display text-3xl font-bold uppercase text-ink-1">Match not found</p>
                    <p className="mb-6 mt-2 max-w-sm text-sm text-ink-3">This match is no longer on your schedule. It may already have been played or resolved when the week advanced.</p>
                    <Button onClick={() => router.push("/schedule")}>Back to schedule</Button>
                </div>
            )
        }
        return <LoadingState message="Warming up servers…" size="lg" fullScreen />
    }

    const { homeTeam, awayTeam } = matchData.current
    const mapName = MAP_NAMES[currentMapId] || currentMapId || "Unknown Map"

    // Side colours follow the round being shown.
    const homeIsCT = roundHomeIsCT
    // Loadout editor always describes the managed team.
    const ownRoster = isPlayerHome ? homeRoster : awayRoster
    // R2: the managed team's side in the round on screen, and its call bar.
    const ownCT = isPlayerHome ? homeIsCT : !homeIsCT
    const coachBar = roundLive && gameState.status === "IN_PROGRESS" && !decisionOverlay
        ? <CoachCallBar ct={ownCT} calls={coachCalls} clock={liveClock} planted={isBombPlanted} roundEnd={liveClock.end} onCall={callCoach} />
        : null
    const ownOriginal = isPlayerHome ? originalHomeMap : originalAwayMap
    const ownBudget = Math.floor(Object.values(ownEconomy).reduce((s, p) => s + (p?.cash || 0), 0))

    // Live state of the round on screen: HP, deaths (with the killer) and
    // grenades from the round timeline at the playback clock.
    const inFlight = roundLive
    const timeline = inFlight && roundView && roundView.key === `${gameState.currentMapIndex}:${gameState.round}` ? roundView.timeline : null
    const rows = (roster: LivePlayerState[], originals: Map<string, { portraitPath?: string }>, isCT: boolean, economy: Record<string, { utility?: string[] }> | undefined): RosterCardRowProps[] =>
        roster.slice(0, 5).map(p => {
            const s = timeline ? samplePlayer(timeline, p.id, gameState.time) : null
            const dead = p.isDead || !!s?.dead
            // Between rounds: what survivors carry into the next round.
            const nades = s ? s.nades : roundOver ? (economy?.[p.id]?.utility ?? []) : []
            return {
                id: p.id,
                name: p.name,
                portraitPath: originals.get(p.id)?.portraitPath,
                money: p.money,
                weapon: p.weapon || (isCT ? "usp" : "glock"),
                hp: dead ? 0 : s ? s.hp : 100,
                dead,
                killerName: dead && s?.killerId ? names[s.killerId] : undefined,
                killerWeapon: dead ? s?.killerWeapon : undefined,
                hasArmor: !dead && p.hasArmor,
                hasHelmet: !dead && p.hasHelmet,
                hasKit: !dead && isCT && p.hasKit,
                nades: dead ? "" : nades.join(","),
                kills: p.kills || 0,
                assists: p.assists || 0,
                deaths: p.deaths || 0,
                adr: adrOf(damageTally, p.id),
                hpEstimated: !!timeline?.estimatedHp,
            }
        })
    const homeRows = rows(homeRoster, originalHomeMap, homeIsCT, simState.homeEconomy)
    const awayRows = rows(awayRoster, originalAwayMap, !homeIsCT, simState.awayEconomy)
    const teamCash = (list: RosterCardRowProps[]) => list.reduce((s, p) => s + (p.money || 0), 0)
    const aliveCount = (list: RosterCardRowProps[]) => list.filter(p => !p.dead).length

    // Multi-kill callout (3rd / 4th / 5th kill of a player this round).
    const multi = timeline ? [...timeline.multiKills].reverse().find(k => k.t <= gameState.time) : undefined
    const homeIds = new Set(homeRoster.map(p => p.id))
    const callout: MomentCalloutData | null = multi && roundView
        ? { id: `${roundView.key}:${multi.playerId}:${multi.count}`, playerName: names[multi.playerId] ?? "Player", count: multi.count, side: homeIds.has(multi.playerId) === homeIsCT ? "CT" : "T" }
        : null

    const fastForward = pacingMode === "moments" && !!roundView && inFlight && !inMoment(roundView.pacing, gameState.time + FAST_FORWARD_LEAD)
    // Dock play button: mid-round it is playback; between rounds the auto call.
    const dockPlaying = isWaitingForStrategy ? (isAutoTactics && !decisionHold) : isPlaying

    const breakCard = !roundBeat && intermission && (intermission.kind === "halftime" || intermission.kind === "map-end") ? intermission : null
    const breakStats: HalfStat[] = breakCard ? (() => {
        const count = (side: "home" | "away", types: string[]) => roundHistory.filter(r => r.winner === side && types.includes(r.winType ?? "")).length
        const pistol = roundHistory.find(r => r.round === (breakCard.kind === "halftime" ? 1 : 13))
        return [
            ...(pistol ? [{ label: "Pistol round", home: pistol.winner === "home" ? 1 : 0, away: pistol.winner === "away" ? 1 : 0 }] : []),
            { label: "Eliminations", home: count("home", ["ELIMINATION"]), away: count("away", ["ELIMINATION"]) },
            { label: "Bomb / defuse", home: count("home", ["BOMB_EXPLODED", "BOMB_DEFUSE"]), away: count("away", ["BOMB_EXPLODED", "BOMB_DEFUSE"]) },
            { label: "On time", home: count("home", ["TIME"]), away: count("away", ["TIME"]) },
        ]
    })() : []
    const ownKey = isPlayerHome ? "home" : "away"
    const roundsPanel = <RoundsPanel rounds={roundHistory} mapName={mapName} ownKey={ownKey} homeName={homeTeam.name} awayName={awayTeam.name} />
    const feedPanel = <LiveFeedPanel logs={logs} />

    return (
        <ErrorBoundary section="Live Match">
        <div className="relative flex h-full min-h-0 select-none flex-col gap-2.5 bg-ink font-sans text-ink-1"
            role="main"
            aria-label={`Live match: ${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`}
        >
            {/* Pre-match derby framing — only renders for HEATED/FIERCE rivalries. */}
            <DerbyBanner homeTeam={homeTeam} awayTeam={awayTeam} />

            {/* TeamSaveData (engine save shape) → Team (engine runtime
                shape). Structural overlap is total for the fields the
                scoreboard reads — cast documented in ARCHITECTURE.md
                "Known Type-System Debt". */}
            <LiveMatchScoreboard
                gameState={gameState}
                homeTeam={homeTeam as unknown as Team}
                awayTeam={awayTeam as unknown as Team}
                matchFormat={matchData.current.match.format}
                currentMapId={currentMapId}
                mapName={mapName}
                homeSeriesScore={gameState.homeSeriesScore}
                awaySeriesScore={gameState.awaySeriesScore}
                homeScore={gameState.homeScore}
                awayScore={gameState.awayScore}
                roundTime={roundTime}
                isBombPlanted={isBombPlanted}
                bombTime={bombTime}
                homeIsCT={homeIsCT}
                roundHistory={roundHistory}
                homeLossLevel={shownLossLevels.home}
                awayLossLevel={shownLossLevels.away}
                clock={scorebugClock}
                ownTeam={isPlayerHome ? "home" : "away"}
            />

            <LiveMatchControlBar
                gameState={gameState}
                isAutoTactics={isAutoTactics}
                setIsAutoTactics={setIsAutoTactics}
                isPlaying={dockPlaying}
                onTogglePlayback={togglePlayback}
                isWaitingForStrategy={isWaitingForStrategy}
                betweenRounds={roundOver}
                speed={speed}
                setSpeed={setSpeed}
                pacingMode={pacingMode}
                setPacingMode={setPacingMode}
                keyRoundsOnly={keyRoundsOnly}
                setKeyRoundsOnly={setKeyRoundsOnly}
                fastForward={fastForward}
                onSimulateRound={simulateRoundInstant}
                onSimulateMatch={simulateMatchInstant}
                onLeave={gameState.status !== "FINISHED" ? leaveToHub : undefined}
                onBeforeLeave={pauseForLeave}
            />

            {/* Rosters left/right, radar is the hero. */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(420px,min(1400px,calc(100dvh-196px),calc(100vw-720px)))_minmax(0,1fr)]">
                <div className="flex min-h-0 min-w-0 flex-col gap-3">
                    <LiveRosterCard teamName={homeTeam.name} isCT={homeIsCT} isOwn={isPlayerHome} alive={aliveCount(homeRows)} teamCash={teamCash(homeRows)} players={homeRows} />
                    {isPlayerHome ? roundsPanel : feedPanel}
                </div>

                <div className="live-radar-stage relative min-h-[360px] min-w-0">
                    <MapRadarPanel
                        currentMapId={currentMapId}
                        mapName={mapName}
                        script={radarScript}
                        roundMap={roundMap}
                        players={radarPlayers}
                        review={radarReview}
                        clock={liveClock}
                        isAnimating={isPlaying}
                        currentTime={gameState.time}
                        roundOver={roundOver}
                        overlay={gameState.status === "FINISHED" && (endBeatDone || !finishedResult)
                            ? (
                                // In the radar's overlay slot, above the scrubber (not floating over it).
                                <div className="flex justify-center pb-2">
                                    <Button onClick={handleFinish} className="h-12 w-full max-w-sm text-base shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                                        Continue to results <ChevronRight size={18} aria-hidden="true" />
                                    </Button>
                                </div>
                            )
                            : decisionOverlay ?? coachBar}
                        fillHeight
                    />
                    <MomentCallout callout={callout} />
                    <CoachCallBanner call={coachCalls[coachCalls.length - 1] ?? null} ct={ownCT} />
                    <AnimatePresence>
                        {roundBeat && <RoundEndBanner key={roundBeat.id} beat={roundBeat} homeName={homeTeam.name} awayName={awayTeam.name} names={names} />}
                    </AnimatePresence>
                    <AnimatePresence>
                        {breakCard && (
                            <IntermissionCard
                                key={`${breakCard.kind}-${breakCard.mapIndex}`}
                                intermission={breakCard}
                                homeName={homeTeam.name}
                                awayName={awayTeam.name}
                                homeIsCT={homeIsCT}
                                mapName={MAP_NAMES[matchData.current.canonicalMaps[breakCard.mapIndex]] ?? mapName}
                                nextMapName={breakCard.nextMapId ? MAP_NAMES[breakCard.nextMapId as MapId] ?? breakCard.nextMapId : undefined}
                                stats={breakStats}
                                onContinue={() => startNextRound("PISTOL")}
                            />
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex min-h-0 min-w-0 flex-col gap-3">
                    <LiveRosterCard teamName={awayTeam.name} isCT={!homeIsCT} isOwn={!isPlayerHome} alive={aliveCount(awayRows)} teamCash={teamCash(awayRows)} players={awayRows} />
                    {isPlayerHome ? feedPanel : roundsPanel}
                </div>
            </div>

            {/* MODALS */}
            <AnimatePresence>
                {isEditingLoadout && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-modal flex items-center justify-center bg-ink/85 p-4"
                    >
                        <TacticalLoadoutEditor
                            side={editingSide}
                            strategyId={editingStrategy}
                            config={customTactics[editingStrategy][editingSide]}
                            teamBudget={ownBudget}
                            playerCash={ownRoster.map(p => ownEconomy[p.id]?.cash ?? p.money ?? 0)}
                            playerIds={ownRoster.map(p => p.id)}
                            playerNames={ownRoster.map(p => p.name)}
                            playerImages={ownRoster.map(p => ownOriginal.get(p.id)?.portraitPath || "")}
                            onSave={(newConfig) => {
                                updateCustomTactic(editingStrategy, editingSide, newConfig)
                                setIsEditingLoadout(false)
                            }}
                            onClose={() => setIsEditingLoadout(false)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {introReady && introData && (
                    <MatchIntro
                        key="intro"
                        matchId={params.id}
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        format={matchData.current.match.format}
                        competition={introData.competition}
                        maps={introData.maps}
                        homePlayers={originalHomePlayers}
                        awayPlayers={originalAwayPlayers}
                        h2h={introData.h2h}
                        context={introData.context}
                        onDone={endIntro}
                    />
                )}
                {gameState.status === "FINISHED" && finishedResult && !endBeatDone && (
                    <MatchEndBeat
                        key="end-beat"
                        result={finishedResult}
                        format={matchData.current.match.format}
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        playerTeamId={isPlayerHome ? homeTeam.id : awayTeam.id}
                        players={[...originalHomePlayers, ...originalAwayPlayers]}
                        onDone={endBeat}
                    />
                )}
            </AnimatePresence>

        </div>
        </ErrorBoundary>
    )
}
