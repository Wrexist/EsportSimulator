"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DollarSign, Clock, Target, Lock, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SponsorSaveData } from "@/engine/save-types"

const TIER_STYLES = {
  STANDARD: { border: "border-blue-500/20", bg: "bg-blue-500/5", badge: "bg-blue-500/20 text-blue-400", accent: "blue" },
  PREMIUM: { border: "border-purple-500/20", bg: "bg-purple-500/5", badge: "bg-purple-500/20 text-purple-400", accent: "purple" },
  ELITE: { border: "border-amber-500/20", bg: "bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", accent: "amber" },
}

interface SponsorOfferCardProps {
  offer: SponsorSaveData
  index: number
  isLocked: boolean
  lockReason: string
  sponsorSlotsFull: boolean
  onAccept: () => void
  onDecline: () => void
}

function SponsorOfferCardImpl({ offer, index, isLocked, lockReason, sponsorSlotsFull, onAccept, onDecline }: SponsorOfferCardProps) {
  const style = TIER_STYLES[offer.tier]
  const disabled = isLocked || sponsorSlotsFull

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.08 }}
      className={cn(
        "glass-panel rounded-2xl overflow-hidden relative",
        style.border, style.bg,
        isLocked && "opacity-60"
      )}
    >
      {isLocked && (
        <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center backdrop-blur-[1px] rounded-2xl">
          <div className="text-center space-y-2">
            <Lock size={24} className="mx-auto text-white/40" />
            <p className="text-xs text-white/60 px-4">{lockReason}</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-white">{offer.name}</h3>
            <Badge className={cn("mt-1", style.badge)}>{offer.tier}</Badge>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-green-400 font-bold text-xl">
              <DollarSign size={16} />
              {offer.weeklyPayout.toLocaleString()}
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">per week</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={12} /> {offer.remainingWeeks} weeks
          </span>
          {offer.requirements !== "None" && (
            <span className="text-amber-400/80">{offer.requirements}</span>
          )}
        </div>

        {offer.goals && offer.goals.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Target size={10} /> Performance Bonuses
            </span>
            {offer.goals.map((goal) => (
              <div key={goal.id} className="flex justify-between text-xs">
                <span className="text-white/70">{goal.description} ({goal.target})</span>
                <span className="text-emerald-400 font-semibold">+${goal.bonusPayout.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1 font-bold"
            disabled={disabled}
            onClick={onAccept}
          >
            <Check size={14} className="mr-1" />
            {sponsorSlotsFull ? "Slots Full" : "Accept"}
          </Button>
          <Button
            variant="outline"
            className="border-white/10 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 disabled:opacity-40"
            onClick={onDecline}
            disabled={isLocked}
            aria-label="Decline offer"
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

export const SponsorOfferCard = memo(SponsorOfferCardImpl)
