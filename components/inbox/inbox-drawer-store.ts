"use client"

/**
 * UI-only state for the inbox drawer: open/closed, active tab, selected item.
 * Kept out of the game store — none of this belongs in a save.
 */

import { create } from "zustand"
import type { InboxTab } from "@/lib/navigation"

interface InboxDrawerState {
    open: boolean
    tab: InboxTab
    /** InboxItem.key of the item in the reading pane. */
    selectedKey: string | null
    openInbox: (tab?: InboxTab, selectedKey?: string | null) => void
    close: () => void
    toggle: () => void
    setTab: (tab: InboxTab) => void
    select: (key: string | null) => void
}

export const useInboxDrawer = create<InboxDrawerState>()((set) => ({
    open: false,
    tab: "all",
    selectedKey: null,
    openInbox: (tab, selectedKey) => set(state => ({
        open: true,
        tab: tab ?? state.tab,
        selectedKey: selectedKey !== undefined ? selectedKey : tab && tab !== state.tab ? null : state.selectedKey,
    })),
    close: () => set({ open: false }),
    toggle: () => set(state => ({ open: !state.open })),
    setTab: (tab) => set(state => (tab === state.tab ? state : { tab, selectedKey: null })),
    select: (selectedKey) => set({ selectedKey }),
}))
