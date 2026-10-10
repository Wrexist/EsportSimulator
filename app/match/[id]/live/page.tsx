"use client"

import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"

import { useEffect, useMemo, memo, useRef, useState, type ReactNode } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { LoadingState } from "@/components/ui/loading"
import { useLiveMatch } from "@/hooks/useLiveMatch"
import { LiveMatchScoreboard, type ScorebugRound } from "@/components/match/LiveMatchScoreboard"
import { LiveMatchControlBar } from "@/components/match/LiveMatchControlBar"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { DerbyBanner } from "@/components/match/DerbyBanner"
import { HalfTimeOverlay } from "@/components/match/HalfTimeOverlay"
import { TacticalLoadoutEditor } from "@/components/match/TacticalLoadoutEditor"
import { WeaponGlyph, HeadshotMark, weaponDisplayName } from "@/components/match/WeaponGlyph"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { ArrowLeft, Skull, Swords, Zap as ZapIcon, EyeOff, Settings2, Coins, Shield, Sparkles, Bomb, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CustomTactics, LivePlayerState, MapId, MatchEvent, Team } from "@/types"
import { computeRadarPositions, type RadarPlayerDot } from "@/lib/radar-position-engine"
import { MAP_NAMES } from "@/data/map-pool"

import { formatCurrency } from "@/lib/utils-extended"
import { REGROUP_EDGE, REGROUP_MIN_LOSS_STREAK } from "@/engine/match/manager-controls"

// Stable React keys for feed rows. Entries are prepended (newest first) and
// the tail is trimmed, so array indices shift on every new line and made React
// rebuild the whole list; each entry object keeps its identity across updates.
const logRowKeys = new WeakMap<object, number>()
let nextLogRowKey = 0
function logRowKey(entry: object): number {
    let key = logRowKeys.get(entry)
    if (key === undefined) {
        key = ++nextLogRowKey
        logRowKeys.set(entry, key)
    }
    return key
}

const sideText = (side: "CT" | "T" | undefined) => side === "CT" ? "text-side-ct" : "text-side-t"
const otherSide = (side: "CT" | "T" | undefined): "CT" | "T" => side === "CT" ? "T" : "CT"
const clock = (t: number | undefined) => t != null ? `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}` : ""

// Memoized log list. Without memo this re-evaluates every per-tick parent
// render (~30-60Hz from useLiveMatch), iterating the full logs array and
// recreating ~100+ log-row elements each frame even when nothing changed.
// React.memo + a stable `logs` reference from useLiveMatch means this
// re-runs only when a new log entry is appended.
const LiveLogList = memo(function LiveLogList({ logs }: { logs: any[] }) {
    return (
        <ol className="space-y-px pb-3">
            {logs.map(l => {
                const rowKey = logRowKey(l)
                const timeStr = clock(l.time)
                const time = <span className="w-8 shrink-0 text-[11px] tabular-nums text-ink-3">{timeStr}</span>

                if (l.type === "KILL") {
                    return (
                        <li key={rowKey} className="flex h-7 items-center gap-2 rounded-[3px] bg-raised px-2 text-[13px]">
                            {time}
                            <span className={cn("min-w-0 truncate font-semibold", sideText(l.killerSide))}>{l.killerName}</span>
                            {l.assisterName && <span className="shrink-0 truncate text-xs text-ink-3">+ {l.assisterName}</span>}
                            <span className="flex shrink-0 items-center gap-1 text-ink-2">
                                <WeaponGlyph weapon={l.weapon} className="h-3 w-8" />
                                {l.isHeadshot && <HeadshotMark className="text-ink-1" />}
                            </span>
                            <span className={cn("min-w-0 truncate font-semibold", sideText(otherSide(l.killerSide)))}>{l.victimName}</span>
                            {l.isTrade && <span className="ml-auto shrink-0 rounded-sm border border-line-strong px-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-ink-2">Trade</span>}
                        </li>
                    )
                }

                const plain = (icon: ReactNode, text: string, tone = "text-ink-2") => (
                    <li key={rowKey} className="flex min-h-7 items-center gap-2 rounded-[3px] px-2 py-1 text-xs">
                        {time}
                        {icon}
                        <span className={cn("min-w-0", tone)}>{text}</span>
                    </li>
                )

                if (l.type === "PLANT") return plain(<Bomb className="h-3.5 w-3.5 shrink-0 text-side-t" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "DEFUSE") return plain(<Shield className="h-3.5 w-3.5 shrink-0 text-side-ct" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "EXPLODE") return plain(<ZapIcon className="h-3.5 w-3.5 shrink-0 text-side-t" aria-hidden="true" />, l.message, "text-ink-1")
                if (l.type === "CLUTCH") return plain(<Sparkles className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />, l.message, "font-semibold text-ink-1")
                if (l.type === "SAVE") return plain(<EyeOff className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />, l.message, "text-ink-3")
                if (l.type === "BUY") return plain(<Coins className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />, l.message, "text-ink-3")

                if (l.type === "ROUND_END") {
                    return (
                        <li key={rowKey} className="my-1.5 flex items-center gap-2 border-y border-line bg-shell px-2 py-1.5 text-xs font-semibold text-ink-1">
                            {l.message}
                        </li>
                    )
                }

                return (
                    <li key={rowKey} className="flex min-h-7 items-center gap-2 px-2 py-1 text-xs text-ink-3">
                        {timeStr && time}
                        <span>{l.message}</span>
                    </li>
                )
            })}
        </ol>
    )
})

