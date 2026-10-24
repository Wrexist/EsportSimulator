"use client"

import { getActivePlayersByRosterOrder } from '@/lib/live-match-builders'
import { fixtureBlockReason } from '@/lib/playable-match'
import { useState, useMemo, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading"
import { ArrowLeft, Brain, Check, ChevronRight, Crosshair, Lock, Video, Zap } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { Meter } from "@/src/components/ui/Meter"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { TierTag } from "@/src/components/ui/TierTag"
import { PressPanel } from "@/components/storylines/PressConference"
import { cn, deterministicSeed } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { formatGameCalendarDate } from "@/lib/game-calendar"
import { getStakes } from "@/lib/match-stakes"
import { leagueMatchContext, leagueStageLabel } from "@/components/league/league-view"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { playerEnergyPercent } from "@/lib/player-energy"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
// Engine Imports for Auto-Veto
import { simulationEngineV2, SeededRNG } from "@/engine"
import { MapId } from "@/types/enums"
import { Player } from "@/types"
import { getMapAssetName, ACTIVE_MAP_POOL, MAP_NAMES } from "@/data/map-pool"
import { MATCH_BALANCE, COST_CONSTANTS } from "@/lib/constants"
import { ROUND_ECONOMY_TUNING } from "@/lib/balance-tuning"
import { ANTI_STRAT_SELF_PENALTY, MAP_POINTS_PER_EDGE, MENTAL_PREP_EDGE, NON_PLAYER_BONUS_CAP, PREP_STRENGTH_PER_POINT, ROUND_SHARE_PER_EDGE, STYLE_SPECIALISATION_EDGE } from "@/engine/match/round-sim/team-edge"
import { TUNING } from "@/engine/match/round-sim/tuning"
import { PlayerLink, TeamLink } from "@/components/ui/EntityLink"

// Playstyle counter triangle, same as the sim (calculatePlaystyleCounterMod):
// each key beats its value; "default" is neutral against everything.
const PLAYSTYLE_BEATS: Record<string, string> = { aggressive: "structured", structured: "balanced", balanced: "aggressive" }
const PLAYSTYLE_LABELS: Record<string, string> = { aggressive: "Aggressive", structured: "Structured", balanced: "Balanced", default: "Default" }
const pct = (n: number) => `${Math.round(n * 100)}%`

// Real effects, read from the constants the match engine (script-v1,
// engine/match/round-sim) applies. "Team strength" is its non-player edge:
// every factor below is summed per team, the difference between the teams is
// capped at ±10% and shifts every duel (team-edge.ts); measured, +1% ≈ +0.28%
// of rounds won ≈ +0.85 map-win points.
// - VOD review adds 25 tactical prep; prep / 400 → +6.25% for this match.
// - Mental reset: +15 roster morale (store; morale is part of each player's
//   duel condition) and +3% team strength.
// - Playstyle counter +4% / −3% (shared cap with staff) and a sharper / blunter
//   read of the opponent's plan (simulate.ts choosePlan).
// - Anti-strat: the target's duels −6 rating (tuning.ts TARGETED) and your own
//   team strength −2% (tunnel vision).
// - Economy style shifts the automatic buy thresholds by $500 (economy-manager.ts).
const VOD_STRENGTH_PCT = Math.round(25 * PREP_STRENGTH_PER_POINT * 100)
const MENTAL_RESET_STRENGTH_PCT = Math.round(MENTAL_PREP_EDGE * 100)
const MENTAL_RESET_MORALE = 15
const STYLE_SPECIALISATION_PCT = Math.round(STYLE_SPECIALISATION_EDGE * 100)
const ROUNDS_PER_STRENGTH_PCT = ROUND_SHARE_PER_EDGE
const MAP_POINTS_PER_STRENGTH_PCT = MAP_POINTS_PER_EDGE / 100
// A 50/50 duel for the anti-strat target becomes this many percent.
const TARGET_DUEL_PCT = Math.round(100 / (1 + Math.exp(TUNING.TARGETED / TUNING.DUEL_SCALE)))
const ANTI_STRAT_SELF_PCT = Math.round(ANTI_STRAT_SELF_PENALTY * 100)
const FULL_BUY_FROM = ROUND_ECONOMY_TUNING.FULL_MIN_AVG_CASH

const overline = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"

type LineupPlayer = { id: string; nickname: string; nationality?: string; role?: string; morale?: number; energy?: number | null; portraitPath?: string; ovr: number }

function LineupTable({ title, team, players }: { title: string; team: { name: string }; players: LineupPlayer[] }) {
    return (
        <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                <p className={overline}>{title}</p>
                <p className="truncate text-xs text-ink-3">{team.name}</p>
            </div>
            <table data-slot="table" className="w-full border-collapse text-left">
                <thead data-slot="table-header">
                    <tr className="border-y border-line">
                        <th data-slot="table-head" className="pl-4">Player</th>
                        <th data-slot="table-head" className="px-2">Role</th>
                        <th data-slot="table-head" className="px-2 text-center">OVR</th>
                        <th data-slot="table-head" className="px-2">Morale</th>
                        <th data-slot="table-head" className="pr-4">Energy</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => (
                        <tr key={p.id} data-slot="table-row" className="h-11 border-b border-line last:border-b-0">
                            <td className="py-1.5 pl-4 pr-2">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised">
                                        <PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.nickname} size={32} />
                                    </div>
                                    <CountryFlag country={p.nationality || ""} size={14} />
                                    <p className="min-w-0 truncate text-sm font-semibold text-ink-1">{p.nickname}</p>
                                </div>
                            </td>
                            <td className="px-2"><RoleTag role={p.role} /></td>
                            <td className="px-2 text-center"><RatingChip value={p.ovr} size="sm" /></td>
                            <td className="px-2"><Meter value={p.morale ?? 50} label="Morale" trackClassName="w-10" /></td>
                            <td className="pr-4"><Meter value={playerEnergyPercent(p)} label="Energy" trackClassName="w-10" /></td>
                        </tr>
                    ))}
                    {players.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-4 text-sm text-ink-3">No eligible players.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

/** A selectable plan option: the label and the effect the engine actually applies. */
function OptionCard({ selected, onClick, label, effect, note, disabled, className }: {
    selected: boolean; onClick: () => void; label: string; effect: ReactNode; note?: ReactNode; disabled?: boolean; className?: string
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex min-h-16 flex-col items-start justify-start gap-1 rounded-[4px] border px-3 py-2.5 text-left transition-colors duration-150",
                selected ? "border-gold bg-gold/[0.06]" : "border-line bg-raised hover:border-line-strong hover:bg-hover",
                disabled && "cursor-not-allowed opacity-40 hover:border-line hover:bg-raised",
                className,
            )}
        >
            <span className="flex w-full items-center justify-between gap-2">
                <span className={cn("text-sm font-semibold", selected ? "text-ink-1" : "text-ink-2")}>{label}</span>
                {selected && <Check size={14} className="shrink-0 text-gold" aria-hidden="true" />}
            </span>
            <span className="text-xs leading-snug text-ink-3">{effect}</span>
            {note != null && <span className="text-[11px] leading-snug text-ink-3">{note}</span>}
        </button>
    )
}

