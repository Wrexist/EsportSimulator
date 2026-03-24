"use client"

import React from "react"
import { motion } from "framer-motion"
import { X, Swords, Plane, Briefcase, Megaphone } from "lucide-react"

interface ActivityPickerModalProps {
    isOpen: boolean
    onClose: () => void
    week: number
    onSelectType: (type: "SCRIM" | "BOOTCAMP" | "MEETING" | "MARKETING") => void
}

export function ActivityPickerModal({ isOpen, onClose, week, onSelectType }: ActivityPickerModalProps) {
    if (!isOpen) return null

    const handleSelect = (type: "SCRIM" | "BOOTCAMP" | "MEETING" | "MARKETING") => {
        onSelectType(type)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-activity-picker"
                className="glass-panel w-full max-w-lg p-6 shadow-2xl border-white/10"
            >
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 id="modal-title-activity-picker" className="text-xl font-normal uppercase tracking-tighter text-white">Schedule Activity</h2>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">Week {week}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Close dialog">
                        <X size={18} className="text-white/50 hover:text-white" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSelect("SCRIM")}
                        className="group p-4 rounded-xl bg-black/40 border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all text-left flex flex-col gap-3"
                    >
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                            <Swords size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm group-hover:text-purple-300">Find Scrim</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">Practice match against other teams.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => handleSelect("BOOTCAMP")}
                        className="group p-4 rounded-xl bg-black/40 border border-white/5 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all text-left flex flex-col gap-3"
                    >
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                            <Plane size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm group-hover:text-orange-300">Bootcamp</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">Multi-week intensive training.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => handleSelect("MEETING")}
                        className="group p-4 rounded-xl bg-black/40 border border-white/5 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all text-left flex flex-col gap-3"
                    >
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Briefcase size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm group-hover:text-blue-300">Staff Meeting</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">Adjust goals and morale.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => handleSelect("MARKETING")}
                        className="group p-4 rounded-xl bg-black/40 border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all text-left flex flex-col gap-3"
                    >
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                            <Megaphone size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm group-hover:text-emerald-300">Marketing</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">Grow your fanbase and social media.</p>
                        </div>
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
