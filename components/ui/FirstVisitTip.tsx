"use client"

import { Lightbulb, X } from "lucide-react"
import { useSettingsStore } from "@/lib/settings-store"

export interface ScreenTip {
    id: string
    title: string
    lines: readonly string[]
}

/**
 * The deep match-prep screens (tactics, veto, live) are hidden from the
 * getting-started guide, so each one explains itself once: a short card on
 * the first visit, dismissed for good on this device.
 */
export const SCREEN_TIPS = {
    tactics: {
        id: "tactics-v1",
        title: "Match prep",
        lines: [
            "Win chance at the top is the honest pre-match estimate. Prep that changes it is listed with its effect.",
            "After a VOD review the rival's habits show per map: the site their Ts like on a full buy and the site their CTs stack. Pick a counter to play into them.",
            "The playbook fixes your own calls per map, side and buy. A call you repeat gets read, so mixing beats spamming one call.",
        ],
    },
    veto: {
        id: "veto-v1",
        title: "Map veto",
        lines: [
            "Ban and pick maps for the series. Every club has best and worst maps: ban their best, pick yours. The read edge and each side's comfort count in every round on that map; recent results are history only.",
        ],
    },
    live: {
        id: "live-v1",
        title: "Coaching the live match",
        lines: [
            "Coach calls change the round as it plays: Go now, Fake and swing or Save on T; rotate, hold for the retake or save on CT. Two per round.",
            "Between rounds you can call the buy and take a timeout. The result screen grades every call you made.",
        ],
    },
} as const satisfies Record<string, ScreenTip>

export function FirstVisitTip({ tip }: { tip: ScreenTip }) {
    const seen = useSettingsStore(s => s.seenTips.includes(tip.id))
    const markTipSeen = useSettingsStore(s => s.markTipSeen)
    if (seen) return null
    return (
        <aside role="note" aria-labelledby={`tip-${tip.id}`} className="flex gap-3 rounded-lg border border-gold/40 bg-panel px-4 py-3">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
                <p id={`tip-${tip.id}`} className="text-sm font-semibold text-ink-1">{tip.title}</p>
                {tip.lines.map(line => <p key={line} className="text-xs leading-relaxed text-ink-2">{line}</p>)}
            </div>
            <button type="button" onClick={() => markTipSeen(tip.id)} aria-label={`Dismiss tip: ${tip.title}`}
                className="h-7 w-7 shrink-0 rounded text-ink-3 transition-colors hover:bg-raised hover:text-ink-1 flex items-center justify-center">
                <X size={14} aria-hidden="true" />
            </button>
        </aside>
    )
}
