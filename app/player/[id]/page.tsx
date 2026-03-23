"use client"

import { useGameStore } from "@/store/game-store"
import { PlayerDetail } from "@/components/player/player-detail"
import { notFound, useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function PlayerPage() {
    const { id } = useParams()
    const router = useRouter()
    const { players } = useGameStore()

    // Find player directly in the global players collection
    const itemId = Array.isArray(id) ? id[0] : id
    const player = players.find(p => p.id === itemId)

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
