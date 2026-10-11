"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { nextMoment } from "@/lib/advance-stops"
import type { Moment } from "@/engine/moments"
import { TitleMomentView, LeagueTitleMomentView } from "./TitleMomentView"
import { TierMoveMomentView } from "./TierMoveMomentView"
import { SigningRevealView } from "./SigningRevealView"
import { WelcomeMomentView } from "./WelcomeMomentView"
import { SeasonReviewMomentView } from "./SeasonReviewMomentView"
import { momentBlockedRoute } from "./moment-state"

/** A short beat before a moment opens, so the screen underneath lands first. */
function openDelay(m: Moment, path: string): number {
    if (m.kind === "title" && /^\/match\/[^/]+\/result/.test(path)) return 1400
    return m.kind === "welcome" || m.kind === "season-review" ? 700 : 450
}

/**
 * Shows the head of the moment queue, one at a time, full-screen. Never
 * during week processing, a Continue run or on a blocked screen; a moment
 * decided inside the week tick opens right after processing completes.
 */
export function MomentHost() {
    const pathname = usePathname()
    const s = useGameStore(useShallow(st => ({
        queue: st.momentQueue,
        legacy: st.pendingCelebration,
        ready: st._hasHydrated && st.isInitialized && !!st.saveId,
        busy: st.isLoading || !!st.weekProgress || !!st.continueRun,
        dismissMoment: st.dismissMoment,
    })))
    const moment = useMemo(() => nextMoment({ momentQueue: s.queue, pendingCelebration: s.legacy }), [s.queue, s.legacy])
    const eligible = !!moment && s.ready && !s.busy && !momentBlockedRoute(pathname)
    const [openKey, setOpenKey] = useState<string | null>(null)

    useEffect(() => {
        if (!eligible || !moment) { setOpenKey(null); return }
        if (openKey === moment.key) return
        const t = setTimeout(() => setOpenKey(moment.key), openDelay(moment, pathname ?? ""))
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the head moment or eligibility changes
    }, [eligible, moment?.key])

    const shown = eligible && moment && openKey === moment.key ? moment : null
    const dismiss = () => { if (shown) s.dismissMoment(shown.key) }

    return <AnimatePresence>{shown && renderMoment(shown, dismiss)}</AnimatePresence>
}

function renderMoment(m: Moment, onDismiss: () => void) {
    switch (m.kind) {
        case "title": return <TitleMomentView key={m.key} moment={m} onDismiss={onDismiss} />
        case "league-title": return <LeagueTitleMomentView key={m.key} moment={m} onDismiss={onDismiss} />
        case "promotion":
        case "relegation": return <TierMoveMomentView key={m.key} moment={m} onDismiss={onDismiss} />
        case "signing": return <SigningRevealView key={m.key} moment={m} onDismiss={onDismiss} />
        case "welcome": return <WelcomeMomentView key={m.key} moment={m} onDismiss={onDismiss} />
        case "season-review": return <SeasonReviewMomentView key={m.key} moment={m} onDismiss={onDismiss} />
    }
}