// Strategy panel constants. Costs are what each player needs on average
// (the button unlocks when average cash covers it), hoisted to module scope.
const STRATEGY_OPTIONS = [
    { id: "ECO", fallback: "Save", cost: 0 },
    { id: "FORCE", fallback: "Force buy", cost: 1800 },
    { id: "SEMIBUY", fallback: "Half buy", cost: 3600 },
    { id: "FULL", fallback: "Full buy", cost: 4700 },
    { id: "DOUBLE AWP", fallback: "2xAWP", cost: 6500 },
] as const

const BUY_LABEL: Record<string, string> = { PISTOL: "Pistol", ECO: "Save", FORCE: "Force", SEMIBUY: "Half", FULL: "Full", "DOUBLE AWP": "2×AWP" }
const END_LABEL: Record<string, string> = { ELIMINATION: "Elimination", BOMB_EXPLODED: "Bomb", BOMB_DEFUSE: "Defused", TIME: "Time" }

// Roster row, memoized on the fields it actually reads. Without React.memo
// each tick re-renders all 10 rows even when only the timer changed; the
// PlayerPortrait + image lookups inside add up. Memoizing on the shallow
// subset of LivePlayerState the row actually displays keeps idle ticks at
// O(0) row renders.
interface RosterRowProps {
    id: string
    name: string
    money: number
    weapon: string | undefined
    isDead: boolean
    kills: number
    deaths: number
    assists: number
    portraitPath: string | undefined
    defaultWeaponLabel: "USP" | "GLOCK"
    extraClassName?: string
}

const RosterRow = memo(function RosterRow({
    id, name, money, weapon, isDead, kills, deaths, assists, portraitPath, defaultWeaponLabel, extraClassName,
}: RosterRowProps) {
    const shownWeapon = weapon || defaultWeaponLabel
    return (
        <li className={cn(
            "grid h-[52px] grid-cols-[36px_minmax(0,1fr)_64px_repeat(3,22px)] items-center gap-x-2 border-b border-line px-3 last:border-b-0",
            isDead && "bg-ink/40",
            extraClassName,
        )}>
            <div className={cn("h-9 w-9 overflow-hidden rounded bg-raised", isDead && "opacity-40 grayscale")}>
                <PlayerPortrait src={portraitPath} seed={id} alt={name} size={36} variant="card" />
            </div>
            <div className="min-w-0">
                <p className={cn("truncate text-sm font-semibold", isDead ? "text-ink-3" : "text-ink-1")}>{name}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
                    {isDead
                        ? <><Skull className="h-3 w-3 shrink-0" aria-hidden="true" /> Dead</>
                        : <><WeaponGlyph weapon={shownWeapon} className="h-2.5 w-7 text-ink-2" /> <span className="truncate">{weaponDisplayName(shownWeapon)}</span></>}
                </p>
            </div>
            <span className={cn("text-right text-[13px] tabular-nums", isDead ? "text-ink-3" : "text-ink-1")}>{formatCurrency(money, "$", false)}</span>
            <span className="text-right text-[13px] font-semibold tabular-nums text-ink-1">{kills}</span>
            <span className="text-right text-[13px] tabular-nums text-ink-2">{assists}</span>
            <span className="text-right text-[13px] tabular-nums text-ink-2">{deaths}</span>
        </li>
    )
})

