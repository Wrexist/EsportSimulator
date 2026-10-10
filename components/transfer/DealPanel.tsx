"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowUpRight, Star } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { Meter } from "@/src/components/ui/Meter"
import { getVisibleStats, scoutTierFromAccuracy } from "@/engine/scouting-system"
import { employedScout } from "@/engine/recruitment"
import { getSpecializationMultiplier } from "@/engine/staff-specialization"
import { calculateRosterSynergy } from "@/engine/scouting-helpers"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { useNegotiation } from "./useNegotiation"
import { DealTerms } from "./DealTerms"
import { ScoutedRating, REPORT_LABEL } from "./ScoutedRating"

const SCOUTING_FEE = 3000
const REPORT_RANKS = ["NONE", "BASIC", "ADVANCED", "EXPERT", "ELITE"] as const
const ATTRIBUTE_LABELS: [string, string][] = [
    ["skill", "Skill"], ["rifle", "Rifle"], ["awp", "AWP"], ["pistol", "Pistol"], ["reaction", "Reaction"],
    ["clutch", "Clutch"], ["grenades", "Utility"], ["tactic", "Tactics"], ["creativity", "Creativity"],
    ["teamwork", "Teamwork"], ["leader", "Leadership"], ["consistency", "Consistency"],
]

function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("space-y-3 border-t border-line px-4 py-4", className)}>
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
                {aside}
            </div>
            {children}
        </section>
    )
}

/**
 * Docked deal panel: who the player is, what your scouts actually know, and
 * the live offer (fee → wage + length) with honest acceptance odds.
 */
