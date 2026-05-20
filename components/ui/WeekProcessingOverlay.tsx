"use client"

import { useEffect, useRef } from "react"
import { useGameStore } from "@/store/game-store"
import { Trophy, Frown, Newspaper, ArrowRight, Sparkles } from "lucide-react"

/**
 * Full-screen overlay for week advancement. Two phases:
 *  1. Processing — an animated pipeline shown while the week simulates.
 *  2. Reveal — a "week in review" ticker; results stream in one by one.
 *
 * Phase 1 is CSS-only on purpose: a synchronous week-processor fallback can
 * block the main thread, which would freeze any JS-driven animation. Phase 2
 * runs after processing, when the main thread is free again, but is kept
 * CSS-driven too for consistency.
 */

const PROCESSING_STAGES = [
  "Simulating matches",
  "Resolving standings",
  "Processing transfers",
  "Updating finances",
  "Tallying rankings",
]

export function WeekProcessingOverlay() {
  const isLoading = useGameStore(s => s.isLoading)
  const weekReveal = useGameStore(s => s.weekReveal)
  const dismissWeekReveal = useGameStore(s => s.dismissWeekReveal)
  const continueRef = useRef<HTMLButtonElement>(null)

  const showReveal = !isLoading && !!weekReveal

  useEffect(() => {
    if (!showReveal) return
    const focusTimer = setTimeout(() => continueRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        dismissWeekReveal()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [showReveal, dismissWeekReveal])

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 z-overlay flex items-center justify-center bg-black/70 backdrop-blur-md"
        role="alert"
        aria-live="assertive"
        aria-label="Processing week advancement"
      >
        <div className="esm-pop flex w-[340px] flex-col items-center gap-6 rounded-2xl liquid-panel p-8">
          {/* Rotating ring */}
          <div className="relative h-16 w-16">
            <div className="esm-ring absolute inset-0 rounded-full" />
            <div className="absolute inset-[6px] rounded-full border border-white/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-cyan-200" />
            </div>
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Advancing week
          </p>

          {/* Stage pipeline */}
          <div className="flex w-full flex-col gap-2.5">
            {PROCESSING_STAGES.map((stage, i) => (
              <div
                key={stage}
                className="esm-stage flex items-center gap-3"
                style={{ animationDelay: `${i * 0.55}s` }}
              >
                <span className="esm-stage-dot h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                <span className="text-xs font-medium text-white/70">{stage}</span>
              </div>
            ))}
          </div>

          {/* Indeterminate bar */}
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div className="esm-bar absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
          </div>
        </div>

        <style jsx>{`
          .esm-pop {
            animation: esmPop 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .esm-ring {
            background: conic-gradient(from 0deg, transparent 0deg, #22d3ee 90deg, transparent 220deg);
            -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
            animation: esmSpin 1.1s linear infinite;
          }
          .esm-stage {
            animation: esmStage 2.75s ease-in-out infinite;
          }
          .esm-stage-dot {
            animation: esmDot 2.75s ease-in-out infinite;
            animation-delay: inherit;
          }
          .esm-bar {
            animation: esmBar 1.5s ease-in-out infinite;
          }
          @keyframes esmPop {
            from { opacity: 0; transform: scale(0.94) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes esmSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes esmStage {
            0%, 100% { opacity: 0.35; }
            12%, 26% { opacity: 1; }
          }
          @keyframes esmDot {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); }
            12%, 26% { transform: scale(1.6); box-shadow: 0 0 10px 1px rgba(34, 211, 238, 0.6); }
          }
          @keyframes esmBar {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(330%); }
          }
        `}</style>
      </div>
    )
  }

  if (showReveal && weekReveal) {
    const { week, headline, items } = weekReveal
    const continueDelay = 0.18 + items.length * 0.14 + 0.1

    return (
      <div
        className="fixed inset-0 z-overlay flex items-center justify-center bg-black/72 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label={`Week ${week} review`}
      >
        <div className="esm-pop flex max-h-[80vh] w-[420px] flex-col rounded-2xl liquid-panel p-7">
          {/* Header */}
          <div className="esm-head mb-5 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              Week {week} complete
            </span>
            <span className="text-2xl font-normal uppercase tracking-tight text-white">
              {headline}
            </span>
          </div>

          {/* Ticker */}
          <div className="-mr-2 flex flex-col gap-2 overflow-y-auto pr-2">
            {items.map((item, i) => {
              const Icon =
                item.kind === "match"
                  ? item.tone === "win" ? Trophy : Frown
                  : Newspaper
              const accent =
                item.tone === "win"
                  ? "border-emerald-400/25 bg-emerald-400/[0.07]"
                  : item.tone === "loss"
                    ? "border-rose-400/25 bg-rose-400/[0.07]"
                    : "border-white/[0.08] bg-white/[0.03]"
              const iconColor =
                item.tone === "win"
                  ? "text-emerald-300"
                  : item.tone === "loss"
                    ? "text-rose-300"
                    : "text-sky-300/80"
              return (
                <div
                  key={item.id}
                  className={`esm-item flex items-center gap-3 rounded-lg border px-3.5 py-3 ${accent}`}
                  style={{ animationDelay: `${0.18 + i * 0.14}s` }}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-white/90">
                      {item.title}
                    </span>
                    {item.detail && (
                      <span className="text-xs text-white/45">{item.detail}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Continue */}
          <button
            ref={continueRef}
            onClick={dismissWeekReveal}
            className="esm-continue mt-5 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-transform hover:scale-[1.015] focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            style={{ animationDelay: `${continueDelay}s` }}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <style jsx>{`
          .esm-pop {
            animation: esmPop 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .esm-head {
            animation: esmRise 0.4s ease-out both;
          }
          .esm-item {
            animation: esmRise 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .esm-continue {
            animation: esmRise 0.4s ease-out both;
          }
          @keyframes esmPop {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes esmRise {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  return null
}
