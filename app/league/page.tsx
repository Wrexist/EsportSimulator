"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ListOrdered } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { isLeagueMatchId, ordinal } from "@/engine/season/regional-league"
import { LEAGUE_TUNING, leagueCentralPayment } from "@/lib/balance-tuning"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { LeagueTable } from "@/components/league/LeagueTable"
import { ClubLeagueFixtures } from "@/components/league/ClubLeagueFixtures"
import { DivisionSwitcher } from "@/components/league/DivisionSwitcher"
import {
    bottomLevelOf,
    divisionsByRegion,
    leagueTableRows,
    nextDrawLabel,
    previousSplitOutcome,
    signed,
    splitOutcomeText,
    splitProgressLabel,
    splitWeeksLabel,
    tableSituation,
    zoneRules,
} from "@/components/league/league-view"

const TONE_TEXT = { positive: "text-positive", neutral: "text-ink-3", caution: "text-caution", negative: "text-negative" } as const
const DIVISION_PARAM = "division"

/**
 * Competition → League (Phase 4.7): the managed club's division table with
 * promotion/relegation zones, its league fixtures and results, every other
 * division of every region, and what the last split decided.
 */
export default function LeaguePage() {
    const { hydrated, isLoading, playerTeamId, teams, league, currentWeek, scheduledMatches, completedMatches, gameStartDate } = useGameStore(useShallow(s => ({
        hydrated: s._hasHydrated,
        isLoading: s.isLoading,
        playerTeamId: s.playerTeamId,
        teams: s.teams,
        league: s.league,
        currentWeek: s.currentWeek,
        scheduledMatches: s.scheduledMatches,
        completedMatches: s.completedMatches,
        gameStartDate: s.gameStartDate,
    })))

    const split = league?.current
    const own = useMemo(() => split?.divisions.find(d => !!playerTeamId && d.teamIds.includes(playerTeamId)), [split, playerTeamId])
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // `?division=<id>` opens another division (shareable from the search palette or a link).
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get(DIVISION_PARAM)
        if (id) setSelectedId(id)
    }, [])

    const viewed = useMemo(() => split?.divisions.find(d => d.id === selectedId) ?? own ?? split?.divisions[0], [split, selectedId, own])
    const select = useCallback((id: string) => {
        setSelectedId(id)
        const url = new URL(window.location.href)
        if (id === own?.id) url.searchParams.delete(DIVISION_PARAM)
        else url.searchParams.set(DIVISION_PARAM, id)
        window.history.replaceState(window.history.state, "", url.toString())
    }, [own])

    const teamsById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
    const groups = useMemo(() => divisionsByRegion(split), [split])
    const dayById = useMemo(() => new Map(scheduledMatches.filter(m => isLeagueMatchId(m.id)).map(m => [m.id, m.day])), [scheduledMatches])
    const completedIds = useMemo(() => new Set(completedMatches.filter(m => isLeagueMatchId(m.id) && (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)).map(m => m.id)), [completedMatches, playerTeamId])
    const outcome = useMemo(() => (playerTeamId ? previousSplitOutcome(league, playerTeamId) : null), [league, playerTeamId])

    if (!hydrated || (isLoading && !playerTeamId)) return <LoadingState message="Loading the league…" size="lg" className="min-h-[50vh]" />

    const playerTeam = playerTeamId ? teamsById.get(playerTeamId) : undefined
    const season = Math.floor((Math.max(1, currentWeek) - 1) / 52) + 1

    if (!split || !viewed) {
        return (
            <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
                <ScreenHeader eyebrow={`Season ${season} · Competition`} title="Regional league" subtitle="Every club plays a weekly league in its region, two splits a season." />
                <EmptyState
                    icon={ListOrdered}
                    title="No league split drawn yet"
                    description={`Clubs are drawn into divisions of about ten at the start of each split (season weeks ${LEAGUE_TUNING.SPLITS.map(s => s.drawWeek).join(" and ")}). Top ${LEAGUE_TUNING.PROMOTED} go up, bottom ${LEAGUE_TUNING.RELEGATED} go down.`}
                />
            </div>
        )
    }

    const ownBottom = own ? bottomLevelOf(split, own.region) : 1
    const ownRows = own ? leagueTableRows(own, ownBottom, playerTeamId) : []
    const me = ownRows.find(r => r.isPlayer)
    // Before the first round the order is only the draw (seeding).
    const started = ownRows.some(r => r.played > 0)
    const situation = own && playerTeamId ? tableSituation(ownRows, playerTeamId, own.level) : null
    const viewingOwn = !!own && viewed.id === own.id
    const level = own?.level ?? playerTeam?.leagueDivisionLevel
    const pools = LEAGUE_TUNING.SPLIT_PRIZE_POOL_BY_LEVEL
    const pool = level ? pools[Math.min(pools.length, level) - 1] : undefined
    const shares = LEAGUE_TUNING.SPLIT_PRIZE_SHARES
    const prizeNow = pool && me && started ? Math.round(pool * (shares[me.position - 1] ?? 0)) : 0

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Season ${split.season} · ${own ? splitProgressLabel(split, own) : `Split ${split.split}`}`}
                title={own?.name ?? "Regional league"}
                subtitle={own
                    ? [splitWeeksLabel(split), own.format === "DOUBLE" ? "home and away" : "single round robin", ...zoneRules(own.level, ownBottom)].join(" · ")
                    : "Your club is not in this split's draw; it joins at the next one."}
                leading={playerTeam && (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
                        <TeamLogoDisplay team={playerTeam} size={52} />
                    </div>
                )}
                aside={me && own && (
                    <KpiStrip>
                        <Kpi
                            label="Position"
                            value={started ? <>{ordinal(me.position)}<span className="text-ink-3">/{own.standings.length}</span></> : "—"}
                            hint={started
                                ? situation && <span className={TONE_TEXT[situation.tone]}>{situation.text}</span>
                                : `Seeded ${ordinal(me.position)} of ${own.standings.length}`}
                        />
                        <Kpi label="Points" value={me.points} hint={`${me.wins}W–${me.losses}L · ${me.played} played`} />
                        <Kpi label="Round diff" value={signed(me.roundDiff)} />
                        <Kpi label="League pay" value={formatCurrency(leagueCentralPayment(own.level), "$", true)} hint="per week at this level" />
                    </KpiStrip>
                )}
            />

            <DivisionSwitcher groups={groups} selectedId={viewed.id} ownId={own?.id} onSelect={select} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    <Panel
                        eyebrow={viewingOwn ? "Your division" : undefined}
                        title={viewed.name}
                        actions={
                            <>
                                <span className="text-xs tabular-nums text-ink-3">
                                    {splitProgressLabel(split, viewed)} · {viewed.standings.length} clubs · {viewed.format === "DOUBLE" ? "home and away" : "single round robin"}
                                </span>
                                {!viewingOwn && own && (
                                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => select(own.id)}>My division</Button>
                                )}
                            </>
                        }
                        padded={false}
                        className="overflow-hidden"
                    >
                        <LeagueTable division={viewed} bottomLevel={bottomLevelOf(split, viewed.region)} teamsById={teamsById} playerTeamId={playerTeamId} />
                    </Panel>
                    {split.completed && (
                        <p className="text-sm text-ink-3">Split {split.split} is over; these are the final tables. {nextDrawLabel(split)}.</p>
                    )}
                </div>

                <aside className="min-w-0 space-y-4">
                    {own && playerTeamId && (
                        <ClubLeagueFixtures
                            division={own}
                            teamId={playerTeamId}
                            teamsById={teamsById}
                            dayById={dayById}
                            completedIds={completedIds}
                            gameStartDate={gameStartDate}
                        />
                    )}

                    <Panel title="Last split">
                        {outcome ? (
                            <div className="space-y-2">
                                <p className="text-sm text-ink-1">{splitOutcomeText(outcome)}</p>
                                <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                                    <span>Season {outcome.season}, split {outcome.split}</span>
                                    {outcome.fate !== "stayed" && (
                                        <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", outcome.fate === "promoted" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")}>
                                            {outcome.fate === "promoted" ? "Promoted" : "Relegated"}
                                        </span>
                                    )}
                                    {outcome.champion && <span className="rounded-sm border border-gold/50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">Champions</span>}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-ink-3">This is your first split. Divisions were seeded from the world ranking; from now on the tables decide.</p>
                        )}
                    </Panel>

                    {own && pool !== undefined && (
                        <Panel title="League money" padded={false}>
                            <dl className="divide-y divide-line text-sm">
                                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                                    <dt className="text-ink-3">Central payment</dt>
                                    <dd className="tabular-nums text-ink-1">{formatCurrency(leagueCentralPayment(own.level), "$", false)} / week</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                                    <dt className="text-ink-3">Split prize pool</dt>
                                    <dd className="tabular-nums text-ink-1">{formatCurrency(pool, "$", false)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                                    <dt className="text-ink-3">Prize at {me && started ? ordinal(me.position) : "your place"} now</dt>
                                    <dd className={cn("tabular-nums", prizeNow > 0 ? "text-ink-1" : "text-ink-3")}>{prizeNow > 0 ? formatCurrency(prizeNow, "$", false) : started ? "None" : "—"}</dd>
                                </div>
                            </dl>
                            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
                                Paid when the split ends: {shares.map((s, i) => `${ordinal(i + 1)} ${Math.round(s * 100)}%`).join(", ")}. Promotion raises the weekly payment.
                            </p>
                        </Panel>
                    )}
                </aside>
            </div>
        </div>
    )
}
