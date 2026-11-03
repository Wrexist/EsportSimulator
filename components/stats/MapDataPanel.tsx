"use client"
import { t, tn } from "@/lib/i18n"

import { useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { getMapName } from "@/data/map-pool"
import { ownMapDetail, rate, sumTallies, type OwnMapDetail, type RateCell } from "@/engine/map-record"
import { Panel } from "@/src/components/ui/Panel"
import { CT_SETUPS, T_CALL_STRATEGIES, ctSetupLabel, tCallLabel } from "@/engine/match/playbook"
import { cn } from "@/lib/utils"

const buyLabels = (): Record<string, string> => Object.fromEntries(["ECO", "FORCE", "SEMIBUY", "FULL", "DOUBLE AWP"].map(k => [k, t(`tr.buy.${k}`)]))
const tPlanLabels = (): Record<string, string> => ({ ...Object.fromEntries(T_CALL_STRATEGIES.map(s => [s, tCallLabel(s)])), eco: t("playbook.t.eco") })
const ctSetupLabels = (): Record<string, string> => Object.fromEntries(CT_SETUPS.map(s => [s, ctSetupLabel(s)]))
const styleLabels = (): Record<string, string> => Object.fromEntries(["aggressive", "structured", "balanced", "default"].map(k => [k, t(`rk.playstyle.${k}`)]))
/** Fewer rounds than this and a rate is shown dimmed: too few to read much into. */
const SMALL_SAMPLE = 8

const pct = (won: number, n: number) => {
    const r = rate(won, n)
    return r === null ? "—" : `${r}%`
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
    return (
        <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded border border-line">
            {options.map(([v, text]) => (
                <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
                    className={cn("px-2.5 py-1 text-xs font-semibold transition-colors", value === v ? "bg-raised text-ink-1" : "text-ink-3 hover:text-ink-2")}>
                    {text}
                </button>
            ))}
        </div>
    )
}

function RateBars({ title, cells, labels, unit = "rounds" }: { title: string; cells: Record<string, RateCell>; labels: Record<string, string>; unit?: "rounds" | "maps" }) {
    const rows = Object.entries(cells).sort((a, b) => b[1].n - a[1].n)
    return (
        <div className="min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
            {rows.length === 0 ? <p className="mt-2 text-sm text-ink-3">{t("md.none")}</p> : (
                <ul className="mt-2 space-y-1.5">
                    {rows.map(([key, c]) => {
                        const r = rate(c.won, c.n) ?? 0
                        const small = c.n < SMALL_SAMPLE
                        return (
                            <li key={key} className={cn("text-sm", small && "opacity-60")} title={small ? tn(unit === "maps" ? "md.fewMaps" : "md.fewRounds", c.n) : undefined}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-ink-2">{labels[key] ?? key}</span>
                                    <span className="shrink-0 tabular-nums text-ink-1">{r}% <span className="text-xs text-ink-3">{t("md.of", { n: c.n })}</span></span>
                                </div>
                                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                                    <div className={cn("h-full rounded-full", r >= 50 ? "bg-positive" : "bg-negative")} style={{ width: `${r}%` }} />
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}

function merge(details: OwnMapDetail[]): OwnMapDetail {
    const cells = (pick: (d: OwnMapDetail) => Record<string, RateCell>) => {
        const out: Record<string, RateCell> = {}
        for (const d of details) for (const [k, c] of Object.entries(pick(d))) {
            const o = out[k] ?? (out[k] = { n: 0, won: 0 })
            o.n += c.n; o.won += c.won
        }
        return out
    }
    return {
        side: sumTallies(details.map(d => d.side)),
        pistol: details.reduce((p, d) => ({ n: p.n + d.pistol.n, won: p.won + d.pistol.won }), { n: 0, won: 0 }),
        buys: cells(d => d.buys), tPlans: cells(d => d.tPlans), ctSetups: cells(d => d.ctSetups), calls: cells(d => d.calls), playstyles: cells(d => d.playstyles),
    }
}

/** G2: your round win rates by map, side, buy, plan and call. History only. */
export function MapDataPanel() {
    const state = useGameStore(useShallow(s => ({ mapRecords: s.mapRecords, playerTeamId: s.playerTeamId })))
    const [season, setSeason] = useState<"current" | "previous">("current")
    const [scope, setScope] = useState<"official" | "friendly">("official")
    const [selected, setSelected] = useState<string | null>(null)
    const byMap = ownMapDetail(state, season, scope)
    const maps = Object.entries(byMap).sort((a, b) => b[1].side[0] - a[1].side[0] || a[0].localeCompare(b[0]))
    const focus = useMemo(() => (selected && byMap[selected] ? byMap[selected] : merge(Object.values(byMap))), [byMap, selected])
    const hasPrevious = !!state.mapRecords?.previous?.own

    return (
        <div className="space-y-4">
            <Panel
                title={t("md.title")}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented label={t("md.season")} value={season} onChange={v => { setSeason(v); setSelected(null) }}
                            options={hasPrevious ? [["current", t("md.thisSeason")], ["previous", t("md.lastSeason")]] : [["current", t("md.thisSeason")]]} />
                        <Segmented label={t("md.matches")} value={scope} onChange={v => { setScope(v); setSelected(null) }} options={[["official", t("md.official")], ["friendly", t("md.friendlies")]]} />
                    </div>
                }
                padded={false}
            >
                {maps.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-ink-3">{t(`md.empty.${scope}.${season}`)}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-4">{t("md.col.map")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("md.col.maps")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("md.col.mapWin")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("md.col.ct")}</th>
                                    <th data-slot="table-head" className="px-3 text-right">{t("md.col.t")}</th>
                                    <th data-slot="table-head" className="pr-4 text-right">{t("md.col.pistols")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {maps.map(([map, d]) => {
                                    const [n, won, ctN, ctW, tN, tW] = d.side
                                    const active = selected === map
                                    return (
                                        <tr key={map} className={cn("h-10 cursor-pointer border-b border-line last:border-0 hover:bg-hover", active && "bg-raised")}
                                            onClick={() => setSelected(active ? null : map)} aria-selected={active}>
                                            <td className="pl-4 text-sm font-semibold text-ink-1">
                                                <button type="button" className="text-left hover:text-gold" onClick={e => { e.stopPropagation(); setSelected(active ? null : map) }}>{getMapName(map)}</button>
                                            </td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{won}–{n - won}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-1">{pct(won, n)}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-side-ct">{pct(ctW, ctN)} <span className="text-xs text-ink-3">{ctW}/{ctN}</span></td>
                                            <td className="px-3 text-right text-sm tabular-nums text-side-t">{pct(tW, tN)} <span className="text-xs text-ink-3">{tW}/{tN}</span></td>
                                            <td className="pr-4 text-right text-sm tabular-nums text-ink-2">{pct(d.pistol.won, d.pistol.n)} <span className="text-xs text-ink-3">{d.pistol.won}/{d.pistol.n}</span></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>

            {maps.length > 0 && (
                <Panel title={selected ? t("md.breakdown", { map: getMapName(selected) }) : t("md.allBreakdown")} actions={<span className="text-xs text-ink-3">{selected ? t("md.clickAgain") : t("md.clickMap")}</span>}>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                        <RateBars title={t("md.byBuy")} cells={focus.buys} labels={buyLabels()} />
                        <RateBars title={t("md.tPlan")} cells={focus.tPlans} labels={tPlanLabels()} />
                        <RateBars title={t("md.ctSetup")} cells={focus.ctSetups} labels={ctSetupLabels()} />
                        <RateBars title={t("md.calls")} cells={focus.calls} labels={buyLabels()} />
                        <RateBars title={t("md.styles")} cells={focus.playstyles} labels={styleLabels()} unit="maps" />
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-ink-3">
                        {t("md.note")}
                    </p>
                </Panel>
            )}
        </div>
    )
}
