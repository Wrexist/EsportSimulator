"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { Search, ArrowUpRight, FileText, User, Shield, Save, HelpCircle, Keyboard } from "lucide-react"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { menuGroupsFor, navLabel, settingsItem } from "@/lib/navigation"
import { t } from "@/lib/i18n"
import { useLocale } from "@/lib/use-locale"
import { useGameStore } from "@/store/game-store"
import { screenSearchFilter } from "@/lib/search-filter"
import { weekOfSeason } from "@/lib/season-week"
import { playerHref, teamHref } from "@/components/ui/EntityLink"
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal"
import { OPEN_HELP_EVENT } from "@/components/ui/help-system"
import { debouncedStorage } from "@/engine/storage-adapter"
import { soundManager } from "@/lib/sound-manager"

/** Clubs listed for a query: the best matches only, the list stays short. */
const MAX_CLUBS = 8
const NONE: never[] = []
const ITEM = "gap-3 rounded px-3 py-2.5 text-ink-2 data-[selected=true]:bg-hover data-[selected=true]:text-ink-1"

export function NavigationSearch({ compact = false, disabled, pro = false, draftCup = false, betweenClubs = false }: { compact?: boolean; disabled: boolean; pro?: boolean; draftCup?: boolean; betweenClubs?: boolean }) {
    useLocale() // re-render on a language change
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    // The latest weekly report, offered as a command (HOME-10).
    const reportWeek = useGameStore(s => s.weekReports?.history?.[0]?.week ?? null)
    const openWeekReport = useGameStore(s => s.openWeekReport)
    // HOME-28: the squad's players and the world's clubs, once something is typed.
    const [query, setQuery] = useState("")
    const [shortcutsOpen, setShortcutsOpen] = useState(false)
    // Read only while the palette is open: the week's simulation changes them all the time.
    const { teams, players, playerTeamId, hasSave } = useGameStore(useShallow(s => open
        ? { teams: s.teams, players: s.players, playerTeamId: s.playerTeamId, hasSave: !!s.saveId }
        : { teams: NONE, players: NONE, playerTeamId: null, hasSave: false }))
    const matches = useMemo(() => {
        if (!open || !query.trim()) return { squad: [], clubs: [] }
        const own = teams.find(team => team.id === playerTeamId)
        const squad = (own?.rosterIds ?? [])
            .map(id => players.find(p => p.id === id))
            .filter((p): p is NonNullable<typeof p> => !!p && screenSearchFilter(`${p.nickname} ${p.name}`, query) > 0)
        const clubs = teams
            .map(team => ({ team, score: screenSearchFilter(team.name, query, team.shortName ? [team.shortName] : undefined) }))
            .filter(c => c.score > 0)
            .sort((a, b) => b.score - a.score || (a.team.worldRanking ?? 999) - (b.team.worldRanking ?? 999))
            .slice(0, MAX_CLUBS)
            .map(c => c.team)
        return { squad, clubs }
    }, [open, query, teams, players, playerTeamId])
    const go = (href: string) => {
        if (disabled) return
        startTransition(() => router.push(href))
        setOpen(false)
    }
    // After this key event, like the week report below: the palette closes first.
    const afterClose = (action: () => void) => {
        if (disabled) return
        setOpen(false)
        window.setTimeout(action, 0)
    }
    const saveNow = async () => {
        const state = useGameStore.getState()
        if (!state.saveId || state.isLoading) return
        try {
            await debouncedStorage.flush()
            await state.saveGame()
            soundManager.play("weekAdvance")
        } catch { /* saveGame reports its own errors */ }
    }
    // macOS keyboards show the Command key; others the localized Ctrl ("Strg" in German).
    const [mac, setMac] = useState(false)
    useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])
    const shortcut = mac ? "⌘ K" : `${t("key.ctrl")} K`

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (disabled || event.defaultPrevented || document.querySelector('[role="dialog"]')) return
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault()
                setOpen(true)
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [disabled])

    useEffect(() => { if (disabled) setOpen(false) }, [disabled])
    useEffect(() => { if (!open) setQuery("") }, [open])

    return <>
    <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
        <button
            type="button"
            aria-label={t("search.aria")}
            aria-keyshortcuts="Control+k Meta+k"
            title={t("search.tooltip")}
            disabled={disabled}
            className={compact
                ? "flex h-9 shrink-0 items-center gap-2 rounded border border-line bg-shell px-2.5 text-ink-3 transition-colors hover:border-line-strong hover:text-ink-1 disabled:opacity-40"
                : "mx-2 mb-2 flex h-9 shrink-0 items-center gap-2 rounded border border-line bg-shell px-3 text-ink-3 transition-colors hover:border-line-strong hover:text-ink-1 disabled:opacity-40"}
        >
            <Search size={15} className="shrink-0" />
            <span className={compact ? "hidden text-xs @min-[110rem]/topbar:inline" : "flex-1 text-left text-xs"}>{t("search.open")}</span>
            <kbd className={compact ? "hidden rounded-sm border border-line px-1 text-[11px] font-medium text-ink-3 @min-[110rem]/topbar:inline" : "rounded-sm border border-line px-1 text-[11px] font-medium text-ink-3"}>{shortcut}</kbd>
        </button>
        </DialogTrigger>
            <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
                <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>
                <DialogDescription className="sr-only">{t("search.description")}</DialogDescription>
                {/* Word-prefix matching, and the focus line on the whole input row
                    (icon included) instead of a clipped ring on the bare input (HOME-10). */}
                <Command filter={screenSearchFilter} className="bg-transparent [&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:border-line [&_[data-slot=command-input-wrapper]:focus-within]:border-b-gold">
                    <CommandInput value={query} onValueChange={setQuery} aria-label={t("search.inputLabel")} placeholder={t("search.placeholder")} className="h-14 focus-visible:outline-none! focus-visible:shadow-none!" />
                    <CommandList className="max-h-[min(55vh,420px)] p-2" aria-busy={isPending}>
                        <CommandEmpty>{t("search.empty")}</CommandEmpty>
                        {[...menuGroupsFor(pro, draftCup, betweenClubs), { key: "search.preferences", label: "Preferences", items: [settingsItem] }].map(group =>
                            <CommandGroup key={group.key} heading={navLabel(group)}>
                                {group.items.map(item => <CommandItem
                                    key={item.href}
                                    value={`${navLabel(item)} · ${navLabel(group)}`}
                                    keywords={item.keywords?.split(" ")}
                                    onSelect={() => {
                                        if (disabled) return
                                        startTransition(() => router.push(item.href))
                                        setOpen(false)
                                    }}
                                    className="gap-3 rounded px-3 py-2.5 text-ink-2 data-[selected=true]:bg-hover data-[selected=true]:text-ink-1"
                                ><item.icon size={16} /><span className="flex-1">{navLabel(item)}</span><ArrowUpRight size={14} className="text-ink-3" /></CommandItem>)}
                            </CommandGroup>
                        )}
                        {matches.squad.length > 0 && (
                            <CommandGroup heading={t("search.g.squad")}>
                                {matches.squad.map(p => <CommandItem key={p.id} value={`${p.nickname} ${p.name} · ${p.id}`} onSelect={() => go(playerHref(p.id))} className={ITEM}>
                                    <User size={16} /><span className="flex-1">{p.nickname} <span className="text-ink-3">{p.name}</span></span><ArrowUpRight size={14} className="text-ink-3" />
                                </CommandItem>)}
                            </CommandGroup>
                        )}
                        {matches.clubs.length > 0 && (
                            <CommandGroup heading={t("search.g.clubs")}>
                                {matches.clubs.map(team => <CommandItem key={team.id} value={`${team.name} · ${team.id}`} keywords={team.shortName ? [team.shortName] : undefined} onSelect={() => go(teamHref(team.id))} className={ITEM}>
                                    <Shield size={16} /><span className="flex-1">{team.name}</span>{team.worldRanking ? <span className="text-xs tabular-nums text-ink-3">#{team.worldRanking}</span> : null}<ArrowUpRight size={14} className="text-ink-3" />
                                </CommandItem>)}
                            </CommandGroup>
                        )}
                        <CommandGroup heading={t("search.g.commands")}>
                            {hasSave && <CommandItem value={`${t("shortcuts.saveGame")} · ${t("search.g.commands")}`} keywords={["save", "quicksave"]} onSelect={() => afterClose(() => void saveNow())} className={ITEM}>
                                <Save size={16} /><span className="flex-1">{t("shortcuts.saveGame")}</span>
                            </CommandItem>}
                            <CommandItem value={`${t("help.title")} · ${t("search.g.commands")}`} keywords={["help", "guide", "manual"]} onSelect={() => afterClose(() => window.dispatchEvent(new Event(OPEN_HELP_EVENT)))} className={ITEM}>
                                <HelpCircle size={16} /><span className="flex-1">{t("help.title")}</span>
                            </CommandItem>
                            <CommandItem value={`${t("shortcuts.title")} · ${t("search.g.commands")}`} keywords={["keyboard", "keys", "hotkeys", "shortcuts"]} onSelect={() => afterClose(() => setShortcutsOpen(true))} className={ITEM}>
                                <Keyboard size={16} /><span className="flex-1">{t("shortcuts.title")}</span>
                            </CommandItem>
                        </CommandGroup>
                        {reportWeek != null && (
                            <CommandGroup heading={t("lastWeek.title")}>
                                <CommandItem
                                    value={`${t("wr.toastTitle", { week: weekOfSeason(reportWeek) })} · ${t("lastWeek.title")}`}
                                    keywords={["weekly", "report", "summary", "results"]}
                                    onSelect={() => {
                                        if (disabled) return
                                        setOpen(false)
                                        // After this key event: the report closes on Enter, and its
                                        // key listener would otherwise get the Enter that picked it.
                                        window.setTimeout(() => openWeekReport(reportWeek), 0)
                                    }}
                                    className="gap-3 rounded px-3 py-2.5 text-ink-2 data-[selected=true]:bg-hover data-[selected=true]:text-ink-1"
                                ><FileText size={16} /><span className="flex-1">{t("wr.toastTitle", { week: weekOfSeason(reportWeek) })}</span><ArrowUpRight size={14} className="text-ink-3" /></CommandItem>
                            </CommandGroup>
                        )}
                    </CommandList>
                    <div className="border-t border-line px-5 py-3 text-xs text-ink-3">{t("search.footer")}</div>
                </Command>
            </DialogContent>
    </Dialog>
    <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
}
