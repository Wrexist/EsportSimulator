"use client"
import { t, tn } from "@/lib/i18n"

import { useRouter } from "next/navigation"
import { Check, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Meter } from "@/src/components/ui/Meter"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { formatWeeksAsYears, MAX_CONTRACT_WEEKS, MIN_CONTRACT_WEEKS, type NegotiationState } from "./useNegotiation"
import { ArchetypeChip } from "@/components/player/PersonalityChips"
import { getArchetype } from "@/engine/personality"
import { SENIOR_ROSTER_MAX, squadFullMessage } from "@/engine/roster-rules"
import { releaseClauseFee, releaseTriggerChance, type ReleaseClause } from "@/engine/contract-clauses"
import type { MarketStanding } from "@/engine/transfer-hype"
import { ContractPaper } from "./ContractPaper"
import { feeOfferBlock } from "./negotiation-rules"

const money = (value: number) => formatCurrency(value, "$", false)

function Overline({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</p>
}

function Row({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className={cn("text-sm tabular-nums text-ink-1", tone)}>{value}</dd>
        </div>
    )
}

function Chance({ label, value, hint }: { label: string; value: number; hint: React.ReactNode }) {
    const pct = Math.round(value * 100)
    const tone = pct >= 70 ? "positive" : pct >= 30 ? "neutral" : "caution"
    return (
        <div className="rounded border border-line bg-shell px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-ink-2">{label}</span>
                <span className={cn("font-display text-xl font-bold leading-none tabular-nums", pct >= 70 ? "text-positive" : pct >= 30 ? "text-ink-1" : "text-caution")}>~{pct}%</span>
            </div>
            <Meter value={pct} label={label} tone={tone} showValue={false} className="mt-2" trackClassName="w-full" />
            <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
        </div>
    )
}

function MoneyInput({ value, onChange, label, suffix }: { value: number; onChange: (v: number) => void; label: string; suffix?: string }) {
    return (
        <label className="block">
            <span className="sr-only">{label}</span>
            <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
                <Input
                    type="number"
                    inputMode="numeric"
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="h-11 pl-7 pr-12 font-display text-xl font-bold tabular-nums"
                />
                {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">{suffix}</span>}
            </div>
        </label>
    )
}

function Log({ lines }: { lines: string[] }) {
    if (lines.length === 0) return null
    return (
        <ol role="status" className="max-h-28 space-y-1 overflow-y-auto rounded border border-line bg-shell px-3 py-2 text-xs text-ink-2">
            {lines.map((line, i) => <li key={i} className={cn(i === lines.length - 1 && "text-ink-1")}>{line}</li>)}
        </ol>
    )
}

/**
 * The offer controls for one negotiation: fee to the club (if contracted),
 * then wage + length to the player, with real acceptance odds and the cost
 * of the signing on the books.
 */
export function DealTerms({ n, onDone, standing }: { n: NegotiationState; onDone?: () => void; standing?: MarketStanding }) {
    const router = useRouter()
    if (!n.ready || !n.evaluation || !n.playerSave) return null

    if (n.stage === "SIGN") {
        return (
            <div className="space-y-3">
                <div role="status" className="flex items-start gap-3 rounded border border-gold/40 bg-gold/5 px-3 py-3">
                    <Check size={18} className="mt-0.5 shrink-0 text-gold" />
                    <div>
                        <p className="text-sm font-semibold text-ink-1">{t("terms.agreed")}</p>
                        <p className="text-xs text-ink-3">{t("terms.agreedBody")}</p>
                    </div>
                </div>
                <ContractPaper n={n} standing={standing} />
            </div>
        )
    }

    if (n.stage === "SUCCESS") {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded border border-positive/30 bg-positive/5 px-3 py-3">
                    <Check size={18} className="mt-0.5 shrink-0 text-positive" />
                    <div>
                        <p className="text-sm font-semibold text-ink-1">{t("terms.signed", { name: n.playerSave.nickname })}</p>
                        <p className="text-xs text-ink-3">{t("terms.signedBody", { club: n.myTeam?.name ?? "" })}</p>
                    </div>
                </div>
                <Button className="h-10 w-full" onClick={() => { router.push("/squad"); onDone?.() }}>{t("deal.toSquad")}</Button>
            </div>
        )
    }

    if (n.stage === "FAILED") {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded border border-negative/30 bg-negative/5 px-3 py-3">
                    <CircleAlert size={18} className="mt-0.5 shrink-0 text-negative" />
                    <div>
                        <p className="text-sm font-semibold text-ink-1">{t("terms.collapsed")}</p>
                        <p className="text-xs text-ink-2">{n.failureMessage || t("terms.collapsedBody")}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 flex-1" onClick={n.retry}>{t("terms.backToOffer")}</Button>
                    {onDone && <Button variant="ghost" className="h-10 flex-1" onClick={onDone}>{t("terms.close")}</Button>}
                </div>
            </div>
        )
    }

    // A full squad can't sign anyone (the store refuses it): say so before any offer.
    const squadSize = n.myTeam?.rosterIds.length ?? 0
    if (squadSize >= SENIOR_ROSTER_MAX) {
        return (
            <div className="space-y-3">
                <div role="status" className="flex items-start gap-3 rounded border border-caution/30 bg-caution/5 px-3 py-3">
                    <CircleAlert size={18} className="mt-0.5 shrink-0 text-caution" />
                    <p className="text-xs leading-relaxed text-ink-2">{squadFullMessage(squadSize)}</p>
                </div>
                <Button variant="outline" className="h-10 w-full" onClick={() => { router.push("/squad"); onDone?.() }}>{t("deal.toSquad")}</Button>
            </div>
        )
    }

    const value = n.evaluation.transferValue
    const clubName = n.currentTeam?.name ?? t("nego.theClub")

    if (n.stage === "BUYOUT") {
        // MARKET-02: a fee over the board's limit is blocked here like one over the funds.
        const block = feeOfferBlock(n.buyoutOffer, n.budget, n.boardSanction)
        const overBoard = block === "overBoard"
        const boardLimitLabel = t("terms.boardLimit", { pct: Math.round(n.boardSanction.fraction * 100) })
        return (
            <div className="space-y-3">
                <Overline>{t("terms.step1", { club: clubName })}</Overline>
                <MoneyInput label={t("terms.feeOffer")} value={n.buyoutOffer} onChange={n.setBuyoutOffer} />
                <dl className="divide-y divide-line">
                    <Row label={t("terms.marketValue")} value={money(value)} />
                    {n.feePremium > 0 && <Row label={tn("terms.rivalPremium", n.rivals.length)} value={`+${Math.round(n.feePremium * 100)}% · ${money(n.askingValue)}`} tone="text-gold" />}
                    <Row label={t("terms.yourFunds")} value={money(n.budget)} tone={n.budget < value * 0.5 ? "text-caution" : undefined} />
                    {n.boardSanction.fraction < 1 && (
                        <Row label={boardLimitLabel} value={money(n.boardSanction.maxFee)} tone={overBoard ? "text-negative" : "text-caution"} />
                    )}
                </dl>
                <Chance
                    label={t("terms.clubAccepts")}
                    value={n.feeChance}
                    hint={t("terms.feeHint", { min: money(n.feeRange[0]), max: money(n.feeRange[1]) })}
                />
                <Log lines={n.negotiationLog} />
                {block ? (
                    // A readable "why not" instead of a faded gold button.
                    <div role="status" className="flex h-10 items-center justify-center rounded border border-line bg-shell px-3 text-sm text-ink-2">
                        {block === "enterFee" ? t("terms.enterFee")
                            : block === "overFunds" ? t("terms.overFunds", { amount: money(n.buyoutOffer - n.budget) })
                            : `${boardLimitLabel}: ${money(n.boardSanction.maxFee)}`}
                    </div>
                ) : (
                    <Button className="h-10 w-full" onClick={n.submitBuyout}>
                        {t("terms.offerFee", { fee: money(n.buyoutOffer) })}
                    </Button>
                )}
            </div>
        )
    }

    // CONTRACT
    const preview = n.costPreview
    return (
        <div className="space-y-3">
            <Overline>{n.currentTeam ? t("terms.step2") : t("terms.freeContract")}</Overline>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                <div className="space-y-1.5">
                    <span className="text-xs text-ink-3">{t("terms.wagePerWeek")}</span>
                    <MoneyInput label={t("terms.wageOffer")} value={n.salaryOffer} onChange={n.setSalaryOffer} suffix={t("terms.perWk")} />
                </div>
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-ink-3">{t("terms.length")}</span>
                        <span className="text-sm font-semibold tabular-nums text-ink-1">{t("terms.lengthValue", { weeks: n.durationOffer, length: formatWeeksAsYears(n.durationOffer) })}</span>
                    </div>
                    <Slider
                        aria-label={t("terms.contractLength")}
                        aria-valuetext={tn("deal.weeks", n.durationOffer)}
                        value={[n.durationOffer]}
                        onValueChange={(v) => n.setDurationOffer(v[0] || 52)}
                        min={MIN_CONTRACT_WEEKS}
                        max={MAX_CONTRACT_WEEKS}
                        step={4}
                    />
                    <p className={cn("text-xs", n.durationOk ? "text-ink-3" : "text-caution")}>
                        {t("terms.prefers", { min: formatWeeksAsYears(n.durationPref.minWeeks), max: formatWeeksAsYears(n.durationPref.maxWeeks) })}
                        {n.durationOk ? "" : t("terms.outsideRange")}
                    </p>
                </div>
            </div>
            <ClauseTerms n={n} />
            <Chance
                label={t("terms.playerAccepts")}
                value={n.wageChance}
                hint={n.durationOk ? t("terms.wageHint", { min: money(n.wageRange[0]), max: money(n.wageRange[1]) }) : t("terms.pickLength")}
            />
            {n.playerSave && n.personalityLines.length > 0 && (
                <div className="flex items-start gap-2 rounded border border-line bg-raised px-3 py-2">
                    <ArchetypeChip archetype={getArchetype(n.playerSave)} className="mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed text-ink-2">{n.personalityLines.join(" ")}</p>
                </div>
            )}
            <dl className="divide-y divide-line">
                {n.currentTeam && <Row label={t("terms.feeDue")} value={money(n.buyoutOffer)} />}
                <Row label={t("terms.fundsAfter")} value={money(n.budget - n.buyoutOffer)} tone={n.budget < n.buyoutOffer ? "text-negative" : undefined} />
                <Row label={t("terms.wagesTerm")} value={money(n.salaryOffer * Math.max(0, n.durationOffer - 1))} />
                <Row label={n.clauses.appearanceBonus > 0 || n.clauses.titleBonus > 0 ? t("terms.totalBeforeBonuses", { weeks: n.durationOffer }) : t("terms.total", { weeks: n.durationOffer })} value={money((n.currentTeam ? n.buyoutOffer : 0) + n.salaryOffer * Math.max(0, n.durationOffer - 1))} />
                {preview && <Row label={t("terms.weeklyNet")} value={formatCurrency(preview.weeklyNet, "$", false)} tone={preview.weeklyNet < 0 ? "text-negative" : "text-positive"} />}
                {preview && <Row label={t("terms.runway")} value={preview.runwayWeeks >= 999 ? t("terms.noDeficit") : tn("deal.weeks", preview.runwayWeeks)} tone={preview.runwayWeeks < 12 ? "text-caution" : undefined} />}
            </dl>
            <Log lines={n.negotiationLog} />
            {n.failureMessage && <p className="text-xs text-negative">{n.failureMessage}</p>}
            <Button className="h-10 w-full" onClick={n.submitContract} disabled={n.salaryOffer <= 0}>
                {t("terms.offerWage", { wage: money(n.salaryOffer), weeks: n.durationOffer })}
            </Button>
        </div>
    )
}

