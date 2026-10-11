"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { INBOX_QUERY_PARAM, parseInboxTab } from "@/lib/navigation"
import { useInboxDrawer } from "./inbox-drawer-store"

/**
 * `?inbox=<tab>` on any screen opens the drawer, then the param is dropped so
 * Back/refresh don't reopen it. This is how nav links, the Ctrl-K palette and
 * the retired `/desktop` deep links reach the inbox. Mount inside <Suspense>.
 */
export function InboxUrlBridge() {
    const params = useSearchParams()
    const pathname = usePathname()
    const router = useRouter()
    const value = params.get(INBOX_QUERY_PARAM)

    useEffect(() => {
        const tab = parseInboxTab(value)
        if (!tab) return
        useInboxDrawer.getState().openInbox(tab)
        const rest = new URLSearchParams(params.toString())
        rest.delete(INBOX_QUERY_PARAM)
        const query = rest.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
        // Keyed on the param value only: re-running for other param changes
        // would be a no-op anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    return null
}
