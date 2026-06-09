"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { getNotificationTheme } from "./notification-themes"
import { GameEventSaveData } from "@/engine"
import { soundManager } from "@/lib/sound-manager"
import { toast } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
    Mail,
    Hash,
    TrendingUp,
    Calendar,
    Newspaper,
    Trophy,
    Clock,
    Users,
    DollarSign,
    Stethoscope,
    Flame,
    Loader2,
    ShoppingBag,
    Building2,
    GraduationCap,
    Rocket,
    Lightbulb,
    ClipboardList
} from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { generateSocialPosts } from "@/lib/social-generator"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

// Desktop OS Components
import { DesktopBackground } from "@/components/desktop/DesktopBackground"
import { DesktopOverlay } from "@/components/ui/DesktopOverlay"
import { AppWindow } from "@/components/ui/AppWindow"
import { Taskbar } from "@/components/ui/Taskbar"

// Desktop Apps
import { MailApp } from "@/components/desktop-apps/MailApp"
import { SocialApp } from "@/components/desktop-apps/SocialApp"
import { MarketApp } from "@/components/desktop-apps/MarketApp"
import { CalendarApp } from "@/components/desktop-apps/CalendarApp"
import { NewsApp } from "@/components/desktop-apps/NewsApp"
import { ShopApp } from "@/components/desktop-apps/ShopApp"
import { FacilitiesApp } from "@/components/desktop-apps/FacilitiesApp"
import { FinanceApp } from "@/components/desktop-apps/FinanceApp"
import { AcademyApp } from "@/components/desktop-apps/AcademyApp"
import { ProAwardsModal } from "@/components/celebration/ProAwardsModal"
import { SeasonRecapModal } from "@/components/celebration/SeasonRecapModal"
import { TutorialOverlay } from "@/components/ui/TutorialOverlay"
import { WeeklyFocusWidget } from "@/components/dashboard/WeeklyFocusWidget"

type AppId = "mail" | "social" | "market" | "calendar" | "news" | "shop" | "facilities" | "finance" | "academy"

interface WindowState {
  isOpen: boolean
  isMinimized: boolean
  isFocused: boolean
  zIndex: number
  position: { x: number; y: number }
}

// Default window opening positions, cascading down-right so freshly opened
// windows don't fully overlap. Hoisted to module scope so the initialiser
// closure isn't rebuilt on every render of DesktopContent.
const INITIAL_WINDOW_STATES: Record<AppId, WindowState> = {
  mail:       { isOpen: false, isMinimized: false, isFocused: true,  zIndex: 10, position: { x:  40, y:  20 } },
  social:     { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 120, y:  60 } },
  market:     { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 200, y:  40 } },
  calendar:   { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 280, y:  80 } },
  news:       { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 160, y: 100 } },
  shop:       { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 240, y: 120 } },
  facilities: { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 300, y: 140 } },
  finance:    { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 360, y: 160 } },
  academy:    { isOpen: false, isMinimized: false, isFocused: false, zIndex: 1,  position: { x: 420, y: 180 } },
}

// Delays for desktop boot ambience. Names make the intent clear at call sites.
const STARTUP_SOUND_DELAY_MS = 500
const AUTO_OPEN_MAIL_DELAY_MS = 1500

import { Suspense } from "react"


