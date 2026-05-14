"use client"

import React from "react"
import Image from "next/image"
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
            <div className="absolute inset-x-3 bottom-2 top-1 liquid-chrome rounded-xl border" />

            {/* Content */}
            <div className="relative h-full flex items-center justify-between px-4">
                {/* Left: Team Logo / Start */}
                <button
                    className="w-9 h-9 rounded-lg liquid-button flex items-center justify-center hover:bg-white/10 transition-colors duration-75 ease-out overflow-hidden touch-manipulation select-none will-change-transform hover:scale-[1.02] active:scale-[0.97] active:duration-0"
                >
                    {teamLogo ? (
                        <Image src={teamLogo} alt={teamName || ""} width={24} height={24} className="w-6 h-6 object-contain" unoptimized />
                    ) : (
                        <span className="text-xs font-normal text-white/60">
                            {teamName?.substring(0, 2).toUpperCase() || "ES"}
                        </span>
                    )}
                </button>

                {/* Center: App Icons */}
                <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg px-2 py-1.5 border border-white/10">
                    {apps.map((app) => (
                        <button
                            key={app.id}
                            onClick={() => onAppClick(app.id)}
                            className={cn(
                                "relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-75 ease-out touch-manipulation select-none will-change-transform hover:-translate-y-px active:scale-[0.96] active:translate-y-0 active:duration-0",
                                app.isOpen
                                    ? "bg-white/[0.12] text-white shadow-glass-soft"
                                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                            )}
                        >
                            {app.icon}

                            {/* Running Indicator */}
                            {app.isOpen && (
                                <motion.div
                                    layoutId={`indicator-${app.id}`}
                                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-cyan-200/80"
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
                        </button>
                    ))}
                </div>

                {/* Right: System Tray */}
                <div className="flex items-center gap-3">
                    {/* Week Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg liquid-button">
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
