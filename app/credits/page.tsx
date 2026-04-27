"use client"

import React from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Heart, Code, Music, Globe, Database } from "lucide-react"
import { useRouter } from "next/navigation"

const CREDITS = [
    {
        category: "Game Design & Development",
        icon: Code,
        entries: [
            { role: "Creator & Lead Developer", name: "IsacC" },
        ],
    },
    {
        category: "Data & Statistics",
        icon: Database,
        entries: [
            { role: "Tournament Structure", name: "Inspired by real-world esports circuits" },
            { role: "World Rankings Model", name: "Custom ranking methodology" },
        ],
    },
    {
        category: "Technology",
        icon: Globe,
        entries: [
            { role: "Framework", name: "Next.js by Vercel" },
            { role: "Desktop Runtime", name: "Electron" },
            { role: "Steam Integration", name: "steamworks.js" },
            { role: "UI Components", name: "Radix UI + Tailwind CSS" },
            { role: "State Management", name: "Zustand with Immer" },
            { role: "Animations", name: "Framer Motion" },
        ],
    },
    {
        category: "Audio",
        icon: Music,
        entries: [
            { role: "Sound Effects", name: "Procedurally generated (Web Audio API)" },
            { role: "Ambient Music", name: "Procedurally generated" },
        ],
    },
    {
        category: "Special Thanks",
        icon: Heart,
        entries: [
            { role: "Tactical FPS Community", name: "For decades of competitive excellence" },
            { role: "Esports Organizations", name: "For inspiring the management simulation" },
            { role: "Open Source Contributors", name: "For the incredible tools that made this possible" },
            { role: "Playtesters & Bug Reporters", name: "Your feedback shaped this game" },
        ],
    },
]

export default function CreditsPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-[#080a0e] text-white p-8">
            <div className="max-w-2xl mx-auto">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-white/40 hover:text-white/80 text-sm mb-8 transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-3xl font-bold uppercase tracking-tighter mb-2">Credits</h1>
                    <p className="text-sm text-white/40 uppercase tracking-widest">Esports Manager: FPS</p>
                    <p className="text-xs text-white/20 mt-1">v{process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}</p>
                </motion.div>

                <div className="space-y-10">
                    {CREDITS.map((section, si) => {
                        const Icon = section.icon
                        return (
                            <motion.div
                                key={section.category}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: si * 0.1 }}
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-cyan-400">
                                        <Icon size={16} />
                                    </div>
                                    <h2 className="text-sm font-medium uppercase tracking-widest text-white/60">{section.category}</h2>
                                </div>
                                <div className="space-y-2 pl-11">
                                    {section.entries.map((entry, ei) => (
                                        <div key={ei} className="flex justify-between items-baseline">
                                            <span className="text-xs text-white/40">{entry.role}</span>
                                            <span className="text-sm text-white/80">{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )
                    })}
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-center mt-16 pt-8 border-t border-white/5"
                >
                    <p className="text-xs text-white/20">
                        This game is a work of fiction. Team names, player likenesses, and tournament structures
                        are used for simulation purposes. No endorsement is implied.
                    </p>
                    <p className="text-xs text-white/10 mt-2">
                        &copy; {new Date().getFullYear()} IsacC. All rights reserved.
                    </p>
                </motion.div>
            </div>
        </div>
    )
}
