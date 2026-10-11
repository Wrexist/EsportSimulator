"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import type { PlayerSaveData } from "@/engine/save-types"
import type { AcademyTrainingFocus, ScoutingTier } from "@/types/academy"
import {
    ACADEMY_DRILLS, ACADEMY_LEVELS, DEV_MATCH_CONFIG, ENERGY_CONFIG, PENDING_POOL_MAX_SIZE, SCOUTING_COSTS,
    SCOUTING_DURATIONS, SCOUTING_TIER_MANAGER_REQUIREMENTS, SCOUTING_TIER_REQUIREMENTS, calculateWeeklyUpkeep,
    isScoutingTierUnlocked,
} from "@/engine/academy-constants"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { employedScout } from "@/engine/recruitment"
import { getStaffPassiveBonuses } from "@/engine/talent-trees"
import { formatCurrency, formatRole } from "@/lib/utils-extended"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { ProspectsTable } from "./_components/ProspectsTable"
import {
    BENCH_XP_SHARE, DRILL_STAT_LABEL, POTENTIAL_REVEAL_WEEKS, PROMOTION_PROGRESS, PROMOTION_TERMS, SCOUT_TIER_LABEL,
} from "./_components/academy-facts"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const TIERS: ScoutingTier[] = ["LOCAL", "REGIONAL", "INTERNATIONAL"]

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
            <dt className="text-ink-3">{label}</dt>
            <dd className="text-right font-semibold tabular-nums text-ink-1">{value}</dd>
        </div>
    )
}

/**
 * Academy (Phase 4.2, simplified): one screen with the prospects, the weekly
 * drills that develop them, scouting for a new prospect and what the academy
 * level really does. The weekly academy changes are in the weekly report.
 */
