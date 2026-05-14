"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Bug, ChevronDown, ChevronUp, X, ImagePlus, Clipboard, Send } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { useToast } from "@/lib/toast"
import { errorTracker } from "@/lib/error-tracking"
import { soundManager } from "@/lib/sound-manager"
import { safeParse } from "@/lib/json-safe"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const GAME_VERSION = "1.0.0"

const CATEGORIES = [
  { value: "gameplay", label: "Gameplay", color: "text-amber-400" },
  { value: "ui", label: "UI / Visual", color: "text-blue-400" },
  { value: "match-engine", label: "Match Engine", color: "text-red-400" },
  { value: "transfers", label: "Transfers", color: "text-green-400" },
  { value: "economy", label: "Economy", color: "text-yellow-400" },
  { value: "save-load", label: "Save / Load", color: "text-purple-400" },
  { value: "performance", label: "Performance", color: "text-orange-400" },
  { value: "other", label: "Other", color: "text-gray-400" },
] as const

type Category = typeof CATEGORIES[number]["value"]

interface BugReportForm {
  category: Category | ""
  title: string
  description: string
  steps: string
  screenshot: string | null // base64 data URL
}

const initialForm: BugReportForm = {
  category: "",
  title: "",
  description: "",
  steps: "",
  screenshot: null,
}

function collectDebugInfo(pathname: string | null) {
  const state = useGameStore.getState()
  const playerTeam = state.teams.find(t => t.id === state.playerTeamId)

  let recentErrors: { message: string; timestamp: number }[] = []
  try {
    recentErrors = errorTracker.getReports().slice(-5).map(e => ({
      message: e.message,
      timestamp: e.timestamp,
    }))
  } catch { /* ignore */ }

  let breadcrumbs: { message: string; timestamp: number }[] = []
  try {
    const parsed = safeParse<{ message: string; timestamp: number }[]>(
      sessionStorage.getItem("error-breadcrumbs"),
      []
    )
    if (parsed) breadcrumbs = parsed.slice(-10)
  } catch { /* ignore */ }

  let memoryInfo = ""
  try {
    const perf = performance as any
    if (perf.memory) {
      const used = Math.round(perf.memory.usedJSHeapSize / 1048576)
      const total = Math.round(perf.memory.totalJSHeapSize / 1048576)
      memoryInfo = `${used}MB / ${total}MB`
    }
  } catch { /* ignore */ }

  return {
    gameVersion: GAME_VERSION,
    saveId: state.saveId || "N/A",
    currentWeek: state.currentWeek,
    difficulty: state.difficulty || "normal",
    teamName: playerTeam?.name || "N/A",
    teamId: state.playerTeamId || "N/A",
    managerName: state.managerDetails?.name || "N/A",
    managerRep: state.managerDetails?.reputation ?? "N/A",
    route: pathname || "N/A",
    platform: typeof navigator !== "undefined" ? navigator.platform : "N/A",
    electron: typeof window !== "undefined" && !!(window as any).electron,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "N/A",
    resolution: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "N/A",
    memory: memoryInfo || "N/A",
    timestamp: new Date().toISOString(),
    recentErrors,
    breadcrumbs,
  }
}

