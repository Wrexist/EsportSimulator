"use client"

/**
 * Press conference (Phase 5.3): the questions, the answers with the exact
 * effects each applies (describeChoice reads the same effect bundle the
 * engine applies), "Face the press" and "Send no one". Used in the inbox and,
 * compact, on the pre-match screen.
 */

import { useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import type { GameEventSaveData } from "@/engine/save-types"
import { PRESS_REASON_LABEL, pressDataOf, pressEventId } from "@/engine/storylines/press-view"
import { describeChoice, type EffectChip } from "@/components/inbox/inbox-model"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

function Chips({ chips }: { chips: EffectChip[] }) {
    return (
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {chips.map((c, i) => (
                <span key={i} className={cn("text-xs font-semibold tabular-nums", c.tone === "positive" ? "text-positive" : c.tone === "negative" ? "text-negative" : "text-ink-3")}>{c.label}</span>
            ))}
        </span>
    )
}

/** The open press conference: pick an answer per question, then face the press (or send no one). */
export function PressConferenceDecision({ event, compact = false }: { event: GameEventSaveData; compact?: boolean }) {
    const { answerPressConference, resolveEventChoice, budget } = useGameStore(useShallow(s => ({
        answerPressConference: s.answerPressConference,
        resolveEventChoice: s.resolveEventChoice,
        budget: s.teams.find(t => t.id === s.playerTeamId)?.budget ?? 0,
    })))
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const press = pressDataOf(event)
    if (!press) return null
    // Answer effects apply to the squad unless they name a player (no event player).
    const squadEvent = { ...event, data: { ...(event.data ?? {}), playerId: undefined } } as GameEventSaveData
    const answered = Object.keys(answers).length

    const face = () => {
        const r = answerPressConference(event.id, answers)
        if (r.ok) toast.success(r.message)
        else toast.error(r.message)
    }
    const skip = () => {
        resolveEventChoice(event.id, "no_one")
        if (useGameStore.getState().eventsLog.find(e => e.id === event.id)?.selectedChoiceId === "no_one") toast.info("No one from the club attended the press conference")
    }

    return (
        <section className={cn("space-y-3", compact && "space-y-2.5")}>
            {press.questions.map((q, qi) => (
                <div key={q.id} className="space-y-1.5">
                    <p className={cn("font-semibold leading-snug text-ink-1", compact ? "text-[13px]" : "text-sm")}>
                        <span className="mr-1.5 tabular-nums text-ink-3">Q{qi + 1}.</span>{q.text}
                    </p>
                    <div className="space-y-1.5" role="radiogroup" aria-label={`Question ${qi + 1}`}>
                        {q.answers.map(a => {
                            const selected = answers[q.id] === a.id
                            const outcome = describeChoice(squadEvent, a, budget)
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: a.id }))}
                                    className={cn(
                                        "flex w-full flex-col gap-0.5 rounded-[4px] border px-3 py-2 text-left transition-colors duration-150",
                                        selected ? "border-gold bg-gold/[0.06]" : "border-line bg-raised hover:border-line-strong hover:bg-hover",
                                    )}
                                >
                                    <span className={cn("text-[13px]", selected ? "font-semibold text-ink-1" : "text-ink-2")}>“{a.text}”</span>
                                    <Chips chips={outcome.chips} />
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={face} disabled={answered === 0} className="h-9">
                    Face the press{answered ? ` (${answered} of ${press.questions.length})` : ""}
                </Button>
                <Button variant="outline" onClick={skip} className="h-9">Send no one</Button>
            </div>
            <p className="text-xs text-ink-3">A question you leave out changes nothing. Sending no one has no effect.</p>
        </section>
    )
}

/** What was said, once answered. */
export function PressConferenceRecord({ event }: { event: GameEventSaveData }) {
    const press = pressDataOf(event)
    const chosen = (event.data as { pressAnswers?: Record<string, string> } | undefined)?.pressAnswers
    if (!press) return null
    if (event.selectedChoiceId !== "answered" || !chosen) {
        const withdrawn = (event.data as { isWithdrawn?: boolean } | undefined)?.isWithdrawn
        return <p className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink-2">{withdrawn ? "The match was played before anyone faced the press." : "No one from the club attended."}</p>
    }
    return (
        <ul className="space-y-1.5 rounded-md border border-line px-3 py-2.5 text-[13px]">
            {press.questions.map(q => {
                const a = q.answers.find(x => x.id === chosen[q.id])
                return (
                    <li key={q.id} className="leading-snug">
                        <span className="text-ink-3">{q.text}</span>{" "}
                        <span className="font-semibold text-ink-1">{a ? `“${a.text}”` : "Skipped."}</span>
                    </li>
                )
            })}
        </ul>
    )
}

/** Pre-match screen: the press conference for this match, if there is one. */
export function PressPanel({ matchId }: { matchId: string }) {
    const { event, currentWeek } = useGameStore(useShallow(s => ({
        event: s.eventsLog.find(e => e.id === pressEventId(matchId)),
        currentWeek: s.currentWeek,
    })))
    const press = pressDataOf(event)
    if (!event || !press) return null
    const data = (event.data ?? {}) as { isWithdrawn?: boolean; deadlineWeek?: number }
    const open = event.selectedChoiceId === undefined && !data.isWithdrawn && (data.deadlineWeek == null || data.deadlineWeek >= currentWeek)
    return (
        <Panel eyebrow={PRESS_REASON_LABEL[press.reason]} title="Press conference" actions={<span className="text-xs text-ink-3">{open ? "Optional · before the match" : "Done"}</span>}>
            {open ? <PressConferenceDecision event={event} compact /> : <PressConferenceRecord event={event} />}
        </Panel>
    )
}
