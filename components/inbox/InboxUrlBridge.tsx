"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { INBOX_QUERY_PARAM, parseInboxTab } from "@/lib/navigation"
import { useInboxDrawer } from "./inbox-drawer-store"
import { useGameStore } from "@/store/game-store"
import { useMomentOnScreenNow, useMomentPending } from "@/components/moments/moment-state"

/**
 * `?inbox=<tab>` on any screen opens the drawer, then the param is dropped so
 * Back/refresh don't reopen it. This is how nav links, the Ctrl-K palette and
 * the retired `/desktop` deep links reach the inbox. Mount inside <Suspense>.
 *
 * A full-screen moment (e.g. the Welcome board brief) owns the screen: the
 * param waits until it is dismissed instead of stacking the drawer's focus
 * trap on top of the moment's (CROSSCUT-01), and a moment that comes up
 * while the drawer is open closes the drawer.
 */
export function InboxUrlBridge() {
    const params = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()
    const value = params.get(INBOX_QUERY_PARAM)
    const hydrated = useGameStore(s => s._hasHydrated)
    const momentPending = useMomentPending()
    const momentOnScreen = useMomentOnScreenNow()
    const blocked = !hydrated || momentPending || momentOnScreen

    useEffect(() => {
        if (momentOnScreen) useInboxDrawer.getState().close()
    }, [momentOnScreen])

    useEffect(() => {
        const tab = parseInboxTab(value)
        if (!tab || blocked) return
        useInboxDrawer.getState().openInbox(tab)
        const rest = new URLSearchParams(params.toString())
        rest.delete(INBOX_QUERY_PARAM)
        const query = rest.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
        // Keyed on the param value (and the moment gate) only: re-running for
        // other param changes would be a no-op anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, blocked])

    return null
}
