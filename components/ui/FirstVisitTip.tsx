"use client"
import { t } from "@/lib/i18n"

import { Lightbulb, X } from "lucide-react"
import { useSettingsStore } from "@/lib/settings-store"

/** A tip names its text by translation key, so it reads in the active language. */
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
        title: "tip.tactics.title",
        lines: ["tip.tactics.1", "tip.tactics.2", "tip.tactics.3"],
    },
    veto: {
        id: "veto-v1",
        title: "tip.veto.title",
        lines: ["tip.veto.1"],
    },
    live: {
        id: "live-v1",
        title: "tip.live.title",
        lines: ["tip.live.1", "tip.live.2"],
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
                <p id={`tip-${tip.id}`} className="text-sm font-semibold text-ink-1">{t(tip.title)}</p>
                {tip.lines.map(line => <p key={line} className="text-xs leading-relaxed text-ink-2">{t(line)}</p>)}
            </div>
            <button type="button" onClick={() => markTipSeen(tip.id)} aria-label={t("tip.dismiss", { title: t(tip.title) })}
                className="h-7 w-7 shrink-0 rounded text-ink-3 transition-colors hover:bg-raised hover:text-ink-1 flex items-center justify-center">
                <X size={14} aria-hidden="true" />
            </button>
        </aside>
    )
}
