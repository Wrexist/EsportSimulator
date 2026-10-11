"use client"

/**
 * Inbox drawer (Phase 4.3) — replaces the fake desktop OS. A right-side sheet
 * over any screen: All · Decisions · Messages · News, a message list and a
 * reading pane. `I` toggles it, Esc closes it, `?inbox=<tab>` opens it.
 */

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { useShallow } from "zustand/react/shallow"
import { CheckCheck, Inbox, ListChecks, Newspaper } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useGameStore } from "@/store/game-store"
import { INBOX_TABS, type InboxTab } from "@/lib/navigation"
import { INBOX_TOGGLE_KEY } from "@/lib/keyboard-shortcuts"
import { cn } from "@/lib/utils"
import type { AnnualAwards } from "@/engine/pro-awards-engine"
import { buildInboxItems, countInbox, itemsForTab, type InboxItem } from "./inbox-model"
import { selectInboxContext } from "./inbox-store-bindings"
import { useInboxDrawer } from "./inbox-drawer-store"
import { InboxList } from "./InboxList"
import { InboxReadingPane } from "./InboxReadingPane"

const ProAwardsModal = dynamic(() => import("@/components/celebration/ProAwardsModal").then(m => m.ProAwardsModal), { ssr: false })

const TAB_LABEL: Record<InboxTab, string> = { all: "All", decisions: "Decisions", messages: "Messages", news: "News" }

const EMPTY: Record<InboxTab, { icon: typeof Inbox; title: string; description: string }> = {
    all: { icon: Inbox, title: "Inbox empty", description: "Messages from your staff, offers and league news land here as the season moves." },
    decisions: { icon: ListChecks, title: "Nothing waiting on you", description: "Event choices, transfer bids and job offers that need an answer appear here." },
    messages: { icon: Inbox, title: "No messages yet", description: "Your staff, board and sponsors write here as the weeks go by." },
    news: { icon: Newspaper, title: "No news yet", description: "Signings, transfers and headlines from around the scene appear here." },
}

type NewsFilter = "headlines" | "social"