/** A one-off paid action (VOD review, mental reset). */
function ActionCard({ icon, title, cost, effect, done, doneLabel, disabled, onClick, ariaLabel }: {
    icon: ReactNode; title: string; cost: number; effect: ReactNode; done: boolean; doneLabel: string; disabled?: boolean; onClick: () => void; ariaLabel: string
}) {
    return (
        <div className={cn("flex items-center gap-3 rounded-[4px] border p-3", done ? "border-positive/30 bg-positive/[0.04]" : "border-line bg-raised")}>
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded bg-hover", done ? "text-positive" : "text-ink-2")}>{icon}</div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-1">{title}</p>
                <p className="mt-0.5 text-xs leading-snug text-ink-3">{effect}</p>
            </div>
            {done ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-positive"><Check size={14} aria-hidden="true" /> {doneLabel}</span>
            ) : (
                <Button variant="outline" size="sm" className="h-8 shrink-0 px-3 text-xs tabular-nums" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
                    {formatCurrency(cost, "$", false)}
                </Button>
            )}
        </div>
    )
}

function TeamBlock({ team, ovr, rank, align }: { team: any; ovr: number; rank?: number; align: "left" | "right" }) {
    return (
        <div className={cn("flex min-w-0 flex-1 items-center gap-5", align === "right" && "flex-row-reverse text-right")}>
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                <TeamLogoDisplay team={team} size={60} />
            </div>
            <div className="min-w-0">
                <h2 className="truncate font-display text-[40px] font-bold uppercase leading-none text-ink-1"><TeamLink id={team.id}>{team.name}</TeamLink></h2>
                <div className={cn("mt-2 flex items-center gap-3 text-sm text-ink-3", align === "right" && "justify-end")}>
                    <span>World <span className="font-semibold tabular-nums text-ink-2">#{rank || "—"}</span></span>
                    <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
                    <span className="flex items-center gap-1.5">Team OVR <RatingChip value={ovr} size="sm" bare /></span>
                </div>
            </div>
        </div>
    )
}


