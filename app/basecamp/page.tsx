"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ArrowRight, ClipboardList, Dumbbell, HeartPulse, Users } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { UI_ASSETS } from "@/lib/ui-assets"
import { EconomyEngine } from "@/engine/economy-engine"
import { EquipmentManager } from "@/engine/equipment-manager"
import { facilityEffect, facilityWeeklyCost } from "@/engine/organization-effects"
import { FACILITY_EDGE_PER_LEVEL, NON_PLAYER_BONUS_CAP } from "@/engine/match/round-sim/team-edge"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { soundManager } from "@/lib/sound-manager"
import { GearCatalog } from "./_components/GearCatalog"
import { FACILITY_EDGE_MAX_LEVELS, facilityEdgePct } from "./_components/facility-edge"

type FacilityType = "TRAINING" | "TACTICAL" | "RECOVERY" | "FANZONE"
type Tab = "buildings" | "gear"

const MAX_LEVEL = 5
// Mirrors store/slices/team-facilities-slice.ts.
const BUILD_COST = 10_000
const UPGRADE_COST_PER_LEVEL = 25_000

const FACILITIES: { type: FacilityType; label: string; what: string; icon: typeof Dumbbell; spot: { left: string; top: string } }[] = [
  { type: "TRAINING", label: "Performance Center", what: "Weekly training gains", icon: Dumbbell, spot: { left: "20%", top: "50%" } },
  { type: "TACTICAL", label: "War Room", what: "Tactic, leadership and teamwork gains", icon: ClipboardList, spot: { left: "44%", top: "27%" } },
  { type: "RECOVERY", label: "Wellness Lounge", what: "Weekly fatigue recovery", icon: HeartPulse, spot: { left: "65%", top: "37%" } },
  { type: "FANZONE", label: "Fan Zone", what: "Fan income and follower growth", icon: Users, spot: { left: "81%", top: "64%" } },
]

const money = (v: number) => formatCurrency(v, "$", false)
const pct = (v: number) => `+${v.toFixed(v % 1 ? 1 : 0)}%`

function LevelPips({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={cn("h-2 w-4 rounded-sm", i < level ? "bg-ink-1" : "bg-hover")} />
      ))}
    </span>
  )
}

