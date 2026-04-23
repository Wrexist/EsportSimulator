"use client"

import { ErrorBoundary } from "@/components/ui/error-boundary"

export default function MatchLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <ErrorBoundary section="Match Simulation">{children}</ErrorBoundary>
}