function formatReport(form: BugReportForm, debug: ReturnType<typeof collectDebugInfo>): string {
  const lines: string[] = [
    "========================================",
    "BUG REPORT - Esports Manager Simulator",
    "========================================",
    "",
    `Category: ${CATEGORIES.find(c => c.value === form.category)?.label || form.category}`,
    `Title: ${form.title}`,
    "",
    "DESCRIPTION:",
    form.description,
    "",
    "STEPS TO REPRODUCE:",
    form.steps || "Not provided",
    "",
    `SCREENSHOT: ${form.screenshot ? "Attached separately" : "None"}`,
    "",
    "--- DEBUG INFO ---",
    `Game Version: ${debug.gameVersion}`,
    `Save ID: ${debug.saveId}`,
    `Current Week: ${debug.currentWeek}`,
    `Difficulty: ${debug.difficulty}`,
    `Team: ${debug.teamName} (${debug.teamId})`,
    `Manager: ${debug.managerName} (Rep: ${debug.managerRep})`,
    `Route: ${debug.route}`,
    `Platform: ${debug.platform}`,
    `Electron: ${debug.electron ? "Yes" : "No"}`,
    `User Agent: ${debug.userAgent}`,
    `Resolution: ${debug.resolution}`,
    `Memory: ${debug.memory}`,
    `Timestamp: ${debug.timestamp}`,
  ]

  if (debug.recentErrors.length > 0) {
    lines.push("", "Recent Errors:")
    debug.recentErrors.forEach(e => {
      lines.push(`  - ${e.message} @ ${new Date(e.timestamp).toISOString()}`)
    })
  }

  if (debug.breadcrumbs.length > 0) {
    lines.push("", "Recent Actions:")
    debug.breadcrumbs.forEach((b: any) => {
      lines.push(`  - ${b.message || b.category || "action"} @ ${new Date(b.timestamp).toISOString()}`)
    })
  }

  lines.push("", "========================================")
  return lines.join("\n")
}

