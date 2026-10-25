"use client"

import { useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { getMapName } from "@/data/map-pool"
import { ownMapDetail, rate, sumTallies, type OwnMapDetail, type RateCell } from "@/engine/map-record"
import { Panel } from "@/src/components/ui/Panel"
import { CT_SETUP_LABEL, T_CALL_LABEL } from "@/engine/match/playbook"
import { cn } from "@/lib/utils"

const BUY_LABELS: Record<string, string> = { ECO: "Eco", FORCE: "Force", SEMIBUY: "Semi-buy", FULL: "Full buy", "DOUBLE AWP": "Double AWP" }
const T_PLAN_LABELS: Record<string, string> = { ...T_CALL_LABEL, eco: "Eco push" }
const CT_SETUP_LABELS: Record<string, string> = CT_SETUP_LABEL
const STYLE_LABELS: Record<string, string> = { aggressive: "Aggressive", structured: "Structured", balanced: "Balanced", default: "Default" }
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

function RateBars({ title, cells, labels, unit = "rounds" }: { title: string; cells: Record<string, RateCell>; labels: Record<string, string>; unit?: string }) {
    const rows = Object.entries(cells).sort((a, b) => b[1].n - a[1].n)
    return (
        <div className="min-w-0">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
            {rows.length === 0 ? <p className="mt-2 text-sm text-ink-3">None yet.</p> : (
                <ul className="mt-2 space-y-1.5">
                    {rows.map(([key, c]) => {
                        const r = rate(c.won, c.n) ?? 0
                        const small = c.n < SMALL_SAMPLE
                        return (
                            <li key={key} className={cn("text-sm", small && "opacity-60")} title={small ? `Only ${c.n} ${unit}: too few to read much into.` : undefined}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-ink-2">{labels[key] ?? key}</span>
                                    <span className="shrink-0 tabular-nums text-ink-1">{r}% <span className="text-xs text-ink-3">of {c.n}</span></span>
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
                title="Map data"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented label="Season" value={season} onChange={v => { setSeason(v); setSelected(null) }}
                            options={hasPrevious ? [["current", "This season"], ["previous", "Last season"]] : [["current", "This season"]]} />
                        <Segmented label="Matches" value={scope} onChange={v => { setScope(v); setSelected(null) }} options={[["official", "Official"], ["friendly", "Friendlies"]]} />
                    </div>
                }
                padded={false}
            >
                {maps.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-ink-3">No {scope === "official" ? "official matches" : "friendlies"} played {season === "current" ? "this season" : "last season"} yet. Every map you play adds to these numbers.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table data-slot="table" className="w-full min-w-[640px] border-collapse text-left">
                            <thead data-slot="table-header">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-4">Map</th>
                                    <th data-slot="table-head" className="px-3 text-right">Maps</th>
                                    <th data-slot="table-head" className="px-3 text-right">Map win</th>
                                    <th data-slot="table-head" className="px-3 text-right">CT rounds</th>
                                    <th data-slot="table-head" className="px-3 text-right">T rounds</th>
                                    <th data-slot="table-head" className="pr-4 text-right">Pistols</th>
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
                <Panel title={selected ? `${getMapName(selected)} breakdown` : "All maps breakdown"} actions={<span className="text-xs text-ink-3">{selected ? "Click the map again for all maps" : "Click a map to narrow it down"}</span>}>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                        <RateBars title="By your buy" cells={focus.buys} labels={BUY_LABELS} />
                        <RateBars title="T side: plan you ran" cells={focus.tPlans} labels={T_PLAN_LABELS} />
                        <RateBars title="CT side: setup you held" cells={focus.ctSetups} labels={CT_SETUP_LABELS} />
                        <RateBars title="Your buy calls" cells={focus.calls} labels={BUY_LABELS} />
                        <RateBars title="Playstyle (maps)" cells={focus.playstyles} labels={STYLE_LABELS} unit="maps" />
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-ink-3">
                        Round win rates from the matches you played. They are history, not odds, and they reset each season. Faded rows have too few rounds to read much into.
                    </p>
                </Panel>
            )}
        </div>
    )
}
