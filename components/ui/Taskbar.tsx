"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface TaskbarApp {
    id: string
    icon: React.ReactNode
    label: string
    isOpen: boolean
    isMinimized: boolean
    hasNotification?: boolean
    notificationCount?: number
}

interface TaskbarProps {
    apps: TaskbarApp[]
    currentWeek: number
    teamLogo?: string
    teamName?: string
    onAppClick: (appId: string) => void
}

export function Taskbar({ apps, currentWeek, teamLogo, teamName, onAppClick }: TaskbarProps) {
    const currentTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })

    return (
        <div className="absolute bottom-0 left-0 right-0 h-14 z-50">
            {/* Glassmorphic Background */}
            <div className="absolute inset-0 bg-[rgba(10,10,15,0.85)] backdrop-blur-2xl border-t border-white/10" />

            {/* Content */}
            <div className="relative h-full flex items-center justify-between px-4">
                {/* Left: Team Logo / Start */}
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors overflow-hidden"
                >
                    {teamLogo ? (
                        <img src={teamLogo} alt={teamName} className="w-6 h-6 object-contain" />
                    ) : (
                        <span className="text-xs font-normal text-white/60">
                            {teamName?.substring(0, 2).toUpperCase() || "ES"}
                        </span>
                    )}
                </motion.button>

                {/* Center: App Icons */}
                <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl px-2 py-1.5 border border-white/5">
                    {apps.map((app) => (
                        <motion.button
                            key={app.id}
                            onClick={() => onAppClick(app.id)}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className={cn(
                                "relative w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                                app.isOpen
                                    ? "bg-white/10 text-white"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                            )}
                        >
                            {app.icon}

                            {/* Running Indicator */}
                            {app.isOpen && (
                                <motion.div
                                    layoutId={`indicator-${app.id}`}
                                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-white/60"
                                />
                            )}

                            {/* Notification Badge */}
                            {app.hasNotification && (app.notificationCount ?? 0) > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-white">
                                        {(app.notificationCount ?? 0) > 99 ? "99+" : app.notificationCount}
                                    </span>
                                </div>
                            )}
                        </motion.button>
                    ))}
                </div>

                {/* Right: System Tray */}
                <div className="flex items-center gap-3">
                    {/* Week Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Week</span>
                        <span className="text-sm font-bold text-white">{currentWeek}</span>
                    </div>

                    {/* Clock */}
                    <div className="text-sm font-medium text-white/70 tabular-nums">
                        {currentTime}
                    </div>
                </div>
            </div>
        </div>
    )
}
