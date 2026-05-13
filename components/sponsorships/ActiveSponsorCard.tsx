"use client"

import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { DollarSign, Clock, Target, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SponsorSaveData } from "@/engine/save-types"

const TIER_STYLES = {
  STANDARD: { border: "border-blue-500/20", bg: "bg-blue-500/5", badge: "bg-blue-500/20 text-blue-400", glow: "" },
  PREMIUM: { border: "border-purple-500/20", bg: "bg-purple-500/5", badge: "bg-purple-500/20 text-purple-400", glow: "shadow-purple-500/5" },
  ELITE: { border: "border-amber-500/20", bg: "bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", glow: "shadow-amber-500/10" },
}

interface ActiveSponsorCardProps {
  sponsor: SponsorSaveData
  index: number
}

export function ActiveSponsorCard({ sponsor, index }: ActiveSponsorCardProps) {
  const style = TIER_STYLES[sponsor.tier]
  const totalWeeks = sponsor.tier === "ELITE" ? 48 : sponsor.tier === "PREMIUM" ? 24 : 12
  const elapsed = totalWeeks - sponsor.remainingWeeks
  const progress = Math.min(100, (elapsed / totalWeeks) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn("glass-panel rounded-2xl p-5 space-y-4", style.border, style.bg, style.glow)}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-white text-lg">{sponsor.name}</h3>
          <Badge className={cn("mt-1", style.badge)}>{sponsor.tier}</Badge>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-green-400 font-bold text-lg">
            <DollarSign size={16} />
            {sponsor.weeklyPayout.toLocaleString()}
            <span className="text-xs text-muted-foreground font-normal">/wk</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock size={12} /> Contract Duration</span>
          <span>{sponsor.remainingWeeks} weeks remaining</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {sponsor.goals && sponsor.goals.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Target size={12} /> Performance Goals
          </span>
          {sponsor.goals.map((goal) => (
            <div key={goal.id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/80">{goal.description}</span>
                <span className={cn(goal.isCompleted ? "text-emerald-400 font-bold" : "text-white/50")}>
                  {goal.current}/{goal.target}
                  {goal.isCompleted && <CheckCircle size={10} className="inline ml-1" />}
                </span>
              </div>
              <Progress value={Math.min(100, (goal.current / goal.target) * 100)} className="h-1" />
              {goal.isCompleted && (
                <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Bonus Secured: ${goal.bonusPayout.toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
