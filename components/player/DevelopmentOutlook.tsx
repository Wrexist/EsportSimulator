"use client"
import { Trans } from "@/lib/trans"
import { t, tn } from "@/lib/i18n"

import { AGE_CURVE, lastsLonger } from "@/engine/development-rates"
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData } from "@/engine/save-types"
import { developmentOutlook } from "@/engine/development-outlook"
import { potentialOvr } from "@/lib/potential-ovr"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"


function pct(m: number) {
    const v = Math.round((m - 1) * 100)
    return `${v > 0 ? "+" : "−"}${Math.abs(v)}%`
}

/**
 * What raises and lowers this player's numbers, from the formulas the week
 * applies (engine/development-outlook.ts). Answers "is training working?" and
 * "how do I raise potential?" in the player's own terms.
 */
export function DevelopmentOutlook({ player }: { player: PlayerSaveData }) {
    const { teams, staff, players, playerTeamId, currentWeek } = useGameStore(useShallow(s => ({
        teams: s.teams, staff: s.staff, players: s.players, playerTeamId: s.playerTeamId, currentWeek: s.currentWeek,
    })))
    const outlook = useMemo(() => {
        const team = teams.find(t => t.rosterIds?.includes(player.id))
        const byId = new Map(players.map(p => [p.id, p]))
        return developmentOutlook({ player, team, playerTeamId, staff, lookup: id => byId.get(id), currentWeek })
    }, [player, teams, staff, players, playerTeamId, currentWeek])

    const moving = outlook.forecast.filter(f => f.after - f.now >= 0.05)
    return (
        <Panel title={t("outlook.title")} eyebrow={tn("outlook.next", outlook.weeks)}>
            <div className="grid gap-5 md:grid-cols-2">
                <div className="min-w-0 space-y-3">
                    <p className="text-sm text-ink-2">
                        {outlook.trainsWithClub
                            ? <Trans k={outlook.weeklyGain > 0 ? (outlook.focusIsPersonal ? "outlook.trainsPersonalGain" : "outlook.trainsClubGain") : (outlook.focusIsPersonal ? "outlook.trainsPersonal" : "outlook.trainsClub")} params={{ focus: t(`focus.${outlook.focus}`), gain: outlook.weeklyGain.toFixed(2) }} tags={{ b: s => <span className="font-semibold text-ink-1">{s}</span> }} />
                            : t("outlook.notTraining")}
                    </p>
                    {outlook.trainsWithClub && (
                        moving.length > 0 ? (
                            <ul className="divide-y divide-line rounded-md border border-line">
                                {moving.map(f => (
                                    <li key={f.stat} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                        <span className="text-ink-3">{t(`attr.${f.stat}`)}</span>
                                        <span className="tabular-nums text-ink-1">{Math.round(f.now)} → <span className="font-semibold text-positive">{Math.round(f.after * 10) / 10}</span></span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="rounded-md border border-line px-3 py-2 text-sm text-ink-3">
                                {outlook.focus === "Rest" ? t("outlook.rest") : t("outlook.atPotential")}
                            </p>
                        )
                    )}
                    {outlook.factors.length > 0 && (
                        <p className="flex flex-wrap gap-1.5 text-xs">
                            {outlook.factors.map(f => (
                                <span key={f.label} className={cn("rounded border px-1.5 py-0.5 tabular-nums", f.multiplier >= 1 ? "border-positive/40 text-positive" : "border-negative/40 text-negative")}>
                                    {f.label} {pct(f.multiplier)}
                                </span>
                            ))}
                        </p>
                    )}
                </div>
                <dl className="min-w-0 space-y-2 text-sm">
                    <div>
                        <dt className="font-semibold text-ink-1">{t("outlook.potential", { n: potentialOvr(player, currentWeek) })}</dt>
                        <dd className="text-ink-3">{t("outlook.ceiling")}{outlook.atCeiling ? ` ${t("outlook.reached")}` : ""}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">{t("outlook.raising")}</dt>
                        <dd className="text-ink-3">
                            {outlook.breakthrough
                                ? t("outlook.breakthroughOn")
                                : t("outlook.breakthroughOff")}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">{t("outlook.natural")}</dt>
                        <dd className="text-ink-3">
                            {outlook.naturalPerSeason > 0.05
                                ? t("outlook.naturalGrowth", { n: outlook.naturalPerSeason.toFixed(1) })
                                : (player.age ?? 22) > 24 ? t("outlook.naturalNoneAge") : t("outlook.naturalNonePotential")}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">{t("outlook.decline")}</dt>
                        <dd className="text-ink-3">
                            {outlook.declinePerSeason > 0
                                ? t(lastsLonger(player.role, player.secondaryRole) ? "outlook.declineOnSlow" : "outlook.declineOn", { n: outlook.declinePerSeason.toFixed(1) })
                                : t("outlook.declineLater", { age: AGE_CURVE.CEILING_LOSS[0][0] })}
                        </dd>
                    </div>
                </dl>
            </div>
        </Panel>
    )
}
