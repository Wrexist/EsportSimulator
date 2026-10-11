"use client"

import { useGameStore } from "@/store/game-store"
import { Sparkles } from "lucide-react"
import type { WeekProgressPhase } from "@/store/types"
import { WeekReportModal } from "@/components/report/WeekReportModal"
import { WeekReportToast } from "@/components/report/WeekReportToast"

/**
 * Full-screen overlay for week advancement, then the weekly report.
 *  1. Processing: the real stages of advanceWeek while the week simulates.
 *     During a Continue run it also offers "Stop after this week".
 *  2. Report: the weekly report modal (weekly mode, end of a Continue run)
 *     or a compact toast (daily mode). Replaces the old "week in review".
 *
 * Phase 1 is CSS-only on purpose: a synchronous week-processor fallback can
 * block the main thread, which would freeze any JS-driven animation.
 */

// The real stages of advanceWeek, in order. The list marks the stage the
// store reports (weekProgress); it never animates through stages that have not
// happened (L27.A2). Long careers spend seconds in "simulating" and "saving".
const PROCESSING_STAGES: { phase: WeekProgressPhase; label: string }[] = [
  { phase: "preparing", label: "Preparing the week" },
  { phase: "simulating", label: "Simulating matches and the world" },
  { phase: "applying", label: "Applying results" },
  { phase: "saving", label: "Saving your career" },
]

export function WeekProcessingOverlay() {
  const isLoading = useGameStore(s => s.isLoading)
  const weekProgress = useGameStore(s => s.weekProgress)
  const continueRun = useGameStore(s => s.continueRun)
  const cancelContinue = useGameStore(s => s.cancelContinue)

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

          {/* Stage list: done / current / pending, driven by the store's real stage */}
          <ol className="flex w-full flex-col gap-2.5" aria-label="Week advancement stages">
            {PROCESSING_STAGES.map((stage, i) => {
              const current = Math.max(0, PROCESSING_STAGES.findIndex(s => s.phase === weekProgress))
              const state = i < current ? "done" : i === current ? "current" : "pending"
              return (
                <li key={stage.phase} className="flex items-center gap-3" aria-current={state === "current" ? "step" : undefined}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state === "pending" ? "bg-white/20" : "bg-cyan-300"} ${state === "current" ? "esm-stage-dot" : ""}`} />
                  <span className={`text-xs font-medium ${state === "current" ? "text-white" : state === "done" ? "text-white/60" : "text-white/35"}`}>
                    {stage.label}{state === "done" ? " (done)" : ""}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* Indeterminate bar */}
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/6">
            <div className="esm-bar absolute inset-y-0 w-1/3 rounded-full bg-linear-to-r/srgb from-cyan-400 to-blue-500" />
          </div>

          {continueRun && (
            <div className="flex w-full items-center justify-between gap-3 border-t border-white/10 pt-4">
              <span className="text-xs text-white/60">
                Continuing to your next decision{continueRun.weeksDone > 0 ? ` · ${continueRun.weeksDone} week${continueRun.weeksDone === 1 ? "" : "s"} done` : ""}
              </span>
              <button
                type="button"
                onClick={cancelContinue}
                disabled={continueRun.cancelRequested}
                className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
              >
                {continueRun.cancelRequested ? "Stopping…" : "Stop after this week"}
              </button>
            </div>
          )}
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
          .esm-stage-dot {
            animation: esmDot 1.4s ease-in-out infinite;
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

  return (
    <>
      <WeekReportModal />
      <WeekReportToast />
    </>
  )
}
