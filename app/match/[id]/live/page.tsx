"use client"

import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"

import { useEffect, useMemo, memo, useRef, useState } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { LoadingState } from "@/components/ui/loading"
import { useLiveMatch } from "@/hooks/useLiveMatch"
import { LiveMatchScoreboard } from "@/components/match/LiveMatchScoreboard"
import { LiveMatchControlBar } from "@/components/match/LiveMatchControlBar"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { DerbyBanner } from "@/components/match/DerbyBanner"
import { HalfTimeOverlay } from "@/components/match/HalfTimeOverlay"
import { TacticalLoadoutEditor } from "@/components/match/TacticalLoadoutEditor"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { ArrowLeft, Skull, Swords, Zap as ZapIcon, EyeOff, Settings2, Coins, Search, Shield, Crosshair, Sparkles, Bomb, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { CustomTactics, LivePlayerState, MapId, MatchEvent, Team } from "@/types"
import { computeRadarPositions, type RadarPlayerDot } from "@/lib/radar-position-engine"
import { MAP_NAMES, getMapAssetName } from "@/data/map-pool"

import { formatCurrency } from "@/lib/utils-extended"
import { REGROUP_EDGE, REGROUP_MIN_LOSS_STREAK } from "@/engine/match/manager-controls"
// Weapon-id → icon path. The mapping object is hoisted so it isn't allocated
// on every call, and resolved paths are memoized in a module-level cache so
// the log list doesn't recompute the same string per row per render tick.
const WEAPON_ICON_MAP: Record<string, string> = {
    "m4a1s": "weapon_m4a1s.png",
    "ak47": "weapon_ak47.png",
    "m4a4": "weapon_m4a4.png",
    "awp": "weapon_awp.png",
    "deagle": "weapon_deagle.png",
    "usp": "weapon_usp.png",
    "glock": "weapon_glock.png",
    "p250": "weapon_p250.png",
    "mac10": "weapon_mac10.png",
    "mp9": "weapon_mp9.png",
    "xm1014": "weapon_xm1014.png",
    "p90": "weapon_p90.png",
    "famas": "weapon_famas.png",
    "galilar": "weapon_galil.png",
    "galil": "weapon_galil.png",
    "mp7": "weapon_mp7.png",
    "aug": "weapon_aug.png",
    "mag7": "weapon_mag7.png",
    "fiveseven": "weapon_fiveseven.png",
    "ssg08": "weapon_awp.png",
    "dualies": "weapon_p250.png",
    "tec9": "weapon_glock.png",
    "sg553": "weapon_ak47.png",
    "knife": "weapon_glock.png",
}
const WEAPON_ICON_FALLBACK = "/assets/weapons/weapon_glock.png"
const weaponIconCache = new Map<string, string>()

const getWeaponIcon = (weaponName: string | undefined): string => {
    if (!weaponName) return WEAPON_ICON_FALLBACK
    const cached = weaponIconCache.get(weaponName)
    if (cached) return cached
    const normalized = weaponName.toLowerCase().replace(/-/g, "").replace(/\s+/g, "")
    const mapped = WEAPON_ICON_MAP[normalized] || "weapon_glock.png"
    const path = `/assets/weapons/${mapped}`
    weaponIconCache.set(weaponName, path)
    return path
}


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

// Memoized log list. Without memo this re-evaluates every per-tick parent
// render (~30-60Hz from useLiveMatch), iterating the full logs array and
// recreating ~100+ log-row elements each frame even when nothing changed.
// React.memo + a stable `logs` reference from useLiveMatch means this
// re-runs only when a new log entry is appended.
const LiveLogList = memo(function LiveLogList({ logs }: { logs: any[] }) {
    return (
        <div className="space-y-1.5 pb-4">
            {logs.map(l => {
                const rowKey = logRowKey(l)
                const timeStr = l.time != null ? `[${Math.floor(l.time / 60)}:${(l.time % 60).toString().padStart(2, '0')}]` : ""

                if (l.type === "KILL") {
                    return (
                        <div key={rowKey} className={cn(
                            "p-2 rounded-xl text-[11px] border-l-2 border border-white/5 flex items-center gap-1.5",
                            l.killerSide === "CT"
                                ? "bg-blue-500/10 border-l-blue-400/50"
                                : "bg-orange-500/10 border-l-orange-400/50"
                        )}>
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <div className="flex items-center gap-1 shrink-0">
                                {l.killerImage && (
                                    <div className="w-5 h-5 rounded overflow-hidden shrink-0">
                                        <PlayerPortrait src={l.killerImage} alt="" size={20} variant="card" />
                                    </div>
                                )}
                                <span className={cn("font-semibold truncate max-w-[60px]",
                                    l.killerSide === "CT" ? "text-blue-300/90" : "text-orange-300/90"
                                )}>{l.killerName}</span>
                            </div>
                            {l.assisterName && (
                                <span className="text-white/30 text-[9px] shrink-0">+ {l.assisterName}</span>
                            )}
                            <div className="flex items-center gap-0.5 mx-0.5 shrink-0">
                                <Image src={getWeaponIcon(l.weapon)} alt="" width={20} height={10} className="h-2.5 w-auto brightness-0 invert opacity-40" unoptimized />
                                {l.isHeadshot && (
                                    <Image src="/assets/weapons/headshot.png" alt="HS" width={10} height={10} className="h-2.5 w-2.5 opacity-70" unoptimized />
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="font-semibold text-white/40 truncate max-w-[60px]">{l.victimName}</span>
                                {l.victimImage && (
                                    <div className="w-5 h-5 rounded overflow-hidden shrink-0 opacity-50">
                                        <PlayerPortrait src={l.victimImage} alt="" size={20} variant="card" />
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-1 ml-auto shrink-0">
                                {l.isHeadshot && <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-red-500/20 text-red-300">HS</span>}
                                {l.isTrade && <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-yellow-500/20 text-yellow-300">TRADE</span>}
                            </div>
                        </div>
                    )
                }

                if (l.type === "PLANT") {
                    return (
                        <div key={rowKey} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-red-500/10 border-l-red-400/50 flex items-center gap-2">
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <Bomb className="w-3 h-3 text-red-400 shrink-0" />
                            <span className="text-red-300/80 font-semibold">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "DEFUSE") {
                    return (
                        <div key={rowKey} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-blue-500/10 border-l-blue-400/50 flex items-center gap-2">
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <Shield className="w-3 h-3 text-blue-400 shrink-0" />
                            <span className="text-blue-300/80 font-semibold">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "EXPLODE") {
                    return (
                        <div key={rowKey} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-orange-600/15 border-l-orange-500/60 flex items-center gap-2">
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <ZapIcon className="w-3 h-3 text-orange-400 shrink-0" />
                            <span className="text-orange-300/80 font-semibold">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "ROUND_END") {
                    return (
                        <div key={rowKey} className="p-2.5 rounded-xl text-[11px] border-l-2 border border-white/10 bg-white/8 border-l-white/30 flex items-center gap-2">
                            <Trophy className="w-3.5 h-3.5 text-white/50 shrink-0" />
                            <span className="text-white/70 font-bold uppercase tracking-wide">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "CLUTCH") {
                    return (
                        <div key={rowKey} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-yellow-500/10 border-l-yellow-400/50 flex items-center gap-2">
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
                            <span className="text-yellow-300/80 font-semibold">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "SAVE") {
                    return (
                        <div key={rowKey} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 border-l-white/10 flex items-center gap-2">
                            <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                            <EyeOff className="w-3 h-3 text-white/30 shrink-0" />
                            <span className="text-white/40">{l.message}</span>
                        </div>
                    )
                }

                if (l.type === "BUY") {
                    return (
                        <div key={rowKey} className="p-1.5 rounded-lg text-[10px] border bg-white/2 flex items-center gap-2">
                            <Coins className="w-3 h-3 text-emerald-400/40 shrink-0" />
                            <span className="text-white/30 font-medium">{l.message}</span>
                        </div>
                    )
                }

                return (
                    <div key={rowKey} className="p-2 rounded-xl text-[11px] border border-white/5 bg-black/20 flex items-center gap-2">
                        <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                        <span className="text-white/50">{l.message}</span>
                    </div>
                )
            })}
        </div>
    )
})

// Strategy panel constants. Hoisted to module scope so the array and the
// cost lookup don't reallocate every render of the strategy panel. The
// icons are JSX nodes (small SVGs) — fine to share as the same reference
// since they have no state.
const STRATEGY_OPTIONS = [
    { id: "ECO", fallback: "Save", icon: <Coins className="w-5 h-5" />, baseColor: "bg-white/5 text-white/50 border-white/10", cost: 0 },
    { id: "FORCE", fallback: "Force buy", icon: <ZapIcon className="w-5 h-5" />, baseColor: "bg-orange-500/10 text-orange-300 border-orange-500/20", cost: 1800 },
    { id: "SEMIBUY", fallback: "Half buy", icon: <Search className="w-5 h-5" />, baseColor: "bg-purple-500/10 text-purple-300 border-purple-500/20", cost: 3600 },
    { id: "FULL", fallback: "Full buy", icon: <Shield className="w-5 h-5" />, baseColor: "bg-blue-500/20 text-blue-400 border-blue-500/40", cost: 4700 },
    { id: "DOUBLE AWP", fallback: "2xAWP", icon: <Crosshair className="w-5 h-5" />, baseColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", cost: 6500 },
] as const

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
    return (
        <div className={cn(
            "match-roster-row rounded-xl flex items-center gap-2 border transition-colors",
            isDead ? "bg-black/40 border-white/5 opacity-50" : "bg-white/5 border-white/5",
            extraClassName,
        )}>
            <div className="w-10 h-10 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-white/5">
                <PlayerPortrait
                    src={portraitPath}
                    seed={id}
                    alt={name}
                    size={40}
                    variant="card"
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <div className="font-normal text-xs uppercase truncate pr-2">{name}</div>
                    <div className="text-[10px] text-emerald-400 font-bold whitespace-nowrap">{formatCurrency(money, "$", false)}</div>
                </div>
                <div className="text-[10px] text-white/40 font-bold truncate mt-0.5">{weapon?.toUpperCase() || defaultWeaponLabel}</div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-xs font-normal">{kills}/{deaths}/{assists}</div>
                {isDead && <Skull className="w-3 h-3 text-red-500 ml-auto mt-1" aria-hidden="true" />}
            </div>
        </div>
    )
})

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

    // Background lives in a fixed-position layer so it stays viewport-sized.
    // Heavy dark gradient over the map photo keeps panels readable; the map
    // is a subtle atmospheric backdrop, not the foreground.
    const backgroundStyle = useMemo(() => ({
        backgroundImage: `linear-gradient(180deg, rgba(10,14,20,0.92) 0%, rgba(10,14,20,0.78) 55%, rgba(10,14,20,0.96) 100%), url(/maps/${getMapAssetName(currentMapId)}.png)`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
    }), [currentMapId])

    if (!matchData.current || !simState) {
        if (matchMissing) {
            return (
                <div role="alert" className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                    <p className="text-white text-lg font-bold uppercase tracking-widest mb-2">Match Not Found</p>
                    <p className="text-sm text-white/60 mb-6 max-w-sm">This match is no longer on your schedule. It may already have been played or resolved when the week advanced.</p>
                    <Button variant="play" onClick={() => router.push("/schedule")}>Back to Schedule</Button>
                </div>
            )
        }
        return <LoadingState message="Warming up servers…" size="lg" fullScreen />
    }

    const { homeTeam, awayTeam } = matchData.current
    const mapName = MAP_NAMES[currentMapId] || currentMapId || "Unknown Map"

    // Dynamic Colors based on Side
    const homeIsCT = roundHomeIsCT
    // Strategy panel and loadout editor always describe the managed team.
    const ownRoster = isPlayerHome ? homeRoster : awayRoster
    const ownOriginal = isPlayerHome ? originalHomeMap : originalAwayMap
    const ownBudget = Math.floor(Object.values(ownEconomy).reduce((s, p) => s + (p?.cash || 0), 0))
    const homeBorderClass = homeIsCT ? "border-l-blue-500/30" : "border-l-orange-500/30"
    const awayBorderClass = !homeIsCT ? "border-r-blue-500/30" : "border-r-orange-500/30"

    const homeRosterPanel = (
        <div className={cn("match-roster glass-panel-dark rounded-xl border-l-4 p-4 overflow-y-auto space-y-2 shrink-0", homeBorderClass)}>
            {homeRoster.slice(0, 5).map(p => (
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
                    portraitPath={originalHomeMap.get(p.id)?.portraitPath}
                    defaultWeaponLabel="USP"
                />
            ))}
        </div>
    )
    const awayRosterPanel = (
        <div className={cn("match-roster glass-panel-dark rounded-xl border-r-4 p-4 overflow-y-auto space-y-2 shrink-0", awayBorderClass)}>
            {awayRoster.slice(0, 5).map(p => (
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
                    portraitPath={originalAwayMap.get(p.id)?.portraitPath}
                    defaultWeaponLabel="GLOCK"
                />
            ))}
        </div>
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
                    className="tactical-decisions absolute inset-x-3 bottom-12 z-20 rounded-xl border border-emerald-400/40 bg-[#0b1626]/95 p-3 shadow-2xl backdrop-blur-md"
                >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
                        {/* The round about to be played; gameState.round is the last one played (0 before the first). */}
                        <h3 className="text-xl font-normal uppercase">Round {simState.currentRound} • Select Strategy</h3>
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                            Team Budget: {formatCurrency(ownBudget, "$", false)}
                        </p>
                    </div>
                    {/* Arbitrary grid class: the premium skin folds `.grid-cols-5` to 3 columns on narrow screens. */}
                    <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2">
                        {(() => {
                            const avgCash = Math.floor(ownBudget / 5)
                            const side = ownIsCT ? "ct" : "t"

                            return STRATEGY_OPTIONS.map((strat) => {
                                const cost = strat.cost
                                const canAfford = avgCash >= cost

                                return (
                                    <div key={strat.id} className="relative group">
                                        <Button
                                            variant="secondary"
                                            onClick={() => canAfford && startNextRound(strat.id as any)}
                                            disabled={!canAfford}
                                            className={cn(
                                                "w-full h-16 rounded-2xl flex flex-col gap-1 border transition-all",
                                                canAfford
                                                    ? strat.baseColor + " hover:ring-2 hover:ring-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                                                    : "bg-white/5 text-white/20 border-white/5 cursor-not-allowed opacity-40"
                                            )}
                                        >
                                            <span className="font-normal text-[11px] leading-tight text-center">{strat.fallback}</span>
                                            <div className={cn("text-[10px] font-bold", canAfford ? "text-emerald-400" : "text-red-400")}>
                                                {formatCurrency(cost, "$", false)}
                                            </div>
                                        </Button>
                                        <button
                                            aria-label={`Edit ${strat.fallback} loadout`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingStrategy(strat.id as any);
                                                setEditingSide(side as "ct" | "t");
                                                setIsEditingLoadout(true);
                                            }}
                                            className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 hover:bg-white/20 text-white/30 hover:text-white transition-colors"
                                        >
                                            <Settings2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
    const decisionsPanel = (
        <div className={cn(
            "glass-panel-dark rounded-xl p-4 flex flex-col gap-3 shrink-0 border transition-colors",
            choosingStrategy ? "border-emerald-400/40" : "border-white/5"
        )}>
            <div>
                <h3 className="text-base font-semibold">Your calls</h3>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                    Team Budget: {formatCurrency(ownBudget, "$", false)}
                </p>
            </div>
            <p className="text-xs text-slate-400">
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
            <div className="match-timeout flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                <button
                    onClick={callTimeout}
                    disabled={timeoutsRemaining <= 0 || timeoutActive || !isWaitingForStrategy || gameState.status !== "IN_PROGRESS"}
                    title={`Between rounds only: regroup — +${REGROUP_EDGE * 100}% round-win chance for 2 rounds while you have lost ${REGROUP_MIN_LOSS_STREAK}+ in a row. Two per series; no benefit without a losing streak.`}
                    className="px-4 py-2 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300 text-[11px] font-bold uppercase tracking-wider hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Tactical Timeout ({timeoutsRemaining})
                </button>
                {timeoutActive ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Regrouping — pressure relief active
                    </span>
                ) : (
                    <p className="text-xs text-slate-400 max-w-[240px]">Between rounds. +{REGROUP_EDGE * 100}% round-win chance for two rounds after {REGROUP_MIN_LOSS_STREAK}+ losses in a row.</p>
                )}
            </div>
        </div>
    )

    const feedPanel = (
        <div className="live-feed-panel glass-panel-dark flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col border border-white/5">
            <div className="flex items-center gap-2 mb-4 text-xs font-normal opacity-40 uppercase tracking-widest">
                <Swords className="w-4 h-4" /> SERVER LOGS
            </div>
            <div className="flex-1 pr-2 overflow-y-auto custom-scrollbar h-full min-h-0 relative">
                <LiveLogList logs={logs} />
            </div>
        </div>
    )

    return (
        <ErrorBoundary section="Live Match">
        <div className="live-command h-full text-white flex flex-col font-sans select-none relative"
            role="main"
            aria-label={`Live match: ${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`}
        >
            <div
                aria-hidden="true"
                className="fixed inset-0 -z-10 pointer-events-none"
                style={backgroundStyle}
            />
            <HalfTimeOverlay active={showHalfTime} />
            <div className="live-command-inner mx-auto w-full flex flex-col flex-1 h-full min-h-0">

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
                />

                {/* GAME AREA — full screen: rosters left/right, radar is the hero. */}
                <div className="live-match-grid flex-1 min-h-0">
                    {/* HOME TEAM */}
                    <div className="live-side-column flex min-h-0 min-w-0 flex-col gap-3">
                        {homeRosterPanel}
                        {isPlayerHome ? decisionsPanel : feedPanel}
                    </div>

                    {/* CONSOLE / CENTER */}
                    <div className="match-command-center min-w-0 min-h-0 flex flex-col gap-3">
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
                                        variant="ghost"
                                        className="glass-panel-dark h-auto min-h-[52px] shrink-0 rounded-xl border border-white/10 px-3 text-xs font-bold uppercase tracking-wider text-white/80 hover:text-white hover:bg-white/10"
                                        title="Pause and go back to the match hub"
                                        aria-label="Leave to the match hub"
                                        // Pause while deciding: the round would otherwise play on (or end) behind the dialog.
                                        onClick={() => setIsPlaying(false)}
                                    >
                                        {/* Text only where the centre column is wide enough. */}
                                        <ArrowLeft className="w-4 h-4 2xl:mr-1.5" aria-hidden="true" /> <span className="hidden 2xl:inline">Match hub</span>
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
                    <div className="live-side-column flex min-h-0 min-w-0 flex-col gap-3">
                        {awayRosterPanel}
                        {isPlayerHome ? feedPanel : decisionsPanel}
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
                        className="fixed inset-0 z-modal flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
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
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-md z-50 px-4">
                    <Button
                        onClick={handleFinish}
                        className="w-full h-16 bg-linear-to-r/srgb from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-normal uppercase tracking-[0.2em] rounded-3xl shadow-lg hover:shadow-emerald-500/20 transition-all transform hover:scale-[1.02]"
                    >
                        CONTINUE TO RESULTS
                    </Button>
                </div>
            )}

            <style jsx global>{`
            .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
            }
        `}</style>
        </div>
        </ErrorBoundary>
    )
}
