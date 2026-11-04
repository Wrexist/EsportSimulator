"use client"
import { t } from "@/lib/i18n"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerDetail } from "@/components/player/player-detail"
import { notFound, useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, UserX } from "lucide-react"
import { EmptyState } from "@/src/components/ui/EmptyState"

export default function PlayerPage() {
    const { id } = useParams()
    const router = useRouter()
    const { players, _hasHydrated, isLoading, inCareer } = useGameStore(useShallow(state => ({
        players: state.players,
        inCareer: !!state.playerTeamId,
        _hasHydrated: state._hasHydrated,
        isLoading: state.isLoading,
    })))

    // Find player directly in the global players collection
    const itemId = Array.isArray(id) ? id[0] : id
    const player = players.find(p => p.id === itemId)

    // The store hydrates asynchronously from persisted storage. On a hard
    // load / refresh / deep-link of a player URL, `players` is briefly empty —
    // Settings hydrate before the active career finishes loading. Wait for
    // both before deciding a missing player is a genuine 404.
    if (!_hasHydrated || (!player && isLoading)) {
        return (
            <div className="mx-auto max-w-[1600px]">
                <div role="status" aria-label={t("player.loading")} className="h-64 animate-pulse rounded-lg border border-line bg-panel" />
            </div>
        )
    }

    if (!player) {
        // SQUAD-23: inside a career, offer the way back to the squad, not the main menu.
        if (inCareer) {
            return (
                <div className="mx-auto max-w-[1600px] py-10">
                    <EmptyState icon={UserX} title={t("player.notFound")} description={t("player.notFoundBody")} action={{ label: t("player.backToSquad"), href: "/squad" }} />
                </div>
            )
        }
        return notFound()
    }

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-3 pb-16">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-ink-3" aria-label={t("player.goBack")} onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" /> {t("player.back")}
            </Button>
            <PlayerDetail player={player} />
        </div>
    )
}