export function InboxDrawer() {
    const { open, tab, selectedKey, close, setTab, select } = useInboxDrawer(useShallow(s => ({
        open: s.open, tab: s.tab, selectedKey: s.selectedKey, close: s.close, setTab: s.setTab, select: s.select,
    })))
    const { eventsLog, newsFeed, socialFeed, hasCareer, ctx, acknowledgeEvent, markAllEventsAsRead, syncSocialFeed } = useGameStore(useShallow(s => ({
        eventsLog: s.eventsLog,
        newsFeed: s.newsFeed,
        socialFeed: s.socialFeed,
        hasCareer: !!s.saveId && !!s.playerTeamId,
        ctx: selectInboxContext(s),
        acknowledgeEvent: s.acknowledgeEvent,
        markAllEventsAsRead: s.markAllEventsAsRead,
        syncSocialFeed: s.syncSocialFeed,
    })))
    const [newsFilter, setNewsFilter] = useState<NewsFilter>("headlines")
    const [showPaneOnNarrow, setShowPaneOnNarrow] = useState(false)
    const [awards, setAwards] = useState<AnnualAwards | null>(null)

    // The social timeline is generated lazily (per save + week); merge this
    // week's posts when the drawer opens.
    useEffect(() => { if (open && hasCareer) syncSocialFeed() }, [open, hasCareer, ctx.currentWeek, syncSocialFeed])

    const items = useMemo(
        () => (open && hasCareer ? buildInboxItems({ eventsLog: eventsLog ?? [], newsFeed, socialFeed }, ctx) : []),
        [open, hasCareer, eventsLog, newsFeed, socialFeed, ctx],
    )
    const counts = useMemo(() => countInbox(eventsLog ?? [], ctx), [eventsLog, ctx])
    const tabItems = useMemo(() => {
        const list = itemsForTab(items, tab)
        if (tab !== "news") return list.filter(i => i.source !== "social")
        return list.filter(i => (newsFilter === "social") === (i.source === "social"))
    }, [items, tab, newsFilter])

    // Show the explicitly selected item, else the first one on the tab.
    const selected = tabItems.find(i => i.key === selectedKey) ?? tabItems[0] ?? null

    const onSelect = (item: InboxItem) => {
        select(item.key)
        setShowPaneOnNarrow(true)
        if (item.event && !item.event.acknowledged) acknowledgeEvent(item.event.id)
    }

    // `I` closes from inside (the shell's shortcut handler stands down while a dialog is open).
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key.toLowerCase() !== INBOX_TOGGLE_KEY || e.ctrlKey || e.metaKey || e.altKey) return
        const target = e.target as HTMLElement
        if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
        e.preventDefault()
        close()
    }

    const summary = !hasCareer
        ? "No career loaded."
        : [
            counts.decisions > 0 ? `${counts.decisions} decision${counts.decisions === 1 ? "" : "s"} waiting` : "No decisions waiting",
            `${counts.unreadMessages} unread`,
        ].join(" · ")

    const tabCount: Record<InboxTab, number> = {
        all: counts.decisions + counts.unreadMessages + counts.unreadNews,
        decisions: counts.decisions,
        messages: counts.unreadMessages,
        news: counts.unreadNews,
    }

    const body = (
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
            <div className={cn("flex min-h-0 flex-col border-line md:border-r", showPaneOnNarrow && "max-md:hidden")}>
                {tab === "news" && (
                    <div role="group" aria-label="News source" className="flex gap-1 border-b border-line px-4 py-2">
                        {(["headlines", "social"] as NewsFilter[]).map(f => (
                            <button
                                key={f}
                                type="button"
                                aria-pressed={newsFilter === f}
                                onClick={() => { setNewsFilter(f); select(null) }}
                                className={cn(
                                    "rounded px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                                    newsFilter === f ? "bg-raised text-ink-1" : "text-ink-3 hover:text-ink-1",
                                )}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                )}
                <InboxList
                    items={tabItems}
                    selectedKey={selected?.key ?? null}
                    currentWeek={ctx.currentWeek}
                    onSelect={onSelect}
                    empty={tab === "news" && newsFilter === "social"
                        ? { icon: Newspaper, title: "No posts yet", description: "The scene's social chatter shows up here week by week." }
                        : EMPTY[tab]}
                />
            </div>
            <div className={cn("min-h-0", !showPaneOnNarrow && "max-md:hidden")}>
                <InboxReadingPane
                    key={selected?.key ?? "none"}
                    item={selected}
                    ctx={ctx}
                    onBack={() => setShowPaneOnNarrow(false)}
                    onOpenAwards={a => { close(); setAwards(a as AnnualAwards) }}
                />
            </div>
        </div>
    )

    return (
        <>
            <Sheet open={open} onOpenChange={o => { if (!o) close() }}>
                <SheetContent
                    side="right"
                    onKeyDown={onKeyDown}
                    onOpenAutoFocus={e => {
                        // Land on the open item (arrow keys then walk the list),
                        // not on the first header button.
                        e.preventDefault()
                        const root = e.currentTarget as HTMLElement
                        const row = root.querySelector<HTMLElement>('[data-inbox-key][aria-current="true"]')
                        ;(row ?? root).focus()
                    }}
                    className="w-full max-w-full gap-0 p-0 sm:max-w-[960px] rounded-none! border-y-0! border-r-0!"
                >
                    <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
                        <div className="min-w-0">
                            <SheetTitle className="font-display text-[26px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1">Inbox</SheetTitle>
                            <SheetDescription className="mt-1.5 text-xs text-ink-3">{summary}</SheetDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllEventsAsRead}
                            disabled={!hasCareer || counts.unreadMessages + counts.unreadNews === 0}
                            className="mr-8 text-xs"
                        >
                            <CheckCheck size={14} /> Mark all read
                        </Button>
                    </header>
                    <Tabs value={tab} onValueChange={v => { setTab(v as InboxTab); setShowPaneOnNarrow(false) }} className="min-h-0 flex-1 gap-0">
                        <TabsList className="w-full px-4">
                            {INBOX_TABS.map(t => (
                                <TabsTrigger key={t} value={t} className="gap-2">
                                    {TAB_LABEL[t]}
                                    {tabCount[t] > 0 && (
                                        <span className={cn(
                                            "rounded-sm px-1.5 py-px text-[11px] font-bold tabular-nums",
                                            t === "decisions" ? "bg-caution/15 text-caution" : "bg-raised text-ink-2",
                                        )}>
                                            {tabCount[t]}
                                        </span>
                                    )}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {INBOX_TABS.map(t => (
                            <TabsContent key={t} value={t} className="flex min-h-0 flex-col data-[state=inactive]:hidden">
                                {t === tab && body}
                            </TabsContent>
                        ))}
                    </Tabs>
                </SheetContent>
            </Sheet>
            {awards && <ProAwardsModal isOpen={!!awards} onClose={() => setAwards(null)} awards={awards} />}
        </>
    )
}
