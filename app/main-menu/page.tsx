"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import type { SaveSlotMetadata } from "@/engine"
import { Briefcase, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { SettingsModal } from "@/components/settings/SettingsModal"
import { Logotype } from "@/components/brand/Logotype"
import { TitleHero } from "@/components/brand/TitleHero"

/** "Season 2 · Week 14" from an absolute career week. */
function seasonWeekLabel(week: number | null | undefined): string {
    const w = Math.max(1, week || 1)
    return `Season ${Math.ceil(w / 52)} · Week ${((w - 1) % 52) + 1}`
}

type MenuItemProps = {
    label: string
    hint?: string
    onClick?: () => void
    href?: string
    disabled?: boolean
}

/** A secondary main-menu entry: display type, quiet until hovered or focused (gold edge marks it). */
function MenuItem({ label, hint, onClick, href, disabled }: MenuItemProps) {
    const inner = (
        <>
            <span className="font-display text-[26px] font-semibold uppercase leading-none tracking-[0.02em]">{label}</span>
            {hint && <span className="ml-auto text-xs font-medium normal-case tracking-normal text-ink-3">{hint}</span>}
        </>
    )
    const className = "relative h-14 w-full justify-start gap-3 px-4 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-gold before:opacity-0 before:transition-opacity hover:bg-raised/80 hover:before:opacity-100 focus-visible:before:opacity-100"
    if (href) {
        return <Button asChild variant="ghost" className={className}><Link href={href}>{inner}</Link></Button>
    }
    return <Button variant="ghost" className={className} onClick={onClick} disabled={disabled}>{inner}</Button>
}

export default function MainMenuPage() {
    const router = useRouter()
    const { listSaves, switchSave, isLoading } = useGameStore(useShallow(state => ({
        listSaves: state.listSaves,
        switchSave: state.switchSave,
        isLoading: state.isLoading,
    })))

    const [saves, setSaves] = useState<SaveSlotMetadata[]>([])
    const [savesLoaded, setSavesLoaded] = useState(false)
    const [isContinuing, setIsContinuing] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    // Electron exposes a bridge; the browser build has no window to close.
    const [canQuit, setCanQuit] = useState(false)

    const loadSaves = useCallback(async () => {
        try {
            setSaves(await listSaves())
        } catch {
            setSaves([])
        } finally {
            setSavesLoaded(true)
        }
    }, [listSaves])

    useEffect(() => { void loadSaves() }, [loadSaves])
    useEffect(() => { setCanQuit(!!(window as typeof window & { electron?: unknown }).electron) }, [])

    // listSaves() is sorted newest first; corrupted and cloud-only slots go through Load.
    const careers = saves.filter(s => !s.isEmpty && s.saveId)
    const latest = careers.find(s => !s.isCorrupted && s.teamName)

    const handleContinue = async () => {
        if (!latest?.saveId || isContinuing) return
        setIsContinuing(true)
        try {
            const ok = await switchSave(latest.saveId)
            // On failure the store records lastLoadError; the load screen explains it.
            router.push(ok ? "/" : "/load-game")
        } finally {
            setIsContinuing(false)
        }
    }

    // In Electron, closing the window runs the shell's save-and-confirm handshake.
    const handleQuit = () => window.close()

    return (
        <div className="relative flex min-h-dvh overflow-hidden bg-ink">
            {/* Project-made key art (public/key-art); the menu side stays near-solid ink. */}
            <TitleHero />

            <div className="relative z-10 flex min-h-dvh w-full max-w-[560px] flex-col px-16 py-14 animate-in fade-in duration-200">
                <header>
                    <h1>
                        <Logotype size="hero" subtitle="FPS" label="Esports Manager: FPS" />
                    </h1>
                </header>

                <nav aria-label="Main menu" className="mt-auto mb-auto w-full max-w-[400px] space-y-1.5 pt-16">
                    {!savesLoaded ? (
                        <div className="h-[76px] w-full animate-pulse rounded-md bg-panel" aria-hidden="true" />
                    ) : latest ? (
                        <Button
                            onClick={handleContinue}
                            disabled={isContinuing || isLoading}
                            className="mb-3 h-auto w-full justify-start gap-4 px-4 py-3.5 text-left"
                        >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gold-on">
                                {latest.betweenClubs
                                    ? <Briefcase size={22} className="text-gold" aria-hidden="true" />
                                    : <TeamLogoImage src={latest.teamLogo} team={latest.teamPreview} alt={latest.teamName || "Club"} size={38} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-display text-[28px] font-bold uppercase leading-none tracking-[0.02em]">Continue</span>
                                <span className="mt-1 block truncate text-[13px] font-semibold">
                                    {latest.teamName} · {seasonWeekLabel(latest.currentWeek)}
                                </span>
                            </span>
                            {isContinuing ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
                        </Button>
                    ) : (
                        <Button asChild className="mb-3 h-16 w-full justify-start px-4">
                            <Link href="/new-game">
                                <span className="font-display text-[28px] font-bold uppercase leading-none tracking-[0.02em]">New career</span>
                                <Play fill="currentColor" className="ml-auto" />
                            </Link>
                        </Button>
                    )}

                    {latest && <MenuItem label="New career" href="/new-game" />}
                    <MenuItem
                        label="Load game"
                        href="/load-game"
                        hint={savesLoaded ? (careers.length === 0 ? "No saves" : `${careers.length} ${careers.length === 1 ? "save" : "saves"}`) : undefined}
                    />
                    <MenuItem label="Settings" onClick={() => setIsSettingsOpen(true)} />
                    {canQuit && <MenuItem label="Quit" onClick={handleQuit} />}
                </nav>

                <footer className="flex w-full max-w-[400px] items-center gap-3 border-t border-line pt-4 text-xs text-ink-3">
                    <span className="font-semibold uppercase tracking-[0.14em]">Version</span>
                    <span className="tabular-nums text-ink-2">{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</span>
                    <Link href="/credits" className="ml-auto rounded-sm font-semibold uppercase tracking-[0.14em] hover:text-ink-1 focus-visible:text-ink-1 focus-visible:outline-hidden">Credits</Link>
                </footer>
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    )
}
