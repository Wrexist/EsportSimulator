"use client"

import { useGameStore } from "@/store/game-store"

/**
 * Full-screen overlay shown during advanceWeek processing.
 * Uses CSS-only animations to avoid Framer Motion overhead.
 */
export function WeekProcessingOverlay() {
  const isLoading = useGameStore(s => s.isLoading)

  if (!isLoading) return null

  return (
    <div
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
      aria-label="Processing week advancement"
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl glass-panel">
        {/* Spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 animate-spin" />
        </div>
        <p className="text-sm font-medium text-white/80 tracking-wide">
          Processing week...
        </p>
      </div>
    </div>
  )
}
