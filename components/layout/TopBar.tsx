"use client"

import Link from "next/link"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { usePathname } from "next/navigation"
import React, { useState, useEffect, useMemo } from "react"
import { formatGameCalendarDate } from "@/lib/game-calendar"
import { Settings } from "lucide-react"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { AdvanceControl } from "@/components/report/AdvanceControl"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { navHubs, hubForPath, isNavItemActive, settingsItem } from "@/lib/navigation"
import { NavigationSearch } from "./NavigationSearch"
import { InboxButton } from "@/components/inbox/InboxButton"

/**
 * Two-row game header (design system v2).
 * Row 1: club identity · seven hubs · search · funds · date · advance.
 * Row 2: the active hub's sub-tabs.
 */
export function TopBar() {
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
        }))
    )

    const pathname = usePathname()
    const activeHub = hubForPath(pathname)

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


    return (
        <header className="game-topbar shrink-0 sticky top-0 z-40 flex flex-col">
            {/* Row 1 — identity, hubs, status, advance */}
            <div className="flex h-14 items-center gap-4 px-5">
                {!hideCareerControls && (
                    <Link href="/" className="topbar-club flex min-w-0 shrink-0 items-center gap-2.5 pr-2" aria-label="Club overview">
                        <span className="flex h-9 w-9 items-center justify-center">
                            {isMounted ? <TeamLogoDisplay team={playerTeam} size={32} /> : <span className="h-8 w-8 rounded bg-raised" />}
                        </span>
                        <span className="topbar-club-name hidden max-w-[160px] truncate font-display 2xl:inline text-[19px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1" title={playerTeam?.name}>
                            {isMounted ? (playerTeam?.name || "No Team") : "Loading..."}
                        </span>
                    </Link>
                )}

                {!hideCareerControls && (
                    <nav aria-label="Main navigation" className="flex h-full min-w-0 items-stretch gap-1">
                        {navHubs.map(hub => {
                            const active = activeHub?.id === hub.id
                            return (
                                <Link
                                    key={hub.id}
                                    href={hub.items[0].href}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "nav-hub relative flex items-center px-2 font-display text-[16px] font-semibold uppercase tracking-[0.03em] transition-colors 2xl:px-3 2xl:text-[17px]",
                                        active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"
                                    )}
                                >
                                    {hub.label}
                                    {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 bg-gold 2xl:inset-x-3" />}
                                </Link>
                            )
                        })}
                    </nav>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-3">
                    <NavigationSearch compact disabled={false} />

                    {!hideCareerControls && (
                        <div className="flex flex-col items-end leading-none" title="Club funds">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Funds</span>
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

                    <div className="h-8 w-px bg-line" aria-hidden="true" />

                    <div className="flex flex-col items-end leading-none">
                        <span suppressHydrationWarning className="topbar-date whitespace-nowrap text-sm font-semibold text-ink-1">
                            {formatGameCalendarDate(currentDate, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setTimeMode(timeMode === "HYBRID_DAILY" ? "WEEKLY" : "HYBRID_DAILY")}
                            title="Switch between day-by-day and week-by-week time"
                            className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink-1"
                        >
                            Week {currentWeek}{timeMode === "HYBRID_DAILY" ? ` · Day ${currentDay + 1}` : ""} · {timeMode === "HYBRID_DAILY" ? "Daily" : "Weekly"}
                        </button>
                    </div>

                    <InboxButton />
                    <Link
                        href={settingsItem.href}
                        aria-label="Settings"
                        title="Settings"
                        className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink-1"
                    >
                        <Settings size={18} />
                    </Link>

                    {!hideCareerControls && (
                        <Link
                            href="/career"
                            aria-label="Manager profile"
                            title={managerName ? `${managerName} — manager profile` : "Manager profile"}
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
                <nav aria-label={`${activeHub.label} sections`} className="flex h-10 items-stretch gap-1 border-t border-line px-5">
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
                                {item.label}
                                {active && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 bg-gold" />}
                            </Link>
                        )
                    })}
                </nav>
            )}
        </header>
    )
}
