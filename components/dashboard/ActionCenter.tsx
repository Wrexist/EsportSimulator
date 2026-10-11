"use client"

/**
 * Dashboard "Decisions" panel — the hub's to-do list.
 *
 * Solves two audit findings (AUDIT_UX_2026-06 A2 + B1): decision-making UI was
 * siloed on /desktop, leaving the main dashboard read-only, and nothing told the
 * player what to do on a non-match week. This surfaces, on the hub:
 *   1. Pending decisions (events with unresolved choices) — resolved INLINE via
 *      the same `resolveEventChoice` path the desktop inbox uses.
 *   2. Offers awaiting a response (job/transfer) — linked to the full inbox,
 *      which keeps the richer accept/negotiate/decline flow as the source of truth.
 *   3. Recurring prompts (unused training slots, weekly focus not set).
 *
 * The match itself is intentionally NOT listed here — the dashboard's next-match
 * hero card already owns that CTA. `children` render under the list. The
 * weekly focus itself is picked in the week plan (`/week`, Phase 4.2).
 */

import { useMemo, type ReactNode } from "react"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"
import { getEventTitle, isPendingDecisionEvent } from "@/lib/event-format"
import { ChevronRight, Mail, Dumbbell, CalendarClock, CheckCircle2 } from "lucide-react"
import type { GameEventSaveData } from "@/engine/save-types"
import { formatSignedCurrency } from "@/lib/utils-extended"

const DEFAULT_MAX_TRAINING_SLOTS = 10

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- choice effects bundle is a loose runtime shape
function ChoiceEffects({ effects }: { effects: any }) {
    if (!effects) return null
    const chips: { label: string; positive: boolean }[] = []
    if (typeof effects.money === "number" && effects.money !== 0) {
        chips.push({ label: formatSignedCurrency(effects.money, "$", false), positive: effects.money > 0 })
    }
    if (typeof effects.morale === "number" && effects.morale !== 0) {
        chips.push({ label: `${effects.morale > 0 ? "+" : ""}${effects.morale} morale`, positive: effects.morale > 0 })
    }
    if (typeof effects.reputation === "number" && effects.reputation !== 0) {
        chips.push({ label: `${effects.reputation > 0 ? "+" : ""}${effects.reputation} rep`, positive: effects.reputation > 0 })
    }
    if (typeof effects.loyalty === "number" && effects.loyalty !== 0) {
        chips.push({ label: `${effects.loyalty > 0 ? "+" : ""}${effects.loyalty} loyalty`, positive: effects.loyalty > 0 })
    }
    if (chips.length === 0) return null
    return (
        <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
            {chips.map((c, i) => (
                <span key={i} className={cn("text-xs font-semibold tabular-nums", c.positive ? "text-positive" : "text-caution")}>{c.label}</span>
            ))}
        </span>
    )
}

function PromptRow({ href, icon, title, detail }: { href?: string; icon: ReactNode; title: ReactNode; detail: ReactNode }) {
    const body = (
        <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-ink-2">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-1">{title}</span>
                <span className="block text-xs text-ink-3">{detail}</span>
            </span>
            {href && <ChevronRight size={16} className="shrink-0 text-ink-3" />}
        </>
    )
    return href
        ? <Link href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised">{body}</Link>
        : <div className="flex items-center gap-3 px-4 py-3">{body}</div>
}

export function ActionCenter({ children, className }: { children?: ReactNode; className?: string }) {
    const { eventsLog, teams, playerTeamId, selectedWeeklyActivity, resolveEventChoice } = useGameStore(useShallow(s => ({
        eventsLog: s.eventsLog,
        teams: s.teams,
        playerTeamId: s.playerTeamId,
        selectedWeeklyActivity: s.selectedWeeklyActivity,
        resolveEventChoice: s.resolveEventChoice,
    })))

    const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

    const decisions = useMemo<GameEventSaveData[]>(
        () => (eventsLog ?? []).filter(isPendingDecisionEvent),
        [eventsLog],
    )

    // Offers (job/transfer) keep their richer flow in the inbox — surface the count + a link.
    const offerCount = useMemo(() => {
        return (eventsLog ?? []).filter(e => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime-only fields
            const ev = e as any
            if (ev.selectedChoiceId !== undefined || e.acknowledged) return false
            const type = e.type as string
            if (type === "JOB_OFFER" || type === "TRANSFER_OFFER") return true
            if (type === "CONTRACT" && ev.data?.action === "TRANSFER_OFFER") return true
            return false
        }).length
    }, [eventsLog])

    const freeTrainingSlots = playerTeam
        ? Math.max(0, (playerTeam.maxTrainingSlots ?? DEFAULT_MAX_TRAINING_SLOTS) - (playerTeam.trainingSlotsUsed ?? 0))
        : 0
    const focusNotSet = !selectedWeeklyActivity

    const promptCount = decisions.length + (offerCount > 0 ? 1 : 0) + (freeTrainingSlots > 0 ? 1 : 0) + (focusNotSet ? 1 : 0)

    return (
        <Panel
            title="Decisions"
            actions={<span className="text-xs tabular-nums text-ink-3">{promptCount > 0 ? `${promptCount} to do` : "All done"}</span>}
            padded={false}
            className={className}
        >
            {promptCount === 0 ? (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">
                    <CheckCircle2 size={16} className="text-positive" /> All caught up. Advance when you&apos;re ready.
                </p>
            ) : (
                <div className="divide-y divide-line">
                    {/* Inline-resolvable decisions */}
                    {decisions.map(event => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- choices is a runtime-only field
                        const choices = (event as any).choices as { id: string; text: string; effects: any }[]
                        return (
                            <div key={event.id} className="space-y-2 px-4 py-3">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-semibold text-ink-1">{getEventTitle(event)}</span>
                                    <span className="shrink-0 text-xs text-ink-3">Week {event.week}</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {choices.map(choice => (
                                        <Button
                                            key={choice.id}
                                            variant="outline"
                                            onClick={() => resolveEventChoice(event.id, choice.id)}
                                            className="h-auto w-full justify-between gap-3 whitespace-normal px-3 py-2 text-left"
                                        >
                                            <span className="text-[13px] font-semibold">{choice.text}</span>
                                            <ChoiceEffects effects={choice.effects} />
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )
                    })}

                    {/* Offers — link to the full inbox */}
                    {offerCount > 0 && (
                        <PromptRow
                            href="?inbox=decisions"
                            icon={<Mail size={15} />}
                            title={`${offerCount} offer${offerCount > 1 ? "s" : ""} awaiting a response`}
                            detail="Review them in your inbox"
                        />
                    )}

                    {/* Recurring prompts */}
                    {freeTrainingSlots > 0 && (
                        <PromptRow
                            href="/training"
                            icon={<Dumbbell size={15} />}
                            title={`${freeTrainingSlots} training session${freeTrainingSlots > 1 ? "s" : ""} unused`}
                            detail="Practise when rested; unused sessions are fine before a match."
                        />
                    )}

                    {focusNotSet && (
                        <PromptRow
                            href="/week#weekly-focus"
                            icon={<CalendarClock size={15} />}
                            title="Plan this week"
                            detail="Pick the team focus and bookings in the week plan"
                        />
                    )}
                </div>
            )}
            {children && <div className="border-t border-line">{children}</div>}
        </Panel>
    )
}
