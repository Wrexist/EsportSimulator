"use client"

import { loadCareerDraft, saveCareerDraft, clearCareerDraft } from '@/lib/new-career-draft'
import { useEffect, useState, useMemo, useRef, type KeyboardEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { debug } from "@/lib/debug-logger"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { ArrowLeft, ChevronRight, Loader2, Lock, Search, X } from "lucide-react"
import { toast } from "@/lib/toast"
import { ManagerProgression, ManagerTier, TEAM_REP_TIERS, TIER_THRESHOLDS } from "@/engine/manager-progression"
import { loadCareerProfile, recordNewCampaign } from "@/engine/manager-career-profile"
import { cn } from "@/lib/utils"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { calculateInitialPrestige } from "@/data/snapshot-loader"
import { calculateTeamTier, type TierLevel } from "@/engine/tier-system"
import { resolvePlayerRole } from "@/engine/role-determination"
import { describeClubChallenge } from "@/lib/club-expectations"
import { formatCurrency } from "@/lib/utils-extended"

interface SnapshotTeam {
    id: string
    name: string
    shortName: string
    tier: string
    region: string
    logoPath: string
    rosterIds: string[]
    reputation: number
    fanbase: number
    startingBudget: number
}

interface SnapshotPlayer {
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string
    role: string
    tier: string
    skill: number
    awp: number
    rifle: number
    [key: string]: any
}

interface RankedTeam extends SnapshotTeam {
    worldRanking: number
    calculatedTier: TierLevel
}

type TierFilter = "ALL" | TierLevel

const TIER_LABEL: Record<TierLevel, string> = {
    ELITE: "Elite",
    PRO: "Pro",
    SEMI_PRO: "Semi-pro",
    AMATEUR: "Amateur",
}
const TIER_FILTERS: TierFilter[] = ["ALL", "ELITE", "PRO", "SEMI_PRO", "AMATEUR"]

// Evaluate a snapshot player with computed prestigeScore (matches game initialization)
function evaluateSnapshotPlayer(player: SnapshotPlayer, team?: SnapshotTeam) {
    const prestigeScore = calculateInitialPrestige(
        player.tier, team?.tier, team?.reputation,
        player.matchesPlayed || 0, player.age
    )
    return evaluatePlayer({ ...player, prestigeScore } as any)
}

// Onboarding Steps
type OnboardingStep = "welcome" | "team-select"

/** Full-bleed arena art behind an ink gradient (shared with the main menu look). */
function KeyArt() {
    return (
        <>
            <Image
                src="/esport-ui-assets/backgrounds/club-overview-hq.webp"
                alt=""
                fill
                priority
                sizes="100vw"
                className="pointer-events-none select-none object-cover object-center opacity-70 saturate-[0.7]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-ink from-30% via-ink/85 via-55% to-ink/25" />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-ink via-transparent via-40% to-ink/50" />
        </>
    )
}

export default function TeamSelectionPage() {
    const router = useRouter()
    const { initializeNewGame } = useGameStore(useShallow(state => ({
        initializeNewGame: state.initializeNewGame,
    })))

    // Onboarding state
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome")
    const [managerName, setManagerName] = useState("")
    const [managerNameError, setManagerNameError] = useState("")

    // Team selection state
    const [teams, setTeams] = useState<SnapshotTeam[]>([])
    const [players, setPlayers] = useState<SnapshotPlayer[]>([])
    const [selectedTeam, setSelectedTeam] = useState<RankedTeam | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedTier, setSelectedTier] = useState<TierFilter>("ALL")
    const [isDataLoading, setIsDataLoading] = useState(true)
    const [isStarting, setIsStarting] = useState(false)

    // Career Mode State — gated by the player's all-time peak manager level
    // (cross-save profile), so levels earned in past careers unlock bigger orgs
    // in new ones. Was hardcoded to 1, which left every above-Rookie team locked.
    const [managerLevel, setManagerLevel] = useState(1)
    const [sandboxMode, setSandboxMode] = useState(false)
    // G14: new players and rosters shuffled between clubs of the same tier.
    const [randomWorld, setRandomWorld] = useState(false)

    useEffect(() => {
        loadCareerProfile().then(p => setManagerLevel(Math.max(1, p.peakLevel))).catch(() => { })
    }, [])

    const startingRef = useRef(false)
    const [draftReady, setDraftReady] = useState(false)
    const [draftSaved, setDraftSaved] = useState(true)
    const [dataError, setDataError] = useState(false)
    useEffect(() => {
        const draft = loadCareerDraft()
        if (draft) { setManagerName(draft.managerName); setSandboxMode(!!draft.sandbox); if (draft.managerName.trim().length >= 2) setCurrentStep('team-select') }
        setDraftReady(true)
    }, [])
    useEffect(() => {
        if (draftReady && !isStarting) setDraftSaved(saveCareerDraft({ managerName, sandbox: sandboxMode, ...(selectedTeam ? { teamId: selectedTeam.id } : {}) }))
    }, [draftReady, managerName, sandboxMode, selectedTeam, isStarting])

    // Load snapshot data
    useEffect(() => {
        async function loadData() {
            setIsDataLoading(true)
            try {
                const [teamsRes, playersRes] = await Promise.all([
                    fetch("/data/snapshot/teams.json"),
                    fetch("/data/snapshot/players.json"),
                ])
                if (!teamsRes.ok || !playersRes.ok) throw Error('Game data unavailable')
                const teamsData = await teamsRes.json()
                const playersData = await playersRes.json()
                if (!Array.isArray(teamsData) || !Array.isArray(playersData)) throw Error('Invalid game data')
                setTeams(teamsData)
                setPlayers(playersData)
            } catch (error) {
                setDataError(true)
                debug.error("Failed to load snapshot data:", error)
                toast.error("Failed to load game data", {
                    description: "Please check your connection and try again."
                })
            }
            setIsDataLoading(false)
        }
        loadData()
    }, [])

    // Rank teams and assign tiers dynamically
    const rankedTeams = useMemo(() => {
        // Spread before sort — `Array.prototype.sort` mutates in place, and
        // `teams` is component state; sorting it directly mutates state outside
        // a setter (StrictMode/concurrent-render footgun).
        return [...teams]
            .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
            .map((team, index): RankedTeam => ({
                ...team,
                worldRanking: index + 1,
                calculatedTier: calculateTeamTier(index + 1)
            }))
    }, [teams])

    // O(1) player lookup so per-team numbers scan their own rosterIds (~5 ids)
    // instead of filtering the full ~1000-player snapshot for every team.
    const playersById = useMemo(
        () => new Map(players.map(p => [p.id, p])),
        [players],
    )

    // Calculate actual starting budget (mirrors game-store initialization logic)
    // Teams with < 5 players get bonus funds to fill roster
    const getCalculatedBudget = (team: RankedTeam | SnapshotTeam) => {
        const ranking = (team as RankedTeam).worldRanking || 50

        // Base budget by reputation tier AND world ranking (reputation is 0-100 scale)
        let calculatedBudget = 250000 // Low Tier default
        if (team.reputation > 80) calculatedBudget = 2000000 // Top Tier (Top 10)
        else if (team.reputation > 50) calculatedBudget = 1000000 // High Tier (Top 30)
        else if (team.reputation > 0) calculatedBudget = 500000 // Mid Tier

        // Check for incomplete roster and inject funds
        if (team.rosterIds.length < 5) {
            const missingCount = 5 - team.rosterIds.length
            const teammates = team.rosterIds.map(id => playersById.get(id)).filter((p): p is SnapshotPlayer => !!p)

            // Calculate the MINIMUM value player on the team (that's who they'd realistically replace with)
            let targetValue = 150000 // Bare minimum fallback
            if (teammates.length > 0) {
                const values = teammates.map(p => evaluateSnapshotPlayer(p, team as SnapshotTeam).transferValue).sort((a, b) => a - b)

                // Use the lowest-valued player as the target (you'd buy similar or slightly worse)
                targetValue = values[0]

                // Apply world ranking modifier - lower ranked teams get budget for cheaper players
                // Rank 1-20: 100%, Rank 21-50: 80%, Rank 51-100: 60%, Rank 100+: 40%
                let rankingModifier = 1.0
                if (ranking > 100) rankingModifier = 0.4
                else if (ranking > 50) rankingModifier = 0.6
                else if (ranking > 20) rankingModifier = 0.8

                targetValue = Math.round(targetValue * rankingModifier)
            }

            // Injection: Target Value × Missing Count (no extra buffer - tight budget is more realistic)
            calculatedBudget += Math.round(targetValue * missingCount)
        }

        // Return the higher of calculated or static value
        return Math.max(calculatedBudget, team.startingBudget || 0)
    }

    // Per-club numbers for the picker table, computed once per data load.
    const teamStats = useMemo(() => {
        const map = new Map<string, { ovr: number; budget: number; value: number }>()
        for (const team of rankedTeams) {
            let sum = 0, n = 0, value = 0
            for (const id of team.rosterIds || []) {
                const player = playersById.get(id)
                if (!player) continue
                const evaluation = evaluateSnapshotPlayer(player, team)
                sum += evaluation.overallRating
                value += evaluation.transferValue
                n++
            }
            map.set(team.id, { ovr: n === 0 ? 0 : Math.round(sum / n), budget: getCalculatedBudget(team), value })
        }
        return map
        // eslint-disable-next-line react-hooks/exhaustive-deps -- getCalculatedBudget only reads playersById
    }, [rankedTeams, playersById])

    const isLocked = (team: SnapshotTeam) => !sandboxMode && !ManagerProgression.isTeamUnlocked(team.reputation, managerLevel)

    // Filter teams
    const filteredTeams = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        const result = rankedTeams.filter(t => {
            const matchesSearch = !term || t.name.toLowerCase().includes(term) || t.shortName?.toLowerCase().includes(term)
            const matchesTier = selectedTier === "ALL" || t.calculatedTier === selectedTier
            return matchesSearch && matchesTier
        })

        // Sort: Unlocked teams first, then by Ranking
        return result.sort((a, b) => {
            const lockedA = !sandboxMode && !ManagerProgression.isTeamUnlocked(a.reputation, managerLevel)
            const lockedB = !sandboxMode && !ManagerProgression.isTeamUnlocked(b.reputation, managerLevel)
            if (lockedA !== lockedB) return lockedA ? 1 : -1
            return a.worldRanking - b.worldRanking
        })
    }, [rankedTeams, searchTerm, selectedTier, managerLevel, sandboxMode])

    // Get roster for selected team with evaluations
    const selectedRoster = useMemo(() => {
        if (!selectedTeam) return []
        return selectedTeam.rosterIds
            .map(id => playersById.get(id))
            .filter((p): p is SnapshotPlayer => !!p)
            .map(p => ({ ...p, evaluation: evaluateSnapshotPlayer(p, selectedTeam) }))
            .sort((a, b) => b.evaluation.overallRating - a.evaluation.overallRating)
    }, [selectedTeam, playersById])

    const tierCounts = useMemo(() => {
        const counts: Record<TierFilter, number> = { ALL: rankedTeams.length, ELITE: 0, PRO: 0, SEMI_PRO: 0, AMATEUR: 0 }
        for (const t of rankedTeams) counts[t.calculatedTier]++
        return counts
    }, [rankedTeams])

    const validateManagerName = () => {
        if (!managerName.trim()) {
            setManagerNameError("Enter your manager name")
            return false
        }
        if (managerName.trim().length < 2) {
            setManagerNameError("Name must be at least 2 characters")
            return false
        }
        setManagerNameError("")
        return true
    }

    // Handle continue from welcome step
    const handleContinueToTeamSelect = () => {
        if (validateManagerName()) setCurrentStep("team-select")
    }

    const handleCreateOwnTeam = () => {
        if (!validateManagerName()) return
        // Store manager name in the draft for the create-team page
        saveCareerDraft({ managerName: managerName.trim() })
        router.push("/new-game/create-team")
    }

    // G7: the Draft Cup, a short run with a drafted side.
    const handleDraftCup = () => {
        if (!validateManagerName()) return
        saveCareerDraft({ managerName: managerName.trim() })
        router.push("/new-game/draft-cup")
    }

    // G9: start with no club. The world is built around a placeholder club
    // (the lowest-reputation side, never managed) and the career opens on
    // the first-job market.
    const handleStartUnemployed = async () => {
        if (!validateManagerName() || isStarting || startingRef.current || rankedTeams.length === 0) return
        const placeholder = [...rankedTeams].sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))[0]
        startingRef.current = true
        setIsStarting(true)
        try {
            await initializeNewGame(managerName.trim() || "My Career", placeholder.id, undefined, { unemployed: true, randomWorld })
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            clearCareerDraft()
            void recordNewCampaign()
            router.push("/")
        } catch (err) {
            debug.error("Failed to start game:", err)
            toast.error("Failed to start game", { description: "An error occurred while initializing. Please try again." })
            startingRef.current = false
            setIsStarting(false)
        }
    }

    const handleStartGame = async () => {
        if (!selectedTeam || isStarting || startingRef.current) return
        if (managerName.trim().length < 2 || isLocked(selectedTeam)) {
            toast.error('Review your manager name and club eligibility before starting.'); return
        }
        startingRef.current = true
        setIsStarting(true)
        try {
            // Pass manager name to initializeNewGame (using it as save name for now)
            await initializeNewGame(managerName.trim() || "My Career", selectedTeam.id, undefined, { randomWorld })
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            clearCareerDraft()
            void recordNewCampaign()
            // Use client-side navigation to preserve store state
            router.push("/")
        } catch (err) {
            debug.error("Failed to start game:", err)
            toast.error("Failed to start game", {
                description: "An error occurred while initializing. Please try again."
            })
            startingRef.current = false
            setIsStarting(false)
        }
    }

    // One-shot restore of the draft's club; otherwise preselect the best open club
    // so the detail pane is never empty.
    useEffect(() => {
        if (selectedTeam || rankedTeams.length === 0) return
        const teamId = loadCareerDraft()?.teamId
        const draftTeam = teamId ? rankedTeams.find(t => t.id === teamId) : undefined
        setSelectedTeam(draftTeam || filteredTeams.find(t => !isLocked(t)) || null)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot when teams load; re-running on selectedTeam would re-select after the user clears it
    }, [rankedTeams])

    if (dataError) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-ink p-8">
                <Panel className="w-full max-w-md" title="Game data could not load">
                    <p className="text-sm text-ink-2">Your setup draft is kept. Retry loading the local game data.</p>
                    <Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
                </Panel>
            </div>
        )
    }

    // Loading state
    if (isDataLoading) {
        return (
            <div className="flex min-h-dvh items-center justify-center gap-3 bg-ink text-sm text-ink-3" role="status">
                <Loader2 size={16} className="animate-spin" /> Loading clubs…
            </div>
        )
    }

    // ============ STEP 1: MANAGER NAME + PATH ============
    if (currentStep === "welcome") {
        return (
            <div className="relative flex min-h-dvh overflow-hidden bg-ink">
                <KeyArt />
                <div className="relative z-10 flex min-h-dvh w-full max-w-[560px] flex-col px-16 py-14 animate-in fade-in duration-200">
                    <Link href="/main-menu" className="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-medium text-ink-3 hover:text-ink-1">
                        <ArrowLeft size={16} /> Main menu
                    </Link>

                    <div className="my-auto w-full max-w-[420px] py-12">
                        <ScreenHeader eyebrow="Step 1 of 2" title="New career" subtitle="Name your manager, then take over a club, found your own, or play a short Draft Cup." />

                        <div className="mt-8 space-y-2">
                            <label htmlFor="manager-name" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Manager name</label>
                            <Input
                                id="manager-name"
                                type="text"
                                placeholder="Your name"
                                value={managerName}
                                maxLength={32}
                                aria-invalid={!!managerNameError || undefined}
                                aria-describedby={managerNameError ? "manager-name-error" : undefined}
                                onChange={(e) => {
                                    setManagerName(e.target.value)
                                    if (managerNameError) setManagerNameError("")
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleContinueToTeamSelect()
                                }}
                                className="h-12 text-base"
                                autoFocus
                            />
                            {managerNameError && <p id="manager-name-error" className="text-xs font-medium text-negative">{managerNameError}</p>}
                        </div>

                        <label className="mt-5 flex items-start gap-3 text-sm text-ink-1">
                            <Switch checked={randomWorld} onCheckedChange={setRandomWorld} aria-describedby="random-world-hint" className="mt-0.5" />
                            <span>
                                <span className="font-semibold">Randomised world</span>
                                <span id="random-world-hint" className="mt-0.5 block text-xs text-ink-3">New player names and faces, ratings moved a little, and rosters shuffled between clubs of the same tier and region. For existing-team and no-club starts.</span>
                            </span>
                        </label>

                        <div className="mt-8 space-y-2">
                            <Button onClick={handleContinueToTeamSelect} className="h-auto w-full justify-between px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">Choose existing team</span>
                                    <span className="mt-1 block text-[13px] font-medium">Take over a ranked club and its roster</span>
                                </span>
                                <ChevronRight />
                            </Button>
                            <Button onClick={handleCreateOwnTeam} variant="outline" className="h-auto w-full justify-between px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">Create your own team</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">Start at the bottom with an empty roster</span>
                                </span>
                                <ChevronRight />
                            </Button>
                            <Button onClick={handleStartUnemployed} disabled={isStarting || rankedTeams.length === 0} variant="outline" className="h-auto w-full justify-between px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">Start without a club</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">Take a job offer from a lower-tier side and earn your way up</span>
                                </span>
                                <ChevronRight />
                            </Button>
                            <Button onClick={handleDraftCup} variant="outline" className="h-auto w-full justify-between px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">Draft Cup</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">A short run: draft five players, win three knockout matches</span>
                                </span>
                                <ChevronRight />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // ============ STEP 2: TEAM SELECTION ============
    const selectedStats = selectedTeam ? teamStats.get(selectedTeam.id) : undefined
    const selectedLocked = selectedTeam ? isLocked(selectedTeam) : false
    const challenge = selectedTeam && selectedStats
        ? describeClubChallenge({ worldRanking: selectedTeam.worldRanking, reputation: selectedTeam.reputation, starters: selectedRoster.length, budget: selectedStats.budget })
        : null

    const onRowKeyDown = (team: RankedTeam) => (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTeam(team) }
    }

    return (
        <div className="mx-auto flex h-dvh w-full max-w-[1680px] flex-col gap-5 bg-ink px-8 py-6">
            <ScreenHeader
                eyebrow="New career · Step 2 of 2"
                title="Choose your club"
                subtitle={sandboxMode
                    ? <>Manager {managerName}. Sandbox is on, so every club is open.</>
                    : <>Manager {managerName}, level {managerLevel}. Clubs under reputation {TEAM_REP_TIERS.TIER_2_MIN_REP} are open; {TEAM_REP_TIERS.TIER_2_MIN_REP}+ needs level {TIER_THRESHOLDS[ManagerTier.CHALLENGER]}, {TEAM_REP_TIERS.TIER_1_MIN_REP}+ needs level {TIER_THRESHOLDS[ManagerTier.ELITE]}. Levels carry over between careers.</>}
                aside={
                    <>
                        <Button variant="ghost" onClick={() => setCurrentStep("welcome")} className="gap-2">
                            <ArrowLeft size={16} /> Back
                        </Button>
                        <Button variant="outline" onClick={() => router.push("/main-menu")} className="gap-2">
                            <X size={16} /> Cancel
                        </Button>
                    </>
                }
            />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_460px]">
                {/* Club list */}
                <Panel padded={false} className="flex min-h-0 flex-col overflow-hidden" bodyClassName="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-end gap-x-4 border-b border-line px-4 pt-2">
                        <div className="relative mb-2 w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={15} />
                            <Input
                                placeholder="Search clubs"
                                aria-label="Search clubs"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 pl-9 text-sm"
                            />
                        </div>
                        <Tabs value={selectedTier} onValueChange={(v) => setSelectedTier(v as TierFilter)}>
                            <TabsList aria-label="Filter by tier" className="border-b-0!">
                                {TIER_FILTERS.map(tier => (
                                    <TabsTrigger key={tier} value={tier}>
                                        {tier === "ALL" ? "All" : TIER_LABEL[tier]}
                                        <span className="tabular-nums text-ink-3">{tierCounts[tier]}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <label className="mb-2.5 ml-auto flex items-center gap-2 text-sm text-ink-2">
                            <Switch checked={sandboxMode} onCheckedChange={setSandboxMode} aria-describedby="sandbox-hint" />
                            Sandbox
                            <span id="sandbox-hint" className="sr-only">Opens every club. Match simulation is unchanged.</span>
                        </label>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header" className="sticky top-0 z-10">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="w-16 pl-4 text-right">Rank</th>
                                    <th data-slot="table-head" className="pl-4">Club</th>
                                    <th data-slot="table-head" className="px-3">Region</th>
                                    <th data-slot="table-head" className="px-3">Tier</th>
                                    <th data-slot="table-head" className="px-3 text-center">OVR</th>
                                    <th data-slot="table-head" className="px-3 text-right">Budget</th>
                                    <th data-slot="table-head" className="w-28 pr-4 text-right"><span className="sr-only">Access</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTeams.map(team => {
                                    const stats = teamStats.get(team.id)
                                    const locked = isLocked(team)
                                    const selected = selectedTeam?.id === team.id
                                    return (
                                        <tr
                                            key={team.id}
                                            data-slot="table-row"
                                            data-state={selected ? "selected" : undefined}
                                            tabIndex={0}
                                            aria-current={selected || undefined}
                                            onClick={() => setSelectedTeam(team)}
                                            onKeyDown={onRowKeyDown(team)}
                                            className={cn("h-12 cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-hover", locked && "text-ink-3")}
                                        >
                                            <td className="w-16 pl-4 text-right text-xs font-semibold tabular-nums text-ink-3">#{team.worldRanking}</td>
                                            <td className="py-1.5 pl-4 pr-3">
                                                <div className={cn("flex min-w-0 items-center gap-3", locked && "opacity-60")}>
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-raised">
                                                        <TeamLogoImage src={team.logoPath} alt={team.name} size={26} />
                                                    </span>
                                                    <h3 className={cn("truncate text-sm font-semibold", selected ? "text-gold" : "text-ink-1")}>{team.name}</h3>
                                                    <span className="text-xs text-ink-3">{team.shortName}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 text-xs font-semibold text-ink-2">{team.region}</td>
                                            <td className="px-3 text-sm text-ink-2">{TIER_LABEL[team.calculatedTier]}</td>
                                            <td className="px-3 text-center"><RatingChip value={stats?.ovr ?? 0} size="sm" /></td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(stats?.budget ?? 0)}</td>
                                            <td className="w-28 pr-4 text-right text-xs text-ink-3">
                                                {locked && (
                                                    <span className="inline-flex items-center gap-1"><Lock size={12} /> Level {ManagerProgression.getRequiredLevel(team.reputation)}</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filteredTeams.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-6 text-sm text-ink-3">No clubs match “{searchTerm}”.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
                        {filteredTeams.length} clubs · {draftSaved ? "Setup is saved on this device until you start." : "Setup could not be saved on this device. Keep this page open until you finish."}
                    </p>
                </Panel>

                {/* Selected club */}
                <Panel padded={false} as="aside" className="flex min-h-0 flex-col overflow-hidden" bodyClassName="flex min-h-0 flex-1 flex-col">
                    {selectedTeam && selectedStats ? (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto">
                                <div className="flex items-center gap-4 border-b border-line p-5">
                                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                                        <TeamLogoImage src={selectedTeam.logoPath} alt={selectedTeam.name} size={52} />
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="truncate font-display text-[32px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1">{selectedTeam.name}</h2>
                                        <p className="mt-1.5 text-sm text-ink-3">
                                            {selectedTeam.region} · {TIER_LABEL[selectedTeam.calculatedTier]} · {selectedTeam.shortName}
                                        </p>
                                    </div>
                                </div>

                                <dl className="grid grid-cols-4 divide-x divide-line border-b border-line">
                                    {[
                                        { label: "Rank", value: `#${selectedTeam.worldRanking}` },
                                        { label: "OVR", value: <RatingChip value={selectedStats.ovr} size="md" bare className="min-w-0 px-0 text-2xl" /> },
                                        { label: "Budget", value: formatCurrency(selectedStats.budget) },
                                        { label: "Value", value: formatCurrency(selectedStats.value) },
                                    ].map(kpi => (
                                        <div key={kpi.label} className="px-4 py-3">
                                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{kpi.label}</dt>
                                            <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{kpi.value}</dd>
                                        </div>
                                    ))}
                                </dl>

                                <section aria-labelledby="club-roster-title">
                                    <div className="flex items-center justify-between px-5 pb-2 pt-4">
                                        <h3 id="club-roster-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Roster</h3>
                                        <span className={cn("text-xs tabular-nums", selectedRoster.length < 5 ? "text-caution" : "text-ink-3")}>
                                            {selectedRoster.length} / 5{selectedRoster.length < 5 ? ` · sign ${5 - selectedRoster.length} before your first match` : ""}
                                        </span>
                                    </div>
                                    {randomWorld ? (
                                        <p className="border-t border-line px-5 py-3 text-sm text-ink-2">Randomised world: this club gets the roster of another club in its tier and region, with new players, when the career starts. Rank, budget and expectations stay with the club.</p>
                                    ) : (
                                    <table data-slot="table" className="w-full border-collapse text-left">
                                        <tbody>
                                            {selectedRoster.map(player => (
                                                <tr key={player.id} className="h-12 border-t border-line">
                                                    <td className="py-1.5 pl-5 pr-3">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                                <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} />
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-ink-1">{player.nickname}</p>
                                                                <div className="flex items-center gap-1.5 text-xs text-ink-3">
                                                                    <CountryFlag country={player.nationality} size={12} /> {player.age}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3"><RoleTag role={resolvePlayerRole(player as any)} /></td>
                                                    <td className="pr-5 text-right"><RatingChip value={player.evaluation.overallRating} size="sm" /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    )}
                                </section>

                                {challenge && (
                                    <section aria-labelledby="club-expectations-title" className="mx-5 my-4 rounded-md border border-line bg-shell p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 id="club-expectations-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">What to expect</h3>
                                            <span className="text-xs font-semibold text-ink-2">{challenge.level}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-ink-1">Board target: {challenge.boardLabel}, finish the season ranked #{challenge.rankTarget} or better{challenge.trophyTarget > 0 ? ` and win ${challenge.trophyTarget} trophy` : ''}.</p>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-2">
                                            {challenge.notes.map(note => <li key={note}>{note}</li>)}
                                        </ul>
                                        <p className="mt-2 text-xs text-ink-3">Budget is the estimated starting cash. The board sets its exact target from your standing when the first week is processed.</p>
                                    </section>
                                )}
                            </div>

                            <div className="border-t border-line p-4">
                                {selectedLocked && (
                                    <p className="mb-3 flex items-center gap-2 text-xs text-ink-3">
                                        <Lock size={12} /> Needs manager level {ManagerProgression.getRequiredLevel(selectedTeam.reputation)} (you are {managerLevel}). Sandbox opens every club.
                                    </p>
                                )}
                                <Button
                                    onClick={handleStartGame}
                                    disabled={isStarting || selectedLocked}
                                    aria-busy={isStarting || undefined}
                                    className="h-12 w-full font-display text-xl font-bold tracking-[0.04em]"
                                >
                                    {isStarting ? <><Loader2 className="animate-spin" /> Starting…</> : "START CAREER"}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="p-5 text-sm text-ink-3">Select a club to see its roster, budget and board expectations.</p>
                    )}
                </Panel>
            </div>
        </div>
    )
}
