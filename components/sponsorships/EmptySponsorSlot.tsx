"use client"

import { motion } from "framer-motion"
import { Plus } from "lucide-react"

interface EmptySponsorSlotProps {
  index: number
}

export function EmptySponsorSlot({ index }: EmptySponsorSlotProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-2xl border-2 border-dashed border-white/10 p-5 flex flex-col items-center justify-center min-h-[200px] text-muted-foreground"
    >
      <Plus size={28} className="mb-2 text-white/20" />
      <p className="text-sm font-medium text-white/30">Empty Slot</p>
      <p className="text-xs text-white/20 mt-1">Browse offers below to sign a sponsor</p>
    </motion.div>
  )
}
