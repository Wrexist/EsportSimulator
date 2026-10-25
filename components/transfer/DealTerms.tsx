"use client"

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
import { RELEASE_LABEL, releaseClauseFee, releaseTriggerChance, type ReleaseClause } from "@/engine/contract-clauses"
import type { MarketStanding } from "@/engine/transfer-hype"
import { ContractPaper } from "./ContractPaper"

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
                        <p className="text-sm font-semibold text-ink-1">Terms agreed</p>
                        <p className="text-xs text-ink-3">The contract is on the table. Sign it to complete the deal.</p>
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
                        <p className="text-sm font-semibold text-ink-1">{n.playerSave.nickname} signed</p>
                        <p className="text-xs text-ink-3">Joins {n.myTeam?.name} on the bench. Wages start at the next weekly settlement.</p>
                    </div>
                </div>
                <Button className="h-10 w-full" onClick={() => { router.push("/squad"); onDone?.() }}>Go to squad</Button>
            </div>
        )
    }

    if (n.stage === "FAILED") {
        return (
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded border border-negative/30 bg-negative/5 px-3 py-3">
                    <CircleAlert size={18} className="mt-0.5 shrink-0 text-negative" />
                    <div>
                        <p className="text-sm font-semibold text-ink-1">Deal collapsed</p>
                        <p className="text-xs text-ink-2">{n.failureMessage || "The transfer could not be completed."}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-10 flex-1" onClick={n.retry}>Back to offer</Button>
                    {onDone && <Button variant="ghost" className="h-10 flex-1" onClick={onDone}>Close</Button>}
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
                <Button variant="outline" className="h-10 w-full" onClick={() => { router.push("/squad"); onDone?.() }}>Go to squad</Button>
            </div>
        )
    }

    const value = n.evaluation.transferValue
    const clubName = n.currentTeam?.name ?? "the club"

    if (n.stage === "BUYOUT") {
        const overBudget = n.buyoutOffer > n.budget
        const overBoard = n.boardSanction.fraction < 1 && n.buyoutOffer > n.boardSanction.maxFee
        const blocked = n.buyoutOffer <= 0 || overBudget
        return (
            <div className="space-y-3">
                <Overline>Step 1 of 2 · Fee to {clubName}</Overline>
                <MoneyInput label="Transfer fee offer" value={n.buyoutOffer} onChange={n.setBuyoutOffer} />
                <dl className="divide-y divide-line">
                    <Row label="Market value" value={money(value)} />
                    {n.feePremium > 0 && <Row label={`Rival premium (${n.rivals.length} club${n.rivals.length === 1 ? "" : "s"} chasing)`} value={`+${Math.round(n.feePremium * 100)}% · ${money(n.askingValue)}`} tone="text-gold" />}
                    <Row label="Your funds" value={money(n.budget)} tone={n.budget < value * 0.5 ? "text-caution" : undefined} />
                    {n.boardSanction.fraction < 1 && (
                        <Row label={`Board limit (${Math.round(n.boardSanction.fraction * 100)}% of funds)`} value={money(n.boardSanction.maxFee)} tone={overBoard ? "text-negative" : "text-caution"} />
                    )}
                </dl>
                <Chance
                    label="Club accepts"
                    value={n.feeChance}
                    hint={`The club's hidden price is between ${money(n.feeRange[0])} and ${money(n.feeRange[1])}.`}
                />
                <Log lines={n.negotiationLog} />
                {blocked ? (
                    // A readable "why not" instead of a faded gold button.
                    <div role="status" className="flex h-10 items-center justify-center rounded border border-line bg-shell px-3 text-sm text-ink-2">
                        {n.buyoutOffer <= 0 ? "Enter a fee to make an offer" : `Fee is ${money(n.buyoutOffer - n.budget)} over your funds`}
                    </div>
                ) : (
                    <Button className="h-10 w-full" onClick={n.submitBuyout}>
                        Offer {money(n.buyoutOffer)}
                    </Button>
                )}
            </div>
        )
    }

    // CONTRACT
    const preview = n.costPreview
    return (
        <div className="space-y-3">
            <Overline>{n.currentTeam ? "Step 2 of 2 · Contract with the player" : "Free agent · contract"}</Overline>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                <div className="space-y-1.5">
                    <span className="text-xs text-ink-3">Wage per week</span>
                    <MoneyInput label="Weekly wage offer" value={n.salaryOffer} onChange={n.setSalaryOffer} suffix="/ wk" />
                </div>
                <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-ink-3">Length</span>
                        <span className="text-sm font-semibold tabular-nums text-ink-1">{n.durationOffer} wks · {formatWeeksAsYears(n.durationOffer)}</span>
                    </div>
                    <Slider
                        aria-label="Contract length"
                        aria-valuetext={`${n.durationOffer} weeks`}
                        value={[n.durationOffer]}
                        onValueChange={(v) => n.setDurationOffer(v[0] || 52)}
                        min={MIN_CONTRACT_WEEKS}
                        max={MAX_CONTRACT_WEEKS}
                        step={4}
                    />
                    <p className={cn("text-xs", n.durationOk ? "text-ink-3" : "text-caution")}>
                        Prefers {formatWeeksAsYears(n.durationPref.minWeeks)} – {formatWeeksAsYears(n.durationPref.maxWeeks)}
                        {n.durationOk ? "" : " · outside this range they refuse"}
                    </p>
                </div>
            </div>
            <ClauseTerms n={n} />
            <Chance
                label="Player accepts"
                value={n.wageChance}
                hint={n.durationOk ? `Their hidden minimum at this length is between ${money(n.wageRange[0])} and ${money(n.wageRange[1])}/wk.` : "Pick a length inside their range first."}
            />
            {n.playerSave && n.personalityLines.length > 0 && (
                <div className="flex items-start gap-2 rounded border border-line bg-raised px-3 py-2">
                    <ArchetypeChip archetype={getArchetype(n.playerSave)} className="mt-0.5 shrink-0" />
                    <p className="text-xs leading-relaxed text-ink-2">{n.personalityLines.join(" ")}</p>
                </div>
            )}
            <dl className="divide-y divide-line">
                {n.currentTeam && <Row label="Fee due on signing" value={money(n.buyoutOffer)} />}
                <Row label="Funds after signing" value={money(n.budget - n.buyoutOffer)} tone={n.budget < n.buyoutOffer ? "text-negative" : undefined} />
                <Row label="Wages over the term" value={money(n.salaryOffer * Math.max(0, n.durationOffer - 1))} />
                {preview && <Row label="Weekly net after signing" value={formatCurrency(preview.weeklyNet, "$", false)} tone={preview.weeklyNet < 0 ? "text-negative" : "text-positive"} />}
                {preview && <Row label="Runway at that rate" value={preview.runwayWeeks >= 999 ? "No deficit" : `${preview.runwayWeeks} weeks`} tone={preview.runwayWeeks < 12 ? "text-caution" : undefined} />}
            </dl>
            <Log lines={n.negotiationLog} />
            {n.failureMessage && <p className="text-xs text-negative">{n.failureMessage}</p>}
            <Button className="h-10 w-full" onClick={n.submitContract} disabled={n.salaryOffer <= 0}>
                Offer {money(n.salaryOffer)}/wk · {n.durationOffer} wks
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
                Clauses{n.clauseSaving > 0 ? <span className="ml-1 font-normal text-ink-3">· he asks {money(n.clauseSaving)}/wk less</span> : null}
            </summary>
            <div className="mt-2 space-y-3">
                <div className="space-y-1.5">
                    <span className="text-xs text-ink-3">Release clause</span>
                    <div role="radiogroup" aria-label="Release clause" className="grid grid-cols-3 gap-1.5">
                        {releases.map(r => (
                            <button key={r} type="button" role="radio" aria-checked={n.clauses.release === r} onClick={() => n.setClauses({ release: r })}
                                className={cn("rounded border px-2 py-1.5 text-xs font-semibold", n.clauses.release === r ? "border-ink-2 bg-raised text-ink-1" : "border-line text-ink-3 hover:text-ink-2")}>
                                {r === "none" ? "None" : r === "high" ? "High" : "Low"}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-ink-3">
                        {n.clauses.release === "none"
                            ? "No club can take him without your say."
                            : `${RELEASE_LABEL[n.clauses.release]}: each transfer-window week there is about a ${Math.round(releaseTriggerChance(fee, n.salaryOffer) * 100)}% chance that a club with ${money(fee)} to spare, and a weaker player than him, takes him without your say (only while you have six players or more). You keep the fee. He takes a lower wage for it.`}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <span className="text-xs text-ink-3">Appearance bonus</span>
                        <MoneyInput label="Appearance bonus per official match" value={n.clauses.appearanceBonus} onChange={v => n.setClauses({ appearanceBonus: v })} suffix="/ match" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-ink-3">Title bonus</span>
                        <MoneyInput label="Bonus per title won" value={n.clauses.titleBonus} onChange={v => n.setClauses({ titleBonus: v })} suffix="/ title" />
                    </div>
                </div>
                <p className="text-xs text-ink-3">
                    Appearance money is paid for every official match he plays, and the title bonus whenever you win a tournament.
                    For them he takes off his weekly wage about half the appearance bonus (up to 30% of the wage) and a thirtieth of the title bonus (up to 15%).
                </p>
            </div>
        </details>
    )
}