export function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<BugReportForm>({ ...initialForm })
  const [showDebug, setShowDebug] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()
  const { toast } = useToast()

  const updateField = useCallback(<K extends keyof BugReportForm>(key: K, value: BugReportForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const handleScreenshotPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          updateField("screenshot", reader.result as string)
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }, [updateField])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      updateField("screenshot", reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }, [updateField])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!form.category) newErrors.category = "Please select a category"
    if (!form.title.trim()) newErrors.title = "Please enter a title"
    if (!form.description.trim()) newErrors.description = "Please describe the bug"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)

    try {
      const debug = collectDebugInfo(pathname)
      const reportText = formatReport(form, debug)

      await navigator.clipboard.writeText(reportText)

      // Download screenshot if attached
      if (form.screenshot) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-")
        const link = document.createElement("a")
        link.href = form.screenshot
        link.download = `bug_report_screenshot_${ts}.png`
        link.click()
      }

      toast({
        title: "Bug Report Copied!",
        description: "The report has been copied to your clipboard. Paste it in Discord or GitHub.",
      })

      setForm({ ...initialForm })
      setShowDebug(false)
      setErrors({})
      setOpen(false)
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpen = () => {
    soundManager.play("click")
    setOpen(true)
  }

  // Collect debug for preview
  const debugInfo = open ? collectDebugInfo(pathname) : null

  return (
    <>
      {/* Floating Bug Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-devtools group transition-transform duration-75 ease-out will-change-transform hover:scale-110 active:scale-95 active:duration-0 select-none touch-manipulation"
        title="Report a Bug"
      >
        <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg shadow-black/30 hover:bg-white/15 hover:border-white/30 transition-colors cursor-pointer">
          <Bug className="w-5 h-5 text-red-400 group-hover:text-red-300 transition-colors" />
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#080a0e] animate-pulse" />
        </div>

        {/* Hover tooltip */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-sm border border-white/10 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Report a Bug
        </div>
      </button>

      {/* Bug Report Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="bg-[#0e1217]/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0"
          onPaste={handleScreenshotPaste}
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5 flex-shrink-0">
            <DialogTitle className="flex items-center gap-3 text-lg font-normal">
              <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                <Bug className="h-5 w-5" />
              </div>
              Report a Bug
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Help us improve the game by reporting issues you encounter.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Form */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Category */}
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={form.category}
                onChange={e => updateField("category", e.target.value as Category)}
                className={`w-full bg-white/5 border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-[border-color,box-shadow] duration-100 ease-out ${
                  errors.category ? "border-red-500/50" : "border-white/10"
                }`}
              >
                <option value="" className="bg-[#1a1f2e]">Select a category...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value} className="bg-[#1a1f2e]">
                    {cat.label}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-400 mt-1">{errors.category}</p>}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => updateField("title", e.target.value)}
                placeholder="Brief summary of the issue..."
                maxLength={120}
                className={`w-full bg-white/5 border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-[border-color,box-shadow] duration-100 ease-out ${
                  errors.title ? "border-red-500/50" : "border-white/10"
                }`}
              />
              {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={e => updateField("description", e.target.value)}
                placeholder="What happened? What did you expect to happen?"
                rows={4}
                className={`w-full bg-white/5 border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-[border-color,box-shadow] duration-100 ease-out resize-none ${
                  errors.description ? "border-red-500/50" : "border-white/10"
                }`}
              />
              {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description}</p>}
            </div>

            {/* Steps to Reproduce */}
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Steps to Reproduce <span className="text-white/30 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.steps}
                onChange={e => updateField("steps", e.target.value)}
                placeholder={"1. Go to...\n2. Click on...\n3. Notice that..."}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-[border-color,box-shadow] duration-100 ease-out resize-none"
              />
            </div>

            {/* Screenshot */}
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">
                Screenshot <span className="text-white/30 font-normal">(optional)</span>
              </label>
              {form.screenshot ? (
                <div className="relative group rounded-lg overflow-hidden border border-white/10 bg-white/5">
                  <img
                    src={form.screenshot}
                    alt="Bug screenshot"
                    className="w-full max-h-48 object-contain bg-black/30"
                  />
                  <button
                    onClick={() => updateField("screenshot", null)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white hover:bg-red-500/30 transition-colors duration-100 ease-out active:scale-95 active:duration-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-colors duration-100 ease-out cursor-pointer active:scale-[0.99] active:duration-0"
                >
                  <ImagePlus className="w-6 h-6 text-white/30" />
                  <div className="text-center">
                    <p className="text-sm text-white/50">Click to browse or <span className="text-red-400/70">Ctrl+V</span> to paste</p>
                    <p className="text-xs text-white/25 mt-0.5">PNG, JPG, or GIF</p>
                  </div>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Debug Info (Collapsible) */}
            {debugInfo && (
              <div className="rounded-lg border border-white/5 overflow-hidden">
                <button
                  onClick={() => setShowDebug(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                    Debug Info (auto-captured)
                  </span>
                  {showDebug ? (
                    <ChevronUp className="w-4 h-4 text-white/30" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-white/30" />
                  )}
                </button>
                <AnimatePresence>
                  {showDebug && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-black/20 border-t border-white/5 space-y-1 font-mono text-xs text-white/40">
                        <p>Game Version: <span className="text-white/60">{debugInfo.gameVersion}</span></p>
                        <p>Save ID: <span className="text-white/60">{debugInfo.saveId}</span></p>
                        <p>Week: <span className="text-white/60">{debugInfo.currentWeek}</span></p>
                        <p>Difficulty: <span className="text-white/60">{debugInfo.difficulty}</span></p>
                        <p>Team: <span className="text-white/60">{debugInfo.teamName} ({debugInfo.teamId})</span></p>
                        <p>Manager: <span className="text-white/60">{debugInfo.managerName} (Rep: {debugInfo.managerRep})</span></p>
                        <p>Route: <span className="text-white/60">{debugInfo.route}</span></p>
                        <p>Platform: <span className="text-white/60">{debugInfo.platform}</span></p>
                        <p>Electron: <span className="text-white/60">{debugInfo.electron ? "Yes" : "No"}</span></p>
                        <p>Resolution: <span className="text-white/60">{debugInfo.resolution}</span></p>
                        <p>Memory: <span className="text-white/60">{debugInfo.memory}</span></p>
                        {debugInfo.recentErrors.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/5">
                            <p className="text-white/50 font-bold mb-1">Recent Errors ({debugInfo.recentErrors.length}):</p>
                            {debugInfo.recentErrors.map((e, i) => (
                              <p key={i} className="text-red-400/60 truncate">- {e.message}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/5 flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 hover:border-red-500/30 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-100 ease-out text-sm font-bold active:scale-[0.98] active:duration-0"
            >
              <Clipboard className="w-4 h-4" />
              {submitting ? "Copying..." : "Copy Report to Clipboard"}
            </button>
            <p className="text-center text-xs text-white/25 mt-2">
              Report will be copied to your clipboard. Paste it in Discord or GitHub Issues.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
