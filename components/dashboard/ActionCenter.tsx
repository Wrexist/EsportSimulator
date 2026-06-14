"use client"

/**
 * Dashboard "Action Center" — the hub's to-do list.
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
 * hero card already owns that CTA.
 */

import { useMemo } from "react"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getEventTitle, isPendingDecisionEvent } from "@/lib/event-format"
import { ListChecks, ArrowRight, Mail, Dumbbell, CalendarClock, CheckCircle2 } from "lucide-react"
import type { GameEventSaveData } from "@/engine/save-types"

const DEFAULT_MAX_TRAINING_SLOTS = 10

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- choice effects bundle is a loose runtime shape
function ChoiceEffects({ effects }: { effects: any }) {
    if (!effects) return null
    const chips: { label: string; positive: boolean }[] = []
    if (typeof effects.money === "number" && effects.money !== 0) {
        chips.push({ label: `${effects.money > 0 ? "+" : "-"}$${Math.abs(effects.money).toLocaleString()}`, positive: effects.money > 0 })
    }
    if (typeof effects.morale === "number" && effects.morale !== 0) {
        chips.push({ label: `${effects.morale > 0 ? "+" : ""}${effects.morale} Morale`, positive: effects.morale > 0 })
    }
    if (typeof effects.reputation === "number" && effects.reputation !== 0) {
        chips.push({ label: `${effects.reputation > 0 ? "+" : ""}${effects.reputation} Rep`, positive: effects.reputation > 0 })
    }
    if (typeof effects.chemistry === "number" && effects.chemistry !== 0) {
        chips.push({ label: `${effects.chemistry > 0 ? "+" : ""}${effects.chemistry} Chem`, positive: effects.chemistry > 0 })
    }
    if (chips.length === 0) return null
    return (
        <div className="flex flex-wrap gap-1">
            {chips.map((c, i) => (
                <span key={i} className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold tabular-nums", c.positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                    {c.label}
                </span>
            ))}
        </div>
    )
}

export function ActionCenter() {
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
        <Card className="glass-panel border-white/5 bg-white/[0.02] backdrop-blur-xl rounded-lg overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-[0.2em] text-white/50 flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/10 rounded-xl">
                            <ListChecks size={14} className="text-cyan-400" />
                        </div>
                        This Week
                    </CardTitle>
                    {promptCount > 0 && (
                        <Badge variant="outline" className="text-[9px] rounded-full px-2 border-cyan-500/30 text-cyan-400 bg-cyan-500/5">
                            {promptCount} to do
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-2 space-y-2">
                {promptCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                        <CheckCircle2 size={28} className="text-emerald-400/60" />
                        <p className="text-xs text-white/40 uppercase tracking-widest">All caught up</p>
                        <p className="text-[10px] text-white/30">Advance the week when you&apos;re ready.</p>
                    </div>
                ) : (
                    <>
                        {/* Inline-resolvable decisions */}
                        {decisions.map(event => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- choices is a runtime-only field
                            const choices = (event as any).choices as { id: string; text: string; effects: any }[]
                            return (
                                <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-white uppercase tracking-wide">{getEventTitle(event)}</span>
                                        <span className="text-[9px] text-white/30 uppercase">Wk {event.week}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {choices.map(choice => (
                                            <Button
                                                key={choice.id}
                                                variant="outline"
                                                onClick={() => resolveEventChoice(event.id, choice.id)}
                                                className="w-full h-auto py-2 px-3 justify-between border-white/10 bg-white/5 hover:bg-white/10 text-left"
                                            >
                                                <span className="text-[11px] font-bold uppercase tracking-wide">{choice.text}</span>
                                                <ChoiceEffects effects={choice.effects} />
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}

                        {/* Offers — link to the full inbox */}
                        {offerCount > 0 && (
                            <Link href="/desktop?app=mail" className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 hover:bg-amber-500/[0.08] transition-colors group">
                                <div className="p-2 rounded-lg bg-amber-500/10"><Mail size={14} className="text-amber-400" /></div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white">{offerCount} offer{offerCount > 1 ? "s" : ""} awaiting response</p>
                                    <p className="text-[10px] text-white/40">Review in your inbox</p>
                                </div>
                                <ArrowRight size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
                            </Link>
                        )}

                        {/* Recurring prompts */}
                        {freeTrainingSlots > 0 && (
                            <Link href="/training" className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:bg-white/[0.05] transition-colors group">
                                <div className="p-2 rounded-lg bg-blue-500/10"><Dumbbell size={14} className="text-blue-400" /></div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white/90">{freeTrainingSlots} training session{freeTrainingSlots > 1 ? "s" : ""} unused</p>
                                    <p className="text-[10px] text-white/40">Run drills to develop your roster</p>
                                </div>
                                <ArrowRight size={14} className="text-white/30 group-hover:text-white/60 transition-colors" />
                            </Link>
                        )}

                        {focusNotSet && (
                            <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="p-2 rounded-lg bg-purple-500/10"><CalendarClock size={14} className="text-purple-400" /></div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-white/90">Set this week&apos;s focus</p>
                                    <p className="text-[10px] text-white/40">Choose a weekly activity below</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
