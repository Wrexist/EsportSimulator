"use client"

import { ErrorBoundary } from "@/components/ui/error-boundary"
import { MarketBoard } from "@/components/transfer/MarketBoard"

export default function TransfersPage() {
  return (
    <ErrorBoundary section="Transfers">
      <MarketBoard mode="transfers" />
    </ErrorBoundary>
  )
}
