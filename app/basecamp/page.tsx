"use client"

import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  ShoppingCart,
  Monitor,
  Mouse,
  Keyboard,
  Headphones,
  Armchair,
  Check,
  TrendingUp,
  Dumbbell,
  HeartPulse,
  ClipboardList,
  Users,
  Building2,
  ChevronRight,
  Zap,
  Lock,
  ArrowUpCircle,
  Trophy,
  Loader2
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useMemo } from "react"
import { toast } from "@/lib/toast"
import type { EquipmentItem } from "@/types/game"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import Image from "next/image"

// Hoisted to module scope — this is a static config that was being recreated
// on every render of BasecampPage, including the per-level getStat closures.
const FACILITY_CONFIG = {
  TRAINING: {
    image: "/facilities/training.png",
    label: "Performance Center",
    description: "Optimizes player XP gain and skill development speed.",
    statLabel: "XP Multiplier",
    getStat: (level: number) => `+${level * 10}%`,
    icon: Dumbbell,
    color: "text-cyan-400",
    bgFrom: "from-cyan-500/20",
    border: "hover:border-cyan-500/50"
  },
  RECOVERY: {
    image: "/facilities/recovery.png",
    label: "Wellness Lounge",
    description: "Accelerates fatigue recovery and improves morale.",
    statLabel: "Fatigue Recovery",
    getStat: (level: number) => `-${level * 5} pts/wk`,
    icon: HeartPulse,
    color: "text-emerald-400",
    bgFrom: "from-emerald-500/20",
    border: "hover:border-emerald-500/50"
  },
  TACTICAL: {
    image: "/facilities/tactical.png",
    label: "War Room",
    description: "Unlocks advanced strategic tools and preparation speed.",
    statLabel: "Prep Speed",
    getStat: (level: number) => `+${level * 15}%`,
    icon: ClipboardList,
    color: "text-amber-400",
    bgFrom: "from-amber-500/20",
    border: "hover:border-amber-500/50"
  },
  FANZONE: {
    image: "/facilities/fanzone.png",
    label: "Fan Interaction Zone",
    description: "Boosts merchandise revenue and fan base growth.",
    statLabel: "Merch Revenue",
    getStat: (level: number) => `+${level * 20}%`,
    icon: Users,
    color: "text-rose-400",
    bgFrom: "from-rose-500/20",
    border: "hover:border-rose-500/50"
  }
} as const

