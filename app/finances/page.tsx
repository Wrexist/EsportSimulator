"use client"
import { intlLocale, t, tn } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Lock } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useCurrentTeam } from "@/hooks/useCurrentTeam"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { LoadingState } from "@/components/ui/loading"
import { Panel } from "@/src/components/ui/Panel"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { MoneyBreakdown } from "@/components/finance/IncomeBreakdown"
import { CashChart, type CashPoint } from "@/components/finance/CashChart"
import { EconomyEngine } from "@/engine/economy-engine"
import { cashRunway, forecastFinances } from "@/engine/finance-forecast"
import { ECONOMY_CONSTANTS } from "@/lib/constants"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"

const money = (value: number) => formatCurrency(value, "$", false)
const HISTORY_WEEKS = 12
const PROJECTION_WEEKS = 12

// Mirrors store/slices/team-facilities-slice.ts (merch store) — display only.
const MERCH_LINES = [
  { id: "JERSEY", level: 1 },
  { id: "HOODIE", level: 2 },
  { id: "CAP", level: 3 },
  { id: "CHAIR", level: 4 },
  { id: "KEYBOARD", level: 5 },
] as const
const MERCH_MAX_LEVEL = 5
const MERCH_UPGRADE_BASE = 50_000

const LEDGER_CATEGORIES = new Set(["WAGES_PLAYER", "WAGES_STAFF", "FACILITIES", "PRIZE", "SPONSOR", "TRANSFER_IN", "TRANSFER_OUT", "OTHER", "MERCH", "TRAINING", "OPERATIONS", "LEAGUE"])

