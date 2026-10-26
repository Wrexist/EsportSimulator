"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Copy, Download, Upload, Trophy, Lock, Eye, EyeOff,
    Star, Crown, DollarSign, TrendingUp, Award, Flame, Medal, Sparkles, Crosshair, Gem, Shield, Globe,
    Swords, Rocket, Heart, BarChart3, Calendar, Handshake, HeartCrack, RefreshCcw, Landmark,
} from "lucide-react"
import { useToast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { steamService as steamAchievements, Achievement } from "@/engine/steam-service"
import { isDevToolsEnabled } from "@/lib/runtime-flags"
import { saveManager } from "@/engine"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { AccessibilitySettings, AudioSettings, ControlsSettings, DisplaySettings, GameplaySettings, SettingRow } from "@/components/settings/SettingsSections"

type SettingsTab = "SETTINGS" | "ACHIEVEMENTS" | "DEV_TOOLS"

const ACHIEVEMENT_ICON: Record<string, typeof Trophy> = {
  FIRST_WIN: Trophy, WIN_10: Star, WIN_25: Star, WIN_50: Flame, WIN_100: Medal, WIN_250: Sparkles, WIN_500: Crown,
  FIRST_TOURNAMENT: Crosshair, WIN_B_TIER: Award, WIN_A_TIER: Award, WIN_MAJOR: Crown, GRAND_SLAM: Gem, DYNASTY: Crown, PERFECT_TOURNAMENT: Shield,
  REACH_S_TIER: Gem, TOP_10_RANKING: Globe, NUMBER_ONE: Crown, COMEBACK_KING: Flame, UNDERDOG: Swords,
  FIRST_MILLION: DollarSign, BUDGET_10M: Gem, DEVELOP_STAR: TrendingUp, HALL_OF_FAME_INDUCTION: Landmark, LOYAL_TEAM: Heart, PROFIT_MASTER: BarChart3, ZERO_TO_HERO: Rocket,
  TOURNAMENT_WIN: Trophy, SEASON_COMPLETE: Calendar, FIRST_TRANSFER: Handshake,
  UNLUCKY: HeartCrack, REDEMPTION: RefreshCcw,
}

const LICENSES: [string, string][] = [
  ["Electron", "MIT"], ["Chromium", "BSD"], ["Node.js", "MIT"], ["Next.js", "MIT"], ["React", "MIT"], ["Zustand", "MIT"],
  ["Radix UI primitives", "MIT"], ["Tailwind CSS", "MIT"], ["Framer Motion", "MIT"], ["Lucide icons", "ISC"], ["steamworks.js", "MIT"],
  ["Inter (font)", "SIL OFL 1.1"], ["Barlow Condensed (font)", "SIL OFL 1.1"],
]

export default function SettingsPage() {
  const careerLoaded = useGameStore(state => state.isInitialized && !!state.playerTeamId)
  const router = useRouter()
  const sandboxOn = useGameStore(state => !!state.sandbox)
  const enableSandbox = useGameStore(state => state.enableSandbox)
  const devToolsEnabled = isDevToolsEnabled()
  const { saveGame, deleteAllSaves } = useGameStore(useShallow(state => ({
    saveGame: state.saveGame,
    deleteAllSaves: state.deleteAllSaves,
  })))
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>("SETTINGS")

  // Save location (Electron). Resolved once on mount.
  const [saveLocation, setSaveLocation] = useState<string | null>(null)
  useEffect(() => {
    const bridge = (typeof window !== 'undefined' ? (window as any).electron?.app : null)
    if (bridge?.getUserDataPath) {
      bridge.getUserDataPath().then((p: string | null) => setSaveLocation(p)).catch(() => {})
    }
  }, [])

  // Import save — hidden file input triggered by button
  const importInputRef = useRef<HTMLInputElement>(null)
  const [licensesOpen, setLicensesOpen] = useState(false)
  const licensesButtonRef = useRef<HTMLButtonElement>(null)

  // Achievements state
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [achievementsProgress, setAchievementsProgress] = useState({ unlocked: 0, total: 0, percentage: 0 })
  const [showHidden, setShowHidden] = useState(false)
  const [isAchievementsInitialized, setIsAchievementsInitialized] = useState(false)

  useEffect(() => {
    const init = async () => {
      await steamAchievements.initialize()
      setAchievements(steamAchievements.getAllAchievements())
      setAchievementsProgress(steamAchievements.getProgress())
      setIsAchievementsInitialized(true)
    }
    init()
  }, [])

  const handleSave = async () => {
    try {
      await saveGame()
      toast({ title: "Game saved", description: "Your progress has been saved." })
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Unable to save game.", variant: "destructive" })
    }
  }

  const handleCopySaveLocation = async () => {
    if (!saveLocation) return
    try {
      await navigator.clipboard.writeText(saveLocation)
      toast({ title: "Copied", description: "Save location copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available.", variant: "destructive" })
    }
  }

  const handleImportSave = async (file: File) => {
    try {
      const text = await file.text()
      const { save, error } = saveManager.importSave(text)
      if (!save || error) {
        toast({ title: "Import failed", description: error || "Invalid save file.", variant: "destructive" })
        return
      }
      const result = await saveManager.saveGame(save)
      if (!result.success) {
        toast({ title: "Import failed", description: result.error || "Could not persist imported save.", variant: "destructive" })
        return
      }
      toast({ title: "Save imported", description: `Load "${save.saveName}" from the Load game screen.` })
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const handleExport = async () => {
    const state = useGameStore.getState()
    if (!state.saveId) {
      toast({ title: "Export failed", description: "No career is loaded.", variant: "destructive" })
      return
    }

    const { save, error } = await saveManager.loadGame(state.saveId)
    if (!save || error) {
      toast({ title: "Export failed", description: error || "Unable to load current save.", variant: "destructive" })
      return
    }

    const data = saveManager.exportSave(save)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `esports_save_export_${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    toast({ title: "Save exported", description: "Your save file has been downloaded." })
  }

  const handleDeleteAllSaves = async () => {
    if (typeof window === "undefined") return
    await deleteAllSaves()
    try {
      localStorage.removeItem("analytics-events")
      localStorage.removeItem("game-metrics")
      localStorage.removeItem("error-reports")
      localStorage.removeItem("performance-metrics")
      localStorage.removeItem("skipQuickSimConfirm")
    } catch {
      // Storage clear is best-effort; proceed regardless
    }
    window.location.href = "/main-menu"
  }

  const handleReplayTutorial = () => {
    // Replay guidance without resetting the career or changing new-game preferences.
    if (!careerLoaded) return
    useGameStore.getState().triggerTutorial()
    toast({
      title: "Guide restarted",
      description: "The first-session checklist is back on Home. Your squad, cash and results are unchanged.",
    })
  }

  // One pass: visible achievements split into unlocked / locked.
  const { unlockedAchievements, lockedAchievements } = useMemo(() => {
    const visible = showHidden ? achievements : achievements.filter(a => !a.hidden || a.unlocked)
    const unlocked: Achievement[] = []
    const locked: Achievement[] = []
    for (const a of visible) (a.unlocked ? unlocked : locked).push(a)
    return { unlockedAchievements: unlocked, lockedAchievements: locked }
  }, [achievements, showHidden])

  const renderAchievement = (achievement: Achievement) => {
    const Icon = achievement.hidden && !achievement.unlocked ? Lock : ACHIEVEMENT_ICON[achievement.id] ?? Trophy
    const secret = achievement.hidden && !achievement.unlocked
    return (
      <li key={achievement.id} className="flex items-start gap-3 px-4 py-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", achievement.unlocked ? "bg-gold/10 text-gold" : "bg-raised text-ink-3")}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-semibold", achievement.unlocked ? "text-ink-1" : "text-ink-2")}>{secret ? "Secret achievement" : achievement.name}</span>
          <span className="block text-xs leading-snug text-ink-3">{secret ? "Keep playing to discover it." : achievement.description}</span>
        </span>
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow="Options"
        title="Settings"
        subtitle="Changes apply immediately and are stored on this device."
        aside={
          <>
            <Button asChild variant="ghost"><Link href="/settings/community-import">Community &amp; Workshop</Link></Button>
            <Button asChild variant="ghost"><Link href="/credits">Credits</Link></Button>
            <Button asChild variant="outline"><Link href="/main-menu">Main menu</Link></Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList aria-label="Settings sections" className="w-full">
          <TabsTrigger value="SETTINGS">Settings</TabsTrigger>
          <TabsTrigger value="ACHIEVEMENTS">
            Achievements {isAchievementsInitialized && <span className="tabular-nums text-ink-3">{achievementsProgress.unlocked}/{achievementsProgress.total}</span>}
          </TabsTrigger>
          {devToolsEnabled && <TabsTrigger value="DEV_TOOLS">Dev tools</TabsTrigger>}
        </TabsList>
      </Tabs>

      {activeTab === "SETTINGS" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <Panel title="Display" padded={false}><DisplaySettings /></Panel>
            <Panel title="Audio" padded={false}><AudioSettings /></Panel>
            <Panel title="Accessibility" padded={false}><AccessibilitySettings /></Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Gameplay" padded={false}><GameplaySettings /></Panel>

            <Panel title="Saves" padded={false}>
              <div className="divide-y divide-line">
                <SettingRow label="Save location" hint={<span className="break-all font-mono">{saveLocation ?? "Browser storage (IndexedDB)"}</span>}>
                  {saveLocation && (
                    <Button variant="outline" size="sm" onClick={handleCopySaveLocation} className="gap-1.5"><Copy size={13} /> Copy path</Button>
                  )}
                </SettingRow>
                <SettingRow label="Export or import" hint="Export writes the loaded career to a .json file. Imported saves appear under Load game.">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={!careerLoaded} className="gap-1.5"><Download size={13} /> Export</Button>
                    <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()} className="gap-1.5"><Upload size={13} /> Import</Button>
                  </div>
                </SettingRow>
                <SettingRow
                  label="Sandbox editor"
                  hint={sandboxOn
                    ? "On for this career: edit money, players, contracts and club names. This career earns no achievements."
                    : careerLoaded ? "Edit money, players, contracts and names in this career. Turning it on is permanent for this career and switches its achievements off." : "Load a career to use the sandbox editor."}
                >
                  {sandboxOn ? (
                    <Button asChild variant="outline" size="sm"><Link href="/settings/sandbox">Open editor</Link></Button>
                  ) : (
                    <ConfirmDialog
                      title="Turn on the sandbox editor?"
                      description="You can then edit this career's money, players, contracts and names. The career earns no achievements, Steam stats or leaderboard scores from now on, and its save slot is marked Sandbox. This cannot be turned off for this career."
                      onConfirm={() => { enableSandbox(); router.push("/settings/sandbox") }}
                      confirmText="Turn on sandbox"
                      icon="info"
                    >
                      <Button variant="outline" size="sm" disabled={!careerLoaded}>Turn on…</Button>
                    </ConfirmDialog>
                  )}
                </SettingRow>
                <SettingRow label="Delete all local careers" hint="Removes every career and its backups. Preferences, your manager profile and Map Studio drafts are kept.">
                  <ConfirmDialog
                    title="Delete all local careers?"
                    description="Deletes all local careers and their backups, then returns to the main menu. Device preferences, your manager profile and Map Studio drafts are kept. This cannot be undone."
                    onConfirm={handleDeleteAllSaves}
                    destructive
                    confirmText="Delete all careers"
                    icon="danger"
                  >
                    <Button variant="outline" size="sm" className="text-negative!">Delete all…</Button>
                  </ConfirmDialog>
                </SettingRow>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportSave(file)
                  e.target.value = ""
                }}
              />
            </Panel>

            <Panel title="Controls" padded={false}><ControlsSettings /></Panel>

            <Panel title="About" padded={false}>
              <SettingRow label={`Esports Manager v${process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}`} hint="Credits and the open-source components the game is built with.">
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm"><Link href="/credits">Credits</Link></Button>
                  <Button ref={licensesButtonRef} variant="outline" size="sm" onClick={() => setLicensesOpen(true)}>Licenses</Button>
                </div>
              </SettingRow>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "ACHIEVEMENTS" && (
        !isAchievementsInitialized ? (
          <p className="py-16 text-center text-sm text-ink-3" role="status">Loading achievements…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <KpiStrip>
                <Kpi label="Unlocked" value={`${achievementsProgress.unlocked} / ${achievementsProgress.total}`} />
                <Kpi label="Complete" value={`${achievementsProgress.percentage}%`} />
              </KpiStrip>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowHidden(!showHidden)} className="gap-1.5">
                  {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showHidden ? "Hide secret" : "Show secret"}
                </Button>
                {devToolsEnabled && (
                  <ConfirmDialog
                    title="Reset all achievements?"
                    description="Clears every unlocked achievement on this device."
                    onConfirm={() => {
                      steamAchievements.resetAll()
                      setAchievements(steamAchievements.getAllAchievements())
                      setAchievementsProgress(steamAchievements.getProgress())
                      toast({ title: "Achievements reset", description: "All achievements have been cleared." })
                    }}
                    destructive
                    confirmText="Reset"
                    icon="danger"
                  >
                    <Button variant="outline" size="sm" className="text-negative!">Reset all</Button>
                  </ConfirmDialog>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
              <Panel title="Unlocked" actions={<span className="text-xs tabular-nums text-ink-3">{unlockedAchievements.length}</span>} padded={false}>
                {unlockedAchievements.length > 0
                  ? <ul className="divide-y divide-line">{unlockedAchievements.map(renderAchievement)}</ul>
                  : <p className="px-4 py-3 text-sm text-ink-3">None yet. Your first win unlocks one.</p>}
              </Panel>
              <Panel title="Locked" actions={<span className="text-xs tabular-nums text-ink-3">{lockedAchievements.length}</span>} padded={false}>
                {lockedAchievements.length > 0
                  ? <ul className="divide-y divide-line">{lockedAchievements.map(renderAchievement)}</ul>
                  : <p className="px-4 py-3 text-sm text-ink-3">Everything unlocked.</p>}
              </Panel>
            </div>
          </div>
        )
      )}

      {devToolsEnabled && activeTab === "DEV_TOOLS" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Panel title="Save and load" padded={false}>
            <div className="divide-y divide-line">
              <SettingRow label="Save now" hint="Writes the loaded career immediately.">
                <Button variant="outline" size="sm" onClick={handleSave} disabled={!careerLoaded}>Save game</Button>
              </SettingRow>
              <SettingRow label="Load game" hint="Open the save list.">
                <Button asChild variant="outline" size="sm"><Link href="/load-game">Open</Link></Button>
              </SettingRow>
            </div>
          </Panel>
          <Panel title="First-session guide" padded={false}>
            <SettingRow
              label="Replay the guide"
              hint={careerLoaded ? "Restarts the five-step checklist for this career. Nothing in the career is reset." : "Load a career to replay its first-session guide."}
            >
              <Button variant="outline" size="sm" onClick={handleReplayTutorial} disabled={!careerLoaded}>Replay</Button>
            </SettingRow>
          </Panel>
          <Panel title="Map Studio" padded={false}>
            <SettingRow label="Map editor" hint="Developer tool for radar and spatial data.">
              <Button asChild variant="outline" size="sm"><Link href="/map-editor">Open</Link></Button>
            </SettingRow>
          </Panel>
        </div>
      )}

      <Dialog open={licensesOpen} onOpenChange={setLicensesOpen}>
        <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(event) => { event.preventDefault(); licensesButtonRef.current?.focus() }}>
          <DialogTitle>Third-party licenses</DialogTitle>
          <DialogDescription>
            Built with these open-source components. Full license texts ship in <span className="font-mono">THIRD_PARTY_LICENSES.txt</span> next to the executable.
          </DialogDescription>
          <dl className="divide-y divide-line rounded-md border border-line text-sm">
            {LICENSES.map(([name, license]) => (
              <div key={name} className="flex justify-between px-3 py-1.5">
                <dt className="text-ink-1">{name}</dt>
                <dd className="text-ink-3">{license}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setLicensesOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
