"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Heart, Trophy, Bell, Zap, Star } from "lucide-react"

// Define our standard animations
export const ANIMATIONS = {
    // 1. Popup Variant (for Modals, Cards)
    popup: {
        initial: { opacity: 0, scale: 0.9, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 10 },
        transition: { type: "spring" as const, damping: 25, stiffness: 300 }
    },
    // 2. Slide In (for Notifications, Toasts)
    slideInRight: {
        initial: { opacity: 0, x: 50 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 50 },
        transition: { type: "spring" as const, damping: 30, stiffness: 400 }
    },
    // 3. Pulse Glow (Attract attention)
    pulseGlow: {
        animate: {
            boxShadow: [
                "0 0 0px rgba(59, 130, 246, 0)",
                "0 0 20px rgba(59, 130, 246, 0.5)",
                "0 0 0px rgba(59, 130, 246, 0)"
            ],
            transition: { duration: 2, repeat: Infinity }
        }
    },
    // 4. Juicy Bounce (for Score updates, Counters)
    juicyBounce: {
        initial: { scale: 1 },
        animate: { scale: [1, 1.4, 0.9, 1] },
        transition: { duration: 0.4 }
    },
    // 5. Shake (Error state)
    shake: {
        animate: { x: [0, -5, 5, -5, 5, 0] },
        transition: { duration: 0.4 }
    }
}

export function AnimationShowcase() {
    const [activeDemo, setActiveDemo] = useState<string | null>(null)
    const [counter, setCounter] = useState(0)

    return (
        <div className="p-6 space-y-8 bg-neutral-900/90 text-white rounded-xl border border-white/10 max-w-3xl mx-auto backdrop-blur-md">
            <div className="border-b border-white/10 pb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    Animation Lab
                </h2>
                <p className="text-white/50 text-sm">Testing ground for "Juicy" UI interactions</p>
            </div>

            <div className="grid grid-cols-2 gap-8">
                {/* 1. Popups */}
                <div className="space-y-4">
                    <h3 className="font-bold text-cyan-400 uppercase tracking-wider text-xs flex items-center gap-2">
                        <Star size={14} /> Popup / Modal
                    </h3>
                    <div className="h-40 bg-white/5 rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5 border-dashed">
                        <AnimatePresence>
                            {activeDemo === 'popup' && (
                                <motion.div
                                    {...ANIMATIONS.popup} // Spread our defined animation
                                    className="bg-neutral-800 p-4 rounded-xl border border-white/20 shadow-xl flex flex-col items-center gap-2"
                                >
                                    <Trophy className="text-yellow-400" size={32} />
                                    <span className="font-bold">Winner!</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                            <Button size="sm" variant="ghost" onClick={() => setActiveDemo(activeDemo === 'popup' ? null : 'popup')}>
                                Toggle Popup
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 2. Notifications */}
                <div className="space-y-4">
                    <h3 className="font-bold text-cyan-400 uppercase tracking-wider text-xs flex items-center gap-2">
                        <Bell size={14} /> Toasts / Slides
                    </h3>
                    <div className="h-40 bg-white/5 rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5 border-dashed">
                        <AnimatePresence>
                            {activeDemo === 'toast' && (
                                <motion.div
                                    {...ANIMATIONS.slideInRight}
                                    className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 p-3 rounded-lg flex items-center gap-3 shadow-lg"
                                >
                                    <Bell size={16} />
                                    <span className="text-sm font-bold">New Notification</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                            <Button size="sm" variant="ghost" onClick={() => {
                                setActiveDemo(null)
                                setTimeout(() => setActiveDemo('toast'), 100)
                            }}>
                                Trigger Toast
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 3. Juicy Feedback */}
                <div className="space-y-4">
                    <h3 className="font-bold text-cyan-400 uppercase tracking-wider text-xs flex items-center gap-2">
                        <Heart size={14} /> Juicy Feedback
                    </h3>
                    <div className="h-40 bg-white/5 rounded-xl flex flex-col items-center justify-center gap-4 border border-white/5 border-dashed">
                        <div className="flex items-center gap-4">
                            <motion.div
                                key={counter} // Key change triggers animation
                                {...ANIMATIONS.juicyBounce}
                                className="text-4xl font-black text-white"
                            >
                                {counter}
                            </motion.div>
                            <Button
                                size="sm"
                                onClick={() => setCounter(c => c + 1)}
                                className="bg-blue-600 hover:bg-blue-500"
                            >
                                <Zap size={14} className="mr-2" /> Increment
                            </Button>
                        </div>
                        <p className="text-xs text-white/40">Click increment to see the "Juicy Bounce"</p>
                    </div>
                </div>

                {/* 4. Attention Grabbers */}
                <div className="space-y-4">
                    <h3 className="font-bold text-cyan-400 uppercase tracking-wider text-xs flex items-center gap-2">
                        <Zap size={14} /> Attention Grabbers
                    </h3>
                    <div className="h-40 bg-white/5 rounded-xl flex items-center justify-center border border-white/5 border-dashed">
                        <motion.button
                            {...ANIMATIONS.pulseGlow}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg"
                        >
                            IMPORTANT ACTION
                        </motion.button>
                    </div>
                </div>
            </div>

            <div className="text-xs text-white/30 pt-4 border-t border-white/5">
                <p>Developers: Import `ANIMATIONS` from `@/components/debug/AnimationShowcase` to use these presets.</p>
            </div>
        </div>
    )
}
