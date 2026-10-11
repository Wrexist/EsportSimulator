"use client"

import { ErrorBoundary } from "@/components/ui/error-boundary"
import { WeekPlan } from "@/components/week/WeekPlan"

export default function WeekPage() {
    return (
        <ErrorBoundary section="Week plan">
            <WeekPlan />
        </ErrorBoundary>
    )
}