function RosterPanel({ team, isCT, children, alive, money }: { team: { name: string }; isCT: boolean; children: ReactNode; alive: number; money: number }) {
    return (
        <section className={cn("shrink-0 overflow-hidden rounded-lg border border-line bg-panel", isCT ? "shadow-[inset_3px_0_0_var(--ct)]" : "shadow-[inset_3px_0_0_var(--t)]")} aria-label={`${team.name} players`}>
            <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em]", isCT ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t")}>{isCT ? "CT" : "T"}</span>
                <h2 className="min-w-0 truncate font-display text-lg font-bold uppercase leading-none text-ink-1">{team.name}</h2>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-3">{alive} alive · {formatCurrency(money, "$", false)}</span>
            </header>
            <div className="grid grid-cols-[36px_minmax(0,1fr)_64px_repeat(3,22px)] gap-x-2 border-b border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span className="col-span-2">Player</span>
                <span className="text-right">Cash</span>
                <span className="text-right" title="Kills">K</span>
                <span className="text-right" title="Assists">A</span>
                <span className="text-right" title="Deaths">D</span>
            </div>
            <ul>{children}</ul>
        </section>
    )
}

export default function LiveMatchPage() {
    const params = useParams<{ id: string }>()
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
    } = useLiveMatch(params.id)
    const router = useRouter()
    // A loaded career without this fixture (stale link, already resolved):
    // the hook never initialises, so explain instead of spinning forever.
    const matchMissing = useGameStore(state => state.teams.length > 0 && !state.scheduledMatches.some(m => m.id === params.id))

    // Local UI State for Loadout Editor (UI Concern)
    const [isEditingLoadout, setIsEditingLoadout] = useState(false)
    const [editingSide, setEditingSide] = useState<"ct" | "t">("ct")
    const [editingStrategy, setEditingStrategy] = useState<keyof CustomTactics>("FULL")

    // Half-time overlay trigger — fires on the transition into round 13.
    // Rising-edge detection so the overlay shows once per match, not
    // every tick while round === 13.
    const [showHalfTime, setShowHalfTime] = useState(false)
    const prevRoundRef = useRef(gameState.round)
    useEffect(() => {
        if (gameState.round === 13 && prevRoundRef.current !== 13 && prevRoundRef.current > 0) {
            setShowHalfTime(true)
            const t = setTimeout(() => setShowHalfTime(false), 2400)
            prevRoundRef.current = gameState.round
            return () => clearTimeout(t)
        }
        prevRoundRef.current = gameState.round
    }, [gameState.round])

    // Space = pause / resume (advertised on the play button). Text fields and
    // open dialogs keep their own Space handling.
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

    // Compute live radar positions from round events (must be before early return for hooks rules)
    const currentMapId = matchData.current?.result.maps[gameState.currentMapIndex]?.map || MapId.SANDSTONE

    // Roster identity hash — only changes when player IDs / dead-mask / money
    // shift, NOT every render. Without this, radar recompute fired on every
    // useState update of the roster arrays (~60Hz during a live round).
    const rosterFingerprint = useMemo(() => {
        return homeRoster.map(p => `${p.id}:${p.isDead ? 1 : 0}:${p.money}`).join("|")
            + "#" + awayRoster.map(p => `${p.id}:${p.isDead ? 1 : 0}:${p.money}`).join("|")
    }, [homeRoster, awayRoster])

    // Every radar snapshot re-simulates the round from t=0, so the snapshots
    // are cached per round: the look-ahead frame computed on this tick is the
    // current frame on the next one, and each kill-line snapshot is simulated
    // once. Net cost is about one simulation per tick instead of two plus two
    // per recent kill. A new round, map, side or player list starts a new cache.
    const radarCacheRef = useRef<{ key: string; events: MatchEvent[] | null; dots: Map<number, RadarPlayerDot[]> }>({ key: "", events: null, dots: new Map() })
    const radarFrames = useMemo(() => {
        if (!simState || !matchData.current || gameState.time < 0) return null
        const events = currentRoundEvents.current
        const victims = new Set(events.filter(e => e.type === "KILL").map(e => e.victimId))
        // Only "dead without a kill event" changes positions; a kill's victim is
        // already timed from the event, so a death mid-round keeps the cache.
        const toInput = (p: LivePlayerState) => ({ id: p.id, isDead: p.isDead && !victims.has(p.id), nickname: p.name, money: p.money })
        const home = homeRoster.map(toInput), away = awayRoster.map(toInput)
        const seed = matchData.current.match.seed ?? 0
        const key = [currentMapId, gameState.round, seed, roundHomeIsCT, ...home.map(p => `${p.id}${p.isDead ? "!" : ""}`), "|", ...away.map(p => `${p.id}${p.isDead ? "!" : ""}`)].join(",")
        if (radarCacheRef.current.key !== key || radarCacheRef.current.events !== events) {
            radarCacheRef.current = { key, events, dots: new Map() }
        }
        const options = { dotCache: radarCacheRef.current.dots }
        const now = computeRadarPositions(currentMapId as MapId, gameState.time, events, home, away, roundHomeIsCT, gameState.round, seed, options)
        // Positions one game-second ahead: the radar glides toward them over the tick.
        const next = computeRadarPositions(currentMapId as MapId, gameState.time + 1, events, home, away, roundHomeIsCT, gameState.round, seed, options)
        // Cached dots keep the money they were first computed with; refresh the eco ring.
        const money = new Map([...home, ...away].map(p => [p.id, p.money]))
        return { now: { ...now, dots: now.dots.map(dot => ({ ...dot, money: money.get(dot.playerId) ?? dot.money })) }, next }
        // Intentionally depend on rosterFingerprint instead of the array
        // refs so an unchanged roster (most ticks) skips the recompute.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState.time, gameState.round, currentMapId, simState, roundHomeIsCT, matchData, currentRoundEvents, rosterFingerprint])
    const radarData = radarFrames?.now ?? null
    // The round shown on the radar has been decided (its ROUND_END was played
    // back): no live clutch banner over the end-of-round positions.
    const roundEndEvent = currentRoundEvents.current.find(e => e.type === "ROUND_END")
    const roundOver = gameState.status === "FINISHED" || isWaitingForStrategy
        || (roundEndEvent != null && gameState.time >= Math.floor(roundEndEvent.time))
    const nextRadarData = radarFrames?.next ?? null

    // Build O(1) lookup maps for original players (used in roster rendering)
    const originalHomeMap = useMemo(() => new Map((originalHomePlayers || []).map(p => [p.id, p])), [originalHomePlayers])
    const originalAwayMap = useMemo(() => new Map((originalAwayPlayers || []).map(p => [p.id, p])), [originalAwayPlayers])

    // Stabilize sitePositions identity: `{ a, b }` was being re-created inline in
    // the MapRadarPanel JSX on every parent render, which busts MapRadarPanel's
    // React.memo. Keyed on the coordinates (the engine returns fresh point
    // objects every tick) so it only changes when a site actually moves.
    const aX = radarData?.aSite.x, aY = radarData?.aSite.y, bX = radarData?.bSite.x, bY = radarData?.bSite.y
    const sitePositions = useMemo(
        () => (aX != null && aY != null && bX != null && bY != null ? { a: { x: aX, y: aY }, b: { x: bX, y: bY } } : undefined),
        [aX, aY, bX, bY]
    )


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
    // Strategy panel and loadout editor always describe the managed team.
    const ownRoster = isPlayerHome ? homeRoster : awayRoster
    const ownOriginal = isPlayerHome ? originalHomeMap : originalAwayMap
    const ownBudget = Math.floor(Object.values(ownEconomy).reduce((s, p) => s + (p?.cash || 0), 0))
    const ownAvgCash = Math.floor(ownBudget / 5)

    // Round history for the scorebug: only rounds already revealed on this
    // map (the in-flight round is recorded before playback reaches its end).
    const shownMap = matchData.current.result.maps[gameState.currentMapIndex]
    const revealed = gameState.homeScore + gameState.awayScore
    const roundHistory: ScorebugRound[] = (shownMap?.rounds ?? []).slice(0, revealed).map(r => {
        const winnerId = r.winningTeamId ?? (r.winner === "ct" ? r.ctTeam : r.tTeam)
        return { round: r.roundNumber, winner: winnerId === homeTeam.id ? "home" : "away", side: r.winner, winType: r.winType }
    })

    const rosterRows = (roster: LivePlayerState[], originals: Map<string, { portraitPath?: string }>, defaultWeaponLabel: "USP" | "GLOCK") =>
        roster.slice(0, 5).map(p => (
            <RosterRow
                key={p.id}
                id={p.id}
                name={p.name}
                money={p.money}
                weapon={p.weapon}
                isDead={p.isDead}
                kills={p.kills || 0}
                deaths={p.deaths || 0}
                assists={p.assists || 0}
                portraitPath={originals.get(p.id)?.portraitPath}
                defaultWeaponLabel={defaultWeaponLabel}
            />
        ))
    const teamCash = (roster: LivePlayerState[]) => roster.slice(0, 5).reduce((s, p) => s + (p.money || 0), 0)
    const aliveCount = (roster: LivePlayerState[]) => roster.slice(0, 5).filter(p => !p.isDead).length

    const homeRosterPanel = (
        <RosterPanel team={homeTeam} isCT={homeIsCT} alive={aliveCount(homeRoster)} money={teamCash(homeRoster)}>
            {rosterRows(homeRoster, originalHomeMap, homeIsCT ? "USP" : "GLOCK")}
        </RosterPanel>
    )
    const awayRosterPanel = (
        <RosterPanel team={awayTeam} isCT={!homeIsCT} alive={aliveCount(awayRoster)} money={teamCash(awayRoster)}>
            {rosterRows(awayRoster, originalAwayMap, homeIsCT ? "GLOCK" : "USP")}
        </RosterPanel>
    )

    // Between rounds the buy picker floats over the bottom of the radar (the
    // widest column, always on screen; the finished round's positions matter
    // less than the next call). Budget and the tactical timeout stay in a
    // small card under the managed team's own roster.
    const choosingStrategy = isWaitingForStrategy && !isAutoTactics && gameState.status === "IN_PROGRESS"
    const strategyPicker = (
        <AnimatePresence>
            {choosingStrategy && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="tactical-decisions absolute inset-x-3 bottom-12 z-20 rounded-lg border border-line-strong bg-panel p-3"
                >
                    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        {/* The round about to be played; gameState.round is the last one played (0 before the first). */}
                        <h3 className="font-display text-xl font-bold uppercase leading-none text-ink-1">Round {simState.currentRound} · Select strategy</h3>
                        <p className="text-xs text-ink-3">
                            Avg cash <span className="font-semibold tabular-nums text-ink-1">{formatCurrency(ownAvgCash, "$", false)}</span> per player
                            <span className="mx-1.5">·</span>team <span className="tabular-nums text-ink-2">{formatCurrency(ownBudget, "$", false)}</span>
                        </p>
                    </div>
                    {/* Arbitrary grid class: the premium skin folds `.grid-cols-5` to 3 columns on narrow screens. */}
                    <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2">
                        {STRATEGY_OPTIONS.map((strat) => {
                            const cost = strat.cost
                            const canAfford = ownAvgCash >= cost
                            const side = ownIsCT ? "ct" : "t"
                            return (
                                <div key={strat.id} className="relative">
                                    <Button
                                        variant="secondary"
                                        onClick={() => canAfford && startNextRound(strat.id as any)}
                                        disabled={!canAfford}
                                        className="flex h-[60px] w-full flex-col items-start justify-center gap-0.5 rounded-[4px] border border-line bg-raised text-left hover:border-gold hover:bg-hover"
                                    >
                                        <span className="pl-2 text-sm font-semibold text-ink-1">{strat.fallback}</span>
                                        <span className="pl-2 text-xs tabular-nums text-ink-3">
                                            {cost === 0 ? "No spend" : <>{formatCurrency(cost, "$", false)} <span className="text-[11px]">/ player</span></>}
                                        </span>
                                    </Button>
                                    <button
                                        aria-label={`Edit ${strat.fallback} loadout`}
                                        title={`Edit ${strat.fallback} loadout`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingStrategy(strat.id as any);
                                            setEditingSide(side as "ct" | "t");
                                            setIsEditingLoadout(true);
                                        }}
                                        className="absolute right-1.5 top-1.5 rounded p-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
    const timeoutDisabled = timeoutsRemaining <= 0 || timeoutActive || !isWaitingForStrategy || gameState.status !== "IN_PROGRESS"
    const decisionsPanel = (
        <section className={cn("flex shrink-0 flex-col rounded-lg border bg-panel", choosingStrategy ? "border-line-strong" : "border-line")} aria-label="Your calls">
            <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                <h3 className="text-sm font-semibold text-ink-1">Your calls</h3>
                <span className="text-xs text-ink-3">Team cash <span className="font-semibold tabular-nums text-ink-1">{formatCurrency(ownBudget, "$", false)}</span></span>
            </header>
            <div className="space-y-3 p-3">
                <p className="text-xs text-ink-2">
                    {gameState.status === "FINISHED"
                        ? "The match is over."
                        : isAutoTactics
                            ? "Auto tactics is on: buys follow your economy plan."
                            : choosingStrategy
                                ? `Pick the buy for round ${simState.currentRound} on the radar panel.`
                                : "Your next buy call opens when this round ends."}
                </p>

                {/* Tactical Timeout (B5) — the live-only lever that gives
                    playing the match a real edge over quick-sim. */}
                <div className="flex items-center gap-3 border-t border-line pt-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={callTimeout}
                        disabled={timeoutDisabled}
                        title={`Between rounds only: regroup — +${REGROUP_EDGE * 100}% round-win chance for 2 rounds while you have lost ${REGROUP_MIN_LOSS_STREAK}+ in a row. Two per series; no benefit without a losing streak.`}
                        className="h-8 shrink-0 px-3 text-xs"
                    >
                        Tactical timeout ({timeoutsRemaining})
                    </Button>
                    {timeoutActive ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" /> Regrouping: +{REGROUP_EDGE * 100}% while on a {REGROUP_MIN_LOSS_STREAK}+ loss streak
                        </span>
                    ) : (
                        <p className="text-xs leading-snug text-ink-3">+{REGROUP_EDGE * 100}% round-win chance for two rounds, only after {REGROUP_MIN_LOSS_STREAK}+ losses in a row.</p>
                    )}
                </div>
            </div>
        </section>
    )

    const feedPanel = (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Round feed">
            <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                <Swords className="h-3.5 w-3.5" aria-hidden="true" /> Round feed
            </header>
            <div className="relative h-full min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                <LiveLogList logs={logs} />
            </div>
        </section>
    )

    // Revealed rounds of this map, newest first: who won, how, and both buys.
    const ownKey = isPlayerHome ? "home" : "away"
    const roundsPanel = (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="Rounds on this map">
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h3 className="text-sm font-semibold text-ink-1">Rounds</h3>
                <span className="text-xs text-ink-3">{mapName} · {revealed} played</span>
            </header>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_76px_92px] gap-x-2 border-b border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <span>#</span><span>Winner</span><span>Ended by</span><span className="text-right">Buys you / them</span>
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                {roundHistory.length === 0 && <li className="px-3 py-3 text-xs text-ink-3">No rounds finished on this map yet.</li>}
                {[...roundHistory].reverse().map(r => {
                    const raw = shownMap?.rounds.find(x => x.roundNumber === r.round)
                    const ownBuy = raw?.buys?.[ownKey]
                    const theirBuy = raw?.buys?.[ownKey === "home" ? "away" : "home"]
                    const winnerTeam = r.winner === "home" ? homeTeam : awayTeam
                    const ownWin = r.winner === ownKey
                    return (
                        <li key={r.round} className="grid h-8 grid-cols-[28px_minmax(0,1fr)_76px_92px] items-center gap-x-2 border-b border-line px-3 text-xs last:border-b-0">
                            <span className="tabular-nums text-ink-3">{r.round}</span>
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span className={cn("h-2 w-2 shrink-0 rounded-[1px]", r.side === "ct" ? "bg-side-ct" : "bg-side-t")} aria-hidden="true" />
                                <span className={cn("truncate font-semibold", ownWin ? "text-ink-1" : "text-ink-2")}>{winnerTeam.name}</span>
                            </span>
                            <span className="text-ink-3">{END_LABEL[r.winType ?? ""] ?? "—"}</span>
                            <span className="text-right tabular-nums text-ink-2">{ownBuy ? BUY_LABEL[ownBuy] ?? ownBuy : "—"} <span className="text-ink-3">/</span> {theirBuy ? BUY_LABEL[theirBuy] ?? theirBuy : "—"}</span>
                        </li>
                    )
                })}
            </ol>
        </section>
    )

    return (
        <ErrorBoundary section="Live Match">
        <div className="relative flex h-full min-h-0 select-none flex-col bg-ink font-sans text-ink-1"
            role="main"
            aria-label={`Live match: ${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`}
        >
            <HalfTimeOverlay active={showHalfTime} />
            <div className="mx-auto flex h-full min-h-0 w-full flex-1 flex-col">

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
                />

                {/* GAME AREA — full screen: rosters left/right, radar is the hero. */}
                <div className="live-match-grid min-h-0 flex-1">
                    {/* HOME TEAM */}
                    <div className="flex min-h-0 min-w-0 flex-col gap-3">
                        {homeRosterPanel}
                        {isPlayerHome ? <>{decisionsPanel}{roundsPanel}</> : feedPanel}
                    </div>

                    {/* CONSOLE / CENTER */}
                    <div className="match-command-center flex min-h-0 min-w-0 flex-col gap-3">
                        <div className="flex items-stretch gap-2">
                            {gameState.status !== "FINISHED" && (
                                <ConfirmDialog
                                    title="Leave the live match?"
                                    description="The match pauses and is saved exactly where it is. Resume it from the match hub; other fixtures stay locked until it is finished."
                                    confirmText="Go to match hub"
                                    cancelText="Stay"
                                    onConfirm={() => router.push(`/match/${params.id}/tactics`)}
                                >
                                    <Button
                                        variant="outline"
                                        className="h-auto shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold"
                                        title="Pause and go back to the match hub"
                                        aria-label="Leave to the match hub"
                                        // Pause while deciding: the round would otherwise play on (or end) behind the dialog.
                                        onClick={() => setIsPlaying(false)}
                                    >
                                        {/* Text only where the centre column is wide enough. */}
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> <span className="hidden 2xl:inline">Match hub</span>
                                    </Button>
                                </ConfirmDialog>
                            )}
                            <div className="min-w-0 flex-1">
                                <LiveMatchControlBar
                                    gameState={gameState}
                                    isAutoTactics={isAutoTactics}
                                    setIsAutoTactics={setIsAutoTactics}
                                    isPlaying={isPlaying}
                                    onTogglePlayback={togglePlayback}
                                    isWaitingForStrategy={isWaitingForStrategy}
                                    speed={speed}
                                    setSpeed={setSpeed}
                                    onSimulateRound={simulateRoundInstant}
                                    onSimulateMatch={simulateMatchInstant}
                                />
                            </div>
                        </div>

                        <div className="live-radar-stage relative min-h-0 flex-1">
                            <MapRadarPanel
                                currentMapId={currentMapId}
                                mapName={mapName}
                                radarDots={radarData?.dots}
                                nextRadarDots={nextRadarData?.dots}
                                tickDurationMs={1000 / Math.max(0.1, speed)}
                                isAnimating={isPlaying}
                                bombState={radarData?.bomb}
                                killLines={radarData?.killLines}
                                smokes={radarData?.smokes}
                                sitePositions={sitePositions}
                                currentTime={gameState.time}
                                roundOver={roundOver}
                                fillHeight
                            />
                            {strategyPicker}
                        </div>
                    </div>

                    {/* AWAY TEAM */}
                    <div className="flex min-h-0 min-w-0 flex-col gap-3">
                        {awayRosterPanel}
                        {isPlayerHome ? feedPanel : <>{decisionsPanel}{roundsPanel}</>}
                    </div>
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

            {gameState.status === "FINISHED" && (
                <div className="fixed bottom-8 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
                    <Button onClick={handleFinish} className="h-12 w-full text-base">
                        Continue to results <ChevronRight size={18} aria-hidden="true" />
                    </Button>
                </div>
            )}
        </div>
        </ErrorBoundary>
    )
}
