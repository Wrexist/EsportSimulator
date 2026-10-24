import { memo, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { scorebugTime, type LiveTimeSource, type ScorebugTime } from "@/lib/live-clock"
import { LiveGameState, Team, MapId } from "@/types"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { lossBonusAt } from "@/engine/match/round-sim/economy"
import { buyShortLabel } from "@/lib/live-match-decision"
import { YouTag } from "@/components/match/live/LiveRosterCard"

/** One revealed round of the current map, for the history strip. */
export interface ScorebugRound {
    round: number
    winner: "home" | "away"
    /** Side the winning team played the round on. */
    side: "ct" | "t"
    winType?: string
    /** Buy each team ran (public: visible from equipment). */
    homeBuy?: string
    awayBuy?: string
    /** Map score after the round. */
    homeScore?: number
    awayScore?: number
}

interface LiveMatchScoreboardProps {
    gameState: LiveGameState
    homeTeam: Team
    awayTeam: Team
    matchFormat: string // "BO1" | "BO3" | "BO5"
    currentMapId: MapId
    mapName: string
    homeSeriesScore: number
    awaySeriesScore: number
    homeScore: number
    awayScore: number
    /** Seconds remaining in the current round (counts down from 1:55). */
    roundTime?: number
    /** True while the bomb is planted (display bomb timer instead). */
    isBombPlanted?: boolean
    /** Seconds remaining on the bomb (counts down from 0:40). */
    bombTime?: number
    /** Side the home team is on this round (accent stripes). */
    homeIsCT?: boolean
    /** Rounds already revealed on this map (never the one in flight). */
    roundHistory?: ScorebugRound[]
    /** script-v1 loss-bonus level (0–4) per team for the round on screen. */
    homeLossLevel?: number
    awayLossLevel?: number
    /**
     * The round in flight: the timer follows the live clock on its own (it
     * re-renders itself when the shown second changes, not the page). Without
     * it the timer shows `roundTime` / `bombTime`.
     */
    clock?: ScorebugClock | null
    /** Which team is the player's own (a YOU tag by its name). */
    ownTeam?: "home" | "away"
}

/** Live clock and the round's bomb times for the scorebug timer. */
export interface ScorebugClock {
    source: LiveTimeSource
    /** PLANT time (the bomb timer takes over once the clock reaches it). */
    plantAt?: number
    /** Defuse / explosion time (the bomb timer ends). */
    bombEndAt?: number
}

/**
 * How often the live timer reads the clock. It re-renders only when the shown
 * second changes (at most 8×/s; fast-forward plays up to 20 round seconds a
 * second, so it then steps a few seconds at a time), never the page.
 */
const TIMER_POLL_MS = 125

const WIN_TYPE_LABEL: Record<string, string> = {
    ELIMINATION: "Elimination", elimination: "Elimination",
    BOMB_EXPLODED: "Bomb exploded", bomb: "Bomb exploded",
    BOMB_DEFUSE: "Bomb defused", defuse: "Bomb defused",
    TIME: "Time ran out", time: "Time ran out",
}
/** One-letter marks inside the history cells: E(lim), B(omb), D(efuse), T(ime). */
const WIN_TYPE_MARK: Record<string, string> = { ELIMINATION: "", BOMB_EXPLODED: "B", BOMB_DEFUSE: "D", TIME: "T" }

function SidePill({ ct }: { ct: boolean }) {
    return (
        <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-bold leading-none tracking-[0.06em]", ct ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t")}>
            {ct ? "CT" : "T"}
        </span>
    )
}

function SeriesPips({ won, toWin, label, align }: { won: number; toWin: number; label: string; align: "left" | "right" }) {
    if (toWin <= 1) return null
    return (
        <div className={cn("flex gap-1", align === "right" && "justify-end")} role="img" aria-label={label}>
            {Array.from({ length: toWin }, (_, i) => (
                <span key={i} className={cn("h-1.5 w-5 rounded-full", i < won ? "bg-ink-1" : "bg-hover")} />
            ))}
        </div>
    )
}

/** Loss-bonus ladder: five steps ($1,400 → $3,400), the current one lit. */
function LossBonus({ level, align }: { level?: number; align: "left" | "right" }) {
    if (typeof level !== "number") return null
    const bonus = lossBonusAt(level)
    return (
        <div className={cn("flex items-center gap-1.5 text-[11px] leading-none text-ink-3", align === "right" && "flex-row-reverse")}
            title={`Loss bonus level ${level + 1} of 5: a lost round pays $${bonus.toLocaleString("en-US")} each. A loss moves it up, a win down.`}
            data-loss-level={level}>
            <span className="uppercase tracking-[0.06em]">Loss bonus</span>
            <span className={cn("flex gap-0.5", align === "right" && "flex-row-reverse")} aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => <span key={i} className={cn("h-2 w-1 rounded-[1px]", i <= level ? "bg-ink-2" : "bg-hover")} />)}
            </span>
            <span className="tabular-nums text-ink-2">${bonus.toLocaleString("en-US")}</span>
        </div>
    )
}

