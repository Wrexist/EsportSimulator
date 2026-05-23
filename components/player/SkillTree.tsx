"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Zap } from "lucide-react"

interface SkillNode {
    id: string
    name: string
    description: string
    icon: React.ReactNode
    cost: number
    unlocked: boolean
    dependencies?: string[]
}

interface SkillTreeProps {
    playerNickname: string
    availablePoints: number
    skills: SkillNode[]
    onUnlock: (skillId: string) => void
    className?: string
}

export function SkillTree({ playerNickname, availablePoints, skills, onUnlock, className }: SkillTreeProps) {
    return (
        <div className={cn("glass-panel p-8", className)}>
            <div className="flex justify-between items-center mb-12">
                <div>
                    <h3 className="text-xl font-normal uppercase tracking-tighter text-white">{playerNickname}'s Progression</h3>
                    <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground mt-1">Specialization Tree</p>
                </div>
                <div className="bg-primary/20 border border-primary/30 px-6 py-2 rounded-2xl flex items-center gap-3">
                    <Zap size={16} className="text-primary" />
                    <span className="text-sm font-normal text-white">{availablePoints} SP Available</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
                {/* Connection Lines (Visual Mockup) */}
                <div className="absolute inset-0 pointer-events-none opacity-10">
                    {/* SVG for lines could go here */}
                </div>

                {skills.map((skill, i) => {
                    const isAvailable = skill.cost <= availablePoints && !skill.unlocked
                    const canAfford = availablePoints >= skill.cost

                    return (
                        <motion.div
                            key={skill.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={cn(
                                "relative p-6 rounded-[24px] border transition-all duration-300 group",
                                skill.unlocked
                                    ? "bg-primary/10 border-primary/30"
                                    : isAvailable
                                        ? "bg-white/5 border-white/10 hover:border-primary/50 cursor-pointer"
                                        : "bg-black/40 border-white/5 opacity-60"
                            )}
                            onClick={() => isAvailable && onUnlock(skill.id)}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl flex items-center justify-center p-0.5",
                                    skill.unlocked ? "bg-primary" : "bg-white/10"
                                )}>
                                    <div className="w-full h-full bg-neutral-950 rounded-[inherit] flex items-center justify-center text-primary">
                                        {skill.icon}
                                    </div>
                                </div>
                                {skill.unlocked && (
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 uppercase text-[8px] font-normal">
                                        Mastered
                                    </Badge>
                                )}
                                {!skill.unlocked && (
                                    <span className="text-[10px] font-normal uppercase text-muted-foreground flex items-center gap-1">
                                        <Zap size={10} /> {skill.cost} SP
                                    </span>
                                )}
                            </div>

                            <h4 className="text-sm font-normal text-white uppercase mb-2">{skill.name}</h4>
                            <p className="text-[10px] leading-relaxed text-muted-foreground font-medium uppercase tracking-wider">{skill.description}</p>

                            {!skill.unlocked && isAvailable && (
                                <div className="mt-4 pt-4 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="w-full py-2 bg-primary text-white text-[10px] font-normal uppercase rounded-xl shadow-lg shadow-primary/20">
                                        Unlock Skill
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-normal border", className)}>
            {children}
        </span>
    )
}
