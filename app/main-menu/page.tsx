"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import type { SaveSlotMetadata } from "@/engine"
import { Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { SettingsModal } from "@/components/settings/SettingsModal"

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

/** A secondary main-menu entry: display type, quiet until hovered or focused. */
function MenuItem({ label, hint, onClick, href, disabled }: MenuItemProps) {
    const inner = (
        <>
            <span className="font-display text-[26px] font-semibold uppercase leading-none tracking-[0.02em]">{label}</span>
            {hint && <span className="ml-auto text-xs font-medium normal-case tracking-normal text-ink-3">{hint}</span>}
        </>
    )
    const className = "h-14 w-full justify-start gap-3 px-4"
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
            {/* Key art behind a strong ink gradient: the menu side stays near-solid. */}
            <Image
                src="/esport-ui-assets/backgrounds/match-command-arena.webp"
                alt=""
                fill
                priority
                sizes="100vw"
                className="pointer-events-none select-none object-cover object-[60%_center] opacity-90 saturate-[0.75]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-ink from-20% via-ink/70 via-45% to-ink/0" />
            <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-ink via-ink/0 via-35% to-ink/40" />

            <div className="relative z-10 flex min-h-dvh w-full max-w-[560px] flex-col px-16 py-14 animate-in fade-in duration-200">
                <header className="flex items-center gap-4">
                    <Image src="/logo.png" alt="" width={96} height={96} className="h-24 w-24 object-contain" />
                    <h1 className="font-display text-[56px] font-bold uppercase leading-[0.9] tracking-[0.01em] text-ink-1">Esports Manager</h1>
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
                                <TeamLogoImage src={latest.teamLogo} team={latest.teamPreview} alt={latest.teamName || "Club"} size={38} />
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

                <footer className="flex items-center gap-3 text-xs text-ink-3">
                    <span className="tabular-nums">v{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</span>
                    <span aria-hidden="true">·</span>
                    <Link href="/credits" className="rounded-sm hover:text-ink-1">Credits</Link>
                </footer>
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    )
}
