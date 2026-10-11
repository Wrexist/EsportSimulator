"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { getBoardSanctionedFee, getTierTargets } from "@/engine/board-expectations"
import { BOARD_TUNING, LEAGUE_TUNING } from "@/lib/balance-tuning"
import { boardStartTargets } from "@/lib/club-expectations"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { LoadingState } from "@/components/ui/loading"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Sparkline } from "@/src/components/ui/Sparkline"
import { BOARD_TONE_TEXT, BoardConfidenceScale } from "@/components/career/BoardConfidence"
import {
    BOARD_THRESHOLDS,
    boardStatus,
    boardWeeks,
    confidenceTrail,
    graceWeeksLeft,
    objectiveView,
    signedDelta,
} from "@/components/career/board-view"

const T = BOARD_TUNING
const STATUS_CHIP: Record<string, string> = {
    positive: "bg-positive/15 text-positive",
    neutral: "bg-raised text-ink-2",
    caution: "bg-caution/15 text-caution",
    negative: "bg-negative/15 text-negative",
}

/** What the weekly update and the reviews do, straight from BOARD_TUNING. */
const WEEKLY_RULES: Array<[string, string]> = [
    ["Win", `+${T.RESULT_WIN} · +${T.UPSET_WIN} against a side ${T.UPSET_ELO_GAP}+ Elo stronger · +${T.EXPECTED_WIN} against a weaker one`],
    ["Loss", `${T.RESULT_LOSS} · ${T.EXPECTED_LOSS} against a side ${T.UPSET_ELO_GAP}+ Elo weaker · ${T.UPSET_LOSS} against a stronger one`],
    ["Title", `+${T.TITLE} · +${T.TITLE_S_TIER} for an S-tier event`],
    ["League table", `+${T.LEAGUE_ON_TRACK} a week inside the target, ${T.LEAGUE_BEHIND} outside it (from ${T.LEAGUE_MIN_PLAYED} league games)`],
    ["Finances", `${T.FINANCE_RISK} at risk · ${T.FINANCE_CRISIS} in crisis · ${T.FINANCE_INSOLVENT} insolvent`],
    ["Cap", `At most ±${T.WEEKLY_MAX_MOVE} in one week`],
]

const REVIEW_RULES: Array<[string, string]> = [
    ["League", `After each split (weeks ${LEAGUE_TUNING.SPLITS[1].drawWeek} and 52): 2+ places better than the target +${T.REVIEW_LEAGUE_EXCEEDED}, met +${T.REVIEW_LEAGUE_MET}, missed by up to 2 places ${T.REVIEW_LEAGUE_MISSED}, worse ${T.REVIEW_LEAGUE_FAILED}`],
    ["Ranking", `Season end: 3+ places better than the target +${T.REVIEW_RANK_EXCEEDED}, met +${T.REVIEW_RANK_MET}, missed by up to 5 places ${T.REVIEW_RANK_MISSED}, worse ${T.REVIEW_RANK_FAILED}`],
    ["Budget", `Half weight at mid-season (+${T.REVIEW_FINANCE_MET / 2} / ${T.REVIEW_FINANCE_MISSED / 2}), full at season end (+${T.REVIEW_FINANCE_MET} / ${T.REVIEW_FINANCE_MISSED})`],
]

/**
 * Club → Board (Phase 4.7). The board is the manager's employer, so its view
 * sits next to the Manager profile in the Club hub: this season's objectives
 * with live progress, the confidence meter with every weekly move and its
 * cause, the warning ladder with the engine's real thresholds, and the last
 * formal review.
 */
