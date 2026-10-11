"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Check, Lock } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { EconomyEngine } from "@/engine/economy-engine"
import type { SponsorSaveData } from "@/engine/save-types"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { soundManager } from "@/lib/sound-manager"
import { ActiveDealsTable, OffersTable, TierTag, type OfferRowState } from "@/components/sponsorships/SponsorTables"

const MAX_SPONSORS = 3
const RESIGN_COOLDOWN_WEEKS = 16 // engine/processors/sponsor-goals-processor.ts
const money = (v: number) => formatCurrency(v, "$", false)

export default function SponsorshipsPage() {
  const router = useRouter()
  const {
    playerTeamId, sponsorOffers, signSponsor, declineSponsorOffer, refreshSponsorOffers,
    currentWeek, completedMatches, tournaments, _hasHydrated,
  } = useGameStore(useShallow(state => ({
    playerTeamId: state.playerTeamId,
    sponsorOffers: state.sponsorOffers,
    signSponsor: state.signSponsor,
    declineSponsorOffer: state.declineSponsorOffer,
    refreshSponsorOffers: state.refreshSponsorOffers,
    currentWeek: state.currentWeek,
    completedMatches: state.completedMatches,
    tournaments: state.tournaments,
    _hasHydrated: state._hasHydrated,
  })))
  const team = useCurrentTeam()
  const isSessionActive = !!team && !!playerTeamId

  useEffect(() => {
    if (_hasHydrated && !isSessionActive) router.push("/main-menu")
  }, [_hasHydrated, isSessionActive, router])

  useEffect(() => {
    if (_hasHydrated && isSessionActive && sponsorOffers.length === 0) refreshSponsorOffers()
  }, [_hasHydrated, isSessionActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeSponsors = useMemo(() => team?.sponsors ?? [], [team?.sponsors])
  const weeklyIncome = useMemo(() => team ? EconomyEngine.calculateSponsorIncome(team) : 0, [team])

  // Same gates as signSponsor in the store.
  const gates = useMemo(() => {
    if (!team) return null
    const tournamentsById = new Map(tournaments.map(t => [t.id, t]))
    const hasMajorTrophy = (team.trophies || []).some(t => t.tier === "S_TIER")
    const hasMajorParticipation = completedMatches.some(match => {
      if (match.homeTeamId !== playerTeamId && match.awayTeamId !== playerTeamId) return false
      return !!match.tournamentId && tournamentsById.get(match.tournamentId)?.tier === "S_TIER"
    })
    const ranking = team.worldRanking || 999
    return {
      ranking,
      premiumOpen: ranking <= 30,
      eliteOpen: ranking <= 10 || hasMajorTrophy || hasMajorParticipation,
      occupied: new Set(activeSponsors.map(s => String(s.tier).replace("BASIC", "STANDARD"))),
      names: new Set(activeSponsors.map(s => s.name)),
      cooldowns: team.sponsorCooldowns ?? {},
    }
  }, [team, tournaments, completedMatches, playerTeamId, activeSponsors])

  if (!_hasHydrated || !isSessionActive || !team || !gates) return null

  const slotsFull = activeSponsors.length >= MAX_SPONSORS
  const repFactor = EconomyEngine.sponsorReputationFactor(team.reputation)
  const floor = EconomyEngine.sponsorFloor(team.reputation)
  const openBonuses = activeSponsors.flatMap(s => s.goals ?? []).filter(g => !g.isCompleted).reduce((sum, g) => sum + g.bonusPayout, 0)
  const season = Math.ceil(currentWeek / 52)

  const lockReason = (offer: SponsorSaveData): string | null => {
    if (offer.tier === "PREMIUM" && !gates.premiumOpen) return "Needs a top-30 world ranking"
    if (offer.tier === "ELITE" && !gates.eliteOpen) return "Needs top 10, or a Major appearance"
    if (gates.occupied.has(offer.tier)) return `You already have a ${offer.tier.toLowerCase()} deal`
    if (gates.names.has(offer.name)) return "Already signed"
    const cooldown = gates.cooldowns[offer.name]
    if (typeof cooldown === "number" && cooldown > currentWeek) return `Won't return for ${cooldown - currentWeek} wks`
    return null
  }

  const offerRows: OfferRowState[] = sponsorOffers.map(offer => ({
    offer,
    incomeChange: EconomyEngine.calculateSponsorIncome({ ...team, sponsors: [...activeSponsors, offer] }) - weeklyIncome,
    lockReason: lockReason(offer),
  }))

  const handleAccept = (offer: SponsorSaveData) => {
    const result = signSponsor(team.id, { ...offer, signedWeek: currentWeek || 1 })
    if (result.success) soundManager.play("money")
    if (result.success) toast.success(`${offer.name} signed`, { description: `${offer.remainingWeeks} weeks at ${money(offer.weeklyPayout)}/wk base.` })
    else toast.error("Couldn't sign", { description: result.message })
  }
  const handleDecline = (offerId: string) => {
    declineSponsorOffer(offerId)
    toast("Offer declined")
  }

  const tiers = [
    { tier: "STANDARD", open: true, need: "Always available" },
    { tier: "PREMIUM", open: gates.premiumOpen, need: "Top-30 world ranking" },
    { tier: "ELITE", open: gates.eliteOpen, need: "Top 10, a Major title or a Major appearance" },
  ]

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow={`Season ${season} · Club`}
        title="Sponsors"
        subtitle="Three slots, one deal per tier. Goals pay a one-off bonus when reached; missing one costs nothing."
        aside={
          <KpiStrip>
            <Kpi label="Sponsor income / wk" value={formatCurrency(weeklyIncome, "$", true)} hint={weeklyIncome <= floor ? "Base partners only" : undefined} />
            <Kpi label="Slots" value={`${activeSponsors.length} / ${MAX_SPONSORS}`} />
            <Kpi label="World rank" value={gates.ranking >= 999 ? "—" : `#${gates.ranking}`} />
            <Kpi label="Open bonuses" value={formatCurrency(openBonuses, "$", true)} />
          </KpiStrip>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Active deals" actions={<span className="text-xs text-ink-3">{activeSponsors.length} of {MAX_SPONSORS} slots</span>} padded={false}>
            {activeSponsors.length > 0
              ? <ActiveDealsTable sponsors={activeSponsors} currentWeek={currentWeek} repFactor={repFactor} />
              : <p className="px-4 py-6 text-sm text-ink-3">No deals yet. Sign one from this week&apos;s offers below.</p>}
          </Panel>

          <Panel title="Offers this week" actions={<span className="text-xs text-ink-3">New offers every week</span>} padded={false}>
            {offerRows.length > 0
              ? <OffersTable rows={offerRows} slotsFull={slotsFull} onAccept={handleAccept} onDecline={handleDecline} />
              : <p className="px-4 py-6 text-sm text-ink-3">No offers left this week. New ones arrive at the next weekly update.</p>}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel title="Tiers" padded={false}>
            <ul className="divide-y divide-line">
              {tiers.map(t => {
                const taken = gates.occupied.has(t.tier)
                return (
                  <li key={t.tier} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <TierTag tier={t.tier} />
                      <p className="mt-1 text-xs text-ink-3">{t.need}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", taken ? "text-ink-2" : t.open ? "text-positive" : "text-ink-3")}>
                      {taken ? "Signed" : t.open ? <><Check size={12} /> Open</> : <><Lock size={12} /> Locked</>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel title="How deals pay">
            <ul className="space-y-3 text-sm text-ink-2">
              <li>Each deal pays its base × your reputation factor (now <span className="tabular-nums text-ink-1">×{repFactor.toFixed(2)}</span>) every week.</li>
              <li>Every club also earns base partner income from its reputation (<span className="tabular-nums text-ink-1">{money(floor)}</span>/wk). Each signed deal adds its payout on top.</li>
              <li>Brand effects apply every week of the deal: reputation, the whole roster&apos;s morale, followers.</li>
              <li>Goal bonuses are paid once, on the week you reach them. There is no penalty for missing a goal.</li>
              <li>When a deal ends, that brand won&apos;t sign again for {RESIGN_COOLDOWN_WEEKS} weeks.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
