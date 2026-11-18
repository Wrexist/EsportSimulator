"use client"

// The match flow's crash screen (veto/tactics/live/result), used by the
// route error page (app/match/[id]/error.tsx) and by the error boundaries
// inside the match screens (the match layout and the live page, CROSSCUT-13).
// It always offers a way out that can never brick the save:
//   1. "Simulate instead": finish the match without the live screen (from its
//      checkpoint when rounds were played, see lib/live-match-rescue.ts). This
//      commits a result and drops the match lock, so the week can advance.
//   2. "Back to schedule": bail without resolving (still replayable).
// Without (1), a deterministically crashing match left the player unable to
// play it AND unable to leave it (the lock) or advance the week.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { RefreshCw, Calendar, FastForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CrashCard, crashDetails } from "@/components/ui/crash-card"
import { gameErrors } from "@/lib/error-tracking"
import { resolveMatchWithoutLiveScreen } from "@/lib/live-match-rescue"
import { toast } from "@/lib/toast"
import { t } from "@/lib/i18n"

export function MatchCrashCard({ error, reset, section = "Match" }: { error: Error; reset: () => void; section?: string }) {
    const router = useRouter()
    const params = useParams()
    const matchId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined)
    const [resolving, setResolving] = useState(false)

    useEffect(() => {
        // Report match-flow crashes through the match-simulation channel so
        // production failures here are not silently lost.
        gameErrors.matchSimulation(error)
        if (process.env.NODE_ENV !== "production") {
            console.error("[Match Error]", error)
        }
    }, [error])

    const handleSimulate = async () => {
        if (!matchId || resolving) return
        setResolving(true)
        try {
            // false = refused (the store toasted why); still leave the crashed
            // screen. Advancing the week resolves an unplayable fixture.
            if (await resolveMatchWithoutLiveScreen(matchId)) toast.success(t("matchError.resolved"))
            router.push("/schedule")
        } catch (e) {
            // Even the headless sim failed: leave the user on this screen with
            // the other options rather than make things worse.
            if (process.env.NODE_ENV !== "production") console.error("[Match Error] instant-sim fallback failed", e)
            toast.error(t("matchError.failed"))
            setResolving(false)
        }
    }

    return (
        <CrashCard
            title={t("matchError.title")}
            body={t("matchError.body")}
            message={error.message}
            details={() => crashDetails(error, section)}
            actions={
                <>
                    {matchId && (
                        <Button onClick={handleSimulate} disabled={resolving}>
                            <FastForward aria-hidden="true" />
                            {resolving ? t("advance.simulating") : t("matchError.simulate")}
                        </Button>
                    )}
                    <Button onClick={reset} disabled={resolving} variant="outline">
                        <RefreshCw aria-hidden="true" />
                        {t("matchError.retry")}
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/schedule">
                            <Calendar aria-hidden="true" />
                            {t("result.schedule")}
                        </Link>
                    </Button>
                </>
            }
        />
    )
}
