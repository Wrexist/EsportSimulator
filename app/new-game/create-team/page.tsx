"use client"

import { loadCareerDraft, saveCareerDraft, clearCareerDraft } from '@/lib/new-career-draft'
import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { debug } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { toast } from "@/lib/toast"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import {
    CustomTeamData,
    GameDifficulty,
    TeamRegion,
    DIFFICULTY_SETTINGS,
    REGION_INFO,
    PRESET_COLORS
} from "@/types/team-creator"
import { RosterBuilderModal } from "@/components/onboarding/RosterBuilderModal"
import { customClubStartingCash, describeClubChallenge } from "@/lib/club-expectations"
import { ImageUploader } from "@/components/ui/ImageUploader"
import { formatCurrency } from "@/lib/utils-extended"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"

// Wizard steps
type WizardStep = "name" | "region" | "colors" | "difficulty" | "review"

const STEPS: { id: WizardStep; label: string; title: string; subtitle: string }[] = [
    { id: "name", label: "Name", title: "Name your club", subtitle: "Your manager name, the club name and a 2–5 letter tag." },
    { id: "region", label: "Region", title: "Home region", subtitle: "Decides which regional qualifier you are entered into first." },
    { id: "colors", label: "Colours", title: "Club colours", subtitle: "Pick a colour pair, or upload your own logo." },
    { id: "difficulty", label: "Difficulty", title: "Difficulty", subtitle: "Sets starting cash, reputation and recurring income. Match simulation is the same on every difficulty." },
    { id: "review", label: "Review", title: "Review", subtitle: "Check everything before the club is founded." },
]

// Club region -> regional qualifier it enters first (engine/processors/auto-registration-processor.ts).
const QUALIFIER_FOR: Record<TeamRegion, string> = {
    EU: "Europe", CIS: "Europe", NA: "North America", SA: "North America", ASIA: "Asia", OCEANIA: "Asia",
}

const fieldLabel = "block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"

