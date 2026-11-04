"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ArrowRight, ClipboardList, Dumbbell, HeartPulse, Users } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingState } from "@/components/ui/loading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { UI_ASSETS } from "@/lib/ui-assets"
import { EconomyEngine } from "@/engine/economy-engine"
import { EquipmentManager } from "@/engine/equipment-manager"
import { facilityLevel, facilityWeeklyCost } from "@/engine/organization-effects"
import { FACILITY_EDGE_PER_LEVEL, NON_PLAYER_BONUS_CAP } from "@/engine/match/round-sim/team-edge"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { soundManager } from "@/lib/sound-manager"
import { t } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"
import { Trans } from "@/lib/trans"
import { GearCatalog } from "./_components/GearCatalog"
import { FACILITY_EDGE_MAX_LEVELS, facilityEdgePct } from "./_components/facility-edge"

type FacilityType = "TRAINING" | "TACTICAL" | "RECOVERY" | "FANZONE"
type Tab = "buildings" | "gear"

const MAX_LEVEL = 5
// Mirrors store/slices/team-facilities-slice.ts.
const BUILD_COST = 10_000
const UPGRADE_COST_PER_LEVEL = 25_000

const FACILITIES: { type: FacilityType; icon: typeof Dumbbell; spot: { left: string; top: string } }[] = [
  { type: "TRAINING", icon: Dumbbell, spot: { left: "20%", top: "50%" } },
  { type: "TACTICAL", icon: ClipboardList, spot: { left: "44%", top: "27%" } },
  { type: "RECOVERY", icon: HeartPulse, spot: { left: "65%", top: "37%" } },
  { type: "FANZONE", icon: Users, spot: { left: "81%", top: "64%" } },
]
const facilityName = (type: FacilityType) => t(`fac.${type}.name`)
const facilityWhat = (type: FacilityType) => t(`fac.${type}.what`)

/** What a building does at a level; same numbers as the weekly processors. */
function facilityEffect(type: FacilityType, level: number): string {
  const n = facilityLevel(level)
  switch (type) {
    case "TRAINING": return t("fac.effect.TRAINING", { pct: n * 10 })
    case "RECOVERY": return t("fac.effect.RECOVERY", { n })
    case "TACTICAL": return t("fac.effect.TACTICAL", { pct: n * 20 })
    case "FANZONE": return t("fac.effect.FANZONE", { income: n * 20, growth: n * 15 })
  }
}

const money = (v: number) => formatCurrency(v, "$", false)
const pct = (v: number) => `+${v.toFixed(v % 1 ? 1 : 0)}%`

