"use client"
import { t, tn } from "@/lib/i18n"
import { eventRegionName } from "@/lib/display-names"

import { CAREER_DIFFICULTY, type CareerDifficulty } from "@/lib/balance-tuning"
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
import { snapshotLoader } from "@/data"
import type { GameSave } from "@/engine/save-types"
import { randomizeWorld } from "@/engine/random-world"
import { difficultyStartingCash, previewClubStart, type ClubStartPreview } from "@/lib/career-start-preview"
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

interface RankedTeam extends SnapshotTeam {
    worldRanking: number
    calculatedTier: TierLevel
}

type TierFilter = "ALL" | TierLevel

const TIER_FILTERS: TierFilter[] = ["ALL", "ELITE", "PRO", "SEMI_PRO", "AMATEUR"]

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
    // START-01/02: the world the career will start from. Ratings and cash in
    // the picker are read from it, and Start Career hands it to the store.
    const [world, setWorld] = useState<GameSave | null>(null)
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
    const [difficulty, setDifficulty] = useState<CareerDifficulty>("normal")

    useEffect(() => {
        loadCareerProfile().then(p => setManagerLevel(Math.max(1, p.peakLevel))).catch(() => { })
    }, [])

    const startingRef = useRef(false)
    const [draftReady, setDraftReady] = useState(false)
    const [draftSaved, setDraftSaved] = useState(true)
    const [dataError, setDataError] = useState(false)
    useEffect(() => {
        const draft = loadCareerDraft()
        if (draft) {
            setManagerName(draft.managerName)
            setSandboxMode(!!draft.sandbox)
            setRandomWorld(!!draft.randomWorld)
            if (draft.difficulty) setDifficulty(draft.difficulty)
            // Reopen the club list only when the player left from there (START-07).
            if (draft.step === 'team-select' && draft.managerName.trim().length >= 2) setCurrentStep('team-select')
        }
        setDraftReady(true)
    }, [])
    useEffect(() => {
        if (draftReady && !isStarting) setDraftSaved(saveCareerDraft({ managerName, sandbox: sandboxMode, randomWorld, difficulty, step: currentStep, ...(selectedTeam ? { teamId: selectedTeam.id } : {}) }))
    }, [draftReady, managerName, sandboxMode, randomWorld, difficulty, currentStep, selectedTeam, isStarting])

    // Load snapshot data
    useEffect(() => {
        async function loadData() {
            setIsDataLoading(true)
            try {
                // The snapshot initializeNewGame starts from (community imports included).
                if (!snapshotLoader.getSnapshot()) {
                    const loaded = await snapshotLoader.loadSnapshot()
                    if (!loaded.success) throw Error(loaded.error || 'Game data unavailable')
                }
                const snapshot = snapshotLoader.getSnapshot()
                const built = snapshot?.teams.length ? snapshotLoader.createCareerFromSnapshot("", snapshot.teams[0].id, 1) : null
                if (!snapshot || !built) throw Error('Invalid game data')
                setTeams(snapshot.teams as unknown as SnapshotTeam[])
                setWorld(built)
            } catch (error) {
                setDataError(true)
                debug.error("Failed to load snapshot data:", error)
                toast.error(t("ng.err.loadData"), {
                    description: t("ng.err.loadDataBody")
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

    // The randomised world is dealt from the previewed one (seeded by its
    // save id), so the picker shows the shuffled rosters the career gets.
    const startWorld = useMemo(() => {
        if (!world || !randomWorld) return world
        const shuffled = structuredClone(world)
        randomizeWorld(shuffled)
        return shuffled
    }, [world, randomWorld])

    // Per-club numbers for the picker table, computed once per world: the
    // career's own rating and starting-cash code (lib/career-start-preview.ts).
    // Cash is at Normal here; the chosen difficulty applies on display.
    const teamStats = useMemo(() => {
        const map = new Map<string, ClubStartPreview>()
        if (!startWorld) return map
        const playerMap = new Map(startWorld.players.map(p => [p.id, p]))
        for (const team of startWorld.teams) {
            const preview = previewClubStart(startWorld, team.id, "normal", playerMap)
            if (preview) map.set(team.id, preview)
        }
        return map
    }, [startWorld])
    const budgetFor = (teamId: string) => difficultyStartingCash(teamStats.get(teamId)?.budget ?? 0, difficulty)

    // START-08: a club above the manager's level can only be taken as a
    // sandbox career (achievements off), the same meaning Sandbox has elsewhere.
    const aboveLevel = (team: SnapshotTeam) => !ManagerProgression.isTeamUnlocked(team.reputation, managerLevel)
    const isLocked = (team: SnapshotTeam) => !sandboxMode && aboveLevel(team)

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

    // Roster of the selected club as the career starts it, best first.
    const selectedRoster = selectedTeam ? teamStats.get(selectedTeam.id)?.roster ?? [] : []

    const tierCounts = useMemo(() => {
        const counts: Record<TierFilter, number> = { ALL: rankedTeams.length, ELITE: 0, PRO: 0, SEMI_PRO: 0, AMATEUR: 0 }
        for (const t of rankedTeams) counts[t.calculatedTier]++
        return counts
    }, [rankedTeams])

    const validateManagerName = () => {
        if (!managerName.trim()) {
            setManagerNameError(t("ng.err.nameEmpty"))
            return false
        }
        if (managerName.trim().length < 2) {
            setManagerNameError(t("ng.err.nameShort"))
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

    // C10: a pro career, playing as one young player.
    const handleProCareer = () => {
        if (!validateManagerName()) return
        saveCareerDraft({ managerName: managerName.trim() })
        router.push("/new-game/pro")
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
            await initializeNewGame(managerName.trim() || t("ng.defaultSave"), placeholder.id, undefined, { unemployed: true, randomWorld, ...(startWorld ? { world: structuredClone(startWorld) } : {}) })
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            clearCareerDraft()
            void recordNewCampaign()
            // Replace: Back/Escape from Home must not reopen this form (START-05).
            router.replace("/")
        } catch (err) {
            debug.error("Failed to start game:", err)
            toast.error(t("ng.err.start"), { description: t("ng.err.startBody") })
            startingRef.current = false
            setIsStarting(false)
        }
    }

    const handleStartGame = async () => {
        if (!selectedTeam || isStarting || startingRef.current) return
        if (managerName.trim().length < 2 || isLocked(selectedTeam)) {
            toast.error(t("ng.err.review")); return
        }
        startingRef.current = true
        setIsStarting(true)
        const sandboxCareer = sandboxMode && aboveLevel(selectedTeam)
        try {
            // Pass manager name to initializeNewGame (using it as save name for now).
            // The previewed world goes in as it is, so Home shows the picker's numbers.
            await initializeNewGame(managerName.trim() || t("ng.defaultSave"), selectedTeam.id, undefined, { randomWorld, difficulty, ...(startWorld ? { world: structuredClone(startWorld) } : {}) })
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            if (sandboxCareer) useGameStore.getState().enableSandbox()
            clearCareerDraft()
            void recordNewCampaign()
            // Client-side navigation keeps the store; replace so Back/Escape
            // from Home does not reopen this form (START-05).
            router.replace("/")
        } catch (err) {
            debug.error("Failed to start game:", err)
            toast.error(t("ng.err.start"), {
                description: t("ng.err.startBody")
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
                <Panel className="w-full max-w-md" title={t("ng.dataError.title")}>
                    <p className="text-sm text-ink-2">{t("ng.dataError.body")}</p>
                    <Button className="mt-4" onClick={() => window.location.reload()}>{t("ng.retry")}</Button>
                </Panel>
            </div>
        )
    }

    // Loading state
    if (isDataLoading) {
        return (
            <div className="flex min-h-dvh items-center justify-center gap-3 bg-ink text-sm text-ink-3" role="status">
                <Loader2 size={16} className="animate-spin" /> {t("ng.loadingClubs")}
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
                        <ArrowLeft size={16} /> {t("ng.mainMenu")}
                    </Link>

                    <div className="my-auto w-full max-w-[420px] py-12">
                        <ScreenHeader eyebrow={t("ng.step1.eyebrow")} title={t("ng.step1.title")} subtitle={t("ng.step1.subtitle")} />

                        <div className="mt-8 space-y-2">
                            <label htmlFor="manager-name" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("ng.managerName")}</label>
                            <Input
                                id="manager-name"
                                type="text"
                                placeholder={t("ng.namePlaceholder")}
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

                        {/* START-22: "Randomised world" sits with the two starts that use it
                            (existing club, no club); the other three ignore it. Always rendered,
                            so nothing moves when a path is hovered or focused. */}
                        <div className="mt-8 space-y-2">
                            <div role="group" className="space-y-2 rounded-md border border-line p-2">
                                <Button onClick={handleContinueToTeamSelect} className="h-auto w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
                                    <span>
                                        <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">{t("ng.path.existing")}</span>
                                        <span className="mt-1 block text-[13px] font-medium">{t("ng.path.existing.sub")}</span>
                                    </span>
                                    <ChevronRight />
                                </Button>
                                <Button onClick={handleStartUnemployed} disabled={isStarting || rankedTeams.length === 0} variant="outline" className="h-auto w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
                                    <span>
                                        <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">{t("ng.path.unemployed")}</span>
                                        <span className="mt-1 block text-[13px] font-medium text-ink-3">{t("ng.path.unemployed.sub")}</span>
                                    </span>
                                    <ChevronRight />
                                </Button>
                                <label className="flex items-start gap-3 px-2 pb-1 pt-2 text-sm text-ink-1">
                                    <Switch checked={randomWorld} onCheckedChange={setRandomWorld} aria-describedby="random-world-hint" className="mt-0.5" />
                                    <span>
                                        <span className="font-semibold">{t("ng.randomWorld")}</span>
                                        <span id="random-world-hint" className="mt-0.5 block text-xs text-ink-3">{t("ng.randomWorldHint")}</span>
                                    </span>
                                </label>
                            </div>
                            <Button onClick={handleCreateOwnTeam} variant="outline" className="h-auto w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">{t("ng.path.create")}</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">{t("ng.path.create.sub")}</span>
                                </span>
                                <ChevronRight />
                            </Button>
                            <Button onClick={handleProCareer} variant="outline" className="h-auto w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">{t("ng.path.pro")}</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">{t("ng.path.pro.sub")}</span>
                                </span>
                                <ChevronRight />
                            </Button>
                            <Button onClick={handleDraftCup} variant="outline" className="h-auto w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
                                <span>
                                    <span className="block font-display text-2xl font-bold uppercase leading-none tracking-[0.02em]">{t("ng.path.draft")}</span>
                                    <span className="mt-1 block text-[13px] font-medium text-ink-3">{t("ng.path.draft.sub")}</span>
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
    const selectedBudget = selectedTeam ? budgetFor(selectedTeam.id) : 0
    const selectedSandbox = !!selectedTeam && sandboxMode && aboveLevel(selectedTeam)
    const challenge = selectedTeam && selectedStats
        ? describeClubChallenge({ worldRanking: selectedTeam.worldRanking, reputation: selectedTeam.reputation, starters: selectedRoster.length, budget: selectedBudget })
        : null

    const onRowKeyDown = (team: RankedTeam) => (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedTeam(team) }
    }

    return (
        <div className="mx-auto flex h-dvh w-full max-w-[1680px] flex-col gap-5 bg-ink px-8 py-6">
            <ScreenHeader
                eyebrow={t("ng.step2.eyebrow")}
                title={t("ng.step2.title")}
                subtitle={sandboxMode
                    ? t("ng.step2.sandbox", { name: managerName })
                    : t("ng.step2.levels", { name: managerName, level: managerLevel, rep2: TEAM_REP_TIERS.TIER_2_MIN_REP, rep1: TEAM_REP_TIERS.TIER_1_MIN_REP, lvl2: TIER_THRESHOLDS[ManagerTier.CHALLENGER], lvl1: TIER_THRESHOLDS[ManagerTier.ELITE] })}
                aside={
                    <>
                        <Button variant="ghost" onClick={() => setCurrentStep("welcome")} className="gap-2">
                            <ArrowLeft size={16} /> {t("ng.back")}
                        </Button>
                        <Button variant="outline" onClick={() => { clearCareerDraft(); router.push("/main-menu") }} className="gap-2">
                            <X size={16} /> {t("ng.cancel")}
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
                                placeholder={t("ng.search")}
                                aria-label={t("ng.search")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 pl-9 text-sm"
                            />
                        </div>
                        <Tabs value={selectedTier} onValueChange={(v) => setSelectedTier(v as TierFilter)}>
                            <TabsList aria-label={t("ng.filterTier")} className="border-b-0!">
                                {TIER_FILTERS.map(tier => (
                                    <TabsTrigger key={tier} value={tier}>
                                        {t(`ng.tier.${tier}`)}
                                        <span className="tabular-nums text-ink-3">{tierCounts[tier]}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <label className="mb-2.5 ml-auto flex items-center gap-2 text-sm text-ink-2">
                            <Switch checked={sandboxMode} onCheckedChange={setSandboxMode} aria-describedby="sandbox-hint" />
                            {t("ng.sandbox")}
                            <span id="sandbox-hint" className="sr-only">{t("ng.sandboxHint")}</span>
                        </label>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header" className="sticky top-0 z-10">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="w-16 pl-4 text-right">{t("ng.col.rank")}</th>
                                    <th data-slot="table-head" className="pl-4">{t("ng.col.club")}</th>
                                    <th data-slot="table-head" className="px-3">{t("ng.col.region")}</th>
                                    <th data-slot="table-head" className="px-3">{t("ng.col.tier")}</th>
                                    <th data-slot="table-head" className="px-3 text-center">{t("common.ovr")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("ng.col.budget")}</th>
                                    <th data-slot="table-head" className="w-28 pr-4 text-right"><span className="sr-only">{t("ng.col.access")}</span></th>
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
                                            <td className="px-3 text-xs font-semibold text-ink-2">{eventRegionName(team.region)}</td>
                                            <td className="px-3 text-sm text-ink-2">{t(`ng.tier.${team.calculatedTier}`)}</td>
                                            <td className="px-3 text-center"><RatingChip value={stats?.ovr ?? 0} size="sm" /></td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(budgetFor(team.id))}</td>
                                            <td className="w-28 pr-4 text-right text-xs text-ink-3">
                                                {locked && (
                                                    <span className="inline-flex items-center gap-1"><Lock size={12} /> {t("ng.levelLock", { n: ManagerProgression.getRequiredLevel(team.reputation) })}</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filteredTeams.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-6 text-sm text-ink-3">{t("ng.noMatch", { term: searchTerm })}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
                        {tn("ng.clubs", filteredTeams.length)} · {draftSaved ? t("ng.draftSaved") : t("ng.draftNotSaved")}
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
                                            {selectedTeam.region} · {t(`ng.tier.${selectedTeam.calculatedTier}`)} · {selectedTeam.shortName}
                                        </p>
                                    </div>
                                </div>

                                <dl className="grid grid-cols-4 divide-x divide-line border-b border-line">
                                    {[
                                        { label: t("ng.col.rank"), value: `#${selectedTeam.worldRanking}` },
                                        { label: t("common.ovr"), value: <RatingChip value={selectedStats.ovr} size="md" bare className="min-w-0 px-0 text-2xl" /> },
                                        { label: t("ng.col.budget"), value: formatCurrency(selectedBudget) },
                                        { label: t("ng.col.value"), value: formatCurrency(selectedStats.value) },
                                    ].map(kpi => (
                                        <div key={kpi.label} className="px-4 py-3">
                                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{kpi.label}</dt>
                                            <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{kpi.value}</dd>
                                        </div>
                                    ))}
                                </dl>

                                <section aria-labelledby="club-roster-title">
                                    <div className="flex items-center justify-between px-5 pb-2 pt-4">
                                        <h3 id="club-roster-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("ng.roster")}</h3>
                                        <span className={cn("text-xs tabular-nums", selectedRoster.length < 5 ? "text-caution" : "text-ink-3")}>
                                            {selectedRoster.length} / 5{selectedRoster.length < 5 ? ` · ${t("ng.rosterSign", { n: 5 - selectedRoster.length })}` : ""}
                                        </span>
                                    </div>
                                    {randomWorld ? (
                                        <p className="border-t border-line px-5 py-3 text-sm text-ink-2">{t("ng.randomRoster")}</p>
                                    ) : (
                                    <table data-slot="table" className="w-full border-collapse text-left">
                                        <tbody>
                                            {selectedRoster.map(({ player, ovr }) => (
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
                                                    <td className="pr-5 text-right"><RatingChip value={ovr} size="sm" /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    )}
                                </section>

                                {challenge && (
                                    <section aria-labelledby="club-expectations-title" className="mx-5 my-4 rounded-md border border-line bg-shell p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 id="club-expectations-title" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("ng.expect")}</h3>
                                            <span className="text-xs font-semibold text-ink-2">{t(`ng.level.${challenge.level}`)}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-ink-1">{t(challenge.trophyTarget > 0 ? "ng.boardTargetTrophy" : "ng.boardTarget", { goal: t(`ng.goal.${challenge.tier}`), rank: challenge.rankTarget })}</p>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-2">
                                            {challenge.notes.map(note => <li key={note}>{note}</li>)}
                                        </ul>
                                        <p className="mt-2 text-xs text-ink-3">{t("ng.budgetNote")}</p>
                                    </section>
                                )}
                            </div>

                            <div className="border-t border-line p-4">
                                <fieldset className="mb-3">
                                    <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("ng.difficulty")}</legend>
                                    <div role="radiogroup" aria-label={t("ng.difficulty")} className="mt-1.5 grid grid-cols-3 gap-2">
                                        {(Object.keys(CAREER_DIFFICULTY) as CareerDifficulty[]).map(key => (
                                            <Button key={key} type="button" role="radio" aria-checked={difficulty === key}
                                                variant={difficulty === key ? "default" : "outline"} size="sm"
                                                onClick={() => setDifficulty(key)}>
                                                {t(`ng.diff.${key}`)}
                                            </Button>
                                        ))}
                                    </div>
                                    <p className="mt-1.5 text-xs text-ink-3">{t(`ng.diff.${difficulty}.hint`)}</p>
                                </fieldset>
                                {selectedSandbox && (
                                    <p className="mb-3 flex items-start gap-2 text-xs text-caution">
                                        <Lock size={12} className="mt-0.5 shrink-0" /> {t("ng.sandboxCareer")}
                                    </p>
                                )}
                                {selectedLocked && (
                                    <p className="mb-3 flex items-center gap-2 text-xs text-ink-3">
                                        <Lock size={12} /> {t("ng.needsLevel", { need: ManagerProgression.getRequiredLevel(selectedTeam.reputation), level: managerLevel })}
                                    </p>
                                )}
                                <Button
                                    onClick={handleStartGame}
                                    disabled={isStarting || selectedLocked}
                                    aria-busy={isStarting || undefined}
                                    className="h-12 w-full font-display text-xl font-bold tracking-[0.04em]"
                                >
                                    {isStarting ? <><Loader2 className="animate-spin" /> {t("ng.starting")}</> : t("ng.startCareer")}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="p-5 text-sm text-ink-3">{t("ng.selectHint")}</p>
                    )}
                </Panel>
            </div>
        </div>
    )
}
