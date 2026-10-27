"use client"

import { AGE_CURVE, lastsLonger } from "@/engine/development-rates"
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData } from "@/engine/save-types"
import { developmentOutlook } from "@/engine/development-outlook"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"

const STAT_LABEL: Record<string, string> = {
    rifle: "Rifle", awp: "AWP", pistol: "Pistol", reaction: "Reaction", skill: "Skill",
    tactic: "Tactics", grenades: "Utility", creativity: "Creativity", teamwork: "Teamwork",
}

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
        <Panel title="Development outlook" eyebrow={`Next ${outlook.weeks} weeks`}>
            <div className="grid gap-5 md:grid-cols-2">
                <div className="min-w-0 space-y-3">
                    <p className="text-sm text-ink-2">
                        {outlook.trainsWithClub
                            ? <>Trains <span className="font-semibold text-ink-1">{outlook.focus}</span>{outlook.focusIsPersonal ? " (personal focus)" : " (club regimen)"}{outlook.weeklyGain > 0 && <> at <span className="font-semibold tabular-nums text-ink-1">+{outlook.weeklyGain.toFixed(2)}</span> a week to each main stat</>}.</>
                            : "Not in weekly club training right now."}
                    </p>
                    {outlook.trainsWithClub && (
                        moving.length > 0 ? (
                            <ul className="divide-y divide-line rounded-md border border-line">
                                {moving.map(f => (
                                    <li key={f.stat} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                        <span className="text-ink-3">{STAT_LABEL[f.stat] ?? f.stat}</span>
                                        <span className="tabular-nums text-ink-1">{Math.round(f.now)} → <span className="font-semibold text-positive">{Math.round(f.after * 10) / 10}</span></span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="rounded-md border border-line px-3 py-2 text-sm text-ink-3">
                                {outlook.focus === "Rest" ? "A rest focus restores morale and fatigue but trains nothing." : "The trained stats are at potential, so this focus adds nothing. Switch focus or raise potential."}
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
                        <dt className="font-semibold text-ink-1">Potential {outlook.potential}</dt>
                        <dd className="text-ink-3">The ceiling: training and natural growth stop there. It never falls.{outlook.atCeiling ? " Reached." : ""}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">Raising potential</dt>
                        <dd className="text-ink-3">
                            {outlook.breakthrough
                                ? "Your coach's Potential Breakthrough talent is active: each level-up has a 20% chance of +1."
                                : "Only a coach with the Potential Breakthrough talent can raise it (20% chance of +1 per level-up)."}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">Growth on his own</dt>
                        <dd className="text-ink-3">
                            {outlook.naturalPerSeason > 0.05
                                ? `About ${outlook.naturalPerSeason.toFixed(1)} points a season from natural growth, until age 25.`
                                : (player.age ?? 22) > 24 ? "None after 24; from here only training moves the numbers." : "None: already at potential."}
                        </dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-ink-1">Age decline</dt>
                        <dd className="text-ink-3">
                            {outlook.declinePerSeason > 0
                                ? `His ceiling drops about ${outlook.declinePerSeason.toFixed(1)} points a season, and his aim, reaction and clutch slowly sink to it. Tactics, leadership and the AWP do not fade${lastsLonger(player.role, player.secondaryRole) ? ", and as an IGL or AWPer he ages at half the rate" : ""}.`
                                : `Starts at ${AGE_CURVE.CEILING_LOSS[0][0]}. Until then training moves him toward his potential, a little slower each year after 22.`}
                        </dd>
                    </div>
                </dl>
            </div>
        </Panel>
    )
}
