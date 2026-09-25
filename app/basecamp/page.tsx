"use client"

import { useGameStore } from "@/store/game-store"
import { useState } from "react"
import Link from "next/link"
import { UI_ASSETS } from "@/lib/ui-assets"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dumbbell,
  HeartPulse,
  ClipboardList,
  Users,
  Building2,
  Zap,
  ArrowUpCircle,
  Trophy,
  Loader2
} from "lucide-react"
import { toast } from "@/lib/toast"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { facilityEffect, facilityWeeklyCost } from "@/engine/organization-effects"

// Hoisted to module scope — this is a static config that was being recreated
// on every render of BasecampPage, including the per-level getStat closures.
const FACILITY_CONFIG = {
  TRAINING: {
    image: UI_ASSETS.facilities.TRAINING,
    label: "Performance Center",
    description: "Improves weekly senior training gains.",
    statLabel: "Weekly development",
    icon: Dumbbell,
    color: "text-cyan-400",
    bgFrom: "from-cyan-500/20",
    border: "hover:border-cyan-500/50"
  },
  RECOVERY: {
    image: UI_ASSETS.facilities.RECOVERY,
    label: "Wellness Lounge",
    description: "Adds recovery to the weekly fatigue calculation.",
    statLabel: "Fatigue Recovery",
    icon: HeartPulse,
    color: "text-emerald-400",
    bgFrom: "from-emerald-500/20",
    border: "hover:border-emerald-500/50"
  },
  TACTICAL: {
    image: UI_ASSETS.facilities.TACTICAL,
    label: "War Room",
    description: "Improves tactic, leadership and teamwork gains in weekly training.",
    statLabel: "Tactical development",
    icon: ClipboardList,
    color: "text-amber-400",
    bgFrom: "from-amber-500/20",
    border: "hover:border-amber-500/50"
  },
  FANZONE: {
    image: UI_ASSETS.facilities.FANZONE,
    label: "Fan Interaction Zone",
    description: "Boosts merchandise revenue and fan base growth.",
    statLabel: "Fan income and growth",
    icon: Users,
    color: "text-rose-400",
    bgFrom: "from-rose-500/20",
    border: "hover:border-rose-500/50"
  }
} as const

export default function BasecampPage() {
  const [selectedFacility, setSelectedFacility] = useState<keyof typeof FACILITY_CONFIG>('TRAINING')
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
    <div className="campus-page text-white">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary opacity-80 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Operations Center</span>
            </div>
            <h1 className="page-title ">
              Club Campus
            </h1>
            <p className="text-white/65 max-w-lg text-sm leading-relaxed font-medium">
              Upgrades activate immediately. Weekly upkeep starts at the next settlement; lower levels cost less to maintain. Facilities cannot currently be sold.
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

        <nav aria-label="Club campus sections" className="flex gap-2">
          <Button asChild variant="secondary"><Link href="/basecamp" aria-current="page">Campus</Link></Button>
          <Button asChild variant="outline"><Link href="/equipment">Equipment</Link></Button>
        </nav>
        <div className="campus-scene" role="group" aria-label="Select a campus facility">
          <Image src={UI_ASSETS.campus} alt="" fill priority sizes="(max-width: 1350px) 1000px, 1500px" className="object-cover" />
          {(['TRAINING','TACTICAL','RECOVERY','FANZONE'] as const).map((type, index) => {
            const positions = [{left:'20%',top:'50%'},{left:'44%',top:'27%'},{left:'65%',top:'37%'},{left:'81%',top:'64%'}]
            const config = FACILITY_CONFIG[type]
            const level = playerTeam.facilities?.find(f => f.type === type)?.level || 0
            return <button key={type} type="button" className="campus-hotspot" style={positions[index]} aria-pressed={selectedFacility === type} aria-controls={`campus-${type}`} onClick={() => {
              setSelectedFacility(type)
              document.getElementById(`campus-${type}`)?.scrollIntoView({block:'nearest',behavior:'auto'})
            }}><span className="flex items-center gap-2"><config.icon size={18} />{config.label}</span><small>{level ? `Level ${level}` : 'Not constructed'}</small></button>
          })}
        </div>
        {/* Every facility remains visible and uses the existing upgrade action. */}
        <div className="campus-facilities relative z-0">
          {(["TRAINING", "RECOVERY", "TACTICAL", "FANZONE"] as const).map((type, i) => {
            const facility = playerTeam.facilities?.find(f => f.type === type)
            const config = FACILITY_CONFIG[type]
            const level = facility?.level || 0
            const nextLevelCost = level === 0 ? 10000 : level * 25000
            const maintenance = Math.floor(facilityWeeklyCost(level))
            const Icon = config.icon


            return (
              <motion.div
                key={type}
                id={`campus-${type}`}
                data-selected={selectedFacility === type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "campus-facility group glass-panel relative overflow-hidden rounded-3xl transition-colors duration-200",
                  config.border
                )}
              >
                {/* Background Image with Gradient Overlay */}
                <div className="absolute inset-0 h-48 z-0">
                  <Image
                    src={config.image}
                    alt={config.label}
                    fill
                    sizes="(max-width: 1050px) 100vw, 50vw"
                    className="object-cover transition-transform duration-700 opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/65 to-black/85" />
                  <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20 mix-blend-overlay", config.bgFrom, "to-transparent")} />
                </div>

                {/* Content */}
                <div className="facility-content relative z-10">
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

                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="facility-description text-sm text-white/60 leading-relaxed">
                    {config.description}
                  </p>

                  {/* Stats Comparison Grid */}
                  <div className="facility-comparison grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Current Stats</p>
                      <div className="flex items-baseline gap-2">
                        <span className={cn("text-xl font-normal", level > 0 ? "text-white" : "text-white/30")}>
                          {facilityEffect(type, level)}
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
                            {facilityEffect(type, level + 1)}
                          </span>
                          <span className="text-xs text-emerald-500/50 font-bold">
                            <ArrowUpCircle className="w-3 h-3 inline mb-0.5" />
                          </span>
                        </div>
                        <div className="mt-2 text-[10px] text-white/55 font-medium flex justify-between">
                          <span>Cost · ${Math.floor(facilityWeeklyCost(level + 1)).toLocaleString()}/wk after upgrade</span>
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
