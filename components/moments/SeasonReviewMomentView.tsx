"use client"

import { useEffect, useMemo } from "react"
import type { SeasonReviewMoment } from "@/engine/moments"
import { useGameStore } from "@/store/game-store"
import { buildSeasonReviewView } from "@/lib/season-review-view"
import { SeasonReviewSequence } from "./season-review/SeasonReviewSequence"
import { useReviewSource } from "./season-review/SeasonReviewReplay"

/**
 * The season-end review moment (Phase 5.4b): queued by the week tick that
 * closes the season, shown after any title or tier move, then the new
 * season's pre-season. Closing it also marks the season's awards message
 * read (the ceremony was just shown).
 */
export function SeasonReviewMomentView({ moment, onDismiss }: { moment: SeasonReviewMoment; onDismiss: () => void }) {
    const src = useReviewSource()
    const view = useMemo(() => buildSeasonReviewView(src, moment.season), [src, moment.season])
    const awardsEvent = useGameStore(s => s.eventsLog.find(e => e.id === `pro_top20_season${moment.season}` && !e.acknowledged)?.id)
    const acknowledgeEvent = useGameStore(s => s.acknowledgeEvent)

    // Nothing recorded for that season (a save from before Phase 5.1): never hold Continue on it.
    useEffect(() => { if (!view) onDismiss() }, [view, onDismiss])
    if (!view) return null

    return (
        <SeasonReviewSequence
            view={view}
            teams={src.teams}
            mode="moment"
            momentKey={moment.key}
            onClose={() => {
                if (awardsEvent) acknowledgeEvent(awardsEvent)
                onDismiss()
            }}
        />
    )
}