export default function AcademyPage() {
    const s = useGameStore(useShallow(state => ({
        academyPlayers: state.academyPlayers,
        academyMatchHistory: state.academyMatchHistory,
        players: state.players,
        staff: state.staff,
        currentWeek: state.currentWeek,
        managerLevel: state.managerDetails?.level || 1,
        buildAcademy: state.buildAcademy,
        upgradeAcademy: state.upgradeAcademy,
        scoutProspect: state.scoutProspect,
        setProspectTraining: state.setProspectTraining,
        releaseProspect: state.releaseProspect,
        promoteProspect: state.promoteProspect,
        scheduleDevMatch: state.scheduleDevMatch,
        academyRoster: state.academyRoster,
        updateAcademyRoster: state.updateAcademyRoster,
        academyTrainingSchedule: state.academyTrainingSchedule,
        updateAcademySchedule: state.updateAcademySchedule,
        academyScoutingMissions: state.academyScoutingMissions,
        academyWeeklyReports: state.academyWeeklyReports,
        academyPendingProspects: state.academyPendingProspects,
        discardPendingProspect: state.discardPendingProspect,
        enrollPendingProspect: state.enrollPendingProspect,
    })))
    const team = useCurrentTeam()

    const playerById = useMemo(() => new Map(s.players.map(p => [p.id, p])), [s.players])
    const rows = useMemo(() => s.academyPlayers
        .map(prospect => ({ prospect, player: playerById.get(prospect.playerId) }))
        .filter((r): r is { prospect: typeof r.prospect; player: PlayerSaveData } => !!r.player)
        .sort((a, b) => Number(b.prospect.readyForPromotion) - Number(a.prospect.readyForPromotion) || b.prospect.developmentProgress - a.prospect.developmentProgress),
    [s.academyPlayers, playerById])

    if (!team) {
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">Loading academy…</div>
    }

    const level = team.academyFacility?.level || 0
    const info = level > 0 ? ACADEMY_LEVELS[level] : null
    const next = level < 5 ? ACADEMY_LEVELS[level + 1] : null
    const upkeep = calculateWeeklyUpkeep(level, s.academyPlayers.length)
    const ready = rows.filter(r => r.prospect.readyForPromotion).length
    const scout = employedScout(s.staff, team, s.currentWeek)
    const scoutDiscount = scout ? (getStaffPassiveBonuses("scout", scout.unlockedTalentIds || [])["scout_cost"] || 0) : 0
    const isFull = !!info && s.academyPlayers.length >= info.maxProspects
    const pending = (s.academyPendingProspects || []).map(id => playerById.get(id)).filter((p): p is PlayerSaveData => !!p)

    const scheduled = DAYS.map((_, i) => ACADEMY_DRILLS.find(d => d.id === s.academyTrainingSchedule[i] && d.minLevel <= level))
    const weeklyXp = scheduled.reduce((sum, d) => sum + (d?.xpGain || 0), 0) * (info?.devBonus ?? 1)
    const weeklyEnergy = scheduled.reduce((sum, d) => sum + (d?.energyCost || 0), 0)

    const starterIds = Object.values(s.academyRoster).filter(Boolean) as string[]
    const starters = s.academyPlayers.filter(p => starterIds.includes(p.id))
    const exhaustedStarters = starters.filter(p => (p.energy ?? 100) < ENERGY_CONFIG.exhaustionLimit)
    const matchBlock = level < DEV_MATCH_CONFIG.minAcademyLevel ? `Needs academy level ${DEV_MATCH_CONFIG.minAcademyLevel}`
        : starters.length < 5 ? `Needs 5 starters (${starters.length}/5 in "Plays as")`
            : exhaustedStarters.length ? "A starter is exhausted (under 5 energy)"
                : team.budget < DEV_MATCH_CONFIG.matchCost ? "Not enough budget" : null
    const lastMatch = s.academyMatchHistory[0]
    const report = s.academyWeeklyReports?.[0]

    const run = (result: { success: boolean; message: string }, ok: string) => {
        if (result.success) toast.success(ok, { description: result.message })
        else toast.error("Not possible", { description: result.message })
    }

    const setLineup = (prospectId: string, role: string | null) => {
        for (const [r, id] of Object.entries(s.academyRoster)) if (id === prospectId) s.updateAcademyRoster(r, null)
        if (role) s.updateAcademyRoster(role, prospectId)
    }

    if (!info) {
        const build = ACADEMY_LEVELS[1]
        return (
            <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
                <ScreenHeader eyebrow="Squad · Academy" title="Academy" subtitle="Scout teenagers, develop them through weekly drills and promote the ready ones." />
                <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm text-ink-2">
                            No academy yet. Building costs <span className="font-semibold text-ink-1">{formatCurrency(build.buildCost, "$", false)}</span> and{" "}
                            <span className="font-semibold text-ink-1">{formatCurrency(build.weeklyCost, "$", false)}/wk</span> plus $700/wk per prospect.
                            It holds {build.maxProspects} prospects and drills give ×{build.devBonus.toFixed(2)} XP.
                        </p>
                        <Button onClick={() => run(s.buildAcademy(team.id), "Academy built")} disabled={team.budget < build.buildCost}>Build academy</Button>
                    </div>
                </Panel>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={`Squad · Academy level ${level}`}
                title="Academy"
                subtitle={`${info.name}. Drills run at the weekly update; prospects who reach ${PROMOTION_PROGRESS} progress and the minimums can be promoted on ${formatCurrency(PROMOTION_TERMS.salaryPerWeek, "$", false)}/wk.`}
                aside={
                    <KpiStrip>
                        <Kpi label="Prospects" value={`${s.academyPlayers.length} / ${info.maxProspects}`} />
                        <Kpi label="Ready" value={ready} hint={ready ? "Can be promoted" : "None yet"} />
                        <Kpi label="Upkeep / wk" value={formatCurrency(upkeep, "$", false)} />
                    </KpiStrip>
                }
            />

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    <Panel title="Prospects" actions={<span className="text-xs text-ink-3">Starters get full drill XP, the bench {Math.round(BENCH_XP_SHARE * 100)}%</span>} padded={false}>
                        {rows.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">No prospects yet. Send a scout to find one.</p>
                        ) : (
                            <ProspectsTable
                                rows={rows}
                                academyLevel={level}
                                currentWeek={s.currentWeek}
                                academyRoster={s.academyRoster}
                                lastWeek={report}
                                onSetFocus={(id, focus: AcademyTrainingFocus) => s.setProspectTraining(id, focus)}
                                onSetLineup={setLineup}
                                onPromote={id => run(s.promoteProspect(id, PROMOTION_TERMS), "Prospect promoted")}
                                onRelease={id => run(s.releaseProspect(id), "Prospect released")}
                            />
                        )}
                    </Panel>

                    <Panel
                        title="Weekly drills"
                        actions={<span className="text-xs text-ink-3">Starter XP <span className="font-semibold tabular-nums text-ink-1">{Math.round(weeklyXp)}</span> · energy <span className={cn("font-semibold tabular-nums", weeklyEnergy < 0 ? "text-positive" : "text-ink-1")}>{weeklyEnergy > 0 ? `−${weeklyEnergy}` : weeklyEnergy < 0 ? `+${Math.abs(weeklyEnergy)}` : "0"}</span> before recovery</span>}
                    >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                            {DAYS.map((day, i) => {
                                const drill = scheduled[i]
                                return (
                                    <label key={day} className="block space-y-1.5">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{day}</span>
                                        <Select value={drill?.id ?? "NONE"} onValueChange={val => s.updateAcademySchedule(i, val === "NONE" ? null : val)}>
                                            <SelectTrigger className="h-9 w-full text-sm" aria-label={`${day} academy drill`}>
                                                <SelectValue>{drill?.name ?? "Rest"}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">Rest</SelectItem>
                                                {ACADEMY_DRILLS.map(d => (
                                                    <SelectItem key={d.id} value={d.id} disabled={d.minLevel > level}>
                                                        <span className="flex flex-col">
                                                            <span>{d.name}{d.minLevel > level ? ` · level ${d.minLevel}` : ""}</span>
                                                            <span className="text-xs text-ink-3">+{d.xpGain} XP · {d.energyCost > 0 ? `−${d.energyCost}` : `+${Math.abs(d.energyCost)}`} energy · {d.statFocus.map(st => DRILL_STAT_LABEL[st] ?? st).join(", ")}</span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </label>
                                )
                            })}
                        </div>
                        <p className="mt-3 text-xs text-ink-3">
                            Prospects only develop through drills: a week of rest days gives no XP. After the drills, starters recover {ENERGY_CONFIG.starterRecovery} energy and the bench {ENERGY_CONFIG.benchRecovery}.
                            {report ? ` "Last week" in the table is week ${((report.week - 1) % 52) + 1}'s result.` : ""}
                        </p>
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4">
                    <Panel
                        eyebrow={info.name}
                        title={`Academy level ${level}`}
                        actions={next ? (
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={team.budget < next.buildCost}
                                onClick={() => run(s.upgradeAcademy(team.id), "Academy upgraded")}>
                                Upgrade · {formatCurrency(next.buildCost)}
                            </Button>
                        ) : <span className="text-xs text-ink-3">Max level</span>}
                        padded={false}
                    >
                        <dl className="divide-y divide-line">
                            <Fact label="Places" value={next ? `${info.maxProspects} → ${next.maxProspects}` : `${info.maxProspects}`} />
                            <Fact label="Drill XP" value={next ? `×${info.devBonus.toFixed(2)} → ×${next.devBonus.toFixed(2)}` : `×${info.devBonus.toFixed(2)}`} />
                            <Fact label="Base upkeep" value={next ? `${formatCurrency(info.weeklyCost, "$", false)} → ${formatCurrency(next.weeklyCost, "$", false)}/wk` : `${formatCurrency(info.weeklyCost, "$", false)}/wk`} />
                            <Fact label="Potential shown after" value={level >= 5 ? "Enrolment" : `${POTENTIAL_REVEAL_WEEKS[level]} wks${next ? ` → ${level + 1 >= 5 ? "enrolment" : `${POTENTIAL_REVEAL_WEEKS[level + 1]} wks`}` : ""}`} />
                            <Fact label="Drills available" value={`${ACADEMY_DRILLS.filter(d => d.minLevel <= level).length} of ${ACADEMY_DRILLS.length}`} />
                            <Fact label="Development matches" value={level >= DEV_MATCH_CONFIG.minAcademyLevel ? "Open" : `Level ${DEV_MATCH_CONFIG.minAcademyLevel}`} />
                        </dl>
                        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Each prospect also costs $700/wk (stipend and materials).</p>
                    </Panel>

                    <Panel title="Scout a prospect" actions={<span className="text-xs text-ink-3">Review desk {pending.length}/{PENDING_POOL_MAX_SIZE}</span>} padded={false}>
                        {!scout && (
                            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                                <p className="text-sm text-ink-2">Missions need a hired scout.</p>
                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" asChild><Link href="/staff">Hire a scout</Link></Button>
                            </div>
                        )}
                        <ul className="divide-y divide-line">
                            {TIERS.map(tier => {
                                const unlocked = isScoutingTierUnlocked(tier, level, s.managerLevel)
                                const cost = Math.max(0, Math.round(SCOUTING_COSTS[tier] * (1 + scoutDiscount / 100)))
                                const active = s.academyScoutingMissions.find(m => m.tier === tier)
                                const block = !unlocked ? `Academy ${SCOUTING_TIER_REQUIREMENTS[tier]} or manager level ${SCOUTING_TIER_MANAGER_REQUIREMENTS[tier]}`
                                    : !scout ? "Needs a scout" : active ? null : pending.length >= PENDING_POOL_MAX_SIZE ? "Review desk is full"
                                        : team.budget < cost ? "Not enough budget" : null
                                return (
                                    <li key={tier} className="flex items-center gap-3 px-4 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-ink-1">{SCOUT_TIER_LABEL[tier]}</p>
                                            <p className="text-xs text-ink-3">{active ? `Back in ${active.weeksRemaining} wk${active.weeksRemaining === 1 ? "" : "s"}` : block ?? `${SCOUTING_DURATIONS[tier]} wk${SCOUTING_DURATIONS[tier] > 1 ? "s" : ""} · one prospect`}</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-8 w-24 px-3 text-xs" disabled={!!block || !!active}
                                            onClick={() => run(s.scoutProspect(tier), "Scout sent")}>
                                            {active ? "Out" : formatCurrency(cost, "$", false)}
                                        </Button>
                                    </li>
                                )
                            })}
                        </ul>
                        {pending.length > 0 && (
                            <>
                                <p className="border-t border-line px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Awaiting review</p>
                                <ul className="divide-y divide-line">
                                    {pending.map(p => (
                                        <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised"><PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.nickname} size={36} /></span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-ink-1">{p.nickname}</p>
                                                <p className="text-xs text-ink-3">{p.age} yrs · {formatRole(p.role)} · potential hidden</p>
                                            </div>
                                            <RatingChip value={evaluatePlayer(p, undefined, undefined, s.currentWeek).overallRating} size="sm" />
                                            <div className="flex gap-1">
                                                <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={isFull} title={isFull ? "Academy is full" : undefined}
                                                    onClick={() => run(s.enrollPendingProspect(p.id), "Prospect enrolled")}>Enroll</Button>
                                                <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => s.discardPendingProspect(p.id)}>Pass</Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Panel>

                    <Panel
                        title="Development match"
                        actions={
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!!matchBlock} title={matchBlock ?? undefined}
                                onClick={() => run(s.scheduleDevMatch(), "Match played")}>
                                Play · {formatCurrency(DEV_MATCH_CONFIG.matchCost, "$", false)}
                            </Button>
                        }
                    >
                        <p className="text-sm text-ink-3">{matchBlock ?? `Your five starters play another academy: XP and progress for each, −${ENERGY_CONFIG.matchCost} energy.`}</p>
                        {lastMatch && (
                            <p className="mt-2 text-sm">
                                <span className={cn("font-semibold", lastMatch.won ? "text-positive" : "text-negative")}>{lastMatch.won ? "W" : "L"}</span>
                                <span className="text-ink-2"> {lastMatch.scoreHome}–{lastMatch.scoreAway} vs {lastMatch.opponentName}</span>
                                <span className="text-ink-3"> · week {lastMatch.week}</span>
                            </p>
                        )}
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
