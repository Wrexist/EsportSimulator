"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useGameStore } from "@/store/game-store"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { calculateTeamTier } from "@/engine/tier-system"
import { motion, AnimatePresence } from "framer-motion"
import { X, Swords, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { getTeamFlag } from "@/engine/region-logic"
import { Badge } from "@/components/ui/badge"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { toast } from "sonner"

interface BookScrimModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
    initialDay?: number
}

export function BookScrimModal({ isOpen, onClose, week, initialDay = 0 }: BookScrimModalProps) {
    const { teams, playerTeamId, players, scheduleScrim, currentWeek, currentDay, timeMode } = useGameStore()
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
    const [selectedDay, setSelectedDay] = useState<number>(initialDay)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        if (!isOpen) return

        const normalizedInitialDay = Math.max(0, Math.min(6, Math.floor(initialDay)))
        const minAllowedDay =
            timeMode === "HYBRID_DAILY" && week === currentWeek
                ? currentDay
                : 0

        setSelectedDay(Math.max(normalizedInitialDay, minAllowedDay))
        setError(null)
    }, [isOpen, initialDay, week, currentWeek, currentDay, timeMode])

    // Filter potential opponents
    const opponents = useMemo(() => {
        if (!playerTeamId) return []

        const myTeam = teams.find(t => t.id === playerTeamId)
        if (!myTeam) return []

        return teams
            .filter(t => t.id !== playerTeamId)
            .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => (b.reputation || 0) - (a.reputation || 0))
    }, [teams, playerTeamId, searchTerm])

    const handleBook = () => {
        const opponent = teams.find(t => t.id === selectedTeamId)
        const result = scheduleScrim(selectedTeamId!, week, selectedDay) as unknown as { success: boolean, message: string }
        if (result.success) {
            toast.success(`Scrim booked vs ${opponent?.name || "opponent"}`)
            onClose()
        } else {
            setError(result.message)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 top-16 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-book-scrim"
                className="glass-panel w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl border-white/10"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h2 id="modal-title-book-scrim" className="text-2xl font-normal uppercase tracking-tight flex items-center gap-2">
                            <Swords className="text-primary" />
                            Find Scrim
                        </h2>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                            Schedule practice match for Week {week}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Close dialog">
                        <X size={20} className="text-white/50 hover:text-white" />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-white/5">
                    <input
                        type="text"
                        placeholder="Search teams..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                    />
                </div>

                {/* Team List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {opponents.length === 0 ? (
                        <div className="text-center py-8 text-white/30 text-sm">No teams found matching "{searchTerm}"</div>
                    ) : (
                        opponents.map(team => {
                            const roster = team.rosterIds.map(id => players.find(p => p.id === id)).filter(Boolean)
                            const avgRating = roster.length > 0
                                ? Math.round(roster.reduce((sum, p) => sum + (evaluatePlayer(p as any).overallRating), 0) / roster.length)
                                : 0

                            const isSelected = selectedTeamId === team.id

                            return (
                                <div
                                    key={team.id}
                                    onClick={() => setSelectedTeamId(team.id)}
                                    className={`
                                    p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group
                                    ${isSelected
                                            ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                                            : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10"
                                        }
                                `}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-black/30 border border-white/5">
                                            <TeamLogoDisplay team={team as any} size={40} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-white uppercase tracking-tight">{team.name}</h3>
                                                <CountryFlag country={getTeamFlag(team.rosterIds, players)} />
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                <Badge variant="outline" className="text-[9px] h-4 border-white/10">
                                                    {calculateTeamTier(team.worldRanking || 100)}
                                                </Badge>
                                                <span>OVR: <span className="text-white font-bold">{avgRating}</span></span>
                                            </div>
                                        </div>
                                    </div>

                                    {isSelected && (
                                        <div className="text-primary font-normal uppercase text-xs tracking-widest animate-pulse">
                                            Selected
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Day Selection */}
                <div className="px-6 py-4 border-t border-white/5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 block">
                        Select Day
                    </label>
                    <div className="grid grid-cols-7 gap-2">
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => {
                            const isPastDayInCurrentWeek =
                                timeMode === "HYBRID_DAILY" &&
                                week === currentWeek &&
                                idx < currentDay

                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDay(idx)}
                                    disabled={isPastDayInCurrentWeek}
                                    className={`
                                    h-10 rounded-lg flex items-center justify-center text-xs font-bold uppercase transition-all
                                    ${isPastDayInCurrentWeek
                                            ? "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed"
                                            : ""
                                        }
                                    ${selectedDay === idx
                                            ? "bg-primary text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                                            : "bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white"
                                        }
                                `}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {day}
                                        {isPastDayInCurrentWeek && <Lock size={10} className="opacity-60" />}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {
                    error && (
                        <div className="mx-6 mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-xs font-bold text-center animate-shake">
                            {error}
                        </div>
                    )
                }

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20">
                    <Button
                        onClick={handleBook}
                        disabled={!selectedTeamId}
                        className="w-full h-12 font-normal uppercase tracking-widest text-lg"
                    >
                        Confirm Match {selectedDay !== 0 && `(on ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][selectedDay]})`}
                    </Button>
                </div>
            </motion.div >
        </div >
    )
}
