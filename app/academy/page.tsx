"use client"
import { Trans } from "@/lib/trans"
import { intlLocale, t, tn } from "@/lib/i18n"

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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { ProspectsTable } from "./_components/ProspectsTable"
import {
    BENCH_XP_SHARE, drillStatName, POTENTIAL_REVEAL_WEEKS, PROMOTION_PROGRESS, promotionTerms,
} from "./_components/academy-facts"

/** Day slots Monday to Sunday; the label is t(`ac.day.${i}`). */
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const TIERS: ScoutingTier[] = ["LOCAL", "REGIONAL", "INTERNATIONAL"]

/** Two-decimal multiplier in the player's number format. */
const fmt2 = (n: number) => n.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
        return <div role="status" className="mx-auto max-w-[1600px] py-10 text-sm text-ink-3">{t("ac.loading")}</div>
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
    const matchBlock = level < DEV_MATCH_CONFIG.minAcademyLevel ? t("ac.block.level", { n: DEV_MATCH_CONFIG.minAcademyLevel })
        : starters.length < 5 ? t("ac.block.starters", { n: starters.length })
            : exhaustedStarters.length ? t("ac.block.exhausted")
                : team.budget < DEV_MATCH_CONFIG.matchCost ? t("ac.block.budget") : null
    const lastMatch = s.academyMatchHistory[0]
    const report = s.academyWeeklyReports?.[0]

    // SQUAD-23: `detail: false` when the store's message only repeats the title.
    const run = (result: { success: boolean; message: string }, ok: string, detail = true) => {
        if (result.success) toast.success(ok, detail ? { description: result.message } : undefined)
        else toast.error(t("ac.notPossible"), { description: result.message })
    }

    const setLineup = (prospectId: string, role: string | null) => {
        for (const [r, id] of Object.entries(s.academyRoster)) if (id === prospectId) s.updateAcademyRoster(r, null)
        if (role) s.updateAcademyRoster(role, prospectId)
    }

    if (!info) {
        const build = ACADEMY_LEVELS[1]
        return (
            <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
                <ScreenHeader eyebrow={t("ac.eyebrow")} title={t("ac.title")} subtitle={t("ac.subtitleNone")} />
                <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm text-ink-2">
                            <Trans k="ac.buildBody" params={{ cost: formatCurrency(build.buildCost, "$", false), weekly: formatCurrency(build.weeklyCost, "$", false), max: build.maxProspects, bonus: fmt2(build.devBonus) }}
                                tags={{ b: x => <span className="font-semibold text-ink-1">{x}</span> }} />
                        </p>
                        {/* SQUAD-12: the academy can't be sold or refunded, so confirm the spend. */}
                        <ConfirmDialog
                            title={t("ac.confirm.buildTitle")}
                            description={t("ac.confirm.body", { cost: formatCurrency(build.buildCost, "$", false), upkeep: formatCurrency(calculateWeeklyUpkeep(1, 0), "$", false), after: formatCurrency(team.budget - build.buildCost, "$", false) })}
                            confirmText={t("ac.build")}
                            icon="warning"
                            onConfirm={() => run(s.buildAcademy(team.id), t("ac.built"), false)}
                        >
                            <Button disabled={team.budget < build.buildCost}>{t("ac.build")}</Button>
                        </ConfirmDialog>
                    </div>
                </Panel>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
            <ScreenHeader
                eyebrow={t("ac.eyebrowLevel", { n: level })}
                title={t("ac.title")}
                subtitle={t("ac.subtitle", { name: t(`ac.level.${level}`), progress: PROMOTION_PROGRESS })}
                aside={
                    <KpiStrip>
                        <Kpi label={t("ac.kpi.prospects")} value={`${s.academyPlayers.length} / ${info.maxProspects}`} />
                        <Kpi label={t("ac.kpi.ready")} value={ready} hint={ready ? t("ac.kpi.canPromote") : t("ac.kpi.noneYet")} />
                        <Kpi label={t("ac.kpi.upkeep")} value={formatCurrency(upkeep, "$", false)} />
                    </KpiStrip>
                }
            />

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    <Panel title={t("ac.prospects")} actions={<span className="text-xs text-ink-3">{t("ac.benchShare", { pct: Math.round(BENCH_XP_SHARE * 100) })}</span>} padded={false}>
                        {rows.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-ink-3">{t("ac.noProspects")}</p>
                        ) : (
                            <ProspectsTable
                                rows={rows}
                                team={team}
                                academyLevel={level}
                                currentWeek={s.currentWeek}
                                academyRoster={s.academyRoster}
                                lastWeek={report}
                                onSetFocus={(id, focus: AcademyTrainingFocus) => s.setProspectTraining(id, focus)}
                                onSetLineup={setLineup}
                                onPromote={id => {
                                    const row = rows.find(r => r.prospect.id === id)
                                    if (row) run(s.promoteProspect(id, promotionTerms(row.player, s.currentWeek, team)), t("ac.promoted"))
                                }}
                                onRelease={id => run(s.releaseProspect(id), t("ac.released"))}
                            />
                        )}
                    </Panel>

                    <Panel
                        title={t("ac.drills")}
                        actions={<span className="text-xs text-ink-3"><Trans k="ac.drillsSummary" params={{ xp: Math.round(weeklyXp), energy: weeklyEnergy > 0 ? `−${weeklyEnergy}` : weeklyEnergy < 0 ? `+${Math.abs(weeklyEnergy)}` : "0" }}
                            tags={{ b: x => <span className="font-semibold tabular-nums text-ink-1">{x}</span>, e: x => <span className={cn("font-semibold tabular-nums", weeklyEnergy < 0 ? "text-positive" : "text-ink-1")}>{x}</span> }} /></span>}
                    >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                            {DAYS.map(i => {
                                const drill = scheduled[i]
                                const day = t(`ac.day.${i}`)
                                return (
                                    <label key={i} className="block space-y-1.5">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{day}</span>
                                        <Select value={drill?.id ?? "NONE"} onValueChange={val => s.updateAcademySchedule(i, val === "NONE" ? null : val)}>
                                            <SelectTrigger className="h-9 w-full text-sm" aria-label={t("ac.dayDrill", { day })}>
                                                <SelectValue>{drill ? t(`ac.drill.${drill.id}`) : t("ac.rest")}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">{t("ac.rest")}</SelectItem>
                                                {ACADEMY_DRILLS.map(d => (
                                                    <SelectItem key={d.id} value={d.id} disabled={d.minLevel > level}>
                                                        <span className="flex flex-col">
                                                            <span>{t(`ac.drill.${d.id}`)}{d.minLevel > level ? t("ac.levelReq", { n: d.minLevel }) : ""}</span>
                                                            <span className="text-xs text-ink-3">{t("ac.drillLine", { xp: d.xpGain, energy: d.energyCost > 0 ? `−${d.energyCost}` : `+${Math.abs(d.energyCost)}`, stats: d.statFocus.map(drillStatName).join(", ") })}</span>
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
                            {t("ac.drillsNote", { starter: ENERGY_CONFIG.starterRecovery, bench: ENERGY_CONFIG.benchRecovery })}
                            {report ? t("ac.lastWeekNote", { week: ((report.week - 1) % 52) + 1 }) : ""}
                        </p>
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4">
                    <Panel
                        eyebrow={t(`ac.level.${level}`)}
                        title={t("ac.levelTitle", { n: level })}
                        actions={next ? (
                            <ConfirmDialog
                                title={t("ac.confirm.upgradeTitle", { n: level + 1 })}
                                description={t("ac.confirm.body", { cost: formatCurrency(next.buildCost, "$", false), upkeep: formatCurrency(calculateWeeklyUpkeep(level + 1, s.academyPlayers.length), "$", false), after: formatCurrency(team.budget - next.buildCost, "$", false) })}
                                confirmText={t("ac.upgrade", { cost: formatCurrency(next.buildCost) })}
                                icon="warning"
                                onConfirm={() => run(s.upgradeAcademy(team.id), t("ac.upgraded"), false)}
                            >
                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={team.budget < next.buildCost}>
                                    {t("ac.upgrade", { cost: formatCurrency(next.buildCost) })}
                                </Button>
                            </ConfirmDialog>
                        ) : <span className="text-xs text-ink-3">{t("ac.maxLevel")}</span>}
                        padded={false}
                    >
                        <dl className="divide-y divide-line">
                            <Fact label={t("ac.fact.places")} value={next ? `${info.maxProspects} → ${next.maxProspects}` : `${info.maxProspects}`} />
                            <Fact label={t("ac.fact.drillXp")} value={next ? `×${fmt2(info.devBonus)} → ×${fmt2(next.devBonus)}` : `×${fmt2(info.devBonus)}`} />
                            <Fact label={t("ac.fact.upkeep")} value={next ? `${formatCurrency(info.weeklyCost, "$", false)} → ${t("ac.perWeek", { amount: formatCurrency(next.weeklyCost, "$", false) })}` : t("ac.perWeek", { amount: formatCurrency(info.weeklyCost, "$", false) })} />
                            <Fact label={t("ac.fact.reveal")} value={level >= 5 ? t("ac.enrolment") : `${t("ac.wks", { n: POTENTIAL_REVEAL_WEEKS[level] })}${next ? ` → ${level + 1 >= 5 ? t("ac.enrolmentLower") : t("ac.wks", { n: POTENTIAL_REVEAL_WEEKS[level + 1] })}` : ""}`} />
                            <Fact label={t("ac.fact.drills")} value={t("ac.nOfM", { n: ACADEMY_DRILLS.filter(d => d.minLevel <= level).length, m: ACADEMY_DRILLS.length })} />
                            <Fact label={t("ac.fact.devMatches")} value={level >= DEV_MATCH_CONFIG.minAcademyLevel ? t("ac.open") : t("ac.levelN", { n: DEV_MATCH_CONFIG.minAcademyLevel })} />
                        </dl>
                        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">{t("ac.stipend")}</p>
                    </Panel>

                    <Panel title={t("ac.scoutTitle")} actions={<span className="text-xs text-ink-3">{t("ac.reviewDesk", { n: pending.length, max: PENDING_POOL_MAX_SIZE })}</span>} padded={false}>
                        {!scout && (
                            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                                <p className="text-sm text-ink-2">{t("ac.needScout")}</p>
                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" asChild><Link href="/staff">{t("ac.hireScout")}</Link></Button>
                            </div>
                        )}
                        <ul className="divide-y divide-line">
                            {TIERS.map(tier => {
                                const unlocked = isScoutingTierUnlocked(tier, level, s.managerLevel)
                                const cost = Math.max(0, Math.round(SCOUTING_COSTS[tier] * (1 + scoutDiscount / 100)))
                                const active = s.academyScoutingMissions.find(m => m.tier === tier)
                                const block = !unlocked ? t("ac.tierBlock", { level: SCOUTING_TIER_REQUIREMENTS[tier], manager: SCOUTING_TIER_MANAGER_REQUIREMENTS[tier] })
                                    : !scout ? t("ac.needsScout") : active ? null : pending.length >= PENDING_POOL_MAX_SIZE ? t("ac.deskFull")
                                        : team.budget < cost ? t("ac.block.budget") : null
                                return (
                                    <li key={tier} className="flex items-center gap-3 px-4 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-ink-1">{t(`ac.tier.${tier}`)}</p>
                                            <p className="text-xs text-ink-3">{active ? tn("ac.backIn", active.weeksRemaining) : block ?? tn("ac.mission", SCOUTING_DURATIONS[tier])}</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-8 w-24 px-3 text-xs" disabled={!!block || !!active}
                                            onClick={() => run(s.scoutProspect(tier), t("ac.scoutSent"))}>
                                            {active ? t("ac.out") : formatCurrency(cost, "$", false)}
                                        </Button>
                                    </li>
                                )
                            })}
                        </ul>
                        {pending.length > 0 && (
                            <>
                                <p className="border-t border-line px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("ac.awaiting")}</p>
                                <ul className="divide-y divide-line">
                                    {pending.map(p => (
                                        <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised"><PlayerPortrait src={p.portraitPath} seed={p.id} alt={p.nickname} size={36} /></span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-ink-1">{p.nickname}</p>
                                                <p className="text-xs text-ink-3">{t("ac.pendingLine", { age: p.age, role: formatRole(p.role) })}</p>
                                            </div>
                                            <RatingChip value={evaluatePlayer(p, undefined, undefined, s.currentWeek).overallRating} size="sm" />
                                            <div className="flex gap-1">
                                                <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={isFull} title={isFull ? t("ac.full") : undefined}
                                                    onClick={() => run(s.enrollPendingProspect(p.id), t("ac.enrolled"))}>{t("ac.enroll")}</Button>
                                                <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => s.discardPendingProspect(p.id)}>{t("ac.pass")}</Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </Panel>

                    <Panel
                        title={t("ac.devMatch")}
                        actions={
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!!matchBlock} title={matchBlock ?? undefined}
                                onClick={() => run(s.scheduleDevMatch(), t("ac.played"))}>
                                {t("ac.play", { cost: formatCurrency(DEV_MATCH_CONFIG.matchCost, "$", false) })}
                            </Button>
                        }
                    >
                        <p className="text-sm text-ink-3">{matchBlock ?? t("ac.devMatchBody", { energy: ENERGY_CONFIG.matchCost })}</p>
                        {lastMatch && (
                            <p className="mt-2 text-sm">
                                <span className={cn("font-semibold", lastMatch.won ? "text-positive" : "text-negative")}>{lastMatch.won ? t("common.win.short") : t("common.loss.short")}</span>
                                <span className="text-ink-2"> {t("ac.lastMatch", { home: lastMatch.scoreHome, away: lastMatch.scoreAway, opponent: lastMatch.opponentName })}</span>
                                <span className="text-ink-3">{t("ac.weekN", { n: lastMatch.week })}</span>
                            </p>
                        )}
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
