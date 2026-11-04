"use client"

import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { t } from "@/lib/i18n"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Steam's "write a review" page for this app; opens in the OS browser via the external-link allowlist. */
export const STEAM_REVIEW_URL = "https://store.steampowered.com/recommended/recommendgame/4326170"

/**
 * Asks once per device for a Steam review, after the player's club lifts its
 * first trophy in a career. Either answer closes it for good; nothing is
 * offered in return. GameShell only mounts it when no moment or match screen
 * is on top.
 */
export function ReviewAsk() {
    const done = useSettingsStore(state => state.reviewAskDone)
    const setDone = useSettingsStore(state => state.setReviewAskDone)
    const hydrated = useGameStore(state => state._hasHydrated)
    const firstTrophy = useGameStore(state => {
        if (!state.saveId || !state.playerTeamId || state.draftCup || state.gameOverReason) return false
        const team = state.teams.find(t => t.id === state.playerTeamId)
        return (team?.trophies?.length ?? 0) > 0
    })
    if (!hydrated || done || !firstTrophy) return null

    return (
        <Dialog open onOpenChange={open => { if (!open) setDone() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl font-bold uppercase text-ink-1">{t("rv.title")}</DialogTitle>
                    <DialogDescription className="text-sm text-ink-2">
                        {t("rv.body")}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <button type="button" onClick={setDone} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-hover hover:text-ink-1">
                        {t("rv.later")}
                    </button>
                    <a href={STEAM_REVIEW_URL} target="_blank" rel="noreferrer" onClick={setDone} className="rounded-lg border border-gold bg-gold px-4 py-2 text-center text-sm font-bold text-gold-on hover:border-gold-hover hover:bg-gold-hover">
                        {t("rv.write")}
                    </a>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