function DesktopContent() {
  const router = useRouter()
  const {
    eventsLog, players, teams, currentWeek, pendingSeasonRecap, playerTeamId
  } = useGameStore(useShallow(state => ({
    eventsLog: state.eventsLog,
    players: state.players,
    teams: state.teams,
    currentWeek: state.currentWeek,
    pendingSeasonRecap: state.pendingSeasonRecap,
    playerTeamId: state.playerTeamId
  })))

  const {
    resolveEventChoice, completedMatches, acceptTransferOffer, acceptJobOffer,
    declineJobOffer, negotiateJobOffer, markAllEventsAsRead, acknowledgeEvent,
    clearPendingSeasonRecap
  } = useGameStore(useShallow(state => ({
    resolveEventChoice: state.resolveEventChoice,
    completedMatches: state.completedMatches,
    acceptTransferOffer: state.acceptTransferOffer,
    acceptJobOffer: state.acceptJobOffer,
    declineJobOffer: state.declineJobOffer,
    negotiateJobOffer: state.negotiateJobOffer,
    markAllEventsAsRead: state.markAllEventsAsRead,
    acknowledgeEvent: state.acknowledgeEvent,
    clearPendingSeasonRecap: state.clearPendingSeasonRecap
  })))

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const selectedEvent = useMemo(() =>
    selectedEventId ? eventsLog.find(e => e.id === selectedEventId) || null : null
    , [eventsLog, selectedEventId])
  const [isProcessing, setIsProcessing] = useState(false)
  const playerTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])

  // Pro Awards Modal State
  const [proAwards, setProAwards] = useState<any>(null)
  const [isProModalOpen, setIsProModalOpen] = useState(false)

  // Window management state.
  // Deep-clone the module-level template so per-mount window state is isolated.
  // Below, openWindow / focusWindow mutate `windows[appId].isFocused` directly
  // (not via spread), so without the clone those mutations would leak into the
  // shared INITIAL_WINDOW_STATES constant and re-mounting the desktop would
  // resume with the previous session's open/focused state.
  const [windows, setWindows] = useState<Record<AppId, WindowState>>(() => {
    const fresh = {} as Record<AppId, WindowState>
    for (const id of Object.keys(INITIAL_WINDOW_STATES) as AppId[]) {
      const t = INITIAL_WINDOW_STATES[id]
      fresh[id] = { ...t, position: { ...t.position } }
    }
    return fresh
  })


  const [nextZIndex, setNextZIndex] = useState(11)

  // Handle URL Query Params for App Opening
  const searchParams = useSearchParams()
  const appParam = searchParams.get("app")

  // Play startup sound on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      soundManager.play('start')
    }, STARTUP_SOUND_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let autoOpenTimer: ReturnType<typeof setTimeout> | undefined
    if (appParam && Object.keys(windows).includes(appParam)) {
      openWindow(appParam as AppId)
    } else {
      // Auto-open Mail for important unread events (New Game / Updates)
      const hasUnreadImportant = eventsLog.some(e =>
        !e.acknowledged && (e.type === "CAREER_UPDATE" || (e as any).priority === "high")
      )

      if (hasUnreadImportant && !windows.mail.isOpen) {
        // Delay slightly so any active tutorial pop-in animates first.
        // Track the timer so unmount/remount doesn't double-fire openWindow.
        autoOpenTimer = setTimeout(() => {
          openWindow("mail")
        }, AUTO_OPEN_MAIL_DELAY_MS)
      }
    }
    return () => {
      if (autoOpenTimer) clearTimeout(autoOpenTimer)
    }
    // Intentional mount-only: re-running on eventsLog/windows changes would
    // re-auto-open Mail every time the user closes it or a new event lands.
    // appParam in deps so deep-links (?app=mail) still take effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appParam])

  // Update selected event if it changes in the store
  useEffect(() => {
    if (selectedEventId) {
      const event = eventsLog.find(e => e.id === selectedEventId)
      // Only acknowledge if not already read to avoid loops
      if (event && !event.acknowledged) {
        // Run in next tick to avoid immediate state clash if that was the issue
        const timer = setTimeout(() => {
          acknowledgeEvent(selectedEventId)
        }, 0)
        return () => clearTimeout(timer)
      }
    }
  }, [selectedEventId, eventsLog, acknowledgeEvent])


  // Dynamic Social Posts
  const socialPosts = useMemo(() => {
    return generateSocialPosts(playerTeam, completedMatches, players)
  }, [playerTeam, completedMatches, players])

  // DEV: Keyboard shortcut (Ctrl+Shift+H) to test Pro Awards Modal
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault()

        // Generate mock awards using current players
        const mockAwards = {
          year: Math.ceil(currentWeek / 52) || 1,
          generatedWeek: currentWeek,
          revealStartWeek: currentWeek,
          currentRevealDay: 20,
          isFullyRevealed: true,
          top20: players
            .filter(p => !p.isRetired)
            .slice(0, 20)
            .map((p, i) => ({
              rank: i + 1,
              playerId: p.id,
              playerName: p.name,
              nickname: p.nickname,
              nationality: p.nationality,
              portraitPath: p.portraitPath || '',
              teamId: teams.find(t => t.rosterIds?.includes(p.id))?.id || '',
              teamName: teams.find(t => t.rosterIds?.includes(p.id))?.name || 'Free Agent',
              teamLogo: teams.find(t => t.rosterIds?.includes(p.id))?.logoPath || '',
              overallRating: p.skill || 80,
              proRating: 1.00 + (20 - i) * 0.02,
              impactRating: 0.95 + (20 - i) * 0.015,
              kast: 65 + (20 - i) * 0.8,
              adr: 70 + (20 - i) * 1.2,
              kpr: 0.65 + (20 - i) * 0.015,
              mvpCount: Math.max(0, 5 - Math.floor(i / 4)),
              evpCount: Math.max(0, 3 - Math.floor(i / 6)),
              majorMvps: i < 3 ? 1 : 0,
              majorWins: i < 5 ? 1 : 0,
              bigEventWins: Math.max(0, 4 - Math.floor(i / 5)),
              mapsPlayed: 150 + ((p.age || 22) * 7 + i * 3) % 50,
              age: p.age || 22,
              role: p.role || 'Rifler',
              isPlayerTeam: teams.find(t => t.rosterIds?.includes(p.id))?.id === playerTeamId,
              revealDay: 20 - i
            })),
          mvpOfTheYear: null as any,
          rookieOfTheYear: null as any,
          iglOfTheYear: null as any,
          awperOfTheYear: null as any
        }

        // Set special awards
        mockAwards.mvpOfTheYear = mockAwards.top20[0]
        mockAwards.rookieOfTheYear = mockAwards.top20.find(p => p.age <= 21) || null

        setProAwards(mockAwards)
        setIsProModalOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [players, teams, currentWeek, playerTeamId])

  const seasonRecapStats = useMemo(() => {
    if (!playerTeam || !pendingSeasonRecap) return null
    const yearMatches = completedMatches.filter(m => m.week > (currentWeek - 53) && m.week < currentWeek)
    const wins = yearMatches.filter(m => m.result.winnerId === playerTeamId).length
    const losses = yearMatches.length - wins
    const trophies = playerTeam.trophies?.filter(t => t.week > (currentWeek - 53)).length || 0

    // Find best player by avg rating in last year
    const roster = players.filter(p => playerTeam.rosterIds.includes(p.id))
    const bestPlayer = [...roster].sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0))[0] || null

    return {
      wins,
      losses,
      trophies,
      budgetGrowth: playerTeam.budget / 10,
      bestPlayer: bestPlayer ? {
        nickname: bestPlayer.nickname,
        portraitPath: bestPlayer.portraitPath,
        rating: bestPlayer.avgRating || 0
      } : null
    }
  }, [playerTeam, completedMatches, currentWeek, players, playerTeamId, pendingSeasonRecap])

  // Window management functions
  const openWindow = (appId: AppId) => {
    setWindows(prev => {
      // Build a new record where every WindowState is a fresh object so we
      // never mutate the previous state (or the module-level template).
      const newWindows = {} as Record<AppId, WindowState>
      for (const key of Object.keys(prev) as AppId[]) {
        newWindows[key] = { ...prev[key], isFocused: false }
      }
      newWindows[appId] = {
        ...newWindows[appId],
        isOpen: true,
        isMinimized: false,
        isFocused: true,
        zIndex: nextZIndex,
      }
      return newWindows
    })
    setNextZIndex(prev => prev + 1)
  }

  const closeWindow = (appId: AppId) => {
    setWindows(prev => ({
      ...prev,
      [appId]: { ...prev[appId], isOpen: false, isMinimized: false, isFocused: false }
    }))
  }

  const minimizeWindow = (appId: AppId) => {
    setWindows(prev => ({
      ...prev,
      [appId]: { ...prev[appId], isMinimized: true, isFocused: false }
    }))
  }

  const focusWindow = (appId: AppId) => {
    setWindows(prev => {
      const newWindows = {} as Record<AppId, WindowState>
      for (const key of Object.keys(prev) as AppId[]) {
        newWindows[key] = { ...prev[key], isFocused: false }
      }
      newWindows[appId] = {
        ...newWindows[appId],
        isFocused: true,
        isMinimized: false,
        zIndex: nextZIndex,
      }
      return newWindows
    })
    setNextZIndex(prev => prev + 1)
  }

  const handleAppClick = (appId: string) => {
    const id = appId as AppId
    const window = windows[id]
    if (!window.isOpen) {
      openWindow(id)
    } else if (window.isMinimized) {
      focusWindow(id)
    } else if (window.isFocused) {
      minimizeWindow(id)
    } else {
      focusWindow(id)
    }
  }

  // Event handlers
  const handleEventClick = useCallback((event: GameEventSaveData) => {
    setSelectedEventId(event.id)
  }, [])

  // Memoize Quick Action handler to prevent MailApp re-renders
  const handleQuickAction = useCallback((eventId: string, action: string) => {
    if (action === "accept") {
      acceptTransferOffer(eventId)
    } else if (action === "decline") {
      resolveEventChoice(eventId, "decline")
    }
  }, [acceptTransferOffer, resolveEventChoice])

  const handleChoice = (choiceId: string) => {
    if (!selectedEvent || isProcessing) return

    if (selectedEvent.type === ("JOB_OFFER" as any)) {
      if (choiceId === "ACCEPT") {
        setIsProcessing(true)
        const result = acceptJobOffer(selectedEvent.id)
        if (result.success) {
          setSelectedEventId(null)
          // Use router.push for proper navigation
          setTimeout(() => {
            router.push("/")
          }, 800)
          return
        } else {
          debug.error("[InboxPage] Job offer failed:", result.message)
          setIsProcessing(false)
        }
      } else if (choiceId === "DECLINE") {
        declineJobOffer(selectedEvent.id)
        setSelectedEventId(null)
      } else if (choiceId === "NEGOTIATE") {
        const result = negotiateJobOffer(selectedEvent.id)
        // Always surface the outcome — otherwise NEGOTIATE looks like a dead
        // button when the club holds firm or withdraws.
        if (result.message) {
          (result.success ? toast.success : toast.error)(result.message)
        }
        if (result.withdrew) {
          setSelectedEventId(null)
        }
        return
      }
    } else if (selectedEvent.type === ("TRANSFER_OFFER" as any) && choiceId === "accept") {
      acceptTransferOffer(selectedEvent.id)
      setSelectedEventId(null)
    } else {
      resolveEventChoice(selectedEvent.id, choiceId)
      setSelectedEventId(null)
    }
  }

  const handleDismiss = () => {
    if (!selectedEvent) return
    resolveEventChoice(selectedEvent.id, "dismiss")
    setSelectedEventId(null)
  }

  // Get theme for current selected event. getNotificationTheme is now a pure
  // module-level helper (see app/desktop/notification-themes.ts) so no
  // dependency is needed beyond the event itself.
  const notificationTheme = useMemo(
    () => getNotificationTheme(selectedEvent ? (selectedEvent.type as string) : "DEFAULT"),
    [selectedEvent]
  )

  // Play notification sound when dialog opens. Deliberately keyed on
  // selectedEventId only — re-firing the sound on every selectedEvent
  // object identity change (e.g. when acknowledged flips) would replay
  // the cue mid-dialog. notificationTheme is derived from selectedEvent
  // so its sound is always current at fire time.
  useEffect(() => {
    if (selectedEvent && !selectedEvent.acknowledged) {
      soundManager.play(notificationTheme.sound)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId])

  // Event helpers
  const getEventTitle = useCallback((event: GameEventSaveData) => {
    const data = event.data as any
    const type = event.type as string
    switch (type) {
      case "CONTRACT": return "Contract Expiry"
      case "MORALE": return "Internal Morale"
      case "INJURY": return data.fatigue ? "Fatigue Warning" : "Medical Report"
      case "FINANCE": return "Finance Dept"
      case "win_streak": return "Performance"
      case "loss_streak": return "Performance"
      case "TRANSFER_OFFER": return "Transfer Offer"
      case "TRANSFER_WINDOW": return "Transfer Market"
      case "ROSTER_UPDATE": return "Roster News"
      case "AI_SIGNING": return "New Signing"
      case "AI_TRANSFER": return "Transfer Alert"
      case "RETIREMENT": return "Retirement News"
      case "JOB_OFFER": return "Job Offer"
      case "CAREER_UPDATE": return "Career Update"
      case "TOURNAMENT": return "Tournament"
      case "MEDIA":
        // Check for Pro awards
        if ((data as any)?.proAwards) {
          return `🏆 Pro Top 20 of ${(data as any).proAwards.year}`
        }
        return data.title || "Media Update"
      default: return data.title || "Notification"
    }
  }, [])

  const getEventDescription = useCallback((event: GameEventSaveData) => {
    const data = event.data as any
    const player = players.find(p => p.id === data.playerId)
    const pName = player?.nickname || data.playerId || data.playerName || "Player"
    const type = event.type as string
    switch (type) {
      case "CONTRACT": return `Contract for ${pName} ending in ${data.weeksLeft} weeks.`
      case "MORALE": return `${pName} is unhappy (${Math.round(data.morale)}%). Reason: ${data.reason}`
      case "INJURY":
        if (data.fatigue) return `${pName} is exhausted (${data.fatigue}). Risk of injury.`
        return `${pName} injured (${data.severity || "Unknown"}). Out for ${data.weeksOut || "?"} weeks.`
      case "FINANCE": return data.description || "Weekly report ready."
      case "win_streak": return `${data.streak} match win streak! Team is hyped.`
      case "loss_streak": return `${data.streak} match loss streak. Morale dropping.`
      case "TRANSFER_OFFER": return data.teamName && data.offerAmount != null ? `${data.teamName} has offered $${data.offerAmount.toLocaleString()} for ${pName}.` : data.message || `Transfer offer for ${pName}.`
      case "TRANSFER_WINDOW": return data.message || "Transfer window activities update."
      case "ROSTER_UPDATE": return data.message || `Roster changes for ${data.teamName}.`
      case "AI_SIGNING": return `${data.teamName || "A team"} has signed ${data.playerName || "a player"} from the free agent pool.`
      case "AI_TRANSFER": return `${data.toTeamName} acquires ${data.playerName} from ${data.fromTeamName} for $${data.fee?.toLocaleString()}.`
      case "RETIREMENT": return `${pName} has announced their retirement.`
      case "JOB_OFFER": return `${data.offeringTeamName} wants you! $${data.salaryOffer?.toLocaleString()}/week.`
      case "CAREER_UPDATE": return data.message || "Your career has been updated."
      case "TOURNAMENT": return data.message || "Tournament update."
      case "MEDIA":
        // Check for Pro awards
        if ((data as any)?.proAwards) {
          const awards = (data as any).proAwards
          const playerMembers = awards.top20?.filter((p: any) => p.isPlayerTeam) || []
          if (playerMembers.length > 0) {
            return `Your team has ${playerMembers.length} player${playerMembers.length > 1 ? 's' : ''} in the Top 20! Click to see the full ceremony.`
          }
          return `The world's best players have been ranked. ${awards.top20?.[0]?.nickname || 'Unknown'} is #1!`
        }
        return data.message || "Media update."
      default: return data.message || data.description || "New message"
    }
  }, [players])

  // Unread counts for notifications — single pass over eventsLog and
  // memoized so the desktop home (which re-renders on every store change)
  // doesn't re-tally on each repaint.
  const { unreadCount, transferUnread } = useMemo(() => {
    let unread = 0
    let transfer = 0
    for (const e of eventsLog) {
      if (e.acknowledged) continue
      unread++
      const t = e.type as string
      if (t === "TRANSFER_OFFER" || t === "AI_SIGNING" || t === "AI_TRANSFER") transfer++
    }
    return { unreadCount: unread, transferUnread: transfer }
  }, [eventsLog])

  // Taskbar apps config
  const taskbarApps = [
    { id: "mail", icon: <Mail size={18} />, label: "Mail", isOpen: windows.mail.isOpen, isMinimized: windows.mail.isMinimized, hasNotification: unreadCount > 0, notificationCount: unreadCount },
    { id: "social", icon: <Hash size={18} />, label: "Social", isOpen: windows.social.isOpen, isMinimized: windows.social.isMinimized },
    { id: "market", icon: <TrendingUp size={18} />, label: "Market", isOpen: windows.market.isOpen, isMinimized: windows.market.isMinimized, hasNotification: transferUnread > 0, notificationCount: transferUnread },
    { id: "calendar", icon: <Calendar size={18} />, label: "Calendar", isOpen: windows.calendar.isOpen, isMinimized: windows.calendar.isMinimized },
    { id: "news", icon: <Newspaper size={18} />, label: "News", isOpen: windows.news.isOpen, isMinimized: windows.news.isMinimized },
    { id: "shop", icon: <ShoppingBag size={18} />, label: "Shop", isOpen: windows.shop.isOpen, isMinimized: windows.shop.isMinimized },
    { id: "facilities", icon: <Building2 size={18} />, label: "Facilities", isOpen: windows.facilities.isOpen, isMinimized: windows.facilities.isMinimized },
    { id: "finance", icon: <DollarSign size={18} />, label: "Finance", isOpen: windows.finance.isOpen, isMinimized: windows.finance.isMinimized },
    { id: "academy", icon: <GraduationCap size={18} />, label: "Academy", isOpen: windows.academy.isOpen, isMinimized: windows.academy.isMinimized },
  ]

  // Render helper for Job Offers
  const renderJobOfferContent = (event: GameEventSaveData) => {
    const data = event.data as any
    const offeringTeam = teams.find(t => t.id === data.offeringTeamId)
    // Check expiry (1 week deadline default)
    const isExpired = currentWeek > (data.deadlineWeek ?? (event.week + 1))

    if (!offeringTeam) return <p>Team data not found.</p>

    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
            {data.offeringTeamLogo ? (
              <Image src={data.offeringTeamLogo} alt={offeringTeam.name} width={64} height={64} className="w-full h-full object-cover" unoptimized />
            ) : (
              <span className="text-xl font-normal opacity-30">{offeringTeam.name.substring(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div>
            <h3 className="text-xl font-normal text-white">{offeringTeam.name}</h3>
            <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
              {offeringTeam.region && <span className="font-medium text-white/70">{offeringTeam.region}</span>}
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>World Rank #{data.offeringTeamRank || offeringTeam.worldRanking || "?"}</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-center relative z-10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 mb-1">Weekly Salary</div>
            <div className="text-3xl font-normal text-white">${data.salaryOffer.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-400/60 mt-1 font-bold">
              + ${(data.signingBonus || (data.salaryOffer * 4)).toLocaleString()} Bonus
            </div>
          </div>
        </div>

        {/* Team Roster Preview */}
        <div className="bg-neutral-900/40 rounded-xl p-3 border border-white/5 mx-[-8px]">
          <h4 className="text-[9px] font-normal uppercase tracking-widest text-white/30 mb-3 px-1">Current Roster</h4>
          <div className="grid grid-cols-5 gap-2">
            {offeringTeam.rosterIds?.map((pid: string) => {
              const p = players.find(x => x.id === pid)
              if (!p) return (
                <div key={pid} className="flex flex-col items-center gap-1.5 opacity-30">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10" />
                </div>
              )
              return (
                <div key={pid} className="flex flex-col items-center gap-1.5 group cursor-default">
                  <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden border border-white/10 relative group-hover:border-white/30 transition-colors shadow-sm">
                    <PlayerPortrait src={p.portraitPath} alt={p.nickname} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      {p.nationality && <CountryFlag country={p.nationality} className="w-2.5 h-2 rounded-[1px] shadow-sm" />}
                      <span className="text-[9px] font-bold text-white truncate max-w-[45px] text-center leading-none tracking-tight">{p.nickname}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleChoice("ACCEPT")}
              disabled={isProcessing || isExpired}
              className={cn("h-10 text-white font-bold disabled:opacity-50", isExpired ? "bg-neutral-600" : "bg-emerald-600 hover:bg-emerald-500")}
            >
              {isProcessing ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Joining...</>
              ) : isExpired ? (
                "Offer Expired"
              ) : (
                "Accept"
              )}
            </Button>
            <Button onClick={() => handleChoice("NEGOTIATE")} disabled={data.negotiationPatience <= 0 || isProcessing || isExpired} variant="outline" className="h-10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              Negotiate
            </Button>
          </div>
          <Button onClick={() => handleChoice("DECLINE")} disabled={isProcessing} variant="ghost" className="w-full text-white/40 hover:text-white hover:bg-white/5">
            Decline
          </Button>
        </div>
      </div>
    )
  }

  const getChoiceBadge = (effects: any) => {
    if (!effects) return null
    return (
      <div className="flex gap-1.5">
        {Object.entries(effects).map(([key, val]: [string, any]) => (
          <motion.div
            key={key}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Badge
              variant={val > 0 ? "default" : "destructive"}
              className={cn(
                "text-[9px] h-5 px-2 font-bold border",
                val > 0
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                  : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
              )}
            >
              {key[0].toUpperCase()}{val > 0 ? "+" : ""}{val}
            </Badge>
          </motion.div>
        ))}
      </div>
    )
  }

  /* New: Rich Roster News Renderer */
  const renderRosterUpdateContent = (event: GameEventSaveData) => {
    const data = event.data as any
    const team = teams.find(t => t.id === data.teamId) || { name: data.teamName || "Unknown Team", logoPath: null, region: "INT" }

    // Normalize signings to array for single player events
    const signings = data.signings || (data.playerName ? [{
      playerName: data.playerName,
      playerId: data.playerId,
      ovr: data.ovr || "?",
      country: data.country || "Unknown",
      fee: data.fee || 0,
      fromTeamName: data.fromTeamName
    }] : [])

    return (
      <div className="space-y-4 pt-2">
        {/* Header with Team Info */}
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10 overflow-hidden shrink-0">
            <TeamLogoImage
              src={(team as any).logoPath}
              alt={team.name}
              className="w-full h-full object-contain p-2"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 text-[10px] h-4 px-1.5 bg-cyan-500/10">
                ROSTER UPDATE
              </Badge>
              <span className="text-[10px] text-white/40 font-sans uppercase">WEEK {event.week}</span>
            </div>
            <h3 className="text-xl font-normal text-white leading-tight">{team.name}</h3>
            <div className="text-xs text-white/50">{signings.length} New Signing{signings.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Players List */}
        <div className="space-y-2">
          {signings.map((player: any, idx: number) => {
            // Find full player data if possible to get image
            const fullPlayer = players.find(p => p.id === player.playerId)

            return (
              <div key={idx} className="flex items-center gap-3 bg-neutral-900/50 p-2 rounded-lg border border-white/5 hover:bg-white/5 transition-colors group">
                {/* Player Image */}
                <div className="w-12 h-12 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/5 relative">
                  <PlayerPortrait
                    src={fullPlayer?.portraitPath}
                    alt={player.playerName}
                    className="w-full h-full object-cover object-top scale-110 translate-y-1"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {fullPlayer?.nationality && <CountryFlag country={fullPlayer.nationality} className="w-3 h-3 opacity-80" />}
                      <span className="font-bold text-sm text-white truncate">{player.playerName}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded text-[10px] font-sans text-cyan-400 border border-cyan-500/20">
                      <span className="opacity-50">OVR</span>
                      <span className="font-bold">{player.ovr}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1 text-[10px]">
                    <div className="text-white/40">
                      from <span className="text-white/60">{player.fromTeamName || "Free Agent"}</span>
                    </div>
                    {player.fee > 0 && (
                      <div className="text-emerald-400 font-medium">
                        ${player.fee.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer/Context */}
        <div className="text-[10px] text-center text-white/30 italic mt-2">
          Check the Transfer Market for full details.
        </div>

        <Button onClick={handleDismiss} className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-xl font-bold uppercase tracking-wider text-[10px] mt-2">
          Acknowledge
        </Button>
      </div>
    )
  }

  /* New: Rich Tournament Update Renderer */
  const renderTournamentUpdateContent = (event: GameEventSaveData) => {
    const data = event.data as any
    const tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === data.tournamentId)

    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/30 overflow-hidden shrink-0 relative">
            {data.logoPath || tournament?.logoPath ? (
              <div className="w-full h-full p-2 flex items-center justify-center relative">
                <Image src={(data.logoPath || tournament?.logoPath) as string} alt="Tournament" fill className="object-contain drop-shadow-lg" unoptimized />
              </div>
            ) : (
              <Trophy size={24} className="text-indigo-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 text-[10px] h-4 px-1.5 bg-indigo-500/10">
                TOURNAMENT UPDATE
              </Badge>
              <span className="text-[10px] text-white/40 font-sans uppercase">WEEK {event.week}</span>
            </div>
            <h3 className="text-xl font-bold text-white leading-tight">{data.title || "Match Day"}</h3>
            <div className="text-xs text-white/50 mt-0.5 max-w-[200px] truncate">
              {tournament?.name || "Official Tournament Match"}
            </div>
          </div>
        </div>

        <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
          <p className="text-sm text-indigo-100 leading-relaxed font-medium">
            {data.message || "Your team has an upcoming match in the tournament."}
          </p>
        </div>

        {data.matchId ? (
          <Button
            onClick={() => {
              router.push(`/match/${data.matchId}/tactics`)
              handleDismiss()
            }}
            className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-xl font-bold uppercase tracking-wider text-[10px] mt-2 flex items-center justify-center gap-2"
          >
            <Rocket size={14} className="text-black" />
            Go to Match
          </Button>
        ) : data.tournamentId ? (
          <Button
            onClick={() => {
              router.push(`/tournaments/${data.tournamentId}`)
              handleDismiss()
            }}
            className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-xl font-bold uppercase tracking-wider text-[10px] mt-2 flex items-center justify-center gap-2"
          >
            <Trophy size={14} className="text-black" />
            View Tournament
          </Button>
        ) : null}
      </div>
    )
  }


  /* New: Rich Career Update Renderer */
  const renderCareerUpdateContent = (event: GameEventSaveData) => {
    const data = event.data as any
    const rawText = data.message || data.content || ""

    // Define sections to look for
    const headers = ["YOUR TEAM", "FIRST STEPS", "KEY TIPS", "YOUR GOAL"]

    // Icon mapping with proper components
    const iconMap: Record<string, React.ReactNode> = {
      "YOUR TEAM": playerTeam?.logoPath ? (
        <div className="w-full h-full flex items-center justify-center p-0.5">
          <TeamLogoImage src={playerTeam.logoPath} alt="Team" className="w-full h-full object-contain" />
        </div>
      ) : <Users size={18} className="text-emerald-400" />,
      "FIRST STEPS": <ClipboardList size={18} className="text-blue-400" />,
      "KEY TIPS": <Lightbulb size={18} className="text-amber-400" />,
      "YOUR GOAL": <Trophy size={18} className="text-yellow-400" />
    }

    // Check if rich format (contains at least one header)
    if (!headers.some(h => rawText.includes(h))) {
      return (
        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <p className="text-sm leading-relaxed text-white/80 whitespace-pre-line">{rawText}</p>
        </div>
      )
    }

    // Advanced splitting: Find indices of headers
    // We can't just split by regex easily if headers have spaces and we want to keep them.
    // Instead, let's replace headers with a delimiter + header
    let processedText = rawText
    headers.forEach(h => {
      processedText = processedText.replace(h, `|SECTION|${h}`)
    })

    const [intro, ...sections] = processedText.split("|SECTION|")

    return (
      <div className="space-y-4 pt-1">
        {intro && intro.replace("Here's what you need to know:", "").trim().length > 0 && (
          <p className="text-sm text-white/90 font-medium leading-relaxed px-1">
            {intro.replace("Here's what you need to know:", "").trim().replace(/[^\w\s.,!?:;'\"]+$/g, '')}
          </p>
        )}
        <div className="grid gap-3">
          {sections.map((sec: string, i: number) => {
            // Sec starts with Header.
            const header = headers.find(h => sec.startsWith(h)) || ""
            const body = sec.substring(header.length).trim()

            // Clean body of leading/trailing bullets/emojis/whitespace
            const cleanBody = body
              .replace(/^[•\-\s\uD800-\uDBFF\uDC00-\uDFFF\u2700-\u27BF\uE000-\uF8FF\u2600-\u26FF\uFE00-\uFE0F]+/, "") // Leading junk
              .replace(/[\uD800-\uDBFF\uDC00-\uDFFF\u2700-\u27BF\uE000-\uF8FF\u2600-\u26FF\uFE00-\uFE0F]+/g, "") // Any other emojis
              .trim()

            if (!header) return null

            return (
              <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center text-xl shrink-0 border border-white/5 group-hover:scale-105 transition-transform overflow-hidden">
                    {iconMap[header] ?? <Clock size={18} className="text-white/40" />}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">{header}</h4>
                    <p className="text-xs text-white/70 leading-relaxed">{cleanBody}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* New: Rich Medical Report Renderer */
  const renderMedicalReportContent = (event: GameEventSaveData) => {
    const data = event.data as any
    const player = players.find(p => p.id === data.playerId)
    // Find player's actual team
    const team = teams.find(t => t.rosterIds?.includes(player?.id || "")) || { name: "Free Agent", logoPath: null }

    if (!player) return <p className="text-white/50 italic">Player data unavailable.</p>

    return (
      <div className="space-y-4 pt-2">
        {/* Patient Card */}
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/30 overflow-hidden shrink-0 relative">
            <PlayerPortrait src={player.portraitPath} alt={player.nickname} className="w-full h-full object-cover scale-110 translate-y-1 grayscale-[0.3]" />
            <div className="absolute inset-0 bg-red-500/10 mix-blend-overlay" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px] h-4 px-1.5 bg-red-500/10">
                MEDICAL REPORT
              </Badge>
              {team.logoPath && (
                <div className="w-4 h-4 opacity-50">
                  <TeamLogoImage src={team.logoPath} alt={team.name} className="w-full h-full object-contain" />
                </div>
              )}
              <span className="text-[10px] text-white/40 font-sans uppercase">{team.name}</span>
            </div>
            <h3 className="text-xl font-bold text-white leading-tight">{player.nickname}</h3>
            <div className="flex items-center gap-2 text-xs text-white/50 mt-0.5">
              <span>{player.role || "Player"}</span>
              <span className="opacity-30">•</span>
              <span>OVR {player.skill}</span>
            </div>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-red-500/20 rounded-xl text-red-400 mt-0.5 shrink-0">
              <Stethoscope size={20} />
            </div>
            <div className="space-y-2">
              <div>
                <h4 className="text-[10px] font-bold text-red-200/70 uppercase tracking-widest mb-0.5">Diagnosis</h4>
                <p className="text-sm text-red-100 leading-relaxed font-medium">
                  {data.message || data.description || "Player has suffered an injury during training."}
                </p>
              </div>

              {data.weeksOut > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 text-red-400 text-xs font-bold uppercase tracking-wider mx-[-2px]">
                  <Clock size={12} />
                  <span>Out for {data.weeksOut} Week{data.weeksOut !== 1 ? 's' : ''}</span>
                </div>
              )}
              {data.fatigue > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/20 text-orange-400 text-xs font-bold uppercase tracking-wider mx-[-2px]">
                  <Flame size={12} />
                  <span>Fatigue High ({data.fatigue})</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full w-full overflow-hidden liquid-app-bg">
      <SeasonRecapModal
        isOpen={!!pendingSeasonRecap && !!seasonRecapStats}
        onClose={clearPendingSeasonRecap}
        year={pendingSeasonRecap || 0}
        stats={seasonRecapStats!}
      />
      <TutorialOverlay />
      <DesktopOverlay>
        <div className="relative w-full h-full overflow-hidden">
          {/* Animated Background */}
          <DesktopBackground />

          {/* Desktop Icons */}
          <div className="absolute top-4 left-4 grid grid-rows-6 grid-flow-col gap-3 z-10">
            {[
              { id: "mail" as AppId, icon: <Mail size={24} />, label: "Mail" },
              { id: "social" as AppId, icon: <Hash size={24} />, label: "Social" },
              { id: "market" as AppId, icon: <TrendingUp size={24} />, label: "Market" },
              { id: "calendar" as AppId, icon: <Calendar size={24} />, label: "Calendar" },
              { id: "news" as AppId, icon: <Newspaper size={24} />, label: "News" },
              { id: "shop" as AppId, icon: <ShoppingBag size={24} />, label: "Shop" },
              { id: "facilities" as AppId, icon: <Building2 size={24} />, label: "Facilities" },
              { id: "finance" as AppId, icon: <DollarSign size={24} />, label: "Finance" },
              { id: "academy" as AppId, icon: <GraduationCap size={24} />, label: "Academy" },
            ].map(app => (
              <motion.button
                key={app.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => openWindow(app.id)}
                className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-white/[0.07] transition-colors group"
              >
                <div className={cn(
                  "w-12 h-12 rounded-lg backdrop-blur-sm border flex items-center justify-center transition-all shadow-glass-soft",
                  windows[app.id].isOpen
                    ? "bg-cyan-300/[0.14] border-cyan-200/25 text-cyan-200"
                    : "bg-white/[0.075] border-white/10 text-white/70 group-hover:text-white group-hover:border-white/20"
                )}>
                  {app.icon}
                </div>
                <span className="text-[10px] font-medium text-white/70 group-hover:text-white">{app.label}</span>
              </motion.button>
            ))}
          </div>



          {/* Weekly Focus Widget (Desktop Widget) */}
          <div className="absolute top-4 right-4 z-0 w-72 h-[320px]">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="h-full"
            >
              <WeeklyFocusWidget />
            </motion.div>
          </div>

          {/* App Windows */}
          <AppWindow
            id="mail"
            title="Mail"
            icon={<Mail size={12} />}
            isOpen={windows.mail.isOpen}
            isMinimized={windows.mail.isMinimized}
            isFocused={windows.mail.isFocused}
            zIndex={windows.mail.zIndex}
            initialPosition={{ x: 180, y: 30 }}
            initialSize={{ width: 580, height: 400 }}
            onClose={() => closeWindow("mail")}
            onMinimize={() => minimizeWindow("mail")}
            onFocus={() => focusWindow("mail")}
          >
            <MailApp
              events={eventsLog}
              onEventClick={handleEventClick}
              onMarkAllRead={markAllEventsAsRead}
              getEventTitle={getEventTitle}
              getEventDescription={getEventDescription}
              onQuickAction={handleQuickAction}
            />
          </AppWindow>

          <AppWindow
            id="shop"
            title="Pro Shop"
            icon={<ShoppingBag size={12} />}
            isOpen={windows.shop.isOpen}
            isMinimized={windows.shop.isMinimized}
            isFocused={windows.shop.isFocused}
            zIndex={windows.shop.zIndex}
            initialPosition={windows.shop.position}
            initialSize={{ width: 850, height: 600 }}
            onClose={() => closeWindow("shop")}
            onMinimize={() => minimizeWindow("shop")}
            onFocus={() => focusWindow("shop")}
          >
            <ShopApp />
          </AppWindow>

          <AppWindow
            id="facilities"
            title="Team Facilities"
            icon={<Building2 size={12} />}
            isOpen={windows.facilities.isOpen}
            isMinimized={windows.facilities.isMinimized}
            isFocused={windows.facilities.isFocused}
            zIndex={windows.facilities.zIndex}
            initialPosition={windows.facilities.position}
            initialSize={{ width: 700, height: 550 }}
            onClose={() => closeWindow("facilities")}
            onMinimize={() => minimizeWindow("facilities")}
            onFocus={() => focusWindow("facilities")}
          >
            <FacilitiesApp />
          </AppWindow>

          <AppWindow
            id="finance"
            title="Finance Ledger"
            icon={<DollarSign size={12} />}
            isOpen={windows.finance.isOpen}
            isMinimized={windows.finance.isMinimized}
            isFocused={windows.finance.isFocused}
            zIndex={windows.finance.zIndex}
            initialPosition={windows.finance.position}
            initialSize={{ width: 700, height: 500 }}
            onClose={() => closeWindow("finance")}
            onMinimize={() => minimizeWindow("finance")}
            onFocus={() => focusWindow("finance")}
          >
            <FinanceApp />
          </AppWindow>

          <AppWindow
            id="academy"
            title="Youth Academy"
            icon={<GraduationCap size={12} />}
            isOpen={windows.academy.isOpen}
            isMinimized={windows.academy.isMinimized}
            isFocused={windows.academy.isFocused}
            zIndex={windows.academy.zIndex}
            initialPosition={windows.academy.position}
            initialSize={{ width: 800, height: 600 }}
            onClose={() => closeWindow("academy")}
            onMinimize={() => minimizeWindow("academy")}
            onFocus={() => focusWindow("academy")}
          >
            <AcademyApp />
          </AppWindow>

          <AppWindow
            id="social"
            title="Social"
            icon={<Hash size={12} />}
            isOpen={windows.social.isOpen}
            isMinimized={windows.social.isMinimized}
            isFocused={windows.social.isFocused}
            zIndex={windows.social.zIndex}
            initialPosition={{ x: 250, y: 50 }}
            initialSize={{ width: 420, height: 450 }}
            onClose={() => closeWindow("social")}
            onMinimize={() => minimizeWindow("social")}
            onFocus={() => focusWindow("social")}
          >
            <SocialApp posts={socialPosts} teams={teams} playerTeam={playerTeam} />
          </AppWindow>

          <AppWindow
            id="market"
            title="Market"
            icon={<TrendingUp size={12} />}
            isOpen={windows.market.isOpen}
            isMinimized={windows.market.isMinimized}
            isFocused={windows.market.isFocused}
            zIndex={windows.market.zIndex}
            initialPosition={{ x: 320, y: 70 }}
            initialSize={{ width: 900, height: 650 }}
            onClose={() => closeWindow("market")}
            onMinimize={() => minimizeWindow("market")}
            onFocus={() => focusWindow("market")}
          >
            <MarketApp events={eventsLog} onEventClick={handleEventClick} />
          </AppWindow>

          <AppWindow
            id="calendar"
            title="Calendar"
            icon={<Calendar size={12} />}
            isOpen={windows.calendar.isOpen}
            isMinimized={windows.calendar.isMinimized}
            isFocused={windows.calendar.isFocused}
            zIndex={windows.calendar.zIndex}
            initialPosition={{ x: 390, y: 40 }}
            initialSize={{ width: 380, height: 450 }}
            onClose={() => closeWindow("calendar")}
            onMinimize={() => minimizeWindow("calendar")}
            onFocus={() => focusWindow("calendar")}
          >
            <CalendarApp currentWeek={currentWeek} events={eventsLog} onEventClick={handleEventClick} />
          </AppWindow>

          <AppWindow
            id="news"
            title="News"
            icon={<Newspaper size={12} />}
            isOpen={windows.news.isOpen}
            isMinimized={windows.news.isMinimized}
            isFocused={windows.news.isFocused}
            zIndex={windows.news.zIndex}
            initialPosition={{ x: 200, y: 90 }}
            initialSize={{ width: 420, height: 400 }}
            onClose={() => closeWindow("news")}
            onMinimize={() => minimizeWindow("news")}
            onFocus={() => focusWindow("news")}
          >
            <NewsApp events={eventsLog} onEventClick={handleEventClick} />
          </AppWindow>

          {/* Taskbar */}
          <Taskbar
            apps={taskbarApps}
            currentWeek={currentWeek}
            teamLogo={playerTeam?.logoPath}
            teamName={playerTeam?.name}
            onAppClick={handleAppClick}
          />
        </div>
      </DesktopOverlay >

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <DialogContent className={cn(
          "bg-[rgba(10,10,15,0.98)] backdrop-blur-2xl p-0 overflow-hidden rounded-2xl relative",
          "!fixed !top-1/2 !left-1/2 !-translate-x-1/2 !-translate-y-1/2 !z-overlay",
          notificationTheme.borderColor,
          "shadow-2xl",
          selectedEvent?.type === "JOB_OFFER" ? "max-w-md" : (
            ["ROSTER_UPDATE", "AI_SIGNING", "AI_TRANSFER"].includes(selectedEvent?.type as string) ? "max-w-sm" : "max-w-sm"
          )
        )}>
          {/* Animated background glow */}
          <motion.div
            className={cn(
              "absolute -inset-10 rounded-full blur-[80px] pointer-events-none bg-gradient-to-br",
              notificationTheme.gradient
            )}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.5, 0.7, 0.5]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Shimmer overlay */}
          <div className="absolute inset-0 notification-shimmer pointer-events-none rounded-2xl opacity-50" />
          {selectedEvent?.type === "JOB_OFFER" ? (
            <div className="p-6 relative z-10">
              <div className="text-center mb-2">
                <DialogTitle className="text-xl font-normal uppercase tracking-tighter text-emerald-400">
                  Career Opportunity
                </DialogTitle>
                <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest mt-1">
                  Official Offer · Week {selectedEvent.week}
                </DialogDescription>
              </div>
              {renderJobOfferContent(selectedEvent)}
            </div>
          ) : ["ROSTER_UPDATE", "AI_SIGNING", "AI_TRANSFER"].includes(selectedEvent?.type as string) ? (
            <div className="p-6 relative z-10">
              <DialogTitle className="sr-only">{getEventTitle(selectedEvent as GameEventSaveData)}</DialogTitle>
              <DialogDescription className="sr-only">{getEventDescription(selectedEvent as GameEventSaveData)}</DialogDescription>
              {renderRosterUpdateContent(selectedEvent as GameEventSaveData)}
            </div>
          ) : selectedEvent?.type === ("CAREER_UPDATE" as any) ? (
            <div className="p-6 relative z-10">
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-bold uppercase tracking-tight text-white flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                    <Rocket size={20} className="text-cyan-400" />
                  </div>
                  CAREER UPDATE
                </DialogTitle>
                <DialogDescription className="text-[10px] uppercase tracking-widest text-white/40">Week {selectedEvent?.week}</DialogDescription>
              </DialogHeader>
              {renderCareerUpdateContent(selectedEvent as GameEventSaveData)}
            </div>
          ) : selectedEvent?.type === ("INJURY" as any) ? (
            <div className="p-6 relative z-10">
              <DialogTitle className="sr-only">Medical Report</DialogTitle>
              <DialogDescription className="sr-only">Injury Details</DialogDescription>
              {renderMedicalReportContent(selectedEvent as GameEventSaveData)}
            </div>
          ) : selectedEvent?.type === ("TOURNAMENT" as any) ? (
            <div className="p-6 relative z-10">
              <DialogTitle className="sr-only">Tournament Update</DialogTitle>
              <DialogDescription className="sr-only">Match Details</DialogDescription>
              {renderTournamentUpdateContent(selectedEvent as GameEventSaveData)}
            </div>
          ) : (
            <div className="p-6 space-y-4 relative z-10">
              <DialogHeader className="space-y-3">
                {/* Animated Icon with Pulse Ring */}
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border mx-auto relative",
                    notificationTheme.borderColor,
                    notificationTheme.iconBg
                  )}
                >
                  <Mail size={24} className={notificationTheme.iconColor} />

                  {/* Animated pulse ring */}
                  <motion.div
                    className={cn("absolute inset-0 rounded-2xl border", notificationTheme.borderColor)}
                    animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <DialogTitle className={cn("text-lg font-bold uppercase tracking-tight", notificationTheme.iconColor)}>
                    {selectedEvent && getEventTitle(selectedEvent)}
                  </DialogTitle>
                  <DialogDescription className="font-medium text-muted-foreground text-[10px] uppercase tracking-widest mt-1">
                    Week {selectedEvent?.week}
                  </DialogDescription>
                </motion.div>
              </DialogHeader>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={cn("rounded-xl p-4 border", notificationTheme.borderColor, "bg-white/5")}
              >
                <p className="text-sm leading-relaxed text-white/80">
                  {selectedEvent && getEventDescription(selectedEvent)}
                </p>
              </motion.div>

              <div className="space-y-2">
                {selectedEvent && (selectedEvent as any).choices?.map((choice: any, idx: number) => (
                  <motion.div
                    key={choice.id}
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: 0.2 + idx * 0.08, type: "spring", stiffness: 300 }}
                  >
                    <Button
                      onClick={() => handleChoice(choice.id)}
                      disabled={(selectedEvent as any).selectedChoiceId !== undefined}
                      className={cn(
                        "w-full h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between px-4",
                        "transition-all duration-200 hover:scale-[1.02] hover:bg-white/10",
                        "hover:shadow-lg hover:shadow-cyan-500/10"
                      )}
                      variant="outline"
                    >
                      <span className="font-bold uppercase tracking-wider text-[11px]">{choice.text}</span>
                      {getChoiceBadge(choice.effects)}
                    </Button>
                  </motion.div>
                ))}

                {/* Pro Awards View Ceremony Button */}
                {selectedEvent?.type === "MEDIA" && (selectedEvent.data as any)?.proAwards && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                  >
                    <Button
                      onClick={() => {
                        setProAwards((selectedEvent.data as any).proAwards)
                        setIsProModalOpen(true)
                        handleDismiss()
                      }}
                      className="w-full h-11 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 rounded-xl font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-2"
                    >
                      <Trophy size={16} />
                      View Awards Ceremony
                    </Button>
                  </motion.div>
                )}

                {(!selectedEvent || !(selectedEvent as any).choices || (selectedEvent as any).choices.length === 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <Button
                      onClick={handleDismiss}
                      className={cn(
                        "w-full h-11 bg-white text-black hover:bg-white/90 rounded-xl font-bold uppercase tracking-wider text-[10px]",
                        "transition-all duration-200 hover:scale-[1.02]"
                      )}
                    >
                      Acknowledge
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog >

      {/* Pro Awards Modal */}
      < ProAwardsModal
        isOpen={isProModalOpen}
        onClose={() => setIsProModalOpen(false)}
        awards={proAwards}
      />
    </div >
  )
}

export default function DesktopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">Loading Desktop Environment...</div>}>
      <DesktopContent />
    </Suspense>
  )
}
