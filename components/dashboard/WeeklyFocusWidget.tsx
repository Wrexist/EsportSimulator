"use client"

import { t } from "@/lib/i18n"
import { useGameStore } from "@/store/game-store"
import { WEEKLY_ACTIVITIES, WeeklyActivity, WeeklyActivityType } from "@/types"
import { weeklyActivityXpBonus } from "@/types/activities"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { useEffect, useRef } from "react"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"

type Effect = { label: string; good: boolean }

const signedN = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n)}`
/** The plan's name and description in the active language. */
export const focusName = (type: WeeklyActivityType | string) => t(`wfocus.${type}`)
const focusDescription = (type: WeeklyActivityType | string) => t(`wfocus.${type}.desc`)

/** Only the effects the weekly settlement actually applies (weekly-activity-processor). */
function activityEffects(activity: WeeklyActivity): Effect[] {
    const e = activity.effects
    const out: Effect[] = []
    if (e.morale) out.push({ label: t("fx.morale", { value: signedN(e.morale) }), good: e.morale > 0 })
    if (e.fatigue) out.push({ label: t("fx.fatigue", { value: signedN(e.fatigue) }), good: e.fatigue < 0 })
    if (e.synergy) out.push({ label: t("fx.chemistry", { value: e.synergy }), good: true })
    if (e.reputation) out.push({ label: t("fx.reputation", { value: e.reputation }), good: true })
    const xp = weeklyActivityXpBonus(activity)
    if (xp > 0) out.push({ label: t("fx.xpPerPlayer", { value: xp }), good: true })
    return out
}

/**
 * Team focus picker (the week plan's "weekly focus"): one plan for the next
 * weekly update, as a compact list. `framed={false}` drops the titled panel
 * so a parent panel can host it.
 */
export function WeeklyFocusWidget({ framed = true }: { framed?: boolean }) {
    const selectedActivity = useGameStore(state => state.selectedWeeklyActivity)
    const setWeeklyActivity = useGameStore(state => state.setWeeklyActivity)
    const budget = useGameStore(state => state.teams.find(tm => tm.id === state.playerTeamId)?.budget ?? 0)
    // SMOKE-A-15: "/week#weekly-focus" (the guide's "Choose weekly focus") lands
    // here. The list renders after the save loads, too late for the browser's
    // own jump to the hash, so it scrolls itself into view once it is there.
    const anchorRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const reveal = () => { if (window.location.hash === "#weekly-focus") anchorRef.current?.scrollIntoView({ block: "start" }) }
        const timer = window.setTimeout(reveal, 50)
        window.addEventListener("hashchange", reveal)
        return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", reveal) }
    }, [])

    const list = (
        <div id="weekly-focus" ref={anchorRef} className="scroll-mt-24">
            <ul className="py-2">
                {Object.values(WEEKLY_ACTIVITIES).map((activity) => {
                    // No pick is a standard training week, so that row shows as the checked default (HOME-18).
                    const isSelected = (selectedActivity ?? WeeklyActivityType.TRAINING_ONLY) === activity.type
                    const unaffordable = activity.cost > 0 && activity.cost > budget
                    const effects = activityEffects(activity)
                    return (
                        <li key={activity.type}>
                            <button
                                type="button"
                                onClick={() => setWeeklyActivity(activity.type as WeeklyActivityType)}
                                disabled={unaffordable}
                                title={unaffordable ? t("wfocus.noCash") : undefined}
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
                                        <span className="text-sm font-semibold text-ink-1">{focusName(activity.type)}</span>
                                        {activity.cost > 0 && <span className="shrink-0 text-xs tabular-nums text-ink-2">{formatCurrency(activity.cost, "$", false)}</span>}
                                        {!!activity.effects.money && (
                                            <span className="shrink-0 text-xs tabular-nums text-positive">{t("wfocus.perWeek", { amount: formatSignedCurrency(activity.effects.money, "$", false) })}</span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-ink-3">
                                        {effects.length === 0 ? focusDescription(activity.type) : effects.map((fx, i) => (
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
            <p className="border-t border-line px-4 py-2.5 text-xs leading-relaxed text-ink-3">
                {t("wfocus.note")}
            </p>
        </div>
    )

    return framed
        ? <Panel title={t("wfocus.title")} eyebrow={t("wfocus.eyebrow")} padded={false} className="h-full">{list}</Panel>
        : list
}
