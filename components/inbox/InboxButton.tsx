"use client"

import { useEffect, useState } from "react"
import { Inbox } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { cn } from "@/lib/utils"
import { inboxBadgeCount } from "./inbox-model"
import { selectInboxCounts } from "./inbox-store-bindings"
import { useInboxDrawer } from "./inbox-drawer-store"

function describe(decisions: number, unread: number): string {
    const parts: string[] = []
    if (decisions > 0) parts.push(`${decisions} decision${decisions === 1 ? "" : "s"} waiting`)
    if (unread > 0) parts.push(`${unread} unread`)
    return parts.length ? parts.join(", ") : "nothing new"
}

/** Top-bar inbox entry: opens the drawer; badge = open decisions + unread messages. */
export function InboxButton() {
    const { decisions, unreadMessages, unreadNews, hasCareer } = useGameStore(useShallow(s => {
        const counts = selectInboxCounts(s)
        return { ...counts, hasCareer: !!s.saveId && !!s.playerTeamId }
    }))
    const open = useInboxDrawer(s => s.open)
    const openInbox = useInboxDrawer(s => s.openInbox)
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    if (mounted && !hasCareer) return null
    const badge = mounted ? inboxBadgeCount({ decisions, unreadMessages, unreadNews }) : 0
    const label = `Inbox: ${describe(decisions, unreadMessages)}`

    return (
        <button
            type="button"
            onClick={() => openInbox(decisions > 0 ? "decisions" : undefined)}
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-keyshortcuts="i"
            title={`${label} (I)`}
            className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1",
                open && "bg-raised text-ink-1",
            )}
        >
            <Inbox size={18} />
            {badge > 0 && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums leading-none",
                        decisions > 0 ? "bg-caution text-ink" : "bg-side-ct text-ink",
                    )}
                >
                    {badge > 99 ? "99+" : badge}
                </span>
            )}
        </button>
    )
}
