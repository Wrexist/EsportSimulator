"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { usePathname } from "next/navigation"
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { formatGameCalendarDate, formatGameCalendarRange } from "@/lib/game-calendar"
import { MoreHorizontal, Settings } from "lucide-react"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { AdvanceControl } from "@/components/report/AdvanceControl"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { navHubsFor, navLabel, hubForPath, isNavItemActive, settingsItem, type NavHub } from "@/lib/navigation"
import { NavigationSearch } from "./NavigationSearch"
import { InboxButton } from "@/components/inbox/InboxButton"
import { Logotype } from "@/components/brand/Logotype"
import { t } from "@/lib/i18n"
import { useLocale } from "@/lib/use-locale"

// Help & game guide trigger (and its dialog), loaded on demand. It lives in the
// header so it never floats over page content (CROSSCUT-03).
const HelpSystem = dynamic(() => import("@/components/ui/help-system").then(mod => mod.HelpSystem), {
    ssr: false,
    loading: () => <span className="h-9 w-9 shrink-0" aria-hidden="true" />,
})

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * True when the hub labels do not fit the space the header leaves for them
 * (narrow window, large UI scale, long translations): the hubs then show as
 * icons. The labels' natural width is read from a hidden copy, so switching
 * modes never changes the measurement (no flip-flopping).
 */
function useHubsFit(navRef: React.RefObject<HTMLElement | null>, measureRef: React.RefObject<HTMLElement | null>, deps: unknown[]): boolean {
    const [fit, setFit] = useState(true)
    useIsomorphicLayoutEffect(() => {
        const nav = navRef.current
        const measure = measureRef.current
        if (!nav || !measure) return
        const check = () => setFit(measure.scrollWidth <= nav.clientWidth + 1)
        check()
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(check)
        observer.observe(nav)
        observer.observe(measure)
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; deps re-run on label changes
    }, deps)
    return fit
}

/**
 * How many hub icons fit next to a "More" button (CROSSCUT-14). Only used once
 * the labels have collapsed to icons: at a large UI scale on a small window
 * even the icon row can be wider than the room left, and clipped hubs could
 * not be reached. The icons' widths are read from a hidden copy; the room is
 * the box that holds the hub row and the "More" button, which does not change
 * size when the button appears, so the count cannot flip-flop.
 */
function useFittingHubCount(boxRef: React.RefObject<HTMLElement | null>, measureRef: React.RefObject<HTMLElement | null>, total: number, active: boolean, deps: unknown[]): number {
    const [count, setCount] = useState(total)
    useIsomorphicLayoutEffect(() => {
        const box = boxRef.current
        const measure = measureRef.current
        if (!active || !box || !measure) { setCount(total); return }
        const check = () => {
            const gap = 4 // gap-1 between hubs
            const widths = Array.from(measure.children, child => (child as HTMLElement).offsetWidth)
            const room = box.clientWidth
            const all = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1)
            if (all <= room + 1) { setCount(total); return }
            // The "More" button is one icon wide.
            let used = widths[0] ?? 0
            let fit = 0
            for (const w of widths) {
                if (used + gap + w > room + 1) break
                used += gap + w
                fit++
            }
            setCount(Math.min(total, fit))
        }
        check()
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(check)
        observer.observe(box)
        observer.observe(measure)
        return () => observer.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; deps re-run on hub changes
    }, [active, total, ...deps])
    return count
}

