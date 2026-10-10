"use client"

import { useGameStore } from "@/store/game-store"
import { WEEKLY_ACTIVITIES, WeeklyActivity, WeeklyActivityType } from "@/types"
import { weeklyActivityXpBonus } from "@/types/activities"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"

type Effect = { label: string; good: boolean }

/** Only the effects the weekly settlement actually applies (weekly-activity-processor). */
function activityEffects(activity: WeeklyActivity): Effect[] {
    const e = activity.effects
    const out: Effect[] = []
    if (e.morale) out.push({ label: `${e.morale > 0 ? "+" : ""}${e.morale} morale`, good: e.morale > 0 })
    if (e.fatigue) out.push({ label: `${e.fatigue > 0 ? "+" : ""}${e.fatigue} fatigue`, good: e.fatigue < 0 })
    if (e.synergy) out.push({ label: `+${e.synergy} chemistry`, good: true })
    if (e.reputation) out.push({ label: `+${e.reputation} reputation`, good: true })
    const xp = weeklyActivityXpBonus(activity)
    if (xp > 0) out.push({ label: `+${xp} XP per player`, good: true })
    return out
}

/**
 * Weekly focus picker — one plan for the next weekly settlement, as a compact
 * list. `framed={false}` drops the panel so a parent panel can host it.
 */
export function WeeklyFocusWidget({ framed = true }: { framed?: boolean }) {
    const selectedActivity = useGameStore(state => state.selectedWeeklyActivity)
    const setWeeklyActivity = useGameStore(state => state.setWeeklyActivity)
    const budget = useGameStore(state => state.teams.find(t => t.id === state.playerTeamId)?.budget ?? 0)

    const list = (
        <div id="weekly-focus" className="scroll-mt-24">
            <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Weekly focus</p>
                <p className="text-xs text-ink-3">Applies at the next weekly settlement</p>
            </div>
            <ul className="pb-2">
                {Object.values(WEEKLY_ACTIVITIES).map((activity) => {
                    const isSelected = selectedActivity === activity.type
                    const unaffordable = activity.cost > 0 && activity.cost > budget
                    const effects = activityEffects(activity)
                    return (
                        <li key={activity.type}>
                            <button
                                type="button"
                                onClick={() => setWeeklyActivity(activity.type as WeeklyActivityType)}
                                disabled={unaffordable}
                                title={unaffordable ? "Not enough cash for this plan" : undefined}
                                aria-pressed={isSelected}
                                className={cn(
                                    "flex w-full items-start gap-3 border-l-2 px-4 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                    isSelected ? "border-gold bg-hover" : "border-transparent hover:bg-raised",
                                )}
                            >
                                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", isSelected ? "border-gold bg-gold text-gold-on" : "border-line-strong")}>
                                    {isSelected && <Check size={11} strokeWidth={3} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-3">
                                        <span className="text-sm font-semibold text-ink-1">{activity.name}</span>
                                        {activity.cost > 0 && <span className="shrink-0 text-xs tabular-nums text-ink-2">{formatCurrency(activity.cost, "$", false)}</span>}
                                        {!!activity.effects.money && (
                                            <span className="shrink-0 text-xs tabular-nums text-positive">{formatSignedCurrency(activity.effects.money, "$", false)} / wk</span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-ink-3">
                                        {effects.length === 0 ? activity.description : effects.map((fx, i) => (
                                            <span key={fx.label}>
                                                {i > 0 && " · "}
                                                <span className={fx.good ? "text-positive" : "text-caution"}>{fx.label}</span>
                                            </span>
                                        ))}
                                    </span>
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )

    return framed ? <Panel padded={false} className="h-full">{list}</Panel> : list
}