export default function BasecampPage() {
  const { upgradeFacility, players, contracts, staff, currentWeek, academyCount } = useGameStore(useShallow(state => ({
    upgradeFacility: state.upgradeFacility,
    players: state.players,
    contracts: state.contracts,
    staff: state.staff,
    currentWeek: state.currentWeek,
    academyCount: state.academyPlayers.length,
  })))
  const team = useCurrentTeam()
  const [selected, setSelected] = useState<FacilityType | null>(null)
  const [tab, setTab] = useState<Tab>("buildings")

  // `?tab=gear` (the old /equipment route redirects here).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "gear") setTab("gear")
  }, [])
  const changeTab = (value: string) => {
    const next: Tab = value === "gear" ? "gear" : "buildings"
    setTab(next)
    const url = new URL(window.location.href)
    if (next === "gear") url.searchParams.set("tab", "gear")
    else url.searchParams.delete("tab")
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
  }

  const settlement = useMemo(() => team
    ? EconomyEngine.processWeeklyFinances(team, players, contracts, staff, currentWeek + 1, academyCount).expenses
    : null, [team, players, contracts, staff, currentWeek, academyCount])

  if (!team) return <LoadingState message="Loading facilities…" size="lg" className="min-h-[50vh]" />

  const upkeep = settlement?.facilities ?? 0
  const gearUpkeep = EquipmentManager.calculateWeeklyCost(team)
  const levelOf = (type: FacilityType) => team.facilities?.find(f => f.type === type)?.level ?? 0
  const built = (team.facilities ?? []).filter(f => (f.level ?? 0) > 0)
  const { pct: facilityPct, avgLevel } = facilityEdgePct(team)
  const gearPct = EquipmentManager.strengthBonus(team) * 100
  const gearCap = EquipmentManager.STRENGTH_CAP * 100
  const season = Math.ceil(currentWeek / 52)

  const handleUpgrade = (type: FacilityType, label: string) => {
    const result = upgradeFacility(team.id, type)
    if (result.success) soundManager.play("facilityUpgrade")
    if (result.success) toast.success(`${label} upgraded`, { description: result.message })
    else toast.error("Upgrade failed", { description: result.message })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow={`Season ${season} · Club`}
        title="Facilities"
        subtitle="Buildings and gear. Both add a share of team strength in matches; purchases apply at once, upkeep from the next weekly settlement."
        aside={
          <KpiStrip>
            <Kpi label="Funds" value={formatCurrency(team.budget, "$", true)} />
            <Kpi label="Buildings" value={pct(facilityPct)} hint={built.length > 0 ? `Avg level ${avgLevel.toFixed(1)}` : "Base campus"} />
            <Kpi label="Gear" value={pct(gearPct)} hint={`of +${gearCap.toFixed(0)}% max`} />
            <Kpi label="Upkeep / wk" value={formatCurrency(upkeep + gearUpkeep, "$", true)} hint={`${formatCurrency(upkeep, "$", true)} buildings · ${formatCurrency(gearUpkeep, "$", true)} gear`} />
          </KpiStrip>
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Facilities sections">
          <TabsTrigger value="buildings">Buildings</TabsTrigger>
          <TabsTrigger value="gear">Gear</TabsTrigger>
        </TabsList>

        <TabsContent value="buildings" className="space-y-5 pt-3">
          <div className="campus-scene" role="group" aria-label="Select a facility">
            <Image src={UI_ASSETS.campus} alt="" fill priority sizes="1600px" className="object-cover" />
            {FACILITIES.map(f => {
              const level = levelOf(f.type)
              return (
                <button
                  key={f.type}
                  type="button"
                  className="campus-hotspot"
                  style={f.spot}
                  aria-pressed={selected === f.type}
                  onClick={() => { setSelected(f.type); document.getElementById(`facility-${f.type}`)?.scrollIntoView({ block: "nearest" }) }}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold"><f.icon size={16} />{f.label}</span>
                  <small>{level ? `Level ${level}` : "Not built"}</small>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                  <thead data-slot="table-header">
                    <tr className="border-b border-line">
                      <th data-slot="table-head" className="pl-4">Facility</th>
                      <th data-slot="table-head" className="px-3">Level</th>
                      <th data-slot="table-head" className="px-3">Effect now</th>
                      <th data-slot="table-head" className="px-3">Next level</th>
                      <th data-slot="table-head" className="px-3 text-right">Upkeep / wk</th>
                      <th data-slot="table-head" className="pl-3 pr-4 text-right">Upgrade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FACILITIES.map(f => {
                      const level = levelOf(f.type)
                      const maxed = level >= MAX_LEVEL
                      const cost = level === 0 ? BUILD_COST : level * UPGRADE_COST_PER_LEVEL
                      const affordable = team.budget >= cost
                      return (
                        <tr
                          key={f.type}
                          id={`facility-${f.type}`}
                          data-slot="table-row"
                          data-state={selected === f.type ? "selected" : undefined}
                          onClick={() => setSelected(f.type)}
                          className="h-[72px] scroll-mt-4 border-b border-line"
                        >
                          <td className="py-2 pl-4 pr-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-raised">
                                <Image src={UI_ASSETS.facilities[f.type]} alt="" fill sizes="64px" className="object-cover opacity-80" />
                              </div>
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-1"><f.icon size={14} className="text-ink-3" />{f.label}</p>
                                <p className="text-xs text-ink-3">{f.what}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3">
                            <LevelPips level={level} />
                            <p className="mt-1 text-xs tabular-nums text-ink-3">{level ? `Level ${level}` : "Not built"}</p>
                          </td>
                          <td className="px-3 text-sm text-ink-1">{level ? facilityEffect(f.type, level) : <span className="text-ink-3">—</span>}</td>
                          <td className="px-3 text-sm text-ink-2">{maxed ? <span className="text-ink-3">Max level</span> : facilityEffect(f.type, level + 1)}</td>
                          <td className="px-3 text-right text-sm tabular-nums">
                            {maxed ? <span className="text-ink-1">{money(Math.floor(facilityWeeklyCost(level)))}</span> : (
                              <span className="inline-flex items-center gap-1.5 text-ink-2">
                                {money(Math.floor(facilityWeeklyCost(level)))}
                                <ArrowRight size={12} className="text-ink-3" />
                                <span className="text-ink-1">{money(Math.floor(facilityWeeklyCost(level + 1)))}</span>
                              </span>
                            )}
                          </td>
                          <td className="pl-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
                            {maxed ? <span className="text-xs text-ink-3">Fully upgraded</span>
                              : affordable ? (
                                <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => handleUpgrade(f.type, f.label)}>
                                  {level === 0 ? "Build" : `Upgrade to ${level + 1}`} · {money(cost)}
                                </Button>
                              ) : (
                                <span className="text-xs text-ink-3">{money(cost)} · {money(cost - team.budget)} short</span>
                              )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="What buildings really do">
              <ul className="space-y-3 text-sm text-ink-2">
                <li>Each building&apos;s effect is listed in its row and applies every week from the moment it&apos;s built.</li>
                <li>
                  Built facilities also add <span className="text-ink-1">+{Math.round(FACILITY_EDGE_PER_LEVEL * 100)}% team strength per average level above 1</span>, up to +{Math.round(FACILITY_EDGE_PER_LEVEL * FACILITY_EDGE_MAX_LEVELS * 100)}% when every built facility is level 5.
                  Building a new level-1 facility lowers that average.
                </li>
                <li>Buildings, gear, staff and prep are summed per side; the difference between the two sides is capped at ±{Math.round(NON_PLAYER_BONUS_CAP * 100)}%.</li>
                <li>Build cost {money(BUILD_COST)}; each upgrade costs {money(UPGRADE_COST_PER_LEVEL)} × the current level.</li>
                <li>Upkeep grows with level (level<sup>1.25</sup> × {money(500)} per week) and shows on the Finances settlement.</li>
                {built.length === 0 && upkeep > 0 && (
                  <li>Until you build one, the club pays a base campus upkeep of {money(upkeep)}/wk. It is replaced by your facilities once the first is built.</li>
                )}
              </ul>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="gear" className="pt-3">
          <GearCatalog team={team} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