export function DealPanel({ playerId, mode }: { playerId: string; mode: "transfers" | "scouting" }) {
    const n = useNegotiation(playerId, true)
    const {
        players, staff, scoutedPlayers, currentWeek, activeScoutingMission,
        startScoutingMission, cancelScoutingMission, watchlistedPlayerIds, toggleWatchlistPlayer, contracts,
    } = useGameStore(useShallow(state => ({
        players: state.players,
        staff: state.staff,
        scoutedPlayers: state.scoutedPlayers,
        currentWeek: state.currentWeek,
        activeScoutingMission: state.activeScoutingMission,
        startScoutingMission: state.startScoutingMission,
        cancelScoutingMission: state.cancelScoutingMission,
        watchlistedPlayerIds: state.watchlistedPlayerIds,
        toggleWatchlistPlayer: state.toggleWatchlistPlayer,
        contracts: state.contracts,
    })))

    const player = n.playerSave
    const myTeam = n.myTeam
    const knowledge = useMemo(
        () => player ? getVisibleStats(player, scoutedPlayers, myTeam?.rosterIds || [], currentWeek) : undefined,
        [player, scoutedPlayers, myTeam?.rosterIds, currentWeek],
    )
    const starters = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        return (myTeam?.rosterIds || []).slice(0, 5).map(id => byId.get(id)).filter(Boolean) as typeof players
    }, [players, myTeam?.rosterIds])

    if (!player || !knowledge) return null

    const club = n.currentTeam
    const contract = club ? contracts.find(c => c.playerId === player.id && c.teamId === club.id) : undefined
    const weeksLeft = contract ? Math.max(0, contract.endWeek - currentWeek) : null
    const watchlisted = watchlistedPlayerIds.includes(player.id)

    // Scouting: what the hired scout can deliver, and how long it takes (same rules as the store action).
    const scout = employedScout(staff, myTeam, currentWeek)
    const scoutTier = scout ? scoutTierFromAccuracy((scout.stats?.accuracy ?? 50) * getSpecializationMultiplier(scout)) : null
    const scoutWeeks = scout ? Math.max(1, 5 - (scout.level ?? 1) - Math.floor(((scout.stats?.scoutingSpeed ?? 0) * getSpecializationMultiplier(scout)) / 50)) : 0
    const missionHere = activeScoutingMission?.playerId === player.id
    const missionTarget = activeScoutingMission ? players.find(p => p.id === activeScoutingMission.playerId) : undefined
    const reportRank = REPORT_RANKS.indexOf(knowledge.scoutingLevel)
    const canImprove = scoutTier ? REPORT_RANKS.indexOf(scoutTier) > reportRank : false
    const isOwn = myTeam?.rosterIds.includes(player.id) ?? false

    const exact = knowledge.exactStats as Record<string, unknown> | undefined
    const attributes = exact ? ATTRIBUTE_LABELS.filter(([key]) => typeof exact[key] === "number").map(([key, label]) => ({ label, value: exact[key] as number })) : []
    const synergy = knowledge.scoutingLevel === "ELITE" && starters.length > 0 && !isOwn
        ? calculateRosterSynergy(player as never, starters as never)
        : null

    const scoutAction = (() => {
        if (isOwn) return <p className="text-xs text-ink-3">Your player — fully known.</p>
        if (missionHere && activeScoutingMission) {
            const total = Math.max(1, activeScoutingMission.completionWeek - activeScoutingMission.startWeek)
            const done = Math.max(0, Math.min(total, currentWeek - activeScoutingMission.startWeek))
            return (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-2">Scouting · report due week {activeScoutingMission.completionWeek}</span>
                        <button className="text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={() => cancelScoutingMission()}>Cancel (no refund)</button>
                    </div>
                    <Meter value={(done / total) * 100} label="Scouting progress" tone="neutral" showValue={false} trackClassName="w-full" />
                </div>
            )
        }
        if (!scout) return (
            <p className="text-xs text-ink-3">
                No scout on staff. <Link href="/staff" className="text-ink-2 underline underline-offset-2 hover:text-ink-1">Hire one</Link> to reveal ratings.
            </p>
        )
        if (activeScoutingMission) return <p className="text-xs text-ink-3">Your scout is on {missionTarget?.nickname ?? "another player"} until week {activeScoutingMission.completionWeek}.</p>
        if (!canImprove) return <p className="text-xs text-ink-3">Your scout can&apos;t improve this report. A more accurate scout can.</p>
        return (
            <Button variant="outline" size="sm" className="h-9 w-full" onClick={() => startScoutingMission(player.id)} disabled={n.budget < SCOUTING_FEE}>
                Scout for a {REPORT_LABEL[scoutTier!].toLowerCase()} · {formatCurrency(SCOUTING_FEE, "$", false)} · {scoutWeeks} wk{scoutWeeks === 1 ? "" : "s"}
            </Button>
        )
    })()

    return (
        <Panel padded={false} className="overflow-hidden">
            <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-raised">
                    <PlayerPortrait key={player.id} src={player.portraitPath} seed={player.id} alt={player.nickname} size={56} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-display text-2xl font-bold uppercase leading-none text-ink-1">{player.nickname}</p>
                        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
                            <button
                                onClick={() => toggleWatchlistPlayer(player.id)}
                                className={cn("rounded p-1.5 transition-colors hover:bg-hover", watchlisted ? "text-gold" : "text-ink-3 hover:text-ink-1")}
                                aria-pressed={watchlisted}
                                aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
                                title={watchlisted ? "On your watchlist" : "Add to watchlist"}
                            >
                                <Star size={16} className={cn(watchlisted && "fill-current")} />
                            </button>
                            <Link href={`/player/${player.id}`} className="rounded p-1.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1" aria-label="Open player profile" title="Open profile">
                                <ArrowUpRight size={16} />
                            </Link>
                        </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                        <CountryFlag country={player.nationality} size={14} />
                        <RoleTag role={player.role} />
                        <span className="tabular-nums">Age {player.age}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2">
                        {club ? (
                            <>
                                <TeamLogoImage src={(club as { logoPath?: string }).logoPath} alt={club.name} team={club as never} size={16} />
                                <span className="truncate">{club.name}</span>
                                {weeksLeft !== null && <span className="text-ink-3">· contract {weeksLeft >= 52 ? `${(weeksLeft / 52).toFixed(1)}y` : `${weeksLeft}w`}</span>}
                            </>
                        ) : <span className="text-ink-3">Free agent</span>}
                    </div>
                </div>
            </div>

            <Section title="What you know" aside={<span className="text-xs text-ink-3">{REPORT_LABEL[knowledge.scoutingLevel]}</span>}>
                <div className="flex items-center gap-4">
                    <ScoutedRating knowledge={knowledge} size="lg" />
                    <p className="text-xs text-ink-3">
                        {knowledge.scoutingLevel === "NONE" ? "Public info only. Value and wage are known; the rating isn't."
                            : knowledge.scoutingLevel === "ELITE" ? "Every attribute confirmed."
                                : "True rating sits inside the band. Better reports narrow it."}
                    </p>
                </div>
                {mode === "scouting" && attributes.length > 0 && (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                        {attributes.map(a => (
                            <div key={a.label} className="flex items-center justify-between gap-1">
                                <dt className="truncate text-xs text-ink-3">{a.label}</dt>
                                <dd><RatingChip value={a.value} size="sm" bare /></dd>
                            </div>
                        ))}
                    </dl>
                )}
                {mode === "scouting" && synergy !== null && (
                    <p className="text-xs text-ink-3">Synergy with your starting five: <span className="font-semibold tabular-nums text-ink-1">{synergy}</span></p>
                )}
                {scoutAction}
            </Section>

            {!isOwn && (
                <Section title="Deal" aside={<span className="text-xs text-ink-3">{club ? "Fee, then contract" : "Contract only"}</span>}>
                    <DealTerms n={n} />
                </Section>
            )}
        </Panel>
    )
}
