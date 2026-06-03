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
    const { players, _hasHydrated } = useGameStore(useShallow(state => ({
        players: state.players,
        _hasHydrated: state._hasHydrated,
    })))

    // Find player directly in the global players collection
    const itemId = Array.isArray(id) ? id[0] : id
    const player = players.find(p => p.id === itemId)

    // The store hydrates asynchronously from persisted storage. On a hard
    // load / refresh / deep-link of a player URL, `players` is briefly empty —
    // calling notFound() then would 404 a perfectly valid profile. Wait for
    // hydration before deciding the player doesn't exist.
    if (!_hasHydrated) {
        return (
            <div className="container mx-auto px-4 py-6">
                <div className="h-64 animate-pulse rounded-lg bg-white/5" />
            </div>
        )
    }

    if (!player) {
        return notFound()
    }

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => router.back()}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
            </div>

            <PlayerDetail player={player} />
        </div>
    )
}
