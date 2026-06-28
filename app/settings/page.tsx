"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useGameStore } from "@/store/game-store"
import { useSettingsStore } from "@/lib/settings-store"
import { soundManager } from "@/lib/sound-manager"
import { useShallow } from "zustand/react/shallow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
    Save,
    RefreshCw,
    Home,
    Download,
    Volume2,
    VolumeX,
    Sparkles,
    Info,
    Trophy,
    Lock,
    Unlock,
    Star,
    Crown,
    DollarSign,
    TrendingUp,
    Award,
    Zap,
    Eye,
    EyeOff,
    Keyboard,
    Upload,
    FolderOpen,
    FileText,
    Gauge,
    Accessibility as AccessibilityIcon,
    Copy,
    Settings as SettingsIcon,
    Flame,
    Medal,
    Sparkles as SparklesIcon,
    Crosshair,
    Gem,
    Shield,
    Globe,
    Swords,
    Rocket,
    Heart,
    BarChart3,
    Calendar,
    Handshake,
    HeartCrack,
    RefreshCcw,
    Landmark
} from "lucide-react"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import Link from "next/link"
import { useToast } from "@/lib/toast"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { steamService as steamAchievements, Achievement } from "@/engine/steam-service"
import { isDevToolsEnabled } from "@/lib/runtime-flags"
import { saveManager } from "@/engine"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

type SettingsTab = "SETTINGS" | "DEV_TOOLS" | "ACHIEVEMENTS"