/** The hubs that did not fit the top bar, behind one button (CROSSCUT-14). */
function HubOverflowMenu({ hubs, activeHubId }: { hubs: NavHub[]; activeHubId: string | null }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const pathname = usePathname()
    useEffect(() => { setOpen(false) }, [pathname])
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return
            // Closing the menu is all Escape does here (it would otherwise go back a screen).
            e.preventDefault()
            setOpen(false)
            buttonRef.current?.focus()
        }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
    }, [open])
    const label = t("topbar.moreHubs")
    const holdsActive = hubs.some(hub => hub.id === activeHubId)
    return (
        <div ref={ref} className="relative flex shrink-0 items-stretch">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                title={hubs.map(hub => navLabel(hub)).join(" / ")}
                className={cn("nav-hub relative flex items-center px-1.5", holdsActive || open ? "text-ink-1" : "text-ink-3 hover:text-ink-1")}
            >
                <MoreHorizontal size={18} aria-hidden="true" className={holdsActive ? "text-gold" : undefined} />
                {holdsActive && <span aria-hidden="true" className="absolute inset-x-1 bottom-0 h-0.5 bg-gold" />}
            </button>
            {open && (
                <div role="menu" aria-label={label} className="absolute left-0 top-[calc(100%+6px)] z-50 w-56 overflow-hidden rounded-lg border border-line-strong bg-panel py-1 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]">
                    {hubs.map(hub => {
                        const Icon = hub.icon
                        const active = hub.id === activeHubId
                        return (
                            <Link
                                key={hub.id}
                                href={hub.items[0].href}
                                role="menuitem"
                                aria-current={active ? "page" : undefined}
                                onClick={() => setOpen(false)}
                                className={cn("flex items-center gap-2.5 px-3 py-2 text-sm font-semibold hover:bg-raised", active ? "text-ink-1" : "text-ink-2 hover:text-ink-1")}
                            >
                                <Icon size={16} aria-hidden="true" className={active ? "text-gold" : "text-ink-3"} />
                                {navLabel(hub)}
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/**
 * Two-row game header (design system v2).
 * Row 1: club identity · seven hubs · search · funds · date · advance.
 * Row 2: the active hub's sub-tabs.
 */
export function TopBar() {
    useLocale() // re-render on a language change
    // Single shallow-equality selector instead of many individual subscriptions:
    // every store mutation (match tick, transfer, ledger entry) would otherwise
    // re-render the header and cascade through its children.
    const {
        currentWeek,
        currentDay,
        timeMode,
        getDateForWeek,
        saveId,
        playerTeamId,
        setTimeMode,
        managerName,
        betweenClubs,
        pro,
        proName,
        draftCup,
    } = useGameStore(
        useShallow(s => ({
            currentWeek: s.currentWeek,
            currentDay: s.currentDay,
            timeMode: s.timeMode,
            getDateForWeek: s.getDateForWeek,
            saveId: s.saveId,
            playerTeamId: s.playerTeamId,
            setTimeMode: s.setTimeMode,
            managerName: s.managerDetails?.name,
            betweenClubs: !!s.gameOverReason,
            pro: !!s.proCareer && s.proCareer.retiredWeek == null,
            // MODES-07: a pro career's avatar is the pro, not the manager.
            proName: s.proCareer && s.proCareer.retiredWeek == null ? s.players.find(p => p.id === s.proCareer!.playerId)?.nickname : undefined,
            // MODES-14: a Draft Cup run hides the club-running screens it blocks.
            draftCup: !!s.draftCup,
        }))
    )

    const pathname = usePathname()
    // C10: a pro career hides the club-running screens (the staff run the club).
    const hubs = navHubsFor(pro, draftCup, betweenClubs)
    const pathHub = hubForPath(pathname)
    const activeHub = pathHub ? hubs.find(h => h.id === pathHub.id) ?? null : null

    const currentDate = useMemo(() => {
        const weekStart = getDateForWeek(currentWeek)
        const date = new Date(weekStart)
        const dayOffset = timeMode === "HYBRID_DAILY" ? currentDay : 0
        date.setUTCDate(date.getUTCDate() + dayOffset)
        return date
    }, [getDateForWeek, currentWeek, currentDay, timeMode])
    const weekEnd = useMemo(() => {
        const date = new Date(getDateForWeek(currentWeek))
        date.setUTCDate(date.getUTCDate() + 6)
        return date
    }, [getDateForWeek, currentWeek])
    const playerTeam = useCurrentTeam()
    const budget = playerTeam?.budget || 0

    const managerInitials = useMemo(() => {
        // Trim + collapse whitespace so a trailing space ("Neo ") doesn't
        // yield an empty second part.
        const parts = (proName || managerName || "Manager").trim().split(/\s+/).filter(Boolean)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return (parts[0] || "M").slice(0, 2).toUpperCase()
    }, [managerName, proName])

    // No career loaded (fresh launch, deleted save): advancing would build a
    // phantom save for team "unknown", so there is nothing to advance.
    const hasCareer = !!saveId && !!playerTeamId

    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => { setIsMounted(true) }, [])

    // Hide career chrome once mounted with no career (gated on mount so the
    // server render matches the first client render).
    const hideCareerControls = isMounted && !hasCareer

    // Play match / CONTINUE (to the next decision) / Next day / Skip week.
    // Locked without a career, on game over and while loading (AdvanceControl).
    const advanceControl = <AdvanceControl />

    const navRef = useRef<HTMLElement>(null)
    const measureRef = useRef<HTMLDivElement>(null)
    const hubLabels = hubs.map(hub => navLabel(hub))
    const hubsFit = useHubsFit(navRef, measureRef, [hubLabels.join("|"), hideCareerControls])
    // CROSSCUT-14: when even the icons do not fit, the rest go behind "More"
    // (the active hub always stays in the row).
    const navBoxRef = useRef<HTMLDivElement>(null)
    const iconMeasureRef = useRef<HTMLDivElement>(null)
    const fittingHubs = useFittingHubCount(navBoxRef, iconMeasureRef, hubs.length, !hubsFit, [hubs.map(hub => hub.id).join("|"), hideCareerControls])
    const shownHubs = useMemo(() => {
        if (hubsFit || fittingHubs >= hubs.length) return hubs
        const shown = hubs.slice(0, fittingHubs)
        if (activeHub && shown.length > 0 && !shown.includes(activeHub)) shown[shown.length - 1] = activeHub
        return hubs.filter(hub => shown.includes(hub))
    }, [hubs, hubsFit, fittingHubs, activeHub])
    const overflowHubs = hubs.filter(hub => !shownHubs.includes(hub))


    return (
        <header className="game-topbar shrink-0 sticky top-0 z-40 flex flex-col">
            {/* Row 1 — identity, hubs, status, advance. A size container: below
                80rem (1280px at 100% UI scale, more at a larger scale) the
                funds block hides and the gaps tighten, and below 110rem the club name,
                the search label and the extra advance buttons collapse, so nothing overlaps
                down to the 1024px minimum window (CROSSCUT-02). */}
            <div className="@container/topbar flex h-14 items-center gap-3 px-4 @min-[80rem]/topbar:gap-4 @min-[80rem]/topbar:px-5">
                {!hideCareerControls && (
                    <Link href="/" className="topbar-club flex min-w-0 shrink-0 items-center gap-2.5 pr-2" aria-label={t("topbar.clubOverview")}>
                        <span className="flex h-9 w-9 items-center justify-center">
                            {isMounted ? <TeamLogoDisplay team={playerTeam} size={32} /> : <span className="h-8 w-8 rounded bg-raised" />}
                        </span>
                        <span className="topbar-club-name hidden max-w-[160px] truncate font-display @min-[110rem]/topbar:inline text-[19px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1" title={playerTeam?.name}>
                            {isMounted ? (playerTeam?.name || t("topbar.noTeam")) : t("common.loading")}
                        </span>
                    </Link>
                )}

                {/* START-43: outside a career the left side is the game's logotype, back to the main menu. */}
                {hideCareerControls && (
                    <Link href="/main-menu" aria-label={t("ng.mainMenu")} title={t("ng.mainMenu")} className="flex shrink-0 items-center rounded-sm pr-2">
                        <Logotype size="compact" decorative />
                    </Link>
                )}

                {!hideCareerControls && (
                    <div ref={navBoxRef} className="flex h-full min-w-0 flex-1 items-stretch gap-1">
                    <nav ref={navRef} aria-label={t("topbar.mainNavigation")} className="relative flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-hidden">
                        {/* Hidden copy of the labels: their natural width decides labels vs icons. */}
                        <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1">
                            {hubs.map((hub, i) => (
                                <span key={hub.id} className="nav-hub whitespace-nowrap px-2 font-display text-[16px] font-semibold uppercase tracking-[0.03em] 2xl:px-3 2xl:text-[17px]">{hubLabels[i]}</span>
                            ))}
                        </div>
                        {/* Hidden copy of the icons: their width decides how many fit before "More". */}
                        <div ref={iconMeasureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1">
                            {hubs.map(hub => (
                                <span key={hub.id} className="nav-hub flex shrink-0 items-center px-1.5"><hub.icon size={18} /></span>
                            ))}
                        </div>
                        {shownHubs.map(hub => {
                            const i = hubs.indexOf(hub)
                            const active = activeHub?.id === hub.id
                            const Icon = hub.icon
                            return (
                                <Link
                                    key={hub.id}
                                    href={hub.items[0].href}
                                    aria-current={active ? "page" : undefined}
                                    title={hubsFit ? undefined : hubLabels[i]}
                                    className={cn(
                                        "nav-hub relative flex shrink-0 items-center whitespace-nowrap font-display text-[16px] font-semibold uppercase tracking-[0.03em] transition-colors 2xl:text-[17px]",
                                        hubsFit ? "px-2 2xl:px-3" : "px-1.5",
                                        active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
                                    )}
                                >
                                    {hubsFit ? hubLabels[i] : (
                                        <>
                                            <Icon size={18} aria-hidden="true" className={active ? "text-gold" : undefined} />
                                            <span className="sr-only">{hubLabels[i]}</span>
                                        </>
                                    )}
                                    {active && <span aria-hidden="true" className={cn("absolute bottom-0 h-0.5 bg-gold", hubsFit ? "inset-x-2 2xl:inset-x-3" : "inset-x-1")} />}
                                </Link>
                            )
                        })}
                    </nav>
                    {overflowHubs.length > 0 && <HubOverflowMenu hubs={overflowHubs} activeHubId={activeHub?.id ?? null} />}
                    </div>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-2 @min-[80rem]/topbar:gap-3">
                    {/* START-43: "Go to…" lists career screens, so it needs a career. */}
                    {!hideCareerControls && <NavigationSearch compact disabled={false} pro={pro} draftCup={draftCup} betweenClubs={betweenClubs} />}

                    {!hideCareerControls && !betweenClubs && !pro && (
                        <div className="hidden flex-col items-end leading-none @min-[80rem]/topbar:flex" title={t("topbar.funds")}>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("topbar.funds")}</span>
                            {isMounted ? (
                                <AnimatedNumber
                                    value={budget}
                                    format={(n) => formatCurrency(Math.round(n), "$", false)}
                                    className="mt-1 text-sm font-semibold tabular-nums text-ink-1"
                                />
                            ) : (
                                <span suppressHydrationWarning className="mt-1 text-sm font-semibold tabular-nums text-ink-1">
                                    {formatCurrency(budget, "$", false)}
                                </span>
                            )}
                        </div>
                    )}

                    {/* No career: no date, week or time mode to show (START-17). */}
                    {!hideCareerControls && <div className="hidden h-8 w-px bg-line @min-[80rem]/topbar:block" aria-hidden="true" />}

                    {!hideCareerControls && <div className="flex flex-col items-end leading-none">
                        <span suppressHydrationWarning className="topbar-date whitespace-nowrap text-sm font-semibold tabular-nums text-ink-1">
                            {/* Weekly mode: the whole week, so results already played this week are never "in the future" (HOME-18). */}
                            {timeMode === "HYBRID_DAILY"
                                ? formatGameCalendarDate(currentDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                                : formatGameCalendarRange(currentDate, weekEnd, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setTimeMode(timeMode === "HYBRID_DAILY" ? "WEEKLY" : "HYBRID_DAILY")}
                            title={t("topbar.timeModeHint")}
                            className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink-1"
                        >
                            {timeMode === "HYBRID_DAILY"
                                ? t("topbar.weekDayLine", { week: currentWeek, day: currentDay + 1, mode: t("common.daily") })
                                : t("topbar.weekLine", { week: currentWeek, mode: t("common.weekly") })}
                        </button>
                    </div>}

                    <InboxButton />
                    <Link
                        href={settingsItem.href}
                        aria-label={t("topbar.settings")}
                        title={t("topbar.settings")}
                        className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1"
                    >
                        <Settings size={18} />
                    </Link>
                    <HelpSystem />

                    {!hideCareerControls && (
                        <Link
                            href="/career"
                            aria-label={t("topbar.managerProfile")}
                            title={(proName || managerName) ? `${proName || managerName} · ${t("topbar.managerProfile")}` : t("topbar.managerProfile")}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-raised text-[11px] font-bold text-ink-1 hover:border-gold"
                        >
                            {isMounted ? managerInitials : ""}
                        </Link>
                    )}

                    {!hideCareerControls && advanceControl}
                </div>
            </div>

            {/* Row 2 — sub-tabs of the active hub */}
            {!hideCareerControls && activeHub && (
                <nav aria-label={t("topbar.sections", { hub: navLabel(activeHub) })} className="flex h-10 items-stretch gap-1 border-t border-line px-5">
                    {activeHub.items.map(item => {
                        const active = isNavItemActive(item, pathname)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "nav-route relative flex items-center gap-2 px-3 text-[13px] font-medium transition-colors",
                                    active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
                                )}
                            >
                                <item.icon size={15} className={active ? "text-gold" : undefined} />
                                {navLabel(item)}
                                {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-gold" />}
                            </Link>
                        )
                    })}
                </nav>
            )}
        </header>
    )
}