export default function BasecampPage() {
  const router = useRouter()
  const upgradeFacility = useGameStore(state => state.upgradeFacility)
  const playerTeam = useCurrentTeam()

  if (!playerTeam) {
    return <div className="flex items-center justify-center h-64 text-white/40"><Loader2 size={20} className="animate-spin mr-2" /> Loading...</div>
  }

  const handleUpgradeFacility = (type: "TRAINING" | "RECOVERY" | "TACTICAL" | "FANZONE") => {
    const facility = playerTeam.facilities?.find(f => f.type === type)
    const currentLevel = facility?.level || 0
    const cost = currentLevel === 0 ? 10000 : currentLevel * 25000

    if (playerTeam.budget < cost) {
      toast.error("Insufficient Funds", {
        description: `You need $${cost.toLocaleString()} to upgrade ${type.toLowerCase()}.`
      })
      return
    }

    upgradeFacility(playerTeam.id, type)
    toast.success("Facility Upgraded", {
      description: `${type} is now level ${currentLevel + 1}!`
    })
  }

  return (
    <div className="min-h-screen text-white p-8">
      <div className="max-w-7xl mx-auto space-y-12">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary opacity-80 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Operations Center</span>
            </div>
            <h1 className="text-5xl font-normal tracking-tighter bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
              BASECAMP
            </h1>
            <p className="text-white/65 max-w-lg text-sm leading-relaxed font-medium">
              Upgrade your infrastructure to gain competitive advantages. Higher level facilities unlock new abilities and passive bonuses.
            </p>
          </div>

          <div className="flex items-center gap-6 glass-card rounded-2xl p-6">
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-white/55 tracking-widest mb-1">Available Budget</p>
              <p className="text-3xl font-normal text-white tracking-tight">${playerTeam.budget.toLocaleString()}</p>
            </div>
            <div className="h-12 w-[1px] bg-white/10" />
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-white/55 tracking-widest mb-1">Global Reputation</p>
              <div className="flex items-center justify-end gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <p className="text-3xl font-normal text-amber-500 tracking-tight">{playerTeam.reputation}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Facilities Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-0">
          {(["TRAINING", "RECOVERY", "TACTICAL", "FANZONE"] as const).map((type, i) => {
            const facility = playerTeam.facilities?.find(f => f.type === type)
            const config = FACILITY_CONFIG[type]
            const level = facility?.level || 0
            const nextLevelCost = level === 0 ? 10000 : level * 25000
            const maintenance = facility?.monthlyCost ? Math.floor(facility.monthlyCost / 4) : 0
            const Icon = config.icon

            const getNextUnlock = (t: string, l: number) => {
              if (t === "TACTICAL") {
                if (l < 1) return "VOD Review"
                if (l < 2) return "Playstyles"
                if (l < 3) return "Antistrat"
              }
              if (t === "RECOVERY") {
                if (l < 2) return "Mental Reset"
              }
              return null
            }
            const nextUnlock = getNextUnlock(type, level)

            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "group glass-panel relative overflow-hidden rounded-3xl transition-all duration-500",
                  config.border
                )}
              >
                {/* Background Image with Gradient Overlay */}
                <div className="absolute inset-0 h-48 z-0">
                  <Image
                    src={config.image}
                    alt={config.label}
                    fill
                    className="object-cover transition-transform duration-700 opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/65 to-black/85" />
                  <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20 mix-blend-overlay", config.bgFrom, "to-transparent")} />
                </div>

                {/* Content */}
                <div className="relative z-10 p-8 pt-32">
                  <div className="flex justify-between items-end mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-black/50 backdrop-blur-md border border-white/10", config.color)}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-normal text-white tracking-tight">{config.label}</h2>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0.5 border-white/10 uppercase tracking-wider", level > 0 ? "text-white/80" : "text-white/40")}>
                            Tier {level}
                          </Badge>
                          {nextUnlock && (
                            <Badge className="bg-white text-black font-normal border border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] text-[10px] px-2 py-0.5 uppercase tracking-wide">
                              Unlock: {nextUnlock}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-white/60 mb-8 min-h-[40px] leading-relaxed">
                    {config.description}
                  </p>

                  {/* Stats Comparison Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Current Stats</p>
                      <div className="flex items-baseline gap-2">
                        <span className={cn("text-xl font-normal", level > 0 ? "text-white" : "text-white/30")}>
                          {config.getStat(level)}
                        </span>
                      </div>
                      <div className="mt-2 text-[10px] text-white/45 font-medium flex justify-between">
                        <span>Maintenance</span>
                        <span className="text-rose-400/80">${maintenance}/wk</span>
                      </div>
                    </div>

                    {level < 5 && (
                      <div className={cn("rounded-xl p-4 border relative overflow-hidden", "bg-white/[0.03] border-white/10")}>

                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Next Level</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-normal text-emerald-400">
                            {config.getStat(level + 1)}
                          </span>
                          <span className="text-xs text-emerald-500/50 font-bold">
                            <ArrowUpCircle className="w-3 h-3 inline mb-0.5" />
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] text-white/55 font-medium flex justify-between">
                          <span>Cost</span>
                          <span className="text-white">${nextLevelCost.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {level === 5 && (
                      <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20 flex items-center justify-center">
                        <span className="text-amber-500 font-normal uppercase tracking-widest text-xs flex items-center gap-2">
                          <Trophy className="w-4 h-4" /> Maxed Out
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => handleUpgradeFacility(type)}
                    disabled={level === 5 || playerTeam.budget < nextLevelCost}
                    className={cn(
                      "w-full h-12 rounded-xl text-xs font-normal uppercase tracking-[0.1em] transition-all relative overflow-hidden group/btn",
                      level === 5
                        ? "bg-white/5 text-white/35 cursor-not-allowed hover:bg-white/5"
                        : "bg-white text-black hover:bg-neutral-200"
                    )}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {level === 5 ? "Fully Upgraded" : level === 0 ? "Construct Facility" : "Upgrade Facility"}
                      {level < 5 && <Zap className="w-3 h-3 group-hover/btn:text-amber-500 transition-colors" />}
                    </span>
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ArrowRightIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