export default function SettingsPage() {
  const devToolsEnabled = isDevToolsEnabled()
  const {
    saveGame, deleteAllSaves, soundEnabled, setSoundEnabled, showTutorialOnNewGame, setShowTutorialOnNewGame,
    difficulty, setDifficulty,
    autoSave, setAutoSave,
    showBugReportButton, setShowBugReportButton
  } = useGameStore(useShallow(state => ({
    saveGame: state.saveGame,
    deleteAllSaves: state.deleteAllSaves,
    soundEnabled: state.soundEnabled,
    setSoundEnabled: state.setSoundEnabled,
    showTutorialOnNewGame: state.showTutorialOnNewGame,
    setShowTutorialOnNewGame: state.setShowTutorialOnNewGame,
    difficulty: state.difficulty,
    setDifficulty: state.setDifficulty,
    autoSave: state.autoSave,
    setAutoSave: state.setAutoSave,
    showBugReportButton: state.showBugReportButton,
    setShowBugReportButton: state.setShowBugReportButton,
  })))
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SettingsTab>("SETTINGS")

  // Graphics + Audio live through useSettingsStore (that's where soundManager
  // and the global html-class reduced-motion rule read from on mount).
  const {
    windowMode, setWindowMode,
    uiScale, setUiScale,
    reducedMotion, setReducedMotion,
    masterVolumeS, setMasterVolumeS,
    musicVolumeS, setMusicVolumeS,
    sfxVolumeS, setSfxVolumeS,
    autoSaveInterval, setAutoSaveInterval,
    applyWindowSettings,
    resolution, setResolution,
    gameSpeed, setGameSpeed,
    notifications, setNotifications,
  } = useSettingsStore(useShallow(state => ({
    windowMode: state.windowMode,
    setWindowMode: state.setWindowMode,
    uiScale: state.uiScale,
    setUiScale: state.setUiScale,
    reducedMotion: state.reducedMotion,
    setReducedMotion: state.setReducedMotion,
    masterVolumeS: state.masterVolume,
    setMasterVolumeS: state.setMasterVolume,
    musicVolumeS: state.musicVolume,
    setMusicVolumeS: state.setMusicVolume,
    sfxVolumeS: state.sfxVolume,
    setSfxVolumeS: state.setSfxVolume,
    autoSaveInterval: state.autoSaveInterval,
    setAutoSaveInterval: state.setAutoSaveInterval,
    applyWindowSettings: state.applyWindowSettings,
    resolution: state.resolution,
    setResolution: state.setResolution,
    gameSpeed: state.gameSpeed,
    setGameSpeed: state.setGameSpeed,
    notifications: state.notifications,
    setNotifications: state.setNotifications,
  })))

  // Accessibility: colorblind mode — persisted to localStorage
  const [colorblindMode, setColorblindMode] = useState<string>(() => {
    if (typeof window === 'undefined') return 'off'
    return localStorage.getItem('colorblind-mode') || 'off'
  })

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('colorblind-deuteranopia', 'colorblind-protanopia', 'colorblind-tritanopia', 'high-contrast')
    if (colorblindMode !== 'off') html.classList.add(colorblindMode)
  }, [colorblindMode])

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

  // Esc dismisses the licenses dialog. Needs a local handler because the
  // global GameShell keydown handler bails out whenever a [role="dialog"]
  // is present on the page.
  useEffect(() => {
    if (!licensesOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLicensesOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [licensesOpen])

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
      toast({
        title: "Game Saved",
        description: "Your progress has been saved successfully.",
      })
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Unable to save game.",
        variant: "destructive"
      })
    }
  }

  // Audio setters that both persist to settings-store and apply live so the
  // user hears the change immediately without a reload.
  const applyMasterVolume = (v: number) => { setMasterVolumeS(v); soundManager.setMasterVolume(v) }
  const applyMusicVolume = (v: number) => { setMusicVolumeS(v); soundManager.setMusicVolume(v) }
  const applySfxVolume = (v: number) => { setSfxVolumeS(v); soundManager.setSfxVolume(v) }

  const handleCopySaveLocation = async () => {
    if (!saveLocation) return
    try {
      await navigator.clipboard.writeText(saveLocation)
      toast({ title: "Copied", description: "Save location copied to clipboard." })
    } catch {
      toast({ title: "Copy Failed", description: "Clipboard not available.", variant: "destructive" })
    }
  }

  const handleImportSave = async (file: File) => {
    try {
      const text = await file.text()
      const { save, error } = saveManager.importSave(text)
      if (!save || error) {
        toast({ title: "Import Failed", description: error || "Invalid save file.", variant: "destructive" })
        return
      }
      const result = await saveManager.saveGame(save)
      if (!result.success) {
        toast({ title: "Import Failed", description: result.error || "Could not persist imported save.", variant: "destructive" })
        return
      }
      toast({ title: "Save Imported", description: `Load "${save.saveName}" from the Load Game screen.` })
    } catch (e) {
      toast({ title: "Import Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  const handleExport = async () => {
    const state = useGameStore.getState()
    if (!state.saveId) {
      toast({
        title: "Export Failed",
        description: "No active save to export.",
        variant: "destructive"
      })
      return
    }

    const { save, error } = await saveManager.loadGame(state.saveId)
    if (!save || error) {
      toast({
        title: "Export Failed",
        description: error || "Unable to load current save.",
        variant: "destructive"
      })
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

    toast({
      title: "Save Exported",
      description: "Your save file has been downloaded.",
    })
  }

  const handleNewGame = async () => {
    if (typeof window === "undefined") return
    await deleteAllSaves()
    try {
      localStorage.removeItem("analytics-events")
      localStorage.removeItem("game-metrics")
      localStorage.removeItem("error-reports")
      localStorage.removeItem("performance-metrics")
      localStorage.removeItem("skipQuickSimConfirm")
    } catch {
      // Storage clear is best-effort; proceed to new game regardless
    }
    window.location.href = "/main-menu"
  }

  const handleReplayTutorial = () => {
    // Use the real trigger the TutorialOverlay listens to (manualTutorialTrigger
    // via triggerTutorial). The previous version set `onboardingCompleted`, a
    // flag nothing reads — so the button claimed the guide would reappear but it
    // never did. The overlay lives on the dashboard, so it shows on arrival.
    useGameStore.getState().triggerTutorial()
    toast({
      title: "Tutorial Ready",
      description: "Head to the dashboard and the guide will walk you through the basics again.",
    })
  }

  const getAchievementIcon = (id: string) => {
    const s = "h-6 w-6"
    const iconMap: Record<string, React.ReactNode> = {
      // Win Progression
      FIRST_WIN: <Trophy className={s} />,
      WIN_10: <Star className={s} />,
      WIN_25: <Star className={s} />,
      WIN_50: <Flame className={s} />,
      WIN_100: <Medal className={s} />,
      WIN_250: <SparklesIcon className={s} />,
      WIN_500: <Crown className={s} />,
      // Tournaments
      FIRST_TOURNAMENT: <Crosshair className={s} />,
      WIN_B_TIER: <Award className={s} />,
      WIN_A_TIER: <Award className={s} />,
      WIN_MAJOR: <Crown className={s} />,
      GRAND_SLAM: <Gem className={s} />,
      DYNASTY: <Crown className={s} />,
      PERFECT_TOURNAMENT: <Shield className={s} />,
      // Competitive
      REACH_S_TIER: <Gem className={s} />,
      TOP_10_RANKING: <Globe className={s} />,
      NUMBER_ONE: <Crown className={s} />,
      COMEBACK_KING: <Flame className={s} />,
      UNDERDOG: <Swords className={s} />,
      // Management
      FIRST_MILLION: <DollarSign className={s} />,
      BUDGET_10M: <Gem className={s} />,
      DEVELOP_STAR: <TrendingUp className={s} />,
      HALL_OF_FAME_INDUCTION: <Landmark className={s} />,
      LOYAL_TEAM: <Heart className={s} />,
      PROFIT_MASTER: <BarChart3 className={s} />,
      ZERO_TO_HERO: <Rocket className={s} />,
      // Milestones
      TOURNAMENT_WIN: <Trophy className={s} />,
      SEASON_COMPLETE: <Calendar className={s} />,
      FIRST_TRANSFER: <Handshake className={s} />,
      // Hidden
      UNLUCKY: <HeartCrack className={s} />,
      REDEMPTION: <RefreshCcw className={s} />,
    }
    return iconMap[id] || <Trophy className={s} />
  }

  // Three filters in series, recomputed on every tab click / settings
  // change / dialog open. Achievements is bounded but the page re-renders
  // a lot — coalesce into one pass via useMemo.
  const { visibleAchievements, unlockedAchievements, lockedAchievements } = useMemo(() => {
    const visible = showHidden
      ? achievements
      : achievements.filter(a => !a.hidden || a.unlocked)
    const unlocked: typeof achievements = []
    const locked: typeof achievements = []
    for (const a of visible) {
      if (a.unlocked) unlocked.push(a)
      else locked.push(a)
    }
    return { visibleAchievements: visible, unlockedAchievements: unlocked, lockedAchievements: locked }
  }, [achievements, showHidden])

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof SettingsIcon }> = [
    { id: "SETTINGS", label: "Settings", icon: SettingsIcon },
    ...(devToolsEnabled ? [{ id: "DEV_TOOLS" as const, label: "Dev Tools", icon: Zap }] : []),
    { id: "ACHIEVEMENTS", label: "Achievements", icon: Trophy },
  ]

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-normal liquid-text tracking-tighter">SETTINGS & TOOLS</h1>
          <p className="text-sm text-muted-foreground font-medium">Manage preferences and track achievements</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/main-menu">
            <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">
              <Home className="mr-2 h-4 w-4" /> Main Menu
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">
              <RefreshCw className="mr-2 h-4 w-4" /> Dashboard
            </Button>
          </Link>
          <Link href="/credits">
            <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10">
              <Heart className="mr-2 h-4 w-4" /> Credits
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all",
              activeTab === tab.id
                ? "bg-primary text-[#0e1217]"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "SETTINGS" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-6 max-w-3xl mx-auto w-full"
          >
            {/* Graphics */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <Eye className="h-5 w-5" />
                  </div>
                  Graphics
                </CardTitle>
                <CardDescription>Window, resolution, UI scale, and motion</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Window Mode</p>
                    <p className="text-xs text-muted-foreground">Fullscreen, Windowed, or Borderless</p>
                  </div>
                  <select
                    value={windowMode}
                    onChange={(e) => {
                      const mode = e.target.value as "windowed" | "fullscreen" | "borderless"
                      setWindowMode(mode)
                      // "borderless" = fullscreen from Electron's perspective (no OS chrome);
                      // we persist the user's intent separately so a later frame toggle works.
                      const fs = mode === "fullscreen" || mode === "borderless"
                      ;(window as any).electron?.window?.setFullscreen?.(fs)
                      toast({ title: "Display Mode Changed", description: `Window mode set to ${mode}` })
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="windowed" className="bg-[#1a1f2e]">Windowed</option>
                    <option value="borderless" className="bg-[#1a1f2e]">Borderless</option>
                    <option value="fullscreen" className="bg-[#1a1f2e]">Fullscreen</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Resolution</p>
                    <p className="text-xs text-muted-foreground">Applied when not in fullscreen/borderless</p>
                  </div>
                  <select
                    value={resolution}
                    onChange={(e) => { setResolution(e.target.value as any); applyWindowSettings() }}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="1920x1080" className="bg-[#1a1f2e]">1920 × 1080</option>
                    <option value="1600x900" className="bg-[#1a1f2e]">1600 × 900</option>
                    <option value="1280x720" className="bg-[#1a1f2e]">1280 × 720</option>
                  </select>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-white">UI Scale</p>
                      <p className="text-xs text-muted-foreground">Scales fonts and spacing across the whole UI</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{uiScale}%</span>
                  </div>
                  <input
                    type="range"
                    min="80" max="120" step="5"
                    value={uiScale}
                    onChange={(e) => setUiScale(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Reduced Motion</p>
                    <p className="text-xs text-muted-foreground">Disables transitions and decorative animations</p>
                  </div>
                  <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
                </div>
              </CardContent>
            </Card>

            {/* Audio */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                    <Volume2 className="h-5 w-5" />
                  </div>
                  Audio
                </CardTitle>
                <CardDescription>Master, music, and SFX levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center gap-3">
                    {soundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">UI Sound Effects</p>
                      <p className="text-xs text-muted-foreground">Clicks, chimes, and feedback sounds</p>
                    </div>
                  </div>
                  <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-white">Master Volume</p>
                    <span className="text-xs text-muted-foreground">{masterVolumeS}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={masterVolumeS}
                    onChange={(e) => applyMasterVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-white">Music Volume</p>
                    <span className="text-xs text-muted-foreground">{musicVolumeS}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={musicVolumeS}
                    onChange={(e) => applyMusicVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-white">SFX Volume</p>
                    <span className="text-xs text-muted-foreground">{sfxVolumeS}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={sfxVolumeS}
                    onChange={(e) => applySfxVolume(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Gameplay */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                    <Gauge className="h-5 w-5" />
                  </div>
                  Gameplay
                </CardTitle>
                <CardDescription>Simulation speed, difficulty, auto-save</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Game Speed</p>
                    <p className="text-xs text-muted-foreground">Simulation tick rate</p>
                  </div>
                  <select
                    value={gameSpeed}
                    onChange={(e) => setGameSpeed(e.target.value as any)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="normal" className="bg-[#1a1f2e]">Normal</option>
                    <option value="fast" className="bg-[#1a1f2e]">Fast</option>
                    <option value="very-fast" className="bg-[#1a1f2e]">Very Fast</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Difficulty</p>
                    <p className="text-xs text-muted-foreground">Affects AI strength and economy</p>
                  </div>
                  <select
                    value={difficulty || "normal"}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="easy" className="bg-[#1a1f2e]">Easy</option>
                    <option value="normal" className="bg-[#1a1f2e]">Normal</option>
                    <option value="hard" className="bg-[#1a1f2e]">Hard</option>
                    <option value="legendary" className="bg-[#1a1f2e]">Legendary</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Auto-Save</p>
                    <p className="text-xs text-muted-foreground">Automatically save game progress</p>
                  </div>
                  <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Auto-Save Interval</p>
                    <p className="text-xs text-muted-foreground">How often the game writes a background save</p>
                  </div>
                  <select
                    value={autoSaveInterval}
                    onChange={(e) => setAutoSaveInterval(parseInt(e.target.value))}
                    disabled={!autoSave}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  >
                    <option value={2} className="bg-[#1a1f2e]">Every 2 min</option>
                    <option value={5} className="bg-[#1a1f2e]">Every 5 min</option>
                    <option value={10} className="bg-[#1a1f2e]">Every 10 min</option>
                    <option value={15} className="bg-[#1a1f2e]">Every 15 min</option>
                    <option value={30} className="bg-[#1a1f2e]">Every 30 min</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Notifications</p>
                    <p className="text-xs text-muted-foreground">Show in-game event notifications</p>
                  </div>
                  <Switch checked={notifications} onCheckedChange={setNotifications} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Show Tutorial on New Game</p>
                    <p className="text-xs text-muted-foreground">Display the tutorial guide when starting a new career</p>
                  </div>
                  <Switch checked={showTutorialOnNewGame} onCheckedChange={setShowTutorialOnNewGame} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Bug Report Button</p>
                    <p className="text-xs text-muted-foreground">Show floating bug report button on screen</p>
                  </div>
                  <Switch checked={showBugReportButton} onCheckedChange={setShowBugReportButton} />
                </div>
              </CardContent>
            </Card>

            {/* Accessibility */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <AccessibilityIcon className="h-5 w-5" />
                  </div>
                  Accessibility
                </CardTitle>
                <CardDescription>Colorblind palettes and high-contrast mode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Colorblind / Contrast Mode</p>
                    <p className="text-xs text-muted-foreground">Adjust colors for color vision deficiency, or switch to high contrast</p>
                  </div>
                  <select
                    value={colorblindMode}
                    onChange={(e) => {
                      const val = e.target.value
                      setColorblindMode(val)
                      try { localStorage.setItem('colorblind-mode', val) } catch {}
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="off" className="bg-[#1a1f2e]">Off</option>
                    <option value="colorblind-deuteranopia" className="bg-[#1a1f2e]">Deuteranopia (Red-Green)</option>
                    <option value="colorblind-protanopia" className="bg-[#1a1f2e]">Protanopia (Red-Blind)</option>
                    <option value="colorblind-tritanopia" className="bg-[#1a1f2e]">Tritanopia (Blue-Yellow)</option>
                    <option value="high-contrast" className="bg-[#1a1f2e]">High Contrast</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground px-1">
                  For text size, adjust <strong className="text-white/70">UI Scale</strong> in the Graphics section. Reduced-motion lives there too.
                </p>
              </CardContent>
            </Card>

            {/* Controls */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Keyboard className="h-5 w-5" />
                  </div>
                  Controls
                </CardTitle>
                <CardDescription>
                  Keyboard shortcuts. Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">F1</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">?</kbd> any time to show this list.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <h3 className="text-xs uppercase tracking-widest text-white/40 font-medium">{group.label}</h3>
                    <div className="space-y-1.5">
                      {group.shortcuts.map((shortcut) => (
                        <div key={shortcut.description + shortcut.keys.join("+")} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                          <span className="text-sm text-white/70">{shortcut.description}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {shortcut.keys.map((key, i) => (
                              <span key={i}>
                                <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-xs font-mono text-white/80">{key}</kbd>
                                {i < shortcut.keys.length - 1 && (
                                  <span className="text-white/30 mx-0.5">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-white/30 pt-1">
                  macOS users: use <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">⌘</kbd> in place of <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] font-mono">Ctrl</kbd>. Shortcut remapping is planned for a future update — rebind via Steam Input for now.
                </p>
              </CardContent>
            </Card>

            {/* Data */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  Data
                </CardTitle>
                <CardDescription>Save files, import/export, clear data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <p className="text-sm font-bold text-white mb-1">Save Location</p>
                  <p className="text-xs text-muted-foreground break-all font-mono">
                    {saveLocation ?? "Browser storage (IndexedDB)"}
                  </p>
                  {saveLocation && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySaveLocation}
                      className="mt-3 h-8 bg-white/5 border-white/10 hover:bg-white/10"
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" /> Copy path
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={handleExport} variant="outline" className="h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl">
                    <Download className="mr-2 h-4 w-4" />
                    Export Save
                  </Button>
                  <Button
                    onClick={() => importInputRef.current?.click()}
                    variant="outline"
                    className="h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import Save
                  </Button>
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
                <ConfirmDialog
                  title="Clear all save data?"
                  description="Deletes every save on this machine. The current session returns to the main menu. This cannot be undone."
                  onConfirm={handleNewGame}
                  destructive
                  confirmText="Delete all saves"
                  icon="danger"
                >
                  <Button variant="destructive" className="w-full h-12 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/20">
                    <RefreshCcw className="mr-2 h-4 w-4" /> Clear all data
                  </Button>
                </ConfirmDialog>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-white/5 text-white/70">
                    <Info className="h-5 w-5" />
                  </div>
                  About
                </CardTitle>
                <CardDescription>Version, credits, and licenses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-white">Esports Manager Simulator</strong>
                  <span className="text-white/40"> · v{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</span>
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Link href="/credits" className="w-full">
                    <Button variant="outline" className="w-full h-11 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl">
                      <Heart className="mr-2 h-4 w-4" /> Credits
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => setLicensesOpen(true)}
                    className="w-full h-11 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl"
                  >
                    <FileText className="mr-2 h-4 w-4" /> Licenses
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {licensesOpen && (
          <div
            className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setLicensesOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="licenses-title"
              className="glass-panel rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="licenses-title" className="text-lg font-bold text-white">Third-party licenses</h2>
              <p className="text-xs text-muted-foreground">
                This game is built with the following open-source components. Full license texts ship in <span className="font-mono">THIRD_PARTY_LICENSES.txt</span> alongside the executable.
              </p>
              <ul className="space-y-2 text-xs text-white/70">
                <li><strong className="text-white">Electron</strong> — MIT</li>
                <li><strong className="text-white">Chromium</strong> — BSD</li>
                <li><strong className="text-white">Node.js</strong> — MIT</li>
                <li><strong className="text-white">Next.js</strong> — MIT</li>
                <li><strong className="text-white">React</strong> — MIT</li>
                <li><strong className="text-white">Zustand</strong> — MIT</li>
                <li><strong className="text-white">Radix UI primitives</strong> — MIT</li>
                <li><strong className="text-white">Tailwind CSS</strong> — MIT</li>
                <li><strong className="text-white">Framer Motion</strong> — MIT</li>
                <li><strong className="text-white">Lucide icons</strong> — ISC</li>
                <li><strong className="text-white">Sonner</strong> — MIT</li>
                <li><strong className="text-white">steamworks.js</strong> — MIT</li>
                <li><strong className="text-white">Archivo Black</strong> (font) — SIL OFL 1.1</li>
              </ul>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setLicensesOpen(false)} className="bg-white/5 border-white/10 hover:bg-white/10">
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {devToolsEnabled && activeTab === "DEV_TOOLS" && (
          <motion.div
            key="dev-tools"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-6 max-w-3xl mx-auto w-full"
          >
            {/* Save & Load */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Save className="h-5 w-5" />
                  </div>
                  Save & Load
                </CardTitle>
                <CardDescription>Manage your game saves</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleSave} className="w-full h-12 bg-primary hover:bg-primary/80 rounded-xl font-bold">
                  <Save className="mr-2 h-4 w-4" />
                  Save Game
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={handleExport} variant="outline" className="h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl">
                    <Download className="mr-2 h-4 w-4" />
                    Export Save
                  </Button>
                  <Link href="/load-game" className="w-full">
                    <Button variant="outline" className="w-full h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Load Game
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Audio & Tutorial */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  Experience
                </CardTitle>
                <CardDescription>Audio and tutorial settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center gap-3">
                    {soundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">UI Sound Effects</p>
                      <p className="text-xs text-muted-foreground">Clicks, chimes, and feedback sounds</p>
                    </div>
                  </div>
                  <Switch
                    checked={soundEnabled}
                    onCheckedChange={setSoundEnabled}
                  />
                </div>

                <Button
                  onClick={handleReplayTutorial}
                  variant="outline"
                  className="w-full h-12 bg-white/5 border-white/10 hover:bg-white/10 rounded-xl"
                >
                  <Info className="mr-2 h-4 w-4" />
                  Replay Tutorial Guide
                </Button>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="glass-panel border-rose-500/20 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-lg font-normal text-rose-400">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <ConfirmDialog
                  title="Start New Game?"
                  description="All unsaved progress will be permanently lost. This action cannot be undone."
                  onConfirm={handleNewGame}
                  destructive
                  confirmText="Erase & Start New"
                  icon="danger"
                >
                  <Button variant="destructive" className="w-full h-12 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-500/20">
                    <Home className="mr-2 h-4 w-4" />
                    Start New Game (Erase Current)
                  </Button>
                </ConfirmDialog>
              </CardContent>
            </Card>

            {/* About */}
            <Card className="glass-panel border-white/5 rounded-3xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-normal">About</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-white">Esports Manager Simulator v{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</strong>
                </p>
                <p>Manage your esports team to glory with realistic simulation and player development.</p>
                <div className="pt-4 border-t border-white/5 mt-4">
                  <p className="font-bold text-white mb-3 text-xs uppercase tracking-widest">Key Features</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Deterministic RNG Engine",
                      "Player Development",
                      "Team Chemistry",
                      "Match Simulation",
                      "Youth Academy",
                      "Trophy Room",
                      "Tactical System",
                      "Offline-First"
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "ACHIEVEMENTS" && (
          <motion.div
            key="achievements"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {!isAchievementsInitialized ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-pulse text-muted-foreground">Loading achievements...</div>
              </div>
            ) : (
              <>
                {/* Achievements Summary Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Progress Card — Liquid Glass */}
                  <div className="md:col-span-2 rounded-[24px] p-[1px] bg-gradient-to-br from-amber-400/20 via-white/[0.06] to-amber-400/5">
                    <div className="relative rounded-[23px] bg-[#0e1217]/80 backdrop-blur-2xl p-8 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />
                      <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />
                      <div className="relative z-10 space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/10">
                            <Trophy className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white tracking-tight">Career Progress</h3>
                            <p className="text-[11px] text-white/30">Overall achievement completion</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-end">
                            <p className="text-3xl font-light text-white tracking-tight">{achievementsProgress.percentage}<span className="text-lg text-white/30">%</span></p>
                            <p className="text-[11px] font-medium text-white/30 uppercase tracking-wider">{achievementsProgress.unlocked} / {achievementsProgress.total}</p>
                          </div>
                          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.04]">
                            <motion.div
                              className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-orange-400 rounded-full shadow-lg shadow-amber-500/20"
                              initial={{ width: 0 }}
                              animate={{ width: `${achievementsProgress.percentage}%` }}
                              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Milestones Card — Liquid Glass */}
                  <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                    <div className="relative rounded-[23px] bg-[#0e1217]/80 backdrop-blur-2xl p-6 overflow-hidden flex flex-col justify-center items-center text-center h-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
                      <div className="relative z-10 flex justify-end w-full mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowHidden(!showHidden)}
                          className="text-[10px] font-normal uppercase tracking-widest text-white/30 hover:text-white"
                        >
                          {showHidden ? <EyeOff className="h-3 w-3 mr-1.5" /> : <Eye className="h-3 w-3 mr-1.5" />}
                          {showHidden ? "Hide Secret" : "Show Secret"}
                        </Button>
                      </div>
                      <div className="relative z-10 p-4 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/10 text-primary mb-3 border border-primary/10">
                        <Award className="h-8 w-8" />
                      </div>
                      <h3 className="relative z-10 font-semibold text-white uppercase tracking-tight text-lg">Milestones</h3>
                      <p className="relative z-10 text-[11px] text-white/30 mb-4">Keep playing to unlock more</p>
                    {devToolsEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Reset all achievements?")) {
                            steamAchievements.resetAll()
                            setAchievements(steamAchievements.getAllAchievements())
                            setAchievementsProgress(steamAchievements.getProgress())
                            toast({ title: "Achievements Reset", description: "All achievements have been cleared." })
                          }
                        }}
                        className="text-[10px] font-normal border-red-500/20 text-red-500 hover:bg-red-500/10"
                      >
                        Reset All
                      </Button>
                    )}
                    </div>
                  </div>
                </div>

                {/* Achievement Lists */}
                <div className="space-y-10">
                  {/* Unlocked Achievements */}
                  {unlockedAchievements.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-sm font-normal uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2 ml-1">
                        <Unlock className="h-4 w-4" />
                        Recently Unlocked ({unlockedAchievements.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {unlockedAchievements.map((achievement, i) => (
                          <motion.div
                            key={achievement.id}
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 30 }}
                          >
                            <div className="relative group rounded-[20px] p-[1px] bg-gradient-to-br from-emerald-400/30 via-cyan-400/20 to-emerald-400/10 hover:from-emerald-400/50 hover:via-cyan-400/30 hover:to-emerald-400/20 transition-all duration-500">
                              <div className="relative rounded-[19px] bg-[#0e1217]/80 backdrop-blur-2xl p-5 flex items-start gap-4 overflow-hidden">
                                {/* Glass highlight */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none" />
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/20 transition-colors duration-700" />
                                {/* Icon */}
                                <div className="relative z-10 p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 text-emerald-400 border border-emerald-500/10 shadow-lg shadow-emerald-500/5 group-hover:scale-110 group-hover:shadow-emerald-500/20 transition-all duration-300">
                                  {getAchievementIcon(achievement.id)}
                                </div>
                                {/* Content */}
                                <div className="relative z-10 flex-1 min-w-0">
                                  <h3 className="font-semibold text-white truncate text-sm tracking-tight">{achievement.name}</h3>
                                  <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed mt-1">{achievement.description}</p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Locked Achievements */}
                  {lockedAchievements.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-sm font-normal uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 ml-1">
                        <Lock className="h-4 w-4" />
                        Locked ({lockedAchievements.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {lockedAchievements.map((achievement, i) => (
                          <motion.div
                            key={achievement.id}
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 30 }}
                          >
                            <div className={cn(
                              "relative group rounded-[20px] p-[1px] bg-gradient-to-br from-white/[0.08] to-white/[0.02] hover:from-white/[0.12] hover:to-white/[0.04] transition-all duration-500",
                              achievement.hidden && "opacity-50"
                            )}>
                              <div className="relative rounded-[19px] bg-[#0e1217]/90 backdrop-blur-2xl p-5 flex items-start gap-4 overflow-hidden">
                                {/* Glass highlight */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none" />
                                {/* Icon */}
                                <div className="relative z-10 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-white/20 group-hover:text-white/30 transition-colors duration-300">
                                  {achievement.hidden ? <Lock className="h-6 w-6" /> : getAchievementIcon(achievement.id)}
                                </div>
                                {/* Content */}
                                <div className="relative z-10 flex-1 min-w-0">
                                  <h3 className="font-semibold text-white/40 truncate text-sm tracking-tight">
                                    {achievement.hidden ? "Secret Achievement" : achievement.name}
                                  </h3>
                                  <p className="text-[11px] text-white/55 line-clamp-2 leading-relaxed mt-1">
                                    {achievement.hidden ? "Continue playing to discover this achievement" : achievement.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