/** G13: the clauses he signs with; each one moves the wage he asks. */
function ClauseTerms({ n }: { n: NegotiationState }) {
    const releases: ReleaseClause[] = ["none", "high", "low"]
    const fee = releaseClauseFee(n.clauses.release, n.salaryOffer)
    return (
        <details className="rounded border border-line bg-shell px-3 py-2" open={n.clauses.release !== "none" || n.clauses.appearanceBonus > 0 || n.clauses.titleBonus > 0}>
            <summary className="cursor-pointer text-xs font-semibold text-ink-2">
                {t("terms.clauses")}{n.clauseSaving > 0 ? <span className="ml-1 font-normal text-ink-3">{t("terms.asksLess", { amount: money(n.clauseSaving) })}</span> : null}
            </summary>
            <div className="mt-2 space-y-3">
                <div className="space-y-1.5">
                    <span className="text-xs text-ink-3">{t("terms.releaseClause")}</span>
                    <div role="radiogroup" aria-label={t("terms.releaseClause")} className="grid grid-cols-3 gap-1.5">
                        {releases.map(r => (
                            <button key={r} type="button" role="radio" aria-checked={n.clauses.release === r} onClick={() => n.setClauses({ release: r })}
                                className={cn("rounded border px-2 py-1.5 text-xs font-semibold", n.clauses.release === r ? "border-ink-2 bg-raised text-ink-1" : "border-line text-ink-3 hover:text-ink-2")}>
                                {t(`terms.release.${r}`)}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-ink-3">
                        {n.clauses.release === "none"
                            ? t("terms.releaseNone")
                            : t("terms.releaseBody", { label: t(`clause.release.${n.clauses.release}`), pct: Math.round(releaseTriggerChance(fee, n.salaryOffer) * 100), fee: money(fee) })}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <span className="text-xs text-ink-3">{t("terms.appearance")}</span>
                        <MoneyInput label={t("terms.appearanceAria")} value={n.clauses.appearanceBonus} onChange={v => n.setClauses({ appearanceBonus: v })} suffix={t("terms.perMatch")} />
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-ink-3">{t("terms.titleBonus")}</span>
                        <MoneyInput label={t("terms.titleAria")} value={n.clauses.titleBonus} onChange={v => n.setClauses({ titleBonus: v })} suffix={t("terms.perTitle")} />
                    </div>
                </div>
                <p className="text-xs text-ink-3">
                    {t("terms.bonusNote")}
                </p>
            </div>
        </details>
    )
}

