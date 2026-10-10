import { memo } from "react"
import { motion } from "framer-motion"
import { LiveGameState, Team, MapId } from "@/types"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { useAppReducedMotion } from "@/lib/reduced-motion"

/** One revealed round of the current map, for the history strip. */
export interface ScorebugRound {
    round: number
    winner: "home" | "away"
    /** Side the winning team played the round on. */
    side: "ct" | "t"
    winType?: string
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
}

const WIN_TYPE_LABEL: Record<string, string> = {
    ELIMINATION: "elimination", elimination: "elimination",
    BOMB_EXPLODED: "bomb exploded", bomb: "bomb exploded",
    BOMB_DEFUSE: "bomb defused", defuse: "bomb defused",
    TIME: "time ran out", time: "time ran out",
}

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

/**
 * Round history: one column per round, the top cell for the home team and the
 * bottom one for the away team, filled in the colour of the side that won it.
 * Regulation is 24 rounds with a gap at the half; overtime extends the strip.
 */
function RoundHistory({ rounds, homeName, awayName }: { rounds: ScorebugRound[]; homeName: string; awayName: string }) {
    const slots = Math.max(24, rounds.length)
    const byRound = new Map(rounds.map(r => [r.round, r]))
    return (
        <div className="flex items-center gap-[3px]" aria-label="Round history">
            {Array.from({ length: slots }, (_, i) => {
                const n = i + 1
                const r = byRound.get(n)
                const fill = r ? (r.side === "ct" ? "bg-side-ct" : "bg-side-t") : ""
                const title = r ? `Round ${n}: ${r.winner === "home" ? homeName : awayName} (${r.side.toUpperCase()}) · ${WIN_TYPE_LABEL[r.winType ?? ""] ?? "won"}` : `Round ${n}`
                return (
                    <div key={n} title={title} className={cn("flex flex-col gap-[3px]", (n === 13 || (n > 24 && (n - 25) % 6 === 0)) && "ml-2")}>
                        <span className={cn("h-2 w-2.5 rounded-[1px]", r?.winner === "home" ? fill : "bg-hover")} />
                        <span className={cn("h-2 w-2.5 rounded-[1px]", r?.winner === "away" ? fill : "bg-hover")} />
                    </div>
                )
            })}
        </div>
    )
}

// Memoized: live page renders this on every tick (~30-60Hz). Most ticks
// don't change scoreboard inputs (scores update once per round, not per
// tick), so memo skips the render entirely while idle.
function LiveMatchScoreboardImpl({
    gameState,
    homeTeam,
    awayTeam,
    matchFormat,
    currentMapId: _currentMapId,
    mapName,
    homeSeriesScore,
    awaySeriesScore,
    homeScore,
    awayScore,
    roundTime,
    isBombPlanted,
    bombTime,
    homeIsCT = true,
    roundHistory = [],
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
    const isUrgent = !isBombPlanted && displaySeconds <= 10 && displaySeconds > 0
    const reduceMotion = useAppReducedMotion()
    const finished = gameState.status === "FINISHED"
    const toWin = mapsToWinForFormat(matchFormat)
    const phase = roundPhaseLabel(gameState.round, homeScore, awayScore)

    const score = (value: number, leading: boolean) => (
        <div className="relative flex h-[60px] w-[76px] items-center justify-center overflow-hidden">
            <motion.span
                key={value}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn("font-display text-[64px] font-bold leading-none tabular-nums", leading ? "text-ink-1" : "text-ink-2")}
            >
                {value}
            </motion.span>
        </div>
    )

    return (
        <div
            className="relative z-10 mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch overflow-hidden rounded-lg border border-line bg-panel"
            role="region"
            aria-label="Match scoreboard"
            aria-live="polite"
        >
            {/* HOME */}
            <div className="flex min-w-0 items-center gap-4 py-3 pl-0 pr-6">
                <span className={cn("h-full w-1 self-stretch", homeIsCT ? "bg-side-ct" : "bg-side-t")} aria-hidden="true" />
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                    <TeamLogoDisplay team={homeTeam} size={40} />
                </div>
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{homeTeam.name}</span>
                        {!finished && <SidePill ct={homeIsCT} />}
                    </div>
                    <div className="mt-1.5"><SeriesPips won={homeSeriesScore} toWin={toWin} label={`Maps won: ${homeSeriesScore} of ${toWin}`} align="left" /></div>
                </div>
                <div className="ml-auto">{score(homeScore, homeScore >= awayScore)}</div>
            </div>

            {/* CENTRE */}
            <div className="flex min-w-[340px] flex-col items-center justify-center gap-1.5 border-x border-line bg-shell px-6 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    <span className="text-ink-2">{mapName}</span>
                    <span aria-hidden="true">·</span>
                    <span className={finished ? "text-ink-1" : undefined}>{finished ? "Final" : `RND ${gameState.round} / 24`}</span>
                    {!finished && phase && <><span aria-hidden="true">·</span><span className={phase === "Match point" ? "text-ink-1" : undefined}>{phase}</span></>}
                </div>
                {showTimer && !finished && (
                    <div className={cn(
                        "font-display text-[28px] font-bold leading-none tabular-nums",
                        gameState.isPaused ? "text-ink-3" : isBombPlanted ? "text-negative" : isUrgent ? "text-caution" : "text-ink-1",
                    )}>
                        {isBombPlanted && <span className="mr-2 align-middle text-[11px] font-semibold uppercase tracking-[0.08em]">Bomb</span>}
                        {Math.floor(displaySeconds / 60)}:{(displaySeconds % 60).toString().padStart(2, '0')}
                    </div>
                )}
                <RoundHistory rounds={roundHistory} homeName={homeTeam.name} awayName={awayTeam.name} />
            </div>

            {/* AWAY */}
            <div className="flex min-w-0 flex-row-reverse items-center gap-4 py-3 pl-6 pr-0 text-right">
                <span className={cn("h-full w-1 self-stretch", homeIsCT ? "bg-side-t" : "bg-side-ct")} aria-hidden="true" />
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                    <TeamLogoDisplay team={awayTeam} size={40} />
                </div>
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-row-reverse items-center gap-2">
                        <span className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{awayTeam.name}</span>
                        {!finished && <SidePill ct={!homeIsCT} />}
                    </div>
                    <div className="mt-1.5"><SeriesPips won={awaySeriesScore} toWin={toWin} label={`Maps won: ${awaySeriesScore} of ${toWin}`} align="right" /></div>
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
