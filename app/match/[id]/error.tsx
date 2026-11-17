"use client"

// Per-route error boundary for the match flow (veto/tactics/live/result).
// Catches simulation crashes without taking down the whole app; the card
// (components/match/MatchCrashCard.tsx) offers "Simulate instead" so a
// crashing match can never brick the save.

import { MatchCrashCard } from "@/components/match/MatchCrashCard"

export default function MatchError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return <MatchCrashCard error={error} reset={reset} />
}