export default function TacticalHQPage() {
    const params = useParams()
    const router = useRouter()
    const {
        getUpcomingMatches,
        teams,
        players,
        playerTeamId,
        currentWeek,
        currentDay,
        timeMode,
        tournaments,
        scheduledMatches,
        completedMatches,
        performVODReview,
        performMentalReset,
        updateScheduledMatch,
        setPlaystyle,
        setEconomyStyle,
        setTargetPlayer,
        addToast,
        getDateForWeek,
    } = useGameStore(useShallow(state => ({
        getUpcomingMatches: state.getUpcomingMatches,
        teams: state.teams,
        players: state.players,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        currentDay: state.currentDay,
        timeMode: state.timeMode,
        tournaments: state.tournaments,
        scheduledMatches: state.scheduledMatches,
        completedMatches: state.completedMatches,
        performVODReview: state.performVODReview,
        performMentalReset: state.performMentalReset,
        updateScheduledMatch: state.updateScheduledMatch,
        setPlaystyle: state.setPlaystyle,
        setEconomyStyle: state.setEconomyStyle,
        setTargetPlayer: state.setTargetPlayer,
        addToast: state.addToast,
        getDateForWeek: state.getDateForWeek,
    })))
    const league = useGameStore(state => state.league)

    const [isSimulatingVeto, setIsSimulatingVeto] = useState(false)
    const [isQuickSimulating, setIsQuickSimulating] = useState(false)

    const matchId = params.id as string
    // Find match in upcoming OR scheduled. Memoized so we don't re-scan three
    // potentially-large arrays on every render of the tactics screen.
    const match = useMemo(() => (
        getUpcomingMatches(20).find((m: any) => m.id === matchId) ||
        scheduledMatches.find((m: any) => m.id === matchId) ||
        completedMatches.find((m: any) => m.id === matchId)
    ), [matchId, getUpcomingMatches, scheduledMatches, completedMatches])

    // O(1) player lookup so opponentPlayers / playerRoster don't scan the full
    // league players array per render.
    const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

    // Derived state
    const myTeam = teamsById.get(playerTeamId as string)
    const opponentId = match?.homeTeamId === playerTeamId ? match?.awayTeamId : match?.homeTeamId
    const opponent = opponentId ? teamsById.get(opponentId) : undefined

    // Persisted State from Match
    const mentalBoosted = match?.mentalPrep || false
    const vodReviewed = match?.vodReviewed || false

    // Opponent Roster for Antistrat — `?? []` defaulting moved INSIDE the
    // useMemo so we don't invalidate the dep array with a fresh empty-array
    // reference on every render.
    const opponentPlayers = useMemo(() => {
        const ids = opponent?.rosterIds ?? []
        return ids.map((pid: string) => playersById.get(pid)).filter(Boolean) as any[]
    }, [opponent?.rosterIds, playersById])

    // Every match-prep lever (VOD review, playstyle, economy, anti-strat,
    // mental reset) is available from the first match. Facilities keep their
    // own bonuses (strength, training, recovery) and no longer gate these.

    // Opponent's current playstyle vs ours (the counter triangle).
    const myStyle = myTeam?.playstyle || "default"
    const opponentStyle = opponent?.playstyle || "default"
    const counterPick = Object.keys(PLAYSTYLE_BEATS).find(style => PLAYSTYLE_BEATS[style] === opponentStyle)
    const playstyleMatchup = myStyle === "default" || opponentStyle === "default" || myStyle === opponentStyle
        ? "neutral"
        : PLAYSTYLE_BEATS[myStyle] === opponentStyle ? "advantage"
        : PLAYSTYLE_BEATS[opponentStyle] === myStyle ? "disadvantage" : "neutral"

    const handleQuickSim = async () => {
        if (!match || !myTeam || !opponent) return
        setIsQuickSimulating(true)

        // 1. Auto Veto if needed
        if (!match.vetoComplete) {
            await handleAutoVeto()
        }

        // 2. Simulate Match Result (Instant). Open the result only when one was
        // recorded; a refusal (e.g. a side below five players) explains itself
        // with a toast and leaves the user here instead of on "Match Not Found".
        const recorded = await useGameStore.getState().simulateInstantMatch(matchId)

        setIsQuickSimulating(false)
        if (recorded) router.push(`/match/${matchId}/result`)
    }

    const handleAutoVeto = async () => {
        if (!match || !myTeam || !opponent) return
        setIsSimulatingVeto(true)

        const rng = new SeededRNG(
            deterministicSeed(
                match.id,
                match.seed,
                match.week,
                match.format,
                match.homeTeamId,
                match.awayTeamId
            )
        )
        const availableMaps = [...ACTIVE_MAP_POOL]

        const homeTeam = match.homeTeamId === myTeam.id ? myTeam : opponent
        const awayTeam = match.homeTeamId === myTeam.id ? opponent : myTeam

        // O(1) lookup via memoized playersById map instead of N players.find()
        const homePlayers = homeTeam?.rosterIds.map(id => playersById.get(id)).filter(Boolean) as unknown as Player[]
        const awayPlayers = awayTeam?.rosterIds.map(id => playersById.get(id)).filter(Boolean) as unknown as Player[]

        // We will just simulate a standard ban/pick phase purely using engine logic
        // BO3 Sequence: Ban, Ban, Pick, Pick, Ban, Ban, Decider
        // Result: [HomePick, AwayPick, Decider]

        // Simulate Veto Sequence based on Format
        // Pool of 7 maps

        let picks: MapId[] = []
        let currentPool = [...availableMaps]

        // Helper to get engine selection
        const getEngineSelection = (chooserPlayers: Player[], enemyPlayers: Player[], pool: MapId[], action: "BAN" | "PICK") => {
            const strengths = simulationEngineV2.calculateMapStrengths(chooserPlayers)
            let targetStrengths = strengths
            if (action === "BAN") {
                // If banning, we look at enemy strengths to ban their best
                targetStrengths = simulationEngineV2.calculateMapStrengths(enemyPlayers)
            }
            return simulationEngineV2.selectMapForVeto(rng, pool, targetStrengths, action, 3)
        }

        const runBan = (team: "home" | "away") => {
            const chooser = team === "home" ? homePlayers : awayPlayers
            const enemy = team === "home" ? awayPlayers : homePlayers
            const ban = getEngineSelection(chooser, enemy, currentPool, "BAN")
            currentPool = currentPool.filter(m => m !== ban)
        }

        const runPick = (team: "home" | "away") => {
            const chooser = team === "home" ? homePlayers : awayPlayers
            const enemy = team === "home" ? awayPlayers : homePlayers
            const pick = getEngineSelection(chooser, enemy, currentPool, "PICK")
            currentPool = currentPool.filter(m => m !== pick)
            picks.push(pick)
        }

        if (match.format === "BO1") {
            // BO1: Ban A, Ban B, Ban A, Ban B, Ban A, Ban B, Decider (Remaining)
            // Or simpler: each bans 3 times.
            for (let i = 0; i < 3; i++) {
                runBan("home")
                runBan("away")
            }
            // Last map is the pick
            if (currentPool.length > 0) picks.push(currentPool[0])

        } else if (match.format === "BO5") {
            // BO5 (from pool of 7): Ban A, Ban B. 5 maps remain.
            runBan("home")
            runBan("away")
            // All remaining 5 are played
            picks = [...currentPool]
            // Shuffle or keep order? Usually Pick A, Pick B... 
            // Let's just create a logical order: Pick A, Pick B, Pick A, Pick B, Decider
            // But for simplicity, we just use the remaining pool.
            // Ideally we want to order them by "pick" preference.
            // Let's just simulate picks for the first 4, last is decider.
            const orderedPicks: MapId[] = []
            let tempPool = [...currentPool]

            // 4 picks
            const pickSequence = ["home", "away", "home", "away"]
            for (const team of pickSequence) {
                const chooser = team === "home" ? homePlayers : awayPlayers
                const enemy = team === "home" ? awayPlayers : homePlayers
                const pick = getEngineSelection(chooser, enemy, tempPool, "PICK")
                tempPool = tempPool.filter(m => m !== pick)
                orderedPicks.push(pick)
            }
            // Last one
            if (tempPool.length > 0) orderedPicks.push(tempPool[0])
            picks = orderedPicks

        } else {
            // Default BO3
            // Ban A, Ban B
            runBan("home")
            runBan("away")

            // Pick A, Pick B
            runPick("home")
            runPick("away")

            // Ban A, Ban B
            runBan("home")
            runBan("away")

            // Decider
            if (currentPool.length > 0) picks.push(currentPool[0])
        }

        // Save to store and refresh
        updateScheduledMatch(matchId, {
            vetoComplete: true,
            maps: picks
        })
        setIsSimulatingVeto(false)
        router.refresh()
    }

    const handleStartMatch = () => {
        if (!match || !match.maps || !myTeam || !opponent) return
        // HYBRID_DAILY day pacing: a current-week match whose scheduled day hasn't
        // arrived can't be played out of order (mirrors the dashboard's isMatchLive
        // gate and the store-level guards). Refuse with a clear reason.
        if (timeMode === "HYBRID_DAILY" && match.week === currentWeek && (match.day ?? 6) > currentDay) {
            addToast({
                type: "warning",
                message: "This match unlocks later this week — advance the day to play it.",
            })
            return
        }
        // Both teams must field 5 players — otherwise the live screen can't
        // initialize (mirrors the quick-sim guard). Advancing the week forfeits
        // an understrength match properly, so refuse here with a clear reason
        // instead of routing to a live screen that would just bounce back.
        const homeTeam = match.homeTeamId === myTeam.id ? myTeam : opponent
        const awayTeam = match.homeTeamId === myTeam.id ? opponent : myTeam
        const homeActive = getActivePlayersByRosterOrder(homeTeam || {}, players, playersById).length
        const awayActive = getActivePlayersByRosterOrder(awayTeam || {}, players, playersById).length
        if (homeActive < 5 || awayActive < 5) {
            const shorthanded = homeActive < 5 ? homeTeam : awayTeam
            addToast({
                type: "warning",
                message: `${shorthanded?.name || "A team"} can't field 5 players — advance the week to resolve this match by forfeit.`,
            })
            return
        }
        const mapString = match.maps.join(",")
        router.push(`/match/${matchId}/live?maps=${mapString}`)
    }

    const handleManualVeto = () => {
        router.push(`/match/${matchId}/veto`)
    }

    const handleVODReview = () => {
        if (matchId && !vodReviewed) {
            performVODReview(matchId)
            // setVodReviewed(true) // Updates via store
        }
    }

    const handleMentalPrep = () => {
        if (!mentalBoosted) {
            if (myTeam && myTeam.budget < 5000) {
                addToast({
                    type: "warning",
                    message: "Insufficient funds — Mental Reset costs $5,000.",
                })
                return
            }
            performMentalReset(matchId)
            // setMentalBoosted(true) // Updates via store
        }
    }

    if (!match || !myTeam || !opponent) {
        // A loaded career without this fixture (stale link, already resolved,
        // removed by a week tick): explain and offer a way back instead of an
        // endless loading screen.
        if (teams.length > 0 && !match) {
            return (
                <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
                    <p className="font-display text-3xl font-bold uppercase text-ink-1">Match not found</p>
                    <p className="mb-6 mt-2 max-w-sm text-sm text-ink-3">This match is no longer on your schedule. It may already have been played or resolved when the week advanced.</p>
                    <Button onClick={() => router.push("/schedule")}>Back to schedule</Button>
                </div>
            )
        }
        return (
            <LoadingState message="Loading match day…" size="lg" fullScreen />
        )
    }

    const isMatchWeek = match.week === currentWeek
    const isFuture = match.week > currentWeek
    const isPast = match.week < currentWeek
    const isCompleted = completedMatches.some(m => m.id === match.id)
    // Same predicate the TopBar and the store use: a side below five players
    // can't play; advancing the week resolves the fixture by forfeit.
    const blockReason = isMatchWeek && !isCompleted
        ? fixtureBlockReason({ playerTeamId, scheduledMatches, currentWeek, teams, players }, match)
        : null

    // ── Presentation data ────────────────────────────────────────────────
    const toLineup = (team: typeof myTeam): LineupPlayer[] =>
        getActivePlayersByRosterOrder(team, players, playersById).map((p: any) => ({
            id: p.id, nickname: p.nickname, nationality: p.nationality, role: p.role,
            morale: p.morale, energy: p.energy, portraitPath: p.portraitPath,
            ovr: evaluatePlayer(p).overallRating,
        }))
    const myLineup = toLineup(myTeam)
    const theirLineup = toLineup(opponent)
    const avgOvr = (l: LineupPlayer[]) => l.length ? Math.round(l.reduce((s, p) => s + p.ovr, 0) / l.length) : 0
    const threat = theirLineup.reduce<LineupPlayer | null>((best, p) => (!best || p.ovr > best.ovr ? p : best), null)
    const myAvgMorale = myLineup.length ? myLineup.reduce((s, p) => s + (p.morale ?? 50), 0) / myLineup.length : 0
    const myChemistry = Math.round(myTeam.chemistry ?? 0)

    // Opponent's last five results, newest first.
    const opponentForm = completedMatches
        .filter(m => m.homeTeamId === opponent.id || m.awayTeamId === opponent.id)
        .sort((a, b) => (b.week - a.week) || ((b.day ?? 0) - (a.day ?? 0)))
        .slice(0, 5)
        .map(m => {
            const isHome = m.homeTeamId === opponent.id
            const homeWon = m.result.homeScore > m.result.awayScore
            const other = teamsById.get(isHome ? m.awayTeamId : m.homeTeamId)
            const single = m.result.maps.length === 1 ? m.result.maps[0]?.finalScore : undefined
            const [us, them] = single ? (isHome ? [single.team1, single.team2] : [single.team2, single.team1])
                : (isHome ? [m.result.homeScore, m.result.awayScore] : [m.result.awayScore, m.result.homeScore])
            return { id: m.id, won: isHome === homeWon, label: `${isHome === homeWon ? "Won" : "Lost"} ${us}–${them} vs ${other?.name ?? "unknown"}` }
        })
    const formWins = opponentForm.filter(f => f.won).length

    // Competition framing. A league fixture is named by its stage
    // ("Europe Division 3 · Round 5") and its stakes are table points.
    const leagueStage = leagueStageLabel(match)
    const isTournament = !leagueStage && !!match.tournamentId && match.tournamentId !== "SCRIM"
    const liveTournament = isTournament ? tournaments?.find(t => t.id === match.tournamentId) : undefined
    const tournamentDef = isTournament
        ? FULL_TOURNAMENT_CALENDAR.find(t => t.id === match.tournamentId!.replace(/_s\d+$/, '') || t.id === match.tournamentId)
        : undefined
    const competitionName = leagueStage ?? (isTournament ? (tournamentDef?.name || liveTournament?.name || "Tournament") : match.tournamentId === "SCRIM" ? "Scrim" : "Friendly")
    const tableContext = leagueStage ? leagueMatchContext(league, match, myTeam.id) : null
    const competitionDetail = leagueStage
        ? (tableContext ? `Table: ${tableContext}` : "Regional league")
        : match.stage || (isTournament ? "Tournament match" : "Week " + match.week)
    const nextStage = liveTournament?.playoffBracket?.find(m => m.sourceMatchIds?.includes(match.id))?.stage
    const stakes = leagueStage ? getStakes(match.stage || leagueStage, false)
        : isTournament ? getStakes(match.stage || "", tournamentDef?.format === "bracket", nextStage || undefined) : null
    const matchDate = getDateForWeek(match.week)
    matchDate.setUTCDate(matchDate.getUTCDate() + (match.day ?? 0))
    const dateLabel = formatGameCalendarDate(matchDate, { weekday: "short", month: "short", day: "numeric" })

    const matchupNote = playstyleMatchup === "advantage"
        ? <span className="font-semibold text-positive">You counter them · +{pct(MATCH_BALANCE.PLAYSTYLE_COUNTER_BONUS)} team strength, better read</span>
        : playstyleMatchup === "disadvantage"
            ? <span className="font-semibold text-negative">They counter you · −{pct(MATCH_BALANCE.PLAYSTYLE_COUNTER_PENALTY)} team strength, worse read</span>
            : <span className="text-ink-2">No counter either way</span>

    const PLAYSTYLE_OPTIONS = [
        { id: "balanced", label: "Balanced", effect: "Beats Aggressive" },
        {
            id: "aggressive", label: "Aggressive", effect: "Beats Structured",
            note: <>+{STYLE_SPECIALISATION_PCT}% at 80+ avg morale · now <span className={myAvgMorale > 80 ? "text-positive" : "text-ink-2"}>{Math.round(myAvgMorale)}</span></>,
        },
        {
            id: "structured", label: "Structured", effect: "Beats Balanced",
            note: <>+{STYLE_SPECIALISATION_PCT}% at 80+ chemistry · now <span className={myChemistry > 80 ? "text-positive" : "text-ink-2"}>{myChemistry}</span></>,
        },
        { id: "default", label: "Default", effect: "Neutral against every style" },
    ]
    const ECONOMY_OPTIONS = [
        { id: "standard", label: "Standard", effect: <>Full buy from <span className="tabular-nums text-ink-2">{formatCurrency(FULL_BUY_FROM, "$", false)}</span> avg cash</> },
        { id: "force", label: "Force", effect: <>Buys $500 earlier · full buy from <span className="tabular-nums text-ink-2">{formatCurrency(FULL_BUY_FROM - 500, "$", false)}</span></> },
        { id: "eco", label: "Eco", effect: <>Saves $500 longer · full buy from <span className="tabular-nums text-ink-2">{formatCurrency(FULL_BUY_FROM + 500, "$", false)}</span></> },
    ]

    const mapsLocked = match.vetoComplete && (match.maps?.length ?? 0) > 0
    const sides = (match as { mapStartingSides?: Record<string, string> }).mapStartingSides || {}

    const statusLine = isSimulatingVeto
        ? "Running the veto…"
        : mapsLocked ? "Maps locked in · ready to play" : "Map veto comes first"

    return (
        <div className="mx-auto max-w-[1600px] space-y-4 pb-16">
            {/* Back + status */}
            <div className="flex items-center justify-between">
                <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 transition-colors hover:text-ink-1">
                    <ArrowLeft size={15} aria-hidden="true" /> Schedule
                </Link>
                <p className={overline}>
                    {isCompleted ? "Played" : isMatchWeek ? "Match day" : isFuture ? `Scheduled · week ${match.week}` : "Expired"}
                </p>
            </div>

            {/* Broadcast header */}
            <section className="overflow-hidden rounded-[10px] border border-line bg-panel" aria-label={`${myTeam.name} versus ${opponent.name}`}>
                <div className="flex items-center gap-8 px-8 py-6">
                    <TeamBlock team={myTeam} ovr={avgOvr(myLineup)} rank={myTeam.worldRanking} align="left" />
                    <div className="flex w-[300px] shrink-0 flex-col items-center text-center">
                        <div className="flex items-center gap-2">
                            {isTournament && <TierTag tier={tournamentDef?.tier || liveTournament?.tier} />}
                            {leagueStage && <span className="inline-flex shrink-0 items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-2">League</span>}
                            <p className="truncate text-sm font-semibold text-ink-1">{competitionName}</p>
                        </div>
                        <p className="mt-1 text-xs text-ink-3">{competitionDetail}</p>
                        <p className="mt-2 font-display text-[56px] font-bold leading-none tabular-nums text-ink-1">{(match.format || "BO3").toUpperCase()}</p>
                        <p className="mt-2 text-xs text-ink-3">{dateLabel} · week {match.week}</p>
                    </div>
                    <TeamBlock team={opponent} ovr={avgOvr(theirLineup)} rank={opponent.worldRanking} align="right" />
                </div>
                {stakes && (
                    <div className="grid grid-cols-2 divide-x divide-line border-t border-line bg-shell text-sm">
                        <p className="px-8 py-2.5 text-ink-2"><span className={cn(overline, "mr-2")}>If you win</span>{stakes.win}</p>
                        <p className="px-8 py-2.5 text-right text-ink-2"><span className={cn(overline, "mr-2")}>If you lose</span>{stakes.loss}</p>
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    {/* Lineups */}
                    <Panel padded={false} className="overflow-hidden">
                        <div className="grid grid-cols-1 divide-line lg:grid-cols-2 lg:divide-x">
                            <LineupTable title="Your five" team={myTeam} players={myLineup} />
                            <LineupTable title="Their five" team={opponent} players={theirLineup} />
                        </div>
                    </Panel>

                    {/* Game plan */}
                    <Panel title="Game plan" actions={<span className="text-xs text-ink-3">Every number below is what the match engine applies.</span>}>
                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                    <p className={overline}>Playstyle</p>
                                    <p className="text-xs text-ink-3">
                                        {opponent.name} plays <span className="font-semibold text-ink-2">{PLAYSTYLE_LABELS[opponentStyle] ?? opponentStyle}</span>
                                        {counterPick && <> · counter with <span className="font-semibold text-ink-2">{PLAYSTYLE_LABELS[counterPick]}</span></>}
                                        <span className="mx-2 text-ink-3">·</span>{matchupNote}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                    {PLAYSTYLE_OPTIONS.map(style => (
                                        <OptionCard
                                            key={style.id}
                                            selected={(myTeam.playstyle || "default") === style.id}
                                            onClick={() => setPlaystyle(playerTeamId!, style.id as any)}
                                            label={style.label}
                                            effect={style.effect}
                                            note={style.note}
                                        />
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] text-ink-3">
                                    Countering their style is worth +{pct(MATCH_BALANCE.PLAYSTYLE_COUNTER_BONUS)} team strength and a sharper read of their plan; being countered costs {pct(MATCH_BALANCE.PLAYSTYLE_COUNTER_PENALTY)} and blunts your read. The counter shares a +10% cap with staff bonuses. +1% team strength ≈ +{ROUNDS_PER_STRENGTH_PCT.toFixed(2)}% of rounds ≈ +{MAP_POINTS_PER_STRENGTH_PCT.toFixed(2)} map-win points; all non-player factors together are capped at ±{pct(NON_PLAYER_BONUS_CAP)}.
                                </p>
                            </div>

                            {/* Economy Style (B12) — read by the sim (getTeamStrategy). */}
                            <div>
                                <div className="mb-2 flex items-baseline justify-between gap-4">
                                    <p className={overline}>Economy</p>
                                    <p className="text-xs text-ink-3">Used for automatic buys. Your buy calls in the live match override it.</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {ECONOMY_OPTIONS.map(style => (
                                        <OptionCard
                                            key={style.id}
                                            selected={(myTeam.economyStyle || "standard") === style.id}
                                            onClick={() => setEconomyStyle(playerTeamId!, style.id as any)}
                                            label={style.label}
                                            effect={style.effect}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Antistrat */}
                            <div>
                                <div className="mb-2 flex items-baseline justify-between gap-4">
                                    <p className={overline}>Anti-strat</p>
                                    <p className="text-xs text-ink-3">Pick one of their players. Their duels −{TUNING.TARGETED} rating (a 50/50 duel becomes {TARGET_DUEL_PCT}/{100 - TARGET_DUEL_PCT}) · your team strength −{ANTI_STRAT_SELF_PCT}%</p>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    {opponentPlayers.slice(0, 5).map((player: any) => {
                                        const targeted = myTeam.targetPlayerId === player.id
                                        return (
                                            <button
                                                key={player.id}
                                                type="button"
                                                aria-pressed={targeted}
                                                onClick={() => setTargetPlayer(playerTeamId!, targeted ? undefined : player.id)}
                                                className={cn(
                                                    "flex min-w-0 items-center gap-2.5 rounded-[4px] border p-2 text-left transition-colors duration-150",
                                                    targeted ? "border-gold bg-gold/[0.06]" : "border-line bg-raised hover:border-line-strong hover:bg-hover",
                                                )}
                                            >
                                                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-hover">
                                                    <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className={cn("truncate text-sm font-semibold", targeted ? "text-ink-1" : "text-ink-2")}>{player.nickname}</p>
                                                    <RoleTag role={player.role} className="mt-0.5 px-1 py-0" />
                                                </div>
                                                {targeted && <Crosshair size={16} className="shrink-0 text-gold" aria-label="Targeted" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4">
                    {/* Primary action */}
                    <Panel title={mapsLocked ? "Ready" : "Next step"} actions={<span className="text-xs text-ink-3">{statusLine}</span>}>
                        <div className="space-y-3">
                            {mapsLocked && (
                                <ul className="space-y-2">
                                    {(match.maps || []).map((map: string, i: number) => {
                                        const isDecider = (match.maps?.length || 0) > 1 && i === (match.maps?.length || 0) - 1
                                        const ctTeam = sides[map]
                                        const startSide = ctTeam ? (ctTeam === myTeam.id ? "CT" : "T") : null
                                        return (
                                            <li key={map + i} className="relative flex h-14 items-center overflow-hidden rounded-[4px] border border-line">
                                                <Image src={`/maps/${getMapAssetName(map)}.png`} alt="" fill sizes="340px" className="object-cover opacity-30" />
                                                <div className="relative flex w-full items-center justify-between px-3">
                                                    <div>
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{isDecider ? "Decider" : `Map ${i + 1}`}</p>
                                                        <p className="font-display text-xl font-bold uppercase leading-none text-ink-1">{MAP_NAMES[map] ?? map}</p>
                                                    </div>
                                                    {startSide && (
                                                        <span className={cn("text-xs font-semibold", startSide === "CT" ? "text-side-ct" : "text-side-t")}>You start {startSide}</span>
                                                    )}
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}

                            {isCompleted ? (
                                <Button onClick={() => router.push(`/match/${match.id}/result`)} className="h-12 w-full text-base">
                                    View result
                                </Button>
                            ) : blockReason ? (
                                <div role="alert" className="space-y-3">
                                    <p className="text-sm text-caution">{blockReason}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button onClick={() => router.push("/transfers")} className="h-10">Find a player</Button>
                                        <Button variant="outline" onClick={() => router.push("/schedule")} className="h-10">Back to schedule</Button>
                                    </div>
                                </div>
                            ) : isFuture ? (
                                <Button disabled variant="outline" className="h-12 w-full">
                                    <Lock size={16} aria-hidden="true" /> Match is in week {match.week}
                                </Button>
                            ) : isPast ? (
                                <Button disabled variant="outline" className="h-12 w-full">Match expired</Button>
                            ) : mapsLocked ? (
                                <div className="flex gap-2">
                                    <Button onClick={handleStartMatch} className="h-12 flex-1 text-base">
                                        Start match <ChevronRight size={18} aria-hidden="true" />
                                    </Button>
                                    <Button
                                        onClick={handleQuickSim}
                                        disabled={isQuickSimulating}
                                        variant="outline"
                                        className="h-12 gap-1.5 px-4"
                                        title="Simulate Result Instantly"
                                        aria-label="Quick sim: simulate the result instantly"
                                    >
                                        <Zap size={16} aria-hidden="true" /> {isQuickSimulating ? "Simulating…" : "Quick sim"}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Button onClick={handleManualVeto} disabled={isSimulatingVeto} className="h-12 w-full text-base">
                                        Start veto <ChevronRight size={18} aria-hidden="true" />
                                    </Button>
                                    <Button onClick={handleAutoVeto} disabled={isSimulatingVeto} variant="outline" className="h-10 w-full">
                                        {isSimulatingVeto ? "Simulating…" : "Quick sim veto"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Phase 5.3: press conference before a big match (optional) */}
                    <PressPanel matchId={match.id} />

                    {/* Opponent intel */}
                    <Panel title="Opponent intel" actions={<span className="text-xs text-ink-3">{opponent.name}</span>} padded={false}>
                        <dl className="divide-y divide-line text-sm">
                            <div className="flex items-center justify-between px-4 py-2.5">
                                <dt className="text-ink-3">World ranking</dt>
                                <dd className="font-display text-xl font-bold tabular-nums text-ink-1">#{opponent.worldRanking || "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <dt className="text-ink-3">Form</dt>
                                <dd className="flex items-center gap-2">
                                    {opponentForm.length > 0 ? (
                                        <>
                                            <span className="flex gap-1">
                                                {opponentForm.map(f => (
                                                    <span
                                                        key={f.id}
                                                        title={f.label}
                                                        aria-label={f.label}
                                                        className={cn("flex h-6 w-6 items-center justify-center rounded-sm text-[11px] font-bold", f.won ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}
                                                    >
                                                        {f.won ? "W" : "L"}
                                                    </span>
                                                ))}
                                            </span>
                                            <span className="text-xs tabular-nums text-ink-3">{formWins}–{opponentForm.length - formWins}</span>
                                        </>
                                    ) : <span className="text-ink-3">No matches yet</span>}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between px-4 py-2.5">
                                <dt className="text-ink-3">Playstyle</dt>
                                <dd className="font-semibold text-ink-1">{PLAYSTYLE_LABELS[opponentStyle] ?? opponentStyle}</dd>
                            </div>
                            <div className="flex items-center justify-between px-4 py-2.5">
                                <dt className="text-ink-3">Avg OVR</dt>
                                <dd><RatingChip value={avgOvr(theirLineup)} size="sm" /></dd>
                            </div>
                            {threat && (
                                <div className="px-4 py-3">
                                    <dt className={cn(overline, "mb-2")}>Threat player</dt>
                                    <dd className="flex items-center gap-3">
                                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-raised">
                                            <PlayerPortrait src={threat.portraitPath} seed={threat.id} alt={threat.nickname} size={44} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold text-ink-1"><PlayerLink id={threat.id}>{threat.nickname}</PlayerLink></p>
                                            <div className="mt-0.5 flex items-center gap-2"><RoleTag role={threat.role} /><CountryFlag country={threat.nationality || ""} size={12} /></div>
                                        </div>
                                        <RatingChip value={threat.ovr} />
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </Panel>

                    {/* Preparation: one-off paid sessions for this match */}
                    <Panel title="Preparation" actions={<span className="text-xs text-ink-3">Paid once, this match only</span>}>
                        <div className="space-y-2">
                            <ActionCard
                                icon={<Video size={16} />}
                                title="VOD review"
                                cost={COST_CONSTANTS.VOD_REVIEW_COST}
                                effect={<>+25 tactical prep: <span className="text-ink-2">+{VOD_STRENGTH_PCT}% team strength</span> for this match.</>}
                                done={vodReviewed}
                                doneLabel="Done"
                                disabled={!isMatchWeek}
                                onClick={handleVODReview}
                                ariaLabel={`Review VOD for ${formatCurrency(COST_CONSTANTS.VOD_REVIEW_COST, "$", false)}`}
                            />
                            <ActionCard
                                icon={<Brain size={16} />}
                                title="Mental reset"
                                cost={COST_CONSTANTS.MENTAL_RESET_COST}
                                effect={<>+{MENTAL_RESET_MORALE} squad morale and <span className="text-ink-2">+{MENTAL_RESET_STRENGTH_PCT}% team strength</span> for this match.</>}
                                done={mentalBoosted}
                                doneLabel="Done"
                                onClick={handleMentalPrep}
                                ariaLabel={`Apply Mental Reset (${formatCurrency(COST_CONSTANTS.MENTAL_RESET_COST, "$", false)}) to boost morale`}
                            />
                        </div>
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