export default function BoardPage() {
    const { hydrated, isLoading, playerTeamId, teams, boardState, currentWeek, managerDetails } = useGameStore(useShallow(s => ({
        hydrated: s._hasHydrated,
        isLoading: s.isLoading,
        playerTeamId: s.playerTeamId,
        teams: s.teams,
        boardState: s.boardState,
        currentWeek: s.currentWeek,
        managerDetails: s.managerDetails,
    })))
    const team = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    const weeks = useMemo(() => boardWeeks(boardState?.history), [boardState?.history])
    const trail = useMemo(() => (boardState ? confidenceTrail(boardState.confidence, boardState.history) : []), [boardState])

    if (!hydrated || isLoading || !playerTeamId) return <LoadingState message="Loading the board…" size="lg" className="min-h-[50vh]" />

    const season = Math.floor((Math.max(1, currentWeek) - 1) / 52) + 1
    const graceLeft = graceWeeksLeft(currentWeek, managerDetails?.tenureStartWeek)
    const status = boardStatus(boardState, graceLeft)
    const confidence = Math.round(boardState?.confidence ?? T.NEW_BOARD_CONFIDENCE)
    const fallback = boardStartTargets(team?.worldRanking, team?.reputation)
    const tier = getTierTargets(boardState?.seasonExpectation ?? fallback.tier)
    const objectives = (boardState?.objectives ?? []).map(objectiveView)
    const warnings = boardState?.warnings ?? (boardState?.onNotice ? 2 : 0)
    const lastWeek = weeks.find(w => w.week === currentWeek) ?? null
    const sanctioned = boardState && team ? getBoardSanctionedFee(boardState, team.budget) : null
    const review = boardState?.lastReview

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Season ${season} · Club`}
                title="Board"
                subtitle={`${tier.label}. ${tier.blurb}`}
                leading={team && (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-line bg-panel">
                        <TeamLogoDisplay team={team} size={52} />
                    </div>
                )}
                aside={
                    <KpiStrip>
                        <Kpi label="Confidence" value={<>{confidence}<span className="text-ink-3">/100</span></>} hint={<span className={BOARD_TONE_TEXT[status.tone]}>{status.label}</span>} />
                        <Kpi label="Last update" value={lastWeek ? signedDelta(lastWeek.total) : "0"} hint={lastWeek ? `${lastWeek.moves.length} cause${lastWeek.moves.length === 1 ? "" : "s"}` : "No move recorded"} />
                        <Kpi label="Warnings" value={<>{Math.min(2, warnings)}<span className="text-ink-3">/2</span></>} hint={warnings >= 2 ? "Final warning" : warnings === 1 ? "One warning" : "None"} />
                    </KpiStrip>
                }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0 space-y-4">
                    <Panel title="Season objectives" actions={<Link href="/league" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink-1">League table <ArrowUpRight size={12} /></Link>} padded={false}>
                        {objectives.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-ink-3">The board sets this season&apos;s objectives at the first weekly update.</p>
                        ) : (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="pl-4">Objective</th>
                                        <th data-slot="table-head" className="px-3 text-right">Target</th>
                                        <th data-slot="table-head" className="px-3 text-right">Now</th>
                                        <th data-slot="table-head" className="px-3">Gap</th>
                                        <th data-slot="table-head" className="pr-4 text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {objectives.map(o => (
                                        <tr key={o.id} data-slot="table-row" className="h-12 border-b border-line last:border-b-0">
                                            <td className="py-2 pl-4 pr-3 text-sm text-ink-1">{o.label}</td>
                                            <td className="whitespace-nowrap px-3 text-right text-sm tabular-nums text-ink-2">{o.target}</td>
                                            <td className="whitespace-nowrap px-3 text-right font-display text-lg font-bold tabular-nums text-ink-1">{o.current}</td>
                                            <td className="whitespace-nowrap px-3 text-xs text-ink-3">{o.gap ?? "—"}</td>
                                            <td className="pr-4 text-right">
                                                <span className={cn("inline-flex rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]", STATUS_CHIP[o.tone])}>{o.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-xs">
                            {REVIEW_RULES.map(([k, v]) => (
                                <div key={k} className="flex gap-3">
                                    <dt className="w-16 shrink-0 font-semibold text-ink-2">{k}</dt>
                                    <dd className="text-ink-3">{v}</dd>
                                </div>
                            ))}
                            <p className="pt-1 text-ink-3">No review in your first {T.TENURE_GRACE_WEEKS} weeks in a job; a season review needs 13 weeks in charge.</p>
                        </dl>
                    </Panel>

                    <Panel
                        title="Confidence history"
                        actions={trail.length > 1 && (
                            <span className="flex items-center gap-2 text-xs tabular-nums text-ink-3">
                                {Math.round(trail[0])}
                                <Sparkline values={trail} min={Math.max(0, Math.min(...trail) - 4)} max={Math.min(100, Math.max(...trail) + 4)} baseline={T.WARN_BELOW} width={160} height={28} label={`Board confidence over the last ${trail.length - 1} recorded weeks`} />
                                <span className="text-ink-1">{confidence}</span>
                            </span>
                        )}
                        padded={false}
                    >
                        {weeks.length === 0 ? (
                            <p className="px-4 py-4 text-sm text-ink-3">No moves yet. Every week the board reacts to results, the league table and the books; each move lands here with its cause.</p>
                        ) : (
                            <table data-slot="table" className="w-full border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <th data-slot="table-head" className="w-20 pl-4">Week</th>
                                        <th data-slot="table-head">Cause</th>
                                        <th data-slot="table-head" className="w-20 pr-4 text-right">Move</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weeks.map(w => w.moves.map((m, i) => (
                                        <tr key={`${w.week}_${i}`} data-slot="table-row" className={cn("h-10 border-line", i === w.moves.length - 1 ? "border-b" : "")}>
                                            <td className="pl-4 align-middle text-sm tabular-nums text-ink-3">{i === 0 ? ((w.week - 1) % 52) + 1 : ""}</td>
                                            <td className="py-1.5 pr-3 text-sm text-ink-1">{m.cause}</td>
                                            <td className={cn("pr-4 text-right text-sm font-semibold tabular-nums", m.delta > 0 ? "text-positive" : m.delta < 0 ? "text-negative" : "text-ink-3")}>{signedDelta(m.delta)}</td>
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        )}
                        {weeks.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">The last {T.HISTORY_LENGTH} moves are kept. Weeks are season weeks.</p>}
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4">
                    <Panel title="Job security" actions={<span className={cn("text-xs font-semibold", BOARD_TONE_TEXT[status.tone])}>{status.label}</span>}>
                        <div className="flex items-end gap-3">
                            <p className="font-display text-[56px] font-bold leading-none tabular-nums text-ink-1">{confidence}</p>
                            <p className="pb-1.5 text-sm text-ink-3">/ 100 board confidence</p>
                        </div>
                        <p className={cn("mt-2 text-sm", status.tone === "negative" ? "text-negative" : status.tone === "caution" ? "text-caution" : "text-ink-2")}>{status.detail}</p>
                        <BoardConfidenceScale value={confidence} className="mt-5" />
                        <ul className="mt-1 divide-y divide-line border-y border-line text-sm">
                            {BOARD_THRESHOLDS.map(t => {
                                const active = (t.label === "Warning" && status.standing === "warning")
                                    || (t.label === "On notice" && status.standing === "notice")
                                    || (t.label === "Recovery" && warnings > 0)
                                return (
                                    <li key={t.label} className={cn("flex items-center justify-between gap-3 py-2", active ? "text-ink-1" : "text-ink-3")}>
                                        <span className="flex items-center gap-2">
                                            <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-gold" : "bg-line-strong")} />
                                            {t.rule}
                                        </span>
                                        <span className="shrink-0 font-semibold tabular-nums">{t.at}</span>
                                    </li>
                                )
                            })}
                        </ul>
                        {graceLeft > 0 && <p className="mt-3 text-xs text-ink-3">New in the job: no warnings or dismissal for {graceLeft} more week{graceLeft === 1 ? "" : "s"}.</p>}
                        {sanctioned && (
                            <p className="mt-3 text-xs text-ink-3">
                                {sanctioned.fraction < 1
                                    ? <>Transfer fees are capped at {Math.round(sanctioned.fraction * 100)}% of funds ({formatCurrency(sanctioned.maxFee)}) at this confidence; the full budget opens at 70.</>
                                    : <>The board backs any transfer fee up to your full funds ({formatCurrency(sanctioned.maxFee)}).</>}
                            </p>
                        )}
                    </Panel>

                    <Panel title="Last review" actions={review && <span className="text-xs tabular-nums text-ink-3">Week {((review.week - 1) % 52) + 1}</span>}>
                        {review ? (
                            <div className="space-y-2">
                                <div className="flex items-baseline justify-between gap-3">
                                    <p className="text-sm font-semibold text-ink-1">{review.kind === "MID_SEASON" ? "Mid-season review" : "Season review"}</p>
                                    <p className={cn("text-sm font-semibold tabular-nums", review.delta >= 0 ? "text-positive" : "text-negative")}>{signedDelta(review.delta)} → {Math.round(review.confidence)}</p>
                                </div>
                                <ul className="space-y-1 text-sm text-ink-2">
                                    {review.summary.split(". ").filter(Boolean).map((line, i) => <li key={i}>{line.replace(/\.$/, "")}.</li>)}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-ink-3">No formal review yet. The board judges the league objective after split 1 (week {LEAGUE_TUNING.SPLITS[1].drawWeek}) and everything at season end (week 52).</p>
                        )}
                    </Panel>

                    <Panel title="What moves confidence each week" padded={false}>
                        <dl className="divide-y divide-line text-sm">
                            {WEEKLY_RULES.map(([k, v]) => (
                                <div key={k} className="flex gap-3 px-4 py-2">
                                    <dt className="w-24 shrink-0 text-ink-3">{k}</dt>
                                    <dd className="text-ink-2">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    </Panel>
                </aside>
            </div>
        </div>
    )
}
