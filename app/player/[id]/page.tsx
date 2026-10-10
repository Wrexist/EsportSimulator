"use client"

import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerDetail } from "@/components/player/player-detail"
import { notFound, useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function PlayerPage() {
    const { id } = useParams()
    const router = useRouter()
    const { players, _hasHydrated, isLoading } = useGameStore(useShallow(state => ({
        players: state.players,
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
                <div role="status" aria-label="Loading player profile" className="h-64 animate-pulse rounded-lg border border-line bg-panel" />
            </div>
        )
    }

    if (!player) {
        return notFound()
    }

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-3 pb-16">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-ink-3" aria-label="Go back" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <PlayerDetail player={player} />
        </div>
    )
}
