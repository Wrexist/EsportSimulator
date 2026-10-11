"use client"

import { ErrorBoundary } from "@/components/ui/error-boundary"
import { MarketBoard } from "@/components/transfer/MarketBoard"

export default function ScoutingPage() {
  return (
    <ErrorBoundary section="Scouting">
      <MarketBoard mode="scouting" />
    </ErrorBoundary>
  )
}
