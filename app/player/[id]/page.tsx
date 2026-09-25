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
            <div className="container mx-auto px-4 py-6">
                <div role="status" aria-label="Loading player profile" className="h-64 animate-pulse rounded-lg bg-white/5" />
            </div>
        )
    }

    if (!player) {
        return notFound()
    }

    return (
        <div className="w-full min-w-0 max-w-[1440px] mx-auto px-2 sm:px-4 py-3 space-y-3">
            <div className="flex items-center gap-4">
                <Button variant="ghost" className="h-8 gap-2 px-2 text-slate-400" aria-label="Go back" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4" /> Back
                </Button>
            </div>

            <PlayerDetail player={player} />
        </div>
    )
}
