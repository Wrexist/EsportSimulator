"use client"

/**
 * Inbox: the storyline a decision belongs to (Phase 5.3), with the beats so
 * far, so the choice reads in context.
 */

import { useGameStore } from "@/store/game-store"
import { STORY_KIND_LABEL } from "@/engine/storylines/view"

export function StoryContext({ arcId }: { arcId: string }) {
    const arc = useGameStore(s => s.storylines?.find(a => a.id === arcId))
    if (!arc) return null
    return (
        <div className="rounded-md border border-line bg-raised px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Storyline · {STORY_KIND_LABEL[arc.kind]}</p>
            <ol className="mt-2 space-y-1">
                {arc.log.map((entry, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-snug">
                        <span className="w-12 shrink-0 text-xs tabular-nums text-ink-3">Wk {((entry.week - 1) % 52) + 1}</span>
                        <span className="min-w-0 text-ink-2">{entry.text}</span>
                    </li>
                ))}
            </ol>
        </div>
    )
}
