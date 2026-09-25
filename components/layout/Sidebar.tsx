"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn, getTeamColors } from "@/lib/utils"
import { Lock, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { menuGroups, settingsItem, type MenuItem, type MenuGroup } from "@/lib/navigation"
import { NavigationSearch } from "./NavigationSearch"
import { useState, useMemo, useCallback, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [pendingHref, setPendingHref] = useState<string | null>(null)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
    const { activeMatchId, getPlayerTeam, managerDetails } = useGameStore(useShallow(state => ({
        activeMatchId: state.activeMatchId,
        getPlayerTeam: state.getPlayerTeam,
        managerDetails: state.managerDetails,
    })))

    const playerTeam = getPlayerTeam?.() || null
    const teamColors = useMemo(() => getTeamColors(playerTeam), [playerTeam])

    const managerInitials = useMemo(() => {
        const name = managerDetails?.name || "Manager"
        // Trim + collapse whitespace so a trailing space ("Neo ") doesn't
        // yield an empty second part → "NUNDEFINED".
        const parts = name.trim().split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase()
        }
        return (parts[0] || "M").slice(0, 2).toUpperCase()
    }, [managerDetails])

    const isMatchLocked = activeMatchId && pathname?.includes("/live")

    const toggleGroup = useCallback((label: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev)
            if (next.has(label)) {
                next.delete(label)
            } else {
                next.add(label)
            }
            return next
        })
    }, [])

    const groupContainsActive = useCallback((group: MenuGroup) => {
        return group.items.some(item => pathname === item.href.split("?")[0])
    }, [pathname])

    const renderLink = (item: MenuItem) => {
        // Compare against the path portion so query-string hrefs (e.g. the
        // Inbox → /desktop?app=mail entry) still match the active route.
        const isActive = isPending ? pendingHref === item.href : pathname === item.href.split("?")[0]
        return (
            <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={isCollapsed ? item.label : undefined}
                aria-current={pathname === item.href.split("?")[0] ? "page" : undefined}
                aria-disabled={!!isMatchLocked}
                aria-busy={isPending && pendingHref === item.href}
                onMouseEnter={() => { if (!isMatchLocked) router.prefetch(item.href) }}
                onFocus={() => { if (!isMatchLocked) router.prefetch(item.href) }}
                onClick={(event) => {
                    if (isMatchLocked) { event.preventDefault(); return }
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                    event.preventDefault()
                    setPendingHref(item.href)
                    startTransition(() => router.push(item.href))
                }}
                className={cn(
                    "nav-route flex items-center gap-3 px-3 py-2 rounded-xl transition-colors duration-100 group relative border border-transparent active:scale-[0.98]",
                    isActive
                        ? "text-white"
                        : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                    isMatchLocked && "opacity-30 pointer-events-none grayscale"
                )}
            >
                {isMatchLocked && <Lock size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20" />}
                <item.icon size={18} className={cn("relative z-10 shrink-0", isActive && "text-sky-200")} />
                <span
                    className={cn(
                        "relative z-10 font-medium text-[13px] whitespace-nowrap",
                        isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
                    )}
                >
                    {item.label}
                </span>
                {isActive && (
                    <motion.div
                        layoutId="active-navigation-lens"
                        transition={{ type: "spring", stiffness: 550, damping: 42 }}
                        className="nav-lens"
                    />
                )}
            </Link>
        )
    }

    return (
        <motion.div
            initial={false}
            animate={{ width: isCollapsed ? 64 : 208 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="game-sidebar relative flex flex-col pointer-events-auto z-40"
        >
            <div className="p-4 flex items-center justify-between overflow-hidden">
                <AnimatePresence mode="wait">
                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="font-semibold text-sm text-white/90 tracking-tight whitespace-nowrap"
                        >
                            Esports Manager
                        </motion.span>
                    )}
                </AnimatePresence>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors"
                    aria-label="Toggle sidebar"
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            <NavigationSearch collapsed={isCollapsed} disabled={!!isMatchLocked} />
            <nav aria-label="Main navigation" className="flex-1 px-2 py-2 space-y-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar custom-scrollbar">
                {menuGroups.map((group, groupIndex) => {
                    const hasActive = groupContainsActive(group)
                    const isGroupCollapsed = collapsedGroups.has(group.label) && !hasActive

                    return (
                        <div key={group.label}>
                            {/* Group separator */}
                            {groupIndex > 0 && !isCollapsed && (
                                <div className="mx-3 my-2 border-t liquid-divider" />
                            )}
                            {groupIndex > 0 && isCollapsed && (
                                <div className="mx-2 my-1 border-t liquid-divider" />
                            )}

                            {/* Group header (only when sidebar is expanded) */}
                            {!isCollapsed && (
                                <button
                                    onClick={() => toggleGroup(group.label)}
                                    aria-expanded={!isGroupCollapsed}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 hover:text-slate-200 transition-colors"
                                >
                                    <span>{group.label}</span>
                                    <ChevronDown
                                        size={12}
                                        className={cn(
                                            "transition-transform duration-200",
                                            isGroupCollapsed && "-rotate-90"
                                        )}
                                    />
                                </button>
                            )}

                            {/* Group items */}
                            <AnimatePresence initial={false}>
                                {!isGroupCollapsed && (
                                    <motion.div
                                        initial={false}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="overflow-hidden space-y-0.5"
                                    >
                                        {group.items.map(renderLink)}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )
                })}

                {/* Settings - always visible, no group */}
                <div className="pt-1">
                    {!isCollapsed && <div className="mx-3 my-2 border-t liquid-divider" />}
                    {isCollapsed && <div className="mx-2 my-1 border-t liquid-divider" />}
                    {renderLink(settingsItem)}
                </div>
            </nav>

            <div className="p-4 border-t liquid-divider">
                <Link
                    href="/career"
                    aria-label="Manager profile"
                    title={isCollapsed ? "Manager profile" : undefined}
                    className={cn(
                        "flex items-center gap-3 overflow-hidden p-2 -m-2 rounded-lg hover:bg-white/[0.055] transition-colors group",
                        isCollapsed && "justify-center"
                    )}
                >
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-lg group-hover:scale-105 transition-transform text-white"
                        style={{
                            background: playerTeam?.customTeamData
                                ? teamColors.gradient
                                : 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)'
                        }}
                    >
                        {managerInitials}
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                {managerDetails?.name || "Manager"} Career
                            </span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest group-hover:text-white/80">Manager Profile</span>
                        </div>
                    )}
                </Link>
            </div>
        </motion.div>
    )
}
