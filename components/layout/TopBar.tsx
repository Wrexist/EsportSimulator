"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { usePathname } from "next/navigation"
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { formatGameCalendarDate } from "@/lib/game-calendar"
import { Settings } from "lucide-react"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { AdvanceControl } from "@/components/report/AdvanceControl"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { navHubsFor, navLabel, hubForPath, isNavItemActive, settingsItem } from "@/lib/navigation"
import { NavigationSearch } from "./NavigationSearch"
import { InboxButton } from "@/components/inbox/InboxButton"
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
        }))
    )

    const pathname = usePathname()
    // C10: a pro career hides the club-running screens (the staff run the club).
    const hubs = navHubsFor(pro)
    const pathHub = hubForPath(pathname)
    const activeHub = pathHub ? hubs.find(h => h.id === pathHub.id) ?? null : null

    const currentDate = useMemo(() => {
        const weekStart = getDateForWeek(currentWeek)
        const date = new Date(weekStart)
        const dayOffset = timeMode === "HYBRID_DAILY" ? currentDay : 0
        date.setUTCDate(date.getUTCDate() + dayOffset)
        return date
    }, [getDateForWeek, currentWeek, currentDay, timeMode])
    const playerTeam = useCurrentTeam()
    const budget = playerTeam?.budget || 0

    const managerInitials = useMemo(() => {
        // Trim + collapse whitespace so a trailing space ("Neo ") doesn't
        // yield an empty second part.
        const parts = (managerName || "Manager").trim().split(/\s+/).filter(Boolean)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return (parts[0] || "M").slice(0, 2).toUpperCase()
    }, [managerName])

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

                {!hideCareerControls && (
                    <nav ref={navRef} aria-label={t("topbar.mainNavigation")} className="relative flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-hidden">
                        {/* Hidden copy of the labels: their natural width decides labels vs icons. */}
                        <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1">
                            {hubs.map((hub, i) => (
                                <span key={hub.id} className="nav-hub whitespace-nowrap px-2 font-display text-[16px] font-semibold uppercase tracking-[0.03em] 2xl:px-3 2xl:text-[17px]">{hubLabels[i]}</span>
                            ))}
                        </div>
                        {hubs.map((hub, i) => {
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
                )}

                <div className="ml-auto flex shrink-0 items-center gap-2 @min-[80rem]/topbar:gap-3">
                    <NavigationSearch compact disabled={false} pro={pro} />

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
                        <span suppressHydrationWarning className="topbar-date whitespace-nowrap text-sm font-semibold text-ink-1">
                            {formatGameCalendarDate(currentDate, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
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
                            title={managerName ? `${managerName} · ${t("topbar.managerProfile")}` : t("topbar.managerProfile")}
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
