"use client"

import { useRef, type KeyboardEvent } from "react"
import type { LucideIcon } from "lucide-react"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { cn } from "@/lib/utils"
import { answerByWeek, weekLabel, type InboxItem } from "./inbox-model"

const DECISION_TAG: Record<string, string> = {
    choice: "Needs an answer",
    job_offer: "Job offer",
    transfer_offer: "Transfer bid",
}

function Row({ item, selected, currentWeek, onSelect }: {
    item: InboxItem
    selected: boolean
    currentWeek: number
    onSelect: (item: InboxItem) => void
}) {
    const deadline = item.decision && item.event ? answerByWeek(item.event) : null
    return (
        <li>
            <button
                type="button"
                data-inbox-key={item.key}
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(item)}
                className={cn(
                    "flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors",
                    selected ? "bg-gold/[0.08] shadow-[inset_2px_0_0_var(--gold)]" : "hover:bg-raised",
                )}
            >
                <span className="mt-1.5 flex w-2 shrink-0 justify-center" aria-hidden="true">
                    {item.unread && <span className="h-2 w-2 rounded-full bg-side-ct" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{item.sender}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{weekLabel(item.week, currentWeek)}</span>
                    </span>
                    <span className={cn("mt-0.5 block truncate text-sm", item.unread || item.decision ? "font-semibold text-ink-1" : "font-medium text-ink-2")}>
                        {item.subject}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-3">{item.preview}</span>
                    {item.decision && (
                        <span className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold">
                            <span className="rounded-sm bg-caution/15 px-1.5 py-0.5 uppercase tracking-[0.06em] text-caution">{DECISION_TAG[item.decision]}</span>
                            {deadline != null && <span className="text-ink-3">{deadline <= currentWeek ? "Answer this week" : `By week ${deadline}`}</span>}
                        </span>
                    )}
                </span>
                {item.unread && <span className="sr-only">Unread</span>}
            </button>
        </li>
    )
}

export function InboxList({ items, selectedKey, currentWeek, onSelect, empty }: {
    items: InboxItem[]
    selectedKey: string | null
    currentWeek: number
    onSelect: (item: InboxItem) => void
    empty: { icon: LucideIcon; title: string; description: string }
}) {
    const listRef = useRef<HTMLUListElement>(null)

    if (items.length === 0) {
        return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} framed={false} className="h-full px-6" />
    }

    // Up/Down moves through the list (and opens the item) like a mail client.
    const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
        e.preventDefault()
        const index = items.findIndex(i => i.key === selectedKey)
        const next = items[Math.max(0, Math.min(items.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))]
        if (!next) return
        onSelect(next)
        listRef.current?.querySelector<HTMLButtonElement>(`[data-inbox-key="${CSS.escape(next.key)}"]`)?.focus()
    }

    return (
        <ul ref={listRef} onKeyDown={onKeyDown} aria-label="Messages" className="min-h-0 overflow-y-auto">
            {items.map(item => (
                <Row key={item.key} item={item} selected={item.key === selectedKey} currentWeek={currentWeek} onSelect={onSelect} />
            ))}
        </ul>
    )
}
