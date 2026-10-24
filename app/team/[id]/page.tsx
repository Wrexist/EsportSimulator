"use client"

import { notFound, useParams, useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { ArrowLeft } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { Button } from "@/components/ui/button"
import { TeamProfile } from "@/components/team/TeamProfile"

export default function TeamPage() {
    const { id } = useParams()
    const router = useRouter()
    const { teams, _hasHydrated, isLoading } = useGameStore(useShallow(state => ({
        teams: state.teams,
        _hasHydrated: state._hasHydrated,
        isLoading: state.isLoading,
    })))
    const itemId = decodeURIComponent(Array.isArray(id) ? id[0] : id ?? "")
    const team = teams.find(t => t.id === itemId)

    // Same hydration wait as the player page: a deep link lands before the career loads.
    if (!_hasHydrated || (!team && isLoading)) {
        return (
            <div className="mx-auto max-w-[1600px]">
                <div role="status" aria-label="Loading club" className="h-64 animate-pulse rounded-lg border border-line bg-panel" />
            </div>
        )
    }
    if (!team) return notFound()

    return (
        <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-3 pb-16">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-ink-3" aria-label="Go back" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <TeamProfile team={team} />
        </div>
    )
}
