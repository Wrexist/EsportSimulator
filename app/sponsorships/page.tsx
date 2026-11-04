"use client"
import { Trans } from "@/lib/trans"
import { intlLocale, t, tn } from "@/lib/i18n"

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
import { ActiveDealsTable, OffersTable, TierTag, tierLabel, type OfferRowState } from "@/components/sponsorships/SponsorTables"
import { storedText } from "@/lib/stored-text"

const MAX_SPONSORS = 3
const RESIGN_COOLDOWN_WEEKS = 16 // engine/processors/sponsor-goals-processor.ts
const money = (v: number) => formatCurrency(v, "$", false)

export default function SponsorshipsPage() {
  const router = useRouter()
  const {
    playerTeamId, sponsorOffers, signSponsor, declineSponsorOffer, refreshSponsorOffers,
    currentWeek, completedMatches, tournaments, _hasHydrated, isLoading,
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
    isLoading: state.isLoading,
  })))
  const team = useCurrentTeam()
  const isSessionActive = !!team && !!playerTeamId

  // On a full reload the store is hydrated while loadGame() is still running
  // (isLoading), so wait for the save to finish loading before bouncing.
  useEffect(() => {
    if (_hasHydrated && !isLoading && !isSessionActive) router.push("/main-menu")
  }, [_hasHydrated, isLoading, isSessionActive, router])

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
    if (offer.tier === "PREMIUM" && !gates.premiumOpen) return t("sp.lock.premium")
    if (offer.tier === "ELITE" && !gates.eliteOpen) return t("sp.lock.elite")
    if (gates.occupied.has(offer.tier)) return t("sp.lock.occupied", { tier: tierLabel(offer.tier) })
    if (gates.names.has(offer.name)) return t("sp.lock.signed")
    const cooldown = gates.cooldowns[offer.name]
    if (typeof cooldown === "number" && cooldown > currentWeek) return tn("sp.cooldown", cooldown - currentWeek)
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
    if (result.success) toast.success(t("sp.signed", { name: offer.name }), { description: t("sp.signedBody", { weeks: offer.remainingWeeks, amount: money(offer.weeklyPayout) }) })
    else toast.error(t("sp.couldNotSign"), { description: storedText(result.message) })
  }
  const handleDecline = (offerId: string) => {
    declineSponsorOffer(offerId)
    toast(t("sp.declined"))
  }

  const tiers = [
    { tier: "STANDARD", open: true },
    { tier: "PREMIUM", open: gates.premiumOpen },
    { tier: "ELITE", open: gates.eliteOpen },
  ]

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow={t("sp.eyebrow", { n: season })}
        title={t("sp.title")}
        subtitle={t("sp.subtitle")}
        aside={
          <KpiStrip>
            <Kpi label={t("sp.kpi.income")} value={formatCurrency(weeklyIncome, "$", true)} hint={weeklyIncome <= floor ? t("sp.kpi.baseOnly") : undefined} />
            <Kpi label={t("sp.kpi.slots")} value={`${activeSponsors.length} / ${MAX_SPONSORS}`} />
            <Kpi label={t("sp.kpi.rank")} value={gates.ranking >= 999 ? "—" : `#${gates.ranking}`} />
            <Kpi label={t("sp.kpi.bonuses")} value={formatCurrency(openBonuses, "$", true)} />
          </KpiStrip>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title={t("sp.active")} actions={<span className="text-xs text-ink-3">{t("sp.slotsOf", { n: activeSponsors.length, max: MAX_SPONSORS })}</span>} padded={false}>
            {activeSponsors.length > 0
              ? <ActiveDealsTable sponsors={activeSponsors} currentWeek={currentWeek} repFactor={repFactor} />
              : <p className="px-4 py-6 text-sm text-ink-3">{t("sp.noDeals")}</p>}
          </Panel>

          <Panel title={t("sp.offers")} actions={<span className="text-xs text-ink-3">{t("sp.newWeekly")}</span>} padded={false}>
            {offerRows.length > 0
              ? <OffersTable rows={offerRows} slotsFull={slotsFull} onAccept={handleAccept} onDecline={handleDecline} />
              : <p className="px-4 py-6 text-sm text-ink-3">{t("sp.noOffers")}</p>}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel title={t("sp.tiers")} padded={false}>
            <ul className="divide-y divide-line">
              {tiers.map(tier => {
                const taken = gates.occupied.has(tier.tier)
                return (
                  <li key={tier.tier} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <TierTag tier={tier.tier} />
                      <p className="mt-1 text-xs text-ink-3">{t(`sp.need.${tier.tier}`)}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", taken ? "text-ink-2" : tier.open ? "text-positive" : "text-ink-3")}>
                      {taken ? t("sp.taken") : tier.open ? <><Check size={12} /> {t("sp.open")}</> : <><Lock size={12} /> {t("sp.locked")}</>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel title={t("sp.how")}>
            <ul className="space-y-3 text-sm text-ink-2">
              <li><Trans k="sp.how.1" params={{ factor: repFactor.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} tags={{ b: x => <span className="tabular-nums text-ink-1">{x}</span> }} /></li>
              <li><Trans k="sp.how.2" params={{ amount: money(floor) }} tags={{ b: x => <span className="tabular-nums text-ink-1">{x}</span> }} /></li>
              <li>{t("sp.how.3")}</li>
              <li>{t("sp.how.4")}</li>
              <li>{t("sp.how.5", { n: RESIGN_COOLDOWN_WEEKS })}</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