/**
 * Round history: one column per round, the top cell for the home team and the
 * bottom one for the away team, filled in the colour of the side that won it
 * and marked B / D / T for bomb, defuse and time wins. Hover for how it ended.
 * Regulation is 24 rounds with a gap at the half; overtime extends the strip.
 */
const RoundHistory = memo(function RoundHistory({ rounds, homeName, awayName }: { rounds: ScorebugRound[]; homeName: string; awayName: string }) {
    const slots = Math.max(24, rounds.length)
    const byRound = new Map(rounds.map(r => [r.round, r]))
    return (
        <div className="flex items-center gap-[3px]" aria-label="Round history">
            {Array.from({ length: slots }, (_, i) => {
                const n = i + 1
                const r = byRound.get(n)
                const fill = r ? (r.side === "ct" ? "bg-side-ct text-ink" : "bg-side-t text-ink") : ""
                const mark = r ? WIN_TYPE_MARK[r.winType ?? ""] ?? "" : ""
                const how = r ? WIN_TYPE_LABEL[r.winType ?? ""] ?? "Won" : ""
                const cell = (mine: boolean) => (
                    <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[2px] text-[11px] font-bold leading-none", mine ? fill : "bg-hover")}>{mine ? mark : ""}</span>
                )
                return (
                    <div
                        key={n}
                        className={cn("group relative flex flex-col gap-[3px]", (n === 13 || (n > 24 && (n - 25) % 6 === 0)) && "ml-2")}
                        aria-label={r ? `Round ${n}: ${r.winner === "home" ? homeName : awayName} (${r.side.toUpperCase()}), ${how.toLowerCase()}` : `Round ${n}`}
                        data-round-dot={r ? r.winner : undefined}
                    >
                        {cell(r?.winner === "home")}
                        {cell(r?.winner === "away")}
                        {r && (
                            <div className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1.5 w-max -translate-x-1/2 rounded-md border border-line-strong bg-raised px-2.5 py-2 text-left opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100" role="tooltip">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Round {n}{r.homeScore !== undefined ? ` · ${r.homeScore}–${r.awayScore}` : ""}</p>
                                <p className="mt-0.5 text-sm font-semibold text-ink-1">
                                    {r.winner === "home" ? homeName : awayName} <span className={r.side === "ct" ? "text-side-ct" : "text-side-t"}>({r.side.toUpperCase()})</span>
                                </p>
                                <p className="text-xs text-ink-2">{how}</p>
                                {(r.homeBuy || r.awayBuy) && <p className="mt-0.5 text-xs text-ink-3">Buys: {buyShortLabel(r.homeBuy)} / {buyShortLabel(r.awayBuy)}</p>}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
})

function TimerText({ seconds, planted, paused }: { seconds: number; planted: boolean; paused: boolean }) {
    const isUrgent = !planted && seconds <= 10 && seconds > 0
    return (
        <span className={cn(
            "ml-1 font-display text-[22px] font-bold normal-case leading-none tracking-normal tabular-nums",
            paused ? "text-ink-3" : planted ? "text-negative" : isUrgent ? "text-caution" : "text-ink-1",
        )} data-round-timer="">
            {planted && <span className="mr-1.5 align-middle font-sans text-[11px] font-semibold uppercase tracking-[0.08em]">Bomb</span>}
            {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
        </span>
    )
}

/** The round timer of the round in flight, read from the live clock (renders on a new second only). */
function LiveTimer({ clock, paused }: { clock: ScorebugClock; paused: boolean }) {
    const { source, plantAt, bombEndAt } = clock
    const [shown, setShown] = useState<ScorebugTime>(() => scorebugTime(Math.max(0, source.now()), plantAt, bombEndAt))
    useEffect(() => {
        const read = () => {
            const next = scorebugTime(Math.max(0, source.now()), plantAt, bombEndAt)
            setShown(prev => (prev.seconds === next.seconds && prev.planted === next.planted ? prev : next))
        }
        read()
        const timer = window.setInterval(read, TIMER_POLL_MS)
        return () => window.clearInterval(timer)
    }, [source, plantAt, bombEndAt])
    return <TimerText seconds={shown.seconds} planted={shown.planted} paused={paused} />
}

// Memoized: the live page re-renders when the feed or roster change; the
// live timer and the history strip update on their own.
function LiveMatchScoreboardImpl({
    gameState,
    homeTeam,
    awayTeam,
    matchFormat,
    currentMapId: _currentMapId,
    mapName,
    ownTeam,
    homeSeriesScore,
    awaySeriesScore,
    homeScore,
    awayScore,
    roundTime,
    isBombPlanted,
    bombTime,
    homeIsCT = true,
    roundHistory = [],
    homeLossLevel,
    awayLossLevel,
    clock,
}: LiveMatchScoreboardProps) {
    // Display the actual round countdown (1:55 → 0:00). Falls back to the raw
    // game-time tick when no roundTime is provided so existing callers keep
    // working.
    const displaySeconds = Math.floor(isBombPlanted && typeof bombTime === "number"
        ? Math.max(0, bombTime)
        : typeof roundTime === "number"
            ? Math.max(0, roundTime)
            : Math.max(0, gameState.time))
    const showTimer = gameState.time >= 0
    const reduceMotion = useAppReducedMotion()
    const finished = gameState.status === "FINISHED"
    const toWin = mapsToWinForFormat(matchFormat)
    const phase = roundPhaseLabel(gameState.round, homeScore, awayScore)

    const score = (value: number, leading: boolean) => (
        <div className="relative flex h-[52px] w-[68px] items-center justify-center overflow-hidden">
            <motion.span
                key={value}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn("font-display text-[56px] font-bold leading-none tabular-nums", leading ? "text-ink-1" : "text-ink-2")}
            >
                {value}
            </motion.span>
        </div>
    )

    return (
        <div
            className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch rounded-lg border border-line bg-panel"
            role="region"
            aria-label="Match scoreboard"
        >
            {/* Screen readers hear the score change, not every second of the timer. */}
            <span className="sr-only" aria-live="polite">{`${homeTeam.name} ${homeScore}, ${awayTeam.name} ${awayScore}`}</span>
            {/* HOME */}
            <div className="flex min-w-0 items-center gap-4 py-2.5 pl-0 pr-6">
                <span className={cn("h-full w-1 self-stretch rounded-l-lg", homeIsCT ? "bg-side-ct" : "bg-side-t")} aria-hidden="true" />
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                    <TeamLogoDisplay team={homeTeam} size={36} />
                </div>
                <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{homeTeam.name}</span>
                        {!finished && <SidePill ct={homeIsCT} />}
                        {ownTeam === "home" && <YouTag />}
                    </div>
                    <div className="flex items-center gap-3">
                        <SeriesPips won={homeSeriesScore} toWin={toWin} label={`Maps won: ${homeSeriesScore} of ${toWin}`} align="left" />
                        {!finished && <LossBonus level={homeLossLevel} align="left" />}
                    </div>
                </div>
                <div className="ml-auto">{score(homeScore, homeScore >= awayScore)}</div>
            </div>

            {/* CENTRE */}
            <div className="flex min-w-[460px] flex-col items-center justify-center gap-1.5 border-x border-line bg-shell px-6 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    <span className="text-ink-2">{mapName}</span>
                    <span aria-hidden="true">·</span>
                    <span className={finished ? "text-ink-1" : undefined}>{finished ? "Final" : `RND ${gameState.round} / 24`}</span>
                    {!finished && phase && <><span aria-hidden="true">·</span><span className={phase === "Match point" ? "text-ink-1" : undefined}>{phase}</span></>}
                    {showTimer && !finished && (clock
                        ? <LiveTimer clock={clock} paused={!!gameState.isPaused} />
                        : <TimerText seconds={displaySeconds} planted={!!isBombPlanted} paused={!!gameState.isPaused} />)}
                </div>
                <RoundHistory rounds={roundHistory} homeName={homeTeam.name} awayName={awayTeam.name} />
            </div>

            {/* AWAY */}
            <div className="flex min-w-0 flex-row-reverse items-center gap-4 py-2.5 pl-6 pr-0 text-right">
                <span className={cn("h-full w-1 self-stretch rounded-r-lg", homeIsCT ? "bg-side-t" : "bg-side-ct")} aria-hidden="true" />
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                    <TeamLogoDisplay team={awayTeam} size={36} />
                </div>
                <div className="min-w-0 space-y-1.5">
                    <div className="flex min-w-0 flex-row-reverse items-center gap-2">
                        <span className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{awayTeam.name}</span>
                        {!finished && <SidePill ct={!homeIsCT} />}
                        {ownTeam === "away" && <YouTag />}
                    </div>
                    <div className="flex flex-row-reverse items-center gap-3">
                        <SeriesPips won={awaySeriesScore} toWin={toWin} label={`Maps won: ${awaySeriesScore} of ${toWin}`} align="right" />
                        {!finished && <LossBonus level={awayLossLevel} align="right" />}
                    </div>
                </div>
                <div className="mr-auto">{score(awayScore, awayScore >= homeScore)}</div>
            </div>
        </div>
    )
}

function mapsToWinForFormat(format: string): number {
    if (format === "BO3") return 2
    if (format === "BO5") return 3
    return 1
}

/**
 * Broadcast tag for the round. Only facts: pistol rounds (1 and 13),
 * overtime, and match point in regulation (first to 13). It used to say
 * "Full Buy" / "Anti-Eco" from the round number alone, which was often
 * not what either team bought.
 */
function roundPhaseLabel(round: number, homeScore: number, awayScore: number): string | null {
    if (round > 24) return "Overtime"
    if (round === 1 || round === 13) return "Pistol"
    if (Math.max(homeScore, awayScore) === 12) return "Match point"
    return null
}

export const LiveMatchScoreboard = memo(LiveMatchScoreboardImpl)