/** The club's crest preview: the uploaded logo, or the tag on its colour pair. */
function CrestPreview({ team, size }: { team: CustomTeamData; size: number }) {
    if (team.logoData) {
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo data URL; next/image adds nothing with images.unoptimized
        return <img src={team.logoData} alt={team.name || "Team logo"} className="rounded-lg object-contain" style={{ width: size, height: size }} />
    }
    return (
        <div
            className="flex items-center justify-center rounded-lg font-display font-bold text-ink-1"
            style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)` }}
        >
            {team.shortName.slice(0, 3) || "TAG"}
        </div>
    )
}

export default function CreateTeamPage() {
    const router = useRouter()
    const { initializeCustomTeam, teams } = useGameStore(useShallow(state => ({
        initializeCustomTeam: state.initializeCustomTeam,
        teams: state.teams,
    })))
    const getStoreError = () => useGameStore.getState().error

    // Wizard state
    const [currentStep, setCurrentStep] = useState<WizardStep>("name")
    const [isCreating, setIsCreating] = useState(false)
    const [showRosterBuilder, setShowRosterBuilder] = useState(false)

    // Manager name (passed from previous page or stored)
    const [managerName, setManagerName] = useState("")

    // Team data
    const [teamData, setTeamData] = useState<CustomTeamData>({
        name: "",
        shortName: "",
        region: "EU",
        difficulty: "normal",
        logoIndex: 0,
        primaryColor: PRESET_COLORS[0].primary,
        secondaryColor: PRESET_COLORS[0].secondary,
    })

    const creatingRef = useRef(false)
    const [draftReady, setDraftReady] = useState(false)
    const [draftSaved, setDraftSaved] = useState(true)
    useEffect(() => {
        const draft = loadCareerDraft()
        if (draft) { setManagerName(draft.managerName); if (draft.custom) setTeamData(draft.custom) }
        setDraftReady(true)
    }, [])
    useEffect(() => {
        if (draftReady && !isCreating) setDraftSaved(saveCareerDraft({ managerName, custom: teamData }))
    }, [draftReady, managerName, teamData, isCreating])

    // Navigation guard - warn about unsaved changes
    const hasUnsavedChanges = teamData.name.trim() !== "" || managerName.trim() !== ""

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // The setup draft is restored on reload, so only warn when it could not be stored.
            if (hasUnsavedChanges && !showRosterBuilder && !draftSaved) {
                e.preventDefault()
                e.returnValue = "" // Required for Chrome
                return ""
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [hasUnsavedChanges, showRosterBuilder, draftSaved])

    // Validation errors
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Exit confirmation (in-app dialog, not window.confirm — sandboxed Electron
    // suppresses window.confirm, which silently no-op'd the only Back/exit on this
    // hideChrome page).
    const [showExitConfirm, setShowExitConfirm] = useState(false)

    const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)
    const step = STEPS[currentStepIndex]

    // Validate current step
    const validateStep = (): boolean => {
        const newErrors: Record<string, string> = {}

        switch (currentStep) {
            case "name":
                if (!managerName.trim()) {
                    newErrors.managerName = "Enter your manager name"
                } else if (managerName.trim().length < 2) {
                    newErrors.managerName = "Name must be at least 2 characters"
                }
                if (!teamData.name.trim()) {
                    newErrors.teamName = "Enter a team name"
                } else if (teamData.name.trim().length < 2) {
                    newErrors.teamName = "Team name must be at least 2 characters"
                } else {
                    // Check if team name is already taken (inline to avoid circular deps)
                    const normalizedName = teamData.name.trim().toLowerCase()
                    if (teams.some(t => t.name?.toLowerCase() === normalizedName)) {
                        newErrors.teamName = "This team name is already taken"
                    }
                }
                if (!teamData.shortName.trim()) {
                    newErrors.shortName = "Enter a team tag"
                } else if (teamData.shortName.length < 2 || teamData.shortName.length > 5) {
                    newErrors.shortName = "Tag must be 2–5 characters"
                } else if (teams.some(t => t.shortName?.toUpperCase() === teamData.shortName.toUpperCase())) {
                    newErrors.shortName = "This team tag is already in use"
                }
                break
            case "region":
                if (!teamData.region) newErrors.region = "Select a region"
                break
            case "difficulty":
                if (!teamData.difficulty) newErrors.difficulty = "Select a difficulty"
                break
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const goNext = () => {
        if (!validateStep()) return
        const nextIndex = currentStepIndex + 1
        if (nextIndex < STEPS.length) setCurrentStep(STEPS[nextIndex].id)
    }

    const goPrev = () => {
        const prevIndex = currentStepIndex - 1
        if (prevIndex >= 0) {
            setCurrentStep(STEPS[prevIndex].id)
        } else {
            // Back to new-game; confirm in-app (window.confirm is suppressed in sandboxed Electron).
            if (hasUnsavedChanges) {
                setShowExitConfirm(true)
                return
            }
            router.push("/new-game")
        }
    }

    const difficultySettings = DIFFICULTY_SETTINGS[teamData.difficulty]
    const startingCash = customClubStartingCash(difficultySettings.startingBudget)

    const handleCreateTeam = async () => {
        if (isCreating || creatingRef.current) return
        if (managerName.trim().length < 2 || teamData.name.trim().length < 2 || teamData.shortName.trim().length < 2) { setCurrentStep('name'); return }
        creatingRef.current = true
        setIsCreating(true)

        try {
            await initializeCustomTeam(managerName.trim(), teamData)

            // initializeCustomTeam sets error instead of throwing
            const storeError = getStoreError()
            if (storeError) {
                toast.error("Failed to create team", { description: storeError, duration: 8000 })
                creatingRef.current = false
                setIsCreating(false)
                return
            }

            clearCareerDraft()
            setShowRosterBuilder(true)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An unexpected error occurred"
            debug.error("Failed to create team:", err)
            toast.error("Failed to create team", { description: msg, duration: 8000 })
            creatingRef.current = false
            setIsCreating(false)
        }
    }

    const handleRosterComplete = () => {
        setShowRosterBuilder(false)
        router.push("/")
    }

    const renderError = (key: string) => errors[key] ? <p className="text-xs font-medium text-negative">{errors[key]}</p> : null

    const renderStepContent = () => {
        switch (currentStep) {
            case "name":
                return (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label htmlFor="ct-manager" className={fieldLabel}>Manager name</label>
                            <Input
                                id="ct-manager"
                                type="text"
                                placeholder="Your name"
                                value={managerName}
                                aria-invalid={!!errors.managerName || undefined}
                                onChange={(e) => {
                                    setManagerName(e.target.value)
                                    if (errors.managerName) setErrors({ ...errors, managerName: "" })
                                }}
                                className="h-11"
                            />
                            {renderError("managerName")}
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="ct-team" className={fieldLabel}>Team name</label>
                            <Input
                                id="ct-team"
                                type="text"
                                placeholder="e.g. Team Phoenix"
                                value={teamData.name}
                                aria-invalid={!!errors.teamName || undefined}
                                onChange={(e) => {
                                    setTeamData({ ...teamData, name: e.target.value })
                                    if (errors.teamName) setErrors({ ...errors, teamName: "" })
                                }}
                                className="h-11"
                            />
                            {renderError("teamName")}
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="ct-tag" className={fieldLabel}>Team tag (2–5 characters)</label>
                            <Input
                                id="ct-tag"
                                type="text"
                                placeholder="e.g. PHX"
                                value={teamData.shortName}
                                aria-invalid={!!errors.shortName || undefined}
                                onChange={(e) => {
                                    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)
                                    setTeamData({ ...teamData, shortName: value })
                                    if (errors.shortName) setErrors({ ...errors, shortName: "" })
                                }}
                                maxLength={5}
                                className="h-11 w-40 font-mono uppercase tracking-[0.2em]"
                            />
                            {renderError("shortName")}
                        </div>
                    </div>
                )

            case "region":
                return (
                    <ul className="divide-y divide-line rounded-md border border-line" role="radiogroup" aria-label="Home region">
                        {(Object.entries(REGION_INFO) as [TeamRegion, typeof REGION_INFO[TeamRegion]][]).map(([key, info]) => {
                            const selected = teamData.region === key
                            return (
                                <li key={key}>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setTeamData({ ...teamData, region: key })}
                                        className={cn("flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors", selected ? "border-gold bg-hover" : "border-transparent hover:bg-raised")}
                                    >
                                        <span className="w-16 text-xs font-semibold text-ink-3">{key}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-ink-1">{info.label}</span>
                                            <span className="block text-xs text-ink-3">Enters the {QUALIFIER_FOR[key]} regional qualifier first</span>
                                        </span>
                                        {selected && <Check size={16} className="text-gold" />}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )

            case "colors":
                return (
                    <div className="space-y-6">
                        <div>
                            <p className={cn(fieldLabel, "mb-2")}>Colour pair</p>
                            <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Colour pair">
                                {PRESET_COLORS.map((colors, index) => {
                                    const selected = teamData.logoIndex === index
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            aria-label={`Colour pair ${index + 1}`}
                                            onClick={() => setTeamData({ ...teamData, logoIndex: index, primaryColor: colors.primary, secondaryColor: colors.secondary })}
                                            className={cn("relative aspect-square rounded-md border-2 transition-colors", selected ? "border-gold" : "border-transparent hover:border-line-strong")}
                                            style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)` }}
                                        >
                                            {selected && <Check className="absolute inset-0 m-auto text-ink-1" size={18} />}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <div>
                            <p className={cn(fieldLabel, "mb-2")}>Custom logo (optional)</p>
                            <ImageUploader
                                value={teamData.logoData}
                                onChange={(logoData) => setTeamData({ ...teamData, logoData })}
                                maxSize={200}
                            />
                        </div>
                    </div>
                )

            case "difficulty":
                return (
                    <div className="space-y-3">
                        <p className="text-xs text-ink-3">{draftSaved ? 'Setup is saved on this device. Uploaded logos over 500 KB need to be picked again after a reload.' : 'Setup could not be saved. Keep this page open until you finish.'}</p>
                        <ul className="divide-y divide-line rounded-md border border-line" role="radiogroup" aria-label="Difficulty">
                            {(Object.entries(DIFFICULTY_SETTINGS) as [GameDifficulty, typeof DIFFICULTY_SETTINGS[GameDifficulty]][]).map(([key, settings]) => {
                                const selected = teamData.difficulty === key
                                return (
                                    <li key={key}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => setTeamData({ ...teamData, difficulty: key })}
                                            className={cn("flex w-full items-start gap-4 border-l-2 px-4 py-3 text-left transition-colors", selected ? "border-gold bg-hover" : "border-transparent hover:bg-raised")}
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-ink-1">{settings.label}</span>
                                                <span className="block text-xs text-ink-3">{settings.description}</span>
                                            </span>
                                            <dl className="grid shrink-0 grid-cols-3 gap-4 text-right">
                                                <div><dt className="text-[11px] text-ink-3">Cash</dt><dd className="text-sm font-semibold tabular-nums text-ink-1">{formatCurrency(customClubStartingCash(settings.startingBudget))}</dd></div>
                                                <div><dt className="text-[11px] text-ink-3">Rep</dt><dd className="text-sm font-semibold tabular-nums text-ink-1">{settings.startingReputation}</dd></div>
                                                <div><dt className="text-[11px] text-ink-3">Income</dt><dd className="text-sm font-semibold tabular-nums text-ink-1">{settings.incomeMultiplier}×</dd></div>
                                            </dl>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                        <p className="text-xs text-ink-3">Income multiplies recurring sponsor and merchandise income; tournament prizes are handled separately.</p>
                    </div>
                )

            case "review": {
                // Custom clubs enter the world ranking at #150 (initializeCustomTeam).
                const challenge = describeClubChallenge({ worldRanking: 150, reputation: difficultySettings.startingReputation, starters: 0, budget: startingCash, custom: true })
                return (
                    <div className="space-y-4">
                        <dl className="divide-y divide-line rounded-md border border-line text-sm">
                            {[
                                ["Manager", managerName],
                                ["Club", `${teamData.name} [${teamData.shortName}]`],
                                ["Region", REGION_INFO[teamData.region].label],
                                ["Difficulty", difficultySettings.label],
                                ["Starting cash", formatCurrency(startingCash, "$", false)],
                                ["Reputation", difficultySettings.startingReputation],
                            ].map(([label, value]) => (
                                <div key={label as string} className="flex justify-between px-4 py-2">
                                    <dt className="text-ink-3">{label}</dt>
                                    <dd className="font-semibold text-ink-1">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        <section aria-labelledby="custom-expectations-title" className="rounded-md border border-line bg-shell p-4">
                            <h3 id="custom-expectations-title" className={fieldLabel}>What to expect</h3>
                            <p className="mt-2 text-sm text-ink-1">Board target: {challenge.boardLabel}, finish the season ranked #{challenge.rankTarget} or better.</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-2">
                                {challenge.notes.map(note => <li key={note}>{note}</li>)}
                            </ul>
                        </section>
                        <p className="text-sm text-ink-2">
                            <span className="font-semibold text-caution">Empty roster. </span>
                            Pick affordable starters in the roster builder next, or recruit through Transfers. A match needs five available players.
                        </p>
                    </div>
                )
            }
        }
    }

    return (
        <div className="relative min-h-dvh overflow-hidden bg-ink">
            <RosterBuilderModal
                isOpen={showRosterBuilder}
                onComplete={handleRosterComplete}
                teamColors={{ primary: teamData.primaryColor, secondary: teamData.secondaryColor }}
            />

            <Image
                src="/esport-ui-assets/backgrounds/club-campus-dusk.webp"
                alt=""
                fill
                priority
                sizes="100vw"
                className="pointer-events-none select-none object-cover object-center opacity-50 saturate-[0.7]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-ink from-35% via-ink/90 via-60% to-ink/40" />

            <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1240px] gap-12 px-12 py-10">
                <div className="flex w-full max-w-[620px] flex-col gap-6">
                    <button type="button" onClick={goPrev} className="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-medium text-ink-3 hover:text-ink-1">
                        <ArrowLeft size={16} /> {currentStepIndex === 0 ? "New career" : STEPS[currentStepIndex - 1].label}
                    </button>

                    <ScreenHeader eyebrow={`Create your own team · Step ${currentStepIndex + 1} of ${STEPS.length}`} title={step.title} subtitle={step.subtitle} />

                    {/* Stepper */}
                    <ol className="grid grid-cols-5 gap-2" aria-label="Steps">
                        {STEPS.map((s, index) => {
                            const isActive = index === currentStepIndex
                            const isComplete = index < currentStepIndex
                            return (
                                <li key={s.id} aria-current={isActive ? "step" : undefined}>
                                    <span className={cn("block h-1 rounded-full", isActive ? "bg-gold" : isComplete ? "bg-ink-2" : "bg-hover")} />
                                    <span className={cn("mt-1.5 flex items-center gap-1 text-xs", isActive ? "font-semibold text-ink-1" : "text-ink-3")}>
                                        {isComplete && <Check size={12} />} {s.label}
                                    </span>
                                </li>
                            )
                        })}
                    </ol>

                    <Panel>{renderStepContent()}</Panel>

                    <div className="flex justify-between">
                        <Button variant="outline" onClick={goPrev} className="gap-2">
                            <ArrowLeft size={16} /> {currentStepIndex === 0 ? "Cancel" : "Back"}
                        </Button>
                        {currentStep === "review" ? (
                            <Button onClick={handleCreateTeam} disabled={isCreating} aria-busy={isCreating || undefined} className="gap-2 px-5">
                                {isCreating ? "Creating…" : "Create team and start"}
                            </Button>
                        ) : (
                            <Button onClick={goNext} className="gap-2 px-5">
                                Continue <ArrowRight size={16} />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Live preview */}
                <aside className="hidden flex-1 items-start pt-[104px] lg:flex" aria-label="Club preview">
                    <div className="sticky top-10 w-full max-w-[380px] rounded-[10px] border border-line-strong bg-panel p-6">
                        <p className={fieldLabel}>Preview</p>
                        <div className="mt-4 flex items-center gap-4">
                            <CrestPreview team={teamData} size={88} />
                            <div className="min-w-0">
                                <p className="truncate font-display text-3xl font-bold uppercase leading-none text-ink-1">{teamData.name || "Your club"}</p>
                                <p className="mt-1.5 text-sm text-ink-3">{teamData.shortName || "TAG"} · {REGION_INFO[teamData.region].label}</p>
                            </div>
                        </div>
                        <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                            <div className="flex justify-between py-2"><dt className="text-ink-3">Manager</dt><dd className="font-semibold text-ink-1">{managerName || "—"}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-ink-3">Difficulty</dt><dd className="font-semibold text-ink-1">{difficultySettings.label}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-ink-3">Starting cash</dt><dd className="font-semibold tabular-nums text-ink-1">{formatCurrency(startingCash)}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-ink-3">World rank</dt><dd className="font-semibold tabular-nums text-ink-1">#150</dd></div>
                        </dl>
                        <p className="mt-3 text-xs text-ink-3">New clubs start in the C-tier circuit with an empty roster.</p>
                    </div>
                </aside>
            </div>

            <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave team setup?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Your setup stays on this device so you can continue later. A career is created only when you finish.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction onClick={() => router.push("/new-game")} className="bg-gold text-gold-on hover:bg-gold-hover">
                            Go back
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
