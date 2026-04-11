"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn, getTeamColors } from "@/lib/utils"
import {
    Lock,
    Home,
    Users,
    UserPlus,
    BarChart3,
    Dumbbell,
    Building2,
    Calendar,
    Globe,
    Trophy,
    Search,
    DollarSign,
    Settings,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ClipboardList,
    Crown,
    Package,
    Award,
    Monitor,
    Swords,
    Handshake,
    GraduationCap,
    type LucideIcon
} from "lucide-react"
import { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"

interface MenuItem {
    icon: LucideIcon
    label: string
    href: string
}

interface MenuGroup {
    label: string
    items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
    {
        label: "Overview",
        items: [
            { icon: Home, label: "Home", href: "/" },
            { icon: Monitor, label: "Desktop", href: "/desktop" },
            { icon: Calendar, label: "Schedule", href: "/schedule" },
        ]
    },
    {
        label: "Team",
        items: [
            { icon: Users, label: "Squad", href: "/squad" },
            { icon: Dumbbell, label: "Training", href: "/training" },
            { icon: ClipboardList, label: "Staff", href: "/staff" },
            { icon: Package, label: "Equipment", href: "/equipment" },
        ]
    },
    {
        label: "Recruitment",
        items: [
            { icon: UserPlus, label: "Transfers", href: "/transfers" },
            { icon: Search, label: "Scouting", href: "/scouting" },
            { icon: Building2, label: "Facilities", href: "/basecamp" },
            { icon: GraduationCap, label: "Academy", href: "/academy" },
        ]
    },
    {
        label: "Competition",
        items: [
            { icon: Trophy, label: "Tournaments", href: "/tournaments" },
            { icon: Globe, label: "Rankings", href: "/rankings" },
            { icon: Swords, label: "FPL", href: "/fpl" },
            { icon: BarChart3, label: "Statistics", href: "/stats" },
        ]
    },
    {
        label: "Business",
        items: [
            { icon: DollarSign, label: "Finances", href: "/finances" },
            { icon: Handshake, label: "Sponsors", href: "/sponsorships" },
        ]
    },
    {
        label: "Legacy",
        items: [
            { icon: Award, label: "Trophies", href: "/trophies" },
            { icon: Crown, label: "Hall of Fame", href: "/hall-of-fame" },
        ]
    },
]

const settingsItem: MenuItem = { icon: Settings, label: "Settings & Tools", href: "/settings" }

export function Sidebar() {
    const pathname = usePathname()
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
        const parts = name.split(" ")
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase()
        }
        return name.slice(0, 2).toUpperCase()
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
        return group.items.some(item => pathname === item.href)
    }, [pathname])

    const renderLink = (item: MenuItem) => {
        const isActive = pathname === item.href
        return (
            <Link
                key={item.href}
                href={item.href}
                className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative",
                    isActive
                        ? "bg-primary/10 text-primary shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white",
                    isMatchLocked && "opacity-30 pointer-events-none grayscale"
                )}
            >
                {isMatchLocked && <Lock size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20" />}
                <item.icon size={20} className={cn("shrink-0", isActive && "text-primary")} />
                <span
                    className={cn(
                        "font-medium text-sm whitespace-nowrap transition-all duration-200",
                        isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"
                    )}
                >
                    {item.label}
                </span>
                {isActive && (
                    <motion.div
                        layoutId="active-pill"
                        className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                    />
                )}
            </Link>
        )
    }

    return (
        <motion.div
            initial={false}
            animate={{ width: isCollapsed ? 70 : 240 }}
            className="sticky top-0 h-full bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col pointer-events-auto transition-all duration-300 ease-in-out z-40"
        >
            <div className="p-4 flex items-center justify-between overflow-hidden">
                <AnimatePresence mode="wait">
                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="font-normal text-lg text-white tracking-tighter uppercase whitespace-nowrap"
                        >
                            Esports Manager
                        </motion.span>
                    )}
                </AnimatePresence>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
                    aria-label="Toggle sidebar"
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto overflow-x-hidden sidebar-scrollbar custom-scrollbar">
                {menuGroups.map((group, groupIndex) => {
                    const hasActive = groupContainsActive(group)
                    const isGroupCollapsed = collapsedGroups.has(group.label) && !hasActive

                    return (
                        <div key={group.label}>
                            {/* Group separator */}
                            {groupIndex > 0 && !isCollapsed && (
                                <div className="mx-3 my-2 border-t border-white/5" />
                            )}
                            {groupIndex > 0 && isCollapsed && (
                                <div className="mx-2 my-1 border-t border-white/5" />
                            )}

                            {/* Group header (only when sidebar is expanded) */}
                            {!isCollapsed && (
                                <button
                                    onClick={() => toggleGroup(group.label)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 hover:text-white/50 transition-colors"
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
                    {!isCollapsed && <div className="mx-3 my-2 border-t border-white/5" />}
                    {isCollapsed && <div className="mx-2 my-1 border-t border-white/5" />}
                    {renderLink(settingsItem)}
                </div>
            </nav>

            <div className="p-4 border-t border-white/5">
                <Link
                    href="/career"
                    className={cn(
                        "flex items-center gap-3 overflow-hidden p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors group",
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
