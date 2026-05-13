"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { DollarSign, Handshake, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SponsorSaveData } from "@/engine/save-types"
import { ActiveSponsorCard } from "@/components/sponsorships/ActiveSponsorCard"
import { SponsorOfferCard } from "@/components/sponsorships/SponsorOfferCard"
import { EmptySponsorSlot } from "@/components/sponsorships/EmptySponsorSlot"
import { EmptyState } from "@/src/components/ui/EmptyState"

const MAX_SPONSORS = 3

export default function SponsorshipsPage() {
  const router = useRouter()
  const {
    teams,
    playerTeamId,
    sponsorOffers,
    signSponsor,
    declineSponsorOffer,
    refreshSponsorOffers,
    currentWeek,
    completedMatches,
    tournaments,
    _hasHydrated,
    isInitialized,
  } = useGameStore(useShallow(state => ({
    teams: state.teams,
    playerTeamId: state.playerTeamId,
    sponsorOffers: state.sponsorOffers,
    signSponsor: state.signSponsor,
    declineSponsorOffer: state.declineSponsorOffer,
    refreshSponsorOffers: state.refreshSponsorOffers,
    currentWeek: state.currentWeek,
    completedMatches: state.completedMatches,
    tournaments: state.tournaments,
    _hasHydrated: state._hasHydrated,
    isInitialized: state.isInitialized,
  })))

  const isSessionActive = isInitialized || (teams.length > 0 && !!playerTeamId)

  // Session guard
  useEffect(() => {
    if (_hasHydrated && !isSessionActive) {
      router.push("/main-menu")
    }
  }, [_hasHydrated, isSessionActive, router])

  // Generate initial offers if empty
  useEffect(() => {
    if (_hasHydrated && isSessionActive && sponsorOffers.length === 0) {
      refreshSponsorOffers()
    }
  }, [_hasHydrated, isSessionActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const playerTeam = teams.find(t => t.id === playerTeamId)
  const activeSponsors = playerTeam?.sponsors || []
  const emptySlots = MAX_SPONSORS - activeSponsors.length
  const sponsorSlotsFull = activeSponsors.length >= MAX_SPONSORS

  // Calculate total weekly sponsor income
  const totalWeeklyIncome = useMemo(() => {
    if (!playerTeam) return 0
    const repFactor = 0.7 + (playerTeam.reputation / 100) * 0.6
    return Math.floor(activeSponsors.reduce((sum, s) => sum + s.weeklyPayout * repFactor, 0))
  }, [activeSponsors, playerTeam])

  // Determine lock state per offer
  const getOfferLockState = (offer: SponsorSaveData) => {
    if (!playerTeam) return { isLocked: true, lockReason: "No team found" }
    const ranking = playerTeam.worldRanking || 999

    if (offer.tier === "PREMIUM" && ranking > 30) {
      return { isLocked: true, lockReason: "Requires Top 30 World Ranking" }
    }
    if (offer.tier === "ELITE") {
      const hasMajorTrophy = (playerTeam.trophies || []).some((t: any) => t.tier === "S_TIER")
      const hasMajorParticipation = completedMatches.some(match => {
        if (match.homeTeamId !== playerTeamId && match.awayTeamId !== playerTeamId) return false
        if (!match.tournamentId) return false
        const tournament = tournaments.find(t => t.id === match.tournamentId)
        return tournament?.tier === "S_TIER"
      })
      const isTopRanked = ranking <= 10
      if (!hasMajorTrophy && !hasMajorParticipation && !isTopRanked) {
        return { isLocked: true, lockReason: "Requires Top 10 Ranking or Major Participation" }
      }
    }

    // Check if tier already occupied
    if (activeSponsors.some(s => s.tier === offer.tier)) {
      return { isLocked: true, lockReason: `Already have a ${offer.tier.toLowerCase()} sponsor` }
    }

    return { isLocked: false, lockReason: "" }
  }

  const handleAccept = (offer: SponsorSaveData) => {
    if (!playerTeam) return
    const result = signSponsor(playerTeam.id, {
      ...offer,
      signedWeek: currentWeek || 1,
    })

    if (result.success) {
      toast.success("Sponsor Signed!", {
        description: `${offer.remainingWeeks}-week deal with ${offer.name} for $${offer.weeklyPayout.toLocaleString()}/wk.`,
      })
    } else {
      toast.error("Unable to Sign Sponsor", { description: result.message })
    }
  }

  const handleDecline = (offerId: string) => {
    declineSponsorOffer(offerId)
    toast("Offer Declined", { description: "This offer has been removed." })
  }

  if (!_hasHydrated || !isSessionActive || !playerTeam) return null

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-normal tracking-tight uppercase">
            Sponsorship Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage partnerships and maximize your sponsorship revenue.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Weekly Income</p>
              <p className="text-lg font-bold text-green-400">${totalWeeklyIncome.toLocaleString()}</p>
            </div>
          </div>
          <Badge variant="outline" className="h-10 px-3 border-white/10 bg-white/5 text-sm">
            <Handshake size={14} className="mr-1.5" />
            {activeSponsors.length}/{MAX_SPONSORS} Slots
          </Badge>
        </div>
      </div>

      {/* Active Sponsors Section */}
      <div>
        <h2 className="text-lg font-medium tracking-tight mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" />
          Active Partnerships
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {activeSponsors.map((sponsor, i) => (
              <ActiveSponsorCard key={sponsor.id} sponsor={sponsor} index={i} />
            ))}
          </AnimatePresence>
          {Array.from({ length: emptySlots }).map((_, i) => (
            <EmptySponsorSlot key={`empty-${i}`} index={activeSponsors.length + i} />
          ))}
        </div>
      </div>

      {/* Available Offers Section */}
      <div>
        <h2 className="text-lg font-medium tracking-tight mb-4 flex items-center gap-2">
          <Handshake size={18} className="text-primary" />
          Available Offers
          <span className="text-xs text-muted-foreground ml-2">Refreshed weekly</span>
        </h2>
        {sponsorOffers.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No Offers This Week"
            description="The sponsorship market refreshes weekly. Improve your team's reputation and rankings to attract better offers."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {sponsorOffers.map((offer, i) => {
                const { isLocked, lockReason } = getOfferLockState(offer)
                return (
                  <SponsorOfferCard
                    key={offer.id}
                    offer={offer}
                    index={i}
                    isLocked={isLocked}
                    lockReason={lockReason}
                    sponsorSlotsFull={sponsorSlotsFull}
                    onAccept={() => handleAccept(offer)}
                    onDecline={() => handleDecline(offer.id)}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