function weeksLabel(weeks: number) {
  return weeks >= 52
    ? t("deal.yearsShort", { n: (weeks / 52).toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
    : t("common.weeksShort", { count: weeks })
}

export default function FinancesPage() {
  const { currentWeek, players, staff, contracts, academyCount, financeLedger, upgradeMerchStore, toggleMerchItem } = useGameStore(useShallow(state => ({
    academyCount: state.academyPlayers.length,
    currentWeek: state.currentWeek,
    players: state.players,
    staff: state.staff,
    contracts: state.contracts,
    financeLedger: state.financeLedger,
    upgradeMerchStore: state.upgradeMerchStore,
    toggleMerchItem: state.toggleMerchItem,
  })))
  const team = useCurrentTeam()

  // The same projection the next weekly settlement will post.
  const report = useMemo(() => team
    ? EconomyEngine.processWeeklyFinances(team, players, contracts, staff, currentWeek + 1, academyCount)
    : null, [team, players, contracts, staff, currentWeek, academyCount])

  const projection = useMemo(() => team ? forecastFinances(team, players, contracts, staff, currentWeek, PROJECTION_WEEKS, academyCount) : [],
    [team, players, contracts, staff, currentWeek, academyCount])

  const ledger = useMemo(() => (financeLedger as { id: string; week: number; teamId: string; type: "INCOME" | "EXPENSE"; category: string; amount: number; description: string; balance: number }[])
    .filter(e => e.teamId === team?.id), [financeLedger, team?.id])

  const chartPoints = useMemo<CashPoint[]>(() => {
    if (!team) return []
    const byWeek = new Map<number, { net: number; balance: number }>()
    for (const e of ledger) {
      const w = byWeek.get(e.week) ?? { net: 0, balance: e.balance }
      w.net += e.type === "INCOME" ? e.amount : -e.amount
      w.balance = e.balance
      byWeek.set(e.week, w)
    }
    const history: CashPoint[] = [...byWeek.entries()]
      .filter(([week]) => week < currentWeek)
      .sort((a, b) => a[0] - b[0])
      .slice(-HISTORY_WEEKS)
      .map(([week, w]) => ({ week, balance: w.balance, net: w.net, projected: false }))
    const thisWeek = byWeek.get(currentWeek)
    const now: CashPoint = { week: currentWeek, balance: team.budget, net: thisWeek?.net ?? 0, projected: false }
    return [...history, now, ...projection.map(p => ({ week: p.week, balance: p.budget, net: p.net, projected: true }))]
  }, [ledger, projection, team, currentWeek])

  const payroll = useMemo(() => {
    if (!team) return { rows: [], staffRows: [] }
    const byId = new Map(players.map(p => [p.id, p]))
    const contractBy = new Map(contracts.map(c => [c.playerId, c]))
    const rows = team.rosterIds.map(id => byId.get(id)).filter(Boolean).map(p => {
      const c = contractBy.get(p!.id)
      return { player: p!, wage: c?.salaryPerWeek ?? 0, weeksLeft: c ? Math.max(0, c.endWeek - currentWeek) : 0, winBonus: c?.matchWinBonus ?? 0, mvpBonus: c?.mvpBonus ?? 0 }
    })
    const staffRows = staff
      .filter(s => team.staffIds?.includes(s.id) && (s.contractEndWeek === undefined || s.contractEndWeek > currentWeek))
      .map(s => ({ staff: s, weeksLeft: s.contractEndWeek !== undefined ? Math.max(0, s.contractEndWeek - currentWeek) : null }))
    return { rows, staffRows }
  }, [team, players, contracts, staff, currentWeek])

  if (!team || !report) return <LoadingState message={t("fin.loading")} size="lg" className="min-h-[50vh]" />

  const funds = team.budget ?? 0
  const net = report.net
  const runway = cashRunway(funds, net)
  const season = Math.ceil(currentWeek / 52)
  const repFactor = EconomyEngine.sponsorReputationFactor(team.reputation)
  const sponsorFloor = EconomyEngine.sponsorFloor(team.reputation)
  const sponsorsPaid = (team.sponsors ?? []).filter(s => s.remainingWeeks === undefined || s.remainingWeeks > 0)
  const merchLevel = team.merchStoreLevel || 1
  const activeLines = team.activeMerchItems ?? []
  const upgradeCost = MERCH_UPGRADE_BASE * Math.pow(2, merchLevel - 1)
  const fanZone = team.facilities?.find(f => f.type === "FANZONE")?.level ?? 0
  const recentLedger = [...ledger].reverse().slice(0, 18)

  const incomeRows = [
    { label: t("fin.in.sponsors"), amount: report.income.sponsors, note: sponsorsPaid.length
      ? tn("fin.in.sponsorsDeals", sponsorsPaid.length, { floor: formatCurrency(sponsorFloor), factor: repFactor.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
      : t("fin.in.sponsorsNone", { floor: formatCurrency(sponsorFloor) }) },
    { label: t("fin.in.fans"), amount: report.income.fanbase, note: t("fin.in.fansNote", { followers: (team.followers ?? 0).toLocaleString(intlLocale()), level: merchLevel }) },
    { label: t("fin.in.league"), amount: report.income.leagueShare, note: team.leagueDivisionLevel ? t("fin.in.division", { n: team.leagueDivisionLevel }) : t("fin.in.outside") },
  ]
  const expenseRows = [
    { label: t("fin.cat.WAGES_PLAYER"), amount: report.expenses.playerWages, note: tn("fin.out.contracts", payroll.rows.length) },
    { label: t("fin.cat.WAGES_STAFF"), amount: report.expenses.staffWages, note: tn("fin.out.staff", payroll.staffRows.length) },
    { label: t("fin.out.operations"), amount: report.expenses.operations, note: t("fin.out.operationsNote") },
    { label: t("fin.out.facilities"), amount: report.expenses.facilities, note: team.facilities?.length ? tn("fin.out.facilitiesCount", team.facilities.length) : t("fin.out.baseCampus") },
    { label: t("fin.out.equipment"), amount: report.expenses.equipment },
    { label: t("fin.out.academy"), amount: report.expenses.academy },
  ]

  const handleUpgrade = () => {
    const res = upgradeMerchStore(team.id)
    if (res.success) toast.success(res.message)
    else toast.error(res.message)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
      <ScreenHeader
        eyebrow={t("fin.eyebrow", { season })}
        title={t("fin.title")}
        subtitle={t("fin.subtitle")}
        aside={
          <KpiStrip>
            <Kpi label={t("common.funds")} value={formatCurrency(funds, "$", true)} valueClassName={funds <= 0 ? "text-negative" : undefined} />
            <Kpi label={t("fin.kpi.income")} value={formatCurrency(report.income.total, "$", true)} />
            <Kpi label={t("fin.kpi.expenses")} value={formatCurrency(report.expenses.total, "$", true)} />
            <Kpi label={t("fin.kpi.net")} value={formatSignedCurrency(net, "$", true)} valueClassName={net < 0 ? "text-negative" : "text-positive"} />
            <Kpi label={t("fin.kpi.runway")} value={runway >= 999 ? "—" : tn("fin.wks", runway)} hint={runway >= 999 ? t("fin.noDeficit") : undefined} valueClassName={runway < 12 ? "text-caution" : undefined} />
          </KpiStrip>
        }
      />

      {funds <= 0 && (
        <div role="status" className="rounded-lg border border-negative/30 bg-negative/5 px-4 py-3 text-sm">
          <p className="font-semibold text-negative">{t("fin.outOfCash", { n: team.consecutiveInsolventWeeks ?? 0, max: 8 })}</p>
          <p className="mt-1 text-ink-2">{t("fin.outOfCashBody")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel
          title={t("fin.chartTitle")}
          actions={<span className="flex items-center gap-4 text-xs text-ink-3">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-gold" />{t("fin.balance")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2 rounded-sm bg-ink-2/60" />{t("fin.net")}</span>
            <span>{t("fin.dashed")}</span>
          </span>}
        >
          <CashChart points={chartPoints} nowWeek={currentWeek} />
          <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded border border-line">
            {[4, 8, 12].map(w => {
              const p = projection[w - 1]
              return (
                <div key={w} className="px-4 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.inWeeks", { n: w })}</dt>
                  <dd className={cn("mt-1 font-display text-xl font-bold tabular-nums", p && p.budget < 0 ? "text-negative" : "text-ink-1")}>{p ? formatCurrency(p.budget, "$", true) : "—"}</dd>
                </div>
              )
            })}
          </dl>
        </Panel>

        <Panel title={t("fin.nextSettlement")} actions={<span className="text-xs tabular-nums text-ink-3">{t("common.week", { n: currentWeek + 1 })}</span>}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.income")}</p>
          <MoneyBreakdown rows={incomeRows} total={report.income.total} tone="income" />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.expenses")}</p>
          <MoneyBreakdown rows={expenseRows} total={report.expenses.total} tone="expense" />
          <div className="mt-3 flex items-baseline justify-between border-t border-line-strong pt-3">
            <span className="text-sm font-semibold text-ink-1">{t("fin.net")}</span>
            <span className={cn("font-display text-2xl font-bold tabular-nums", net < 0 ? "text-negative" : "text-positive")}>{formatSignedCurrency(net, "$", false)}</span>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel padded={false}>
          <Tabs defaultValue={recentLedger.length > 0 ? "ledger" : "payroll"}>
            <div className="px-4 pt-1">
              <TabsList>
                <TabsTrigger value="ledger">{t("fin.ledger")}</TabsTrigger>
                <TabsTrigger value="payroll">{t("fin.payroll")}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="ledger" className="mt-0">
              {recentLedger.length === 0 ? (
                <p className="px-4 py-8 text-sm text-ink-3">{t("fin.noTransactions")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                    <thead data-slot="table-header">
                      <tr className="border-b border-line">
                        <th data-slot="table-head" className="w-16 pl-4">{t("fin.col.week")}</th>
                        <th data-slot="table-head" className="px-3">{t("fin.col.description")}</th>
                        <th data-slot="table-head" className="px-3">{t("fin.col.category")}</th>
                        <th data-slot="table-head" className="px-3 text-right">{t("fin.col.amount")}</th>
                        <th data-slot="table-head" className="pl-3 pr-4 text-right">{t("fin.balance")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLedger.map(e => (
                        <tr key={e.id} data-slot="table-row" className="h-10 border-b border-line">
                          <td className="pl-4 text-sm tabular-nums text-ink-3">{e.week}</td>
                          <td className="max-w-[320px] truncate px-3 text-sm text-ink-1">{storedText(e.description)}</td>
                          <td className="px-3 text-xs text-ink-3">{LEDGER_CATEGORIES.has(e.category) ? t(`fin.cat.${e.category}`) : e.category}</td>
                          <td className={cn("px-3 text-right text-sm tabular-nums", e.type === "INCOME" ? "text-positive" : "text-ink-2")}>
                            {e.type === "INCOME" ? "+" : "−"}{money(e.amount)}
                          </td>
                          <td className={cn("pl-3 pr-4 text-right text-sm tabular-nums", e.balance < 0 ? "text-negative" : "text-ink-1")}>{money(e.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="payroll" className="mt-0">
              <div className="overflow-x-auto">
                <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                  <thead data-slot="table-header">
                    <tr className="border-b border-line">
                      <th data-slot="table-head" className="pl-4">{t("fin.col.name")}</th>
                      <th data-slot="table-head" className="px-3">{t("common.role")}</th>
                      <th data-slot="table-head" className="px-3 text-right">{t("fin.col.wage")}</th>
                      <th data-slot="table-head" className="px-3 text-right">{t("fin.col.contract")}</th>
                      <th data-slot="table-head" className="px-3">{t("fin.col.bonuses")}</th>
                      <th data-slot="table-head" className="pl-3 pr-4 text-right">{t("fin.col.leftToPay")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.rows.map(r => (
                      <tr key={r.player.id} data-slot="table-row" className="h-12 border-b border-line">
                        <td className="py-1.5 pl-4">
                          <Link href={`/player/${r.player.id}`} className="flex items-center gap-2.5 hover:text-gold">
                            <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-raised"><PlayerPortrait src={r.player.portraitPath} seed={r.player.id} alt={r.player.nickname} size={32} /></span>
                            <span className="text-sm font-semibold text-ink-1">{r.player.nickname}</span>
                          </Link>
                        </td>
                        <td className="px-3"><RoleTag role={r.player.role} /></td>
                        <td className="px-3 text-right text-sm tabular-nums text-ink-1">{money(r.wage)}</td>
                        <td className={cn("px-3 text-right text-sm tabular-nums", r.weeksLeft <= 4 ? "text-negative" : r.weeksLeft <= 13 ? "text-caution" : "text-ink-2")}>{weeksLabel(r.weeksLeft)}</td>
                        <td className="px-3 text-xs text-ink-3">
                          {r.winBonus || r.mvpBonus
                            ? [r.winBonus ? t("fin.winBonus", { amount: money(r.winBonus) }) : null, r.mvpBonus ? t("fin.mvpBonus", { amount: money(r.mvpBonus) }) : null].filter(Boolean).join(" · ")
                            : "—"}
                        </td>
                        <td className="pl-3 pr-4 text-right text-sm tabular-nums text-ink-2">{money(r.wage * r.weeksLeft)}</td>
                      </tr>
                    ))}
                    {payroll.staffRows.map(({ staff: s, weeksLeft }) => (
                      <tr key={s.id} data-slot="table-row" className="h-11 border-b border-line">
                        <td className="pl-4 text-sm font-semibold text-ink-1">{s.name}</td>
                        <td className="px-3 text-xs text-ink-3">{t(`staffRole.${s.role}`)}</td>
                        <td className="px-3 text-right text-sm tabular-nums text-ink-1">{money(s.salaryPerWeek)}</td>
                        <td className={cn("px-3 text-right text-sm tabular-nums", weeksLeft !== null && weeksLeft <= 4 ? "text-negative" : "text-ink-2")}>{weeksLeft === null ? t("fin.rolling") : weeksLabel(weeksLeft)}</td>
                        <td className="px-3 text-xs text-ink-3">—</td>
                        <td className="pl-3 pr-4 text-right text-sm tabular-nums text-ink-2">{weeksLeft === null ? "—" : money(s.salaryPerWeek * weeksLeft)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel
            title={t("fin.in.sponsors")}
            actions={<Link href="/sponsorships" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-gold">{t("fin.manage")} <ArrowUpRight size={12} /></Link>}
            padded={false}
          >
            {sponsorsPaid.length > 0 ? (
              <ul className="divide-y divide-line">
                {sponsorsPaid.map(s => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-1">{s.name}</p>
                      <p className="text-xs text-ink-3">{t(`sponsorTier.${s.tier}`)} · {tn("fin.wksLeft", s.remainingWeeks ?? 0)}</p>
                    </div>
                    <span className="text-sm tabular-nums text-ink-1">{money(s.weeklyPayout)}<span className="text-ink-3"> {t("terms.perWk")}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-ink-3">{t("fin.noDeals", { amount: money(sponsorFloor) })}</p>
            )}
          </Panel>

          <Panel title={t("fin.merch")} actions={<span className="text-xs tabular-nums text-ink-3">{t("fin.level", { n: merchLevel, max: MERCH_MAX_LEVEL })}</span>}>
            <p className="text-sm text-ink-2">
              {t("fin.merchFormula", { perFan: ECONOMY_CONSTANTS.BASE_FAN_INCOME_PER_FAN, level: Math.round(ECONOMY_CONSTANTS.MERCH_LEVEL_RATE * 100), line: 4 })}
            </p>
            <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded border border-line text-center">
              <div className="px-2 py-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.store")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-1">+{Math.round((merchLevel - 1) * ECONOMY_CONSTANTS.MERCH_LEVEL_RATE * 100)}%</dd></div>
              <div className="px-2 py-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.fanZone")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-1">+{Math.round(fanZone * ECONOMY_CONSTANTS.FANZONE_LEVEL_RATE * 100)}%</dd></div>
              <div className="px-2 py-2"><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("fin.lines")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-1">+{Math.min(5, activeLines.length) * 4}%</dd></div>
            </dl>
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {MERCH_LINES.map(line => {
                const unlocked = merchLevel >= line.level
                const active = activeLines.includes(line.id)
                return (
                  <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className={cn("text-sm", unlocked ? "text-ink-1" : "text-ink-3")}>{t(`merch.${line.id}`)}</span>
                    {unlocked ? (
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleMerchItem(team.id, line.id)}
                        className={cn("inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-semibold transition-colors",
                          active ? "border-positive/40 text-positive hover:bg-hover" : "border-line-strong text-ink-2 hover:bg-hover hover:text-ink-1")}
                      >
                        {active ? <><Check size={12} /> {t("fin.selling")}</> : t("fin.startSelling")}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Lock size={11} /> {t("fin.storeLevel", { n: line.level })}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            {merchLevel < MERCH_MAX_LEVEL ? (
              funds >= upgradeCost ? (
                <Button variant="outline" className="mt-3 h-9 w-full" onClick={handleUpgrade}>
                  {t("fin.upgrade", { n: merchLevel + 1, cost: money(upgradeCost) })}
                </Button>
              ) : (
                <p className="mt-3 rounded border border-line bg-shell px-3 py-2 text-center text-sm text-ink-3">{t("fin.short", { n: merchLevel + 1, cost: money(upgradeCost), short: money(upgradeCost - funds) })}</p>
              )
            ) : (
              <p className="mt-3 text-center text-sm text-ink-3">{t("fin.maxed")}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