function LevelPips({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={t("fac.levelOf", { level, max: MAX_LEVEL })}>
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

  if (!team) return <LoadingState message={t("fac.loading")} size="lg" className="min-h-[50vh]" />

  const upkeep = settlement?.facilities ?? 0
  const gearUpkeep = EquipmentManager.calculateWeeklyCost(team)
  const levelOf = (type: FacilityType) => team.facilities?.find(f => f.type === type)?.level ?? 0
  const built = (team.facilities ?? []).filter(f => (f.level ?? 0) > 0)
  const { pct: facilityPct, avgLevel } = facilityEdgePct(team)
  const gearPct = EquipmentManager.strengthBonus(team) * 100
  const gearCap = EquipmentManager.STRENGTH_CAP * 100
  const season = Math.max(1, Math.ceil(currentWeek / 52))

  const handleUpgrade = (type: FacilityType) => {
    const label = facilityName(type)
    const result = upgradeFacility(team.id, type)
    if (result.success) soundManager.play("facilityUpgrade")
    if (result.success) toast.success(t("fac.upgraded", { name: label }), { description: storedText(result.message) })
    else toast.error(t("fac.upgradeFailed"), { description: storedText(result.message) })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow={t("brd.eyebrow", { season })}
        title={t("fac.title")}
        subtitle={t("fac.subtitle")}
        aside={
          <KpiStrip>
            <Kpi label={t("common.funds")} value={formatCurrency(team.budget, "$", true)} />
            <Kpi label={t("fac.kpi.buildings")} value={pct(facilityPct)} hint={built.length > 0 ? t("fac.kpi.avgLevel", { level: avgLevel.toFixed(1) }) : t("fac.kpi.baseCampus")} />
            <Kpi label={t("fac.kpi.gear")} value={pct(gearPct)} hint={t("fac.kpi.gearMax", { pct: gearCap.toFixed(0) })} />
            <Kpi label={t("fac.kpi.upkeep")} value={formatCurrency(upkeep + gearUpkeep, "$", true)} hint={t("fac.kpi.upkeepHint", { buildings: formatCurrency(upkeep, "$", true), gear: formatCurrency(gearUpkeep, "$", true) })} />
          </KpiStrip>
        }
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label={t("fac.tabsAria")}>
          <TabsTrigger value="buildings">{t("fac.tab.buildings")}</TabsTrigger>
          <TabsTrigger value="gear">{t("fac.tab.gear")}</TabsTrigger>
        </TabsList>

        <TabsContent value="buildings" className="space-y-5 pt-3">
          <div className="campus-scene" role="group" aria-label={t("fac.selectAria")}>
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
                  <span className="flex items-center gap-2 text-sm font-semibold"><f.icon size={16} />{facilityName(f.type)}</span>
                  <small>{level ? t("car.levelN", { level }) : t("fac.notBuilt")}</small>
                </button>
              )
            })}
          </div>

          {/* SQUAD-05: the notes stack under the table below 2xl, so the Upgrade column fits at 1280. */}
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table data-slot="table" className="w-full min-w-[980px] border-collapse text-left">
                  <thead data-slot="table-header">
                    <tr className="border-b border-line">
                      <th data-slot="table-head" className="pl-4">{t("fac.col.facility")}</th>
                      <th data-slot="table-head" className="px-3">{t("fac.col.level")}</th>
                      <th data-slot="table-head" className="px-3">{t("fac.col.effectNow")}</th>
                      <th data-slot="table-head" className="px-3">{t("fac.col.nextLevel")}</th>
                      <th data-slot="table-head" className="px-3 text-right">{t("fac.kpi.upkeep")}</th>
                      <th data-slot="table-head" className="pl-3 pr-4 text-right">{t("fac.col.upgrade")}</th>
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
                                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-1"><f.icon size={14} className="text-ink-3" />{facilityName(f.type)}</p>
                                <p className="text-xs text-ink-3">{facilityWhat(f.type)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3">
                            <LevelPips level={level} />
                            <p className="mt-1 text-xs tabular-nums text-ink-3">{level ? t("car.levelN", { level }) : t("fac.notBuilt")}</p>
                          </td>
                          <td className="px-3 text-sm text-ink-1">{level ? facilityEffect(f.type, level) : <span className="text-ink-3">—</span>}</td>
                          <td className="px-3 text-sm text-ink-2">{maxed ? <span className="text-ink-3">{t("fac.maxLevel")}</span> : facilityEffect(f.type, level + 1)}</td>
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
                            {maxed ? <span className="text-xs text-ink-3">{t("fac.fullyUpgraded")}</span>
                              : affordable ? (
                                <div className="flex flex-col items-end gap-1">
                                  {/* SQUAD-12: a building can't be sold or refunded, so confirm the spend. */}
                                  <ConfirmDialog
                                    title={level === 0 ? t("fac.confirm.buildTitle", { name: facilityName(f.type) }) : t("fac.confirm.upgradeTitle", { name: facilityName(f.type), level: level + 1 })}
                                    description={t("fac.confirm.body", { cost: money(cost), from: money(Math.floor(facilityWeeklyCost(level))), to: money(Math.floor(facilityWeeklyCost(level + 1))), after: money(team.budget - cost) })}
                                    confirmText={t(level === 0 ? "fac.confirm.build" : "fac.confirm.upgrade", { cost: money(cost) })}
                                    icon="warning"
                                    onConfirm={() => handleUpgrade(f.type)}
                                  >
                                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs">
                                      {level === 0 ? t("fac.build") : t("fac.upgradeTo", { level: level + 1 })} · {money(cost)}
                                    </Button>
                                  </ConfirmDialog>
                                  {/* C8: the one-time cost and what it adds every week. */}
                                  <span className="text-[11px] tabular-nums text-ink-3">{t("fac.thenUpkeep", { amount: money(Math.floor(facilityWeeklyCost(level + 1) - facilityWeeklyCost(level))) })}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-ink-3">{t("fac.short", { cost: money(cost), short: money(cost - team.budget) })}</span>
                              )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t("fac.howTitle")}>
              <ul className="space-y-3 text-sm text-ink-2">
                <li>{t("fac.how.rows")}</li>
                <li><Trans k="fac.how.edge" params={{ pct: Math.round(FACILITY_EDGE_PER_LEVEL * 100), max: Math.round(FACILITY_EDGE_PER_LEVEL * FACILITY_EDGE_MAX_LEVELS * 100) }} tags={{ b: x => <span className="text-ink-1">{x}</span> }} /></li>
                <li>{t("fac.how.cap", { cap: Math.round(NON_PLAYER_BONUS_CAP * 100) })}</li>
                <li>{t("fac.how.cost", { build: money(BUILD_COST), upgrade: money(UPGRADE_COST_PER_LEVEL) })}</li>
                <li><Trans k="fac.how.upkeep" params={{ base: money(500) }} tags={{ sup: x => <sup>{x}</sup> }} /></li>
                {built.length === 0 && upkeep > 0 && (
                  <li>{t("fac.how.base", { amount: money(upkeep) })}</li>
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
