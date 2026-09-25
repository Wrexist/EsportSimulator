"use client"

import { usePathname } from 'next/navigation'
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist'

/** Contextual guide, with normal navigation and controls available throughout. */
export function TutorialOverlay() {
    const path = usePathname()
    if (path === '/' || path.startsWith('/new-game') || path.startsWith('/main-menu') || path.startsWith('/load-game') || path.startsWith('/map-editor') || path.startsWith('/dev/') || path.includes('/live') || path.includes('/veto') || path.includes('/tactics')) return null
    return <aside className="mx-auto w-full max-w-7xl px-4 pb-5"><GettingStartedChecklist compact /></aside>
}
