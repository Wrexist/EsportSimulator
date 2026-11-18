"use client"

import { ErrorBoundary } from "@/components/ui/error-boundary"
import { MatchCrashCard } from "@/components/match/MatchCrashCard"

export default function MatchLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // A crash here gets the match escape ("Simulate instead"), not the generic card (CROSSCUT-13).
    return (
        <ErrorBoundary section="Match Simulation" fallback={(error, reset) => <MatchCrashCard error={error} reset={reset} section="Match Simulation" />}>
            {children}
        </ErrorBoundary>
    )
}
