"use client"

/**
 * G1: the playbook — one call per map, side and buy. "IGL decides" leaves
 * the round to the in-game leader's mix, as before. Each row shows how the
 * plan has done on this map this season (official matches).
 */

import { useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { ACTIVE_MAP_POOL, getMapName } from "@/data/map-pool"
import { ownMapDetail, rate, type RateCell } from "@/engine/map-record"
import {
    CT_SETUP_HINT, CT_SETUP_LABEL, CT_SETUPS, PLAY_SITUATIONS, decodePlaybook, encodePlaybook, sanitizePlaybook, SITUATION_LABEL, T_CALL_HINT, T_CALL_LABEL, T_CALL_STRATEGIES,
    type MapPlaybook, type PlaySituation, type Playbook, type TCall, type TCallStrategy,
} from "@/engine/match/playbook"
import type { CtSetup, SiteId } from "@/engine/match/round-script-types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/src/components/ui/Panel"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

const AUTO = "auto"
const ANY = "any"

function RateNote({ cell }: { cell?: RateCell }) {
    if (!cell?.n) return <span className="text-xs text-ink-3">No rounds yet</span>
    return (
        <span className={cn("text-xs tabular-nums text-ink-3", cell.n < 8 && "opacity-60")}
            title="Every round you played this plan on this map this season, at any buy and whoever made the call">
            {rate(cell.won, cell.n)}% of {cell.n} rounds with this plan here
        </span>
    )
}

export interface PlaybookEditorProps {
    /** Maps to offer (default: the active pool). The first is selected. */
    maps?: string[]
    className?: string
}

export function PlaybookEditor({ maps = ACTIVE_MAP_POOL, className }: PlaybookEditorProps) {
    const { playerTeamId, teams, mapRecords, setPlaybook } = useGameStore(useShallow(s => ({
        playerTeamId: s.playerTeamId, teams: s.teams, mapRecords: s.mapRecords, setPlaybook: s.setPlaybook,
    })))
    const team = teams.find(t => t.id === playerTeamId)
    const [mapId, setMapId] = useState<string>(maps[0] ?? ACTIVE_MAP_POOL[0])
    const [importing, setImporting] = useState(false)
    const [code, setCode] = useState("")
    const playbook: Playbook = useMemo(() => sanitizePlaybook(team?.playbook), [team?.playbook])
    // Match prep can offer a map outside the active pool: copy and import reach it too.
    const allMaps = [...new Set([...ACTIVE_MAP_POOL, ...maps])]
    const book: MapPlaybook = playbook[mapId] ?? {}
    const detail = useMemo(() => ownMapDetail({ mapRecords, playerTeamId }, "current", "official")[mapId], [mapRecords, playerTeamId, mapId])
    if (!team || !playerTeamId) return null

    const save = (next: MapPlaybook, target = mapId) => {
        const clean: MapPlaybook = {}
        if (next.t && Object.keys(next.t).length) clean.t = next.t
        if (next.ct && Object.keys(next.ct).length) clean.ct = next.ct
        const all = { ...playbook }
        if (clean.t || clean.ct) all[target] = clean
        else delete all[target]
        setPlaybook(playerTeamId, all)
    }
    const setT = (sit: PlaySituation, call: TCall | null) => {
        const t = { ...book.t }
        if (call) t[sit] = call
        else delete t[sit]
        save({ ...book, t })
    }
    const setCt = (sit: PlaySituation, setup: CtSetup | null) => {
        const ct = { ...book.ct }
        if (setup) ct[sit] = setup
        else delete ct[sit]
        save({ ...book, ct })
    }
    const copyToAll = () => {
        const all: Playbook = { ...playbook }
        if (!book.t && !book.ct) return
        for (const m of allMaps) all[m] = book
        setPlaybook(playerTeamId, all)
        toast.success("Playbook copied", { description: `${getMapName(mapId)}'s calls now apply on every map.` })
    }
    const copyCode = async () => {
        const text = encodePlaybook(playbook)
        try {
            await navigator.clipboard.writeText(text)
            toast.success("Share code copied", { description: text })
        } catch {
            toast.info("Share code", { description: text })
        }
    }
    const importCode = () => {
        const read = decodePlaybook(code, allMaps)
        if (!read || !Object.keys(read).length) {
            toast.error("Not a playbook code", { description: "Codes start with PB1 and name at least one map in the pool." })
            return
        }
        setPlaybook(playerTeamId, { ...playbook, ...read })
        toast.success("Playbook imported", { description: `Calls set on ${Object.keys(read).map(getMapName).join(", ")}.` })
        setCode("")
        setImporting(false)
    }
    const setCount = (m: string) => Object.keys(playbook[m]?.t ?? {}).length + Object.keys(playbook[m]?.ct ?? {}).length

    return (
        <Panel title="Playbook" className={className}
            actions={<span className="text-xs text-ink-3">Applies from the next match you start</span>}>
            <div className="space-y-4">
                <div role="group" aria-label="Map" className="flex flex-wrap gap-1.5">
                    {maps.map(m => (
                        <button key={m} type="button" aria-pressed={m === mapId} onClick={() => setMapId(m)}
                            className={cn("rounded border px-2.5 py-1 text-xs font-semibold transition-colors",
                                m === mapId ? "border-ink-2 bg-raised text-ink-1" : "border-line text-ink-3 hover:text-ink-2")}>
                            {getMapName(m)}{setCount(m) ? <span className="ml-1 text-ink-3">· {setCount(m)}</span> : null}
                        </button>
                    ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <section aria-label="T side calls" className="min-w-0">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-side-t">T side</h3>
                        <ul className="mt-2 space-y-3">
                            {PLAY_SITUATIONS.map(sit => {
                                const call = book.t?.[sit]
                                return (
                                    <li key={sit} className="space-y-1">
                                        <div className="text-sm font-semibold text-ink-1">{SITUATION_LABEL[sit]}</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Select value={call?.strategy ?? AUTO} onValueChange={v => setT(sit, v === AUTO ? null : { strategy: v as TCallStrategy, ...(call?.site ? { site: call.site } : {}) })}>
                                                <SelectTrigger className="h-9 w-[150px] text-sm" aria-label={`T call, ${SITUATION_LABEL[sit]}`}>
                                                    <SelectValue>{call ? T_CALL_LABEL[call.strategy] : "IGL decides"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={AUTO}>IGL decides</SelectItem>
                                                    {T_CALL_STRATEGIES.map(s => <SelectItem key={s} value={s}>{T_CALL_LABEL[s]}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Select value={call?.site ?? ANY} disabled={!call} onValueChange={v => call && setT(sit, { strategy: call.strategy, ...(v === ANY ? {} : { site: v as SiteId }) })}>
                                                <SelectTrigger className="h-9 w-[110px] text-sm" aria-label={`T site, ${SITUATION_LABEL[sit]}`}>
                                                    <SelectValue>{call?.site ? `${call.site} site` : "IGL's site"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={ANY}>IGL&apos;s site</SelectItem>
                                                    <SelectItem value="A">A site</SelectItem>
                                                    <SelectItem value="B">B site</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {call && <RateNote cell={detail?.tPlans[call.strategy]} />}
                                        </div>
                                        {call && <p className="text-xs text-ink-3">{T_CALL_HINT[call.strategy]}.</p>}
                                    </li>
                                )
                            })}
                        </ul>
                        <p className="mt-2 text-xs text-ink-3">Eco rounds stay with the IGL: a save or an eco rush.</p>
                    </section>

                    <section aria-label="CT side setups" className="min-w-0">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-side-ct">CT side</h3>
                        <ul className="mt-2 space-y-3">
                            {PLAY_SITUATIONS.map(sit => {
                                const setup = book.ct?.[sit]
                                return (
                                    <li key={sit} className="space-y-1">
                                        <div className="text-sm font-semibold text-ink-1">{sit === "force" ? "Eco / force buy" : SITUATION_LABEL[sit]}</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Select value={setup ?? AUTO} onValueChange={v => setCt(sit, v === AUTO ? null : v as CtSetup)}>
                                                <SelectTrigger className="h-9 w-[150px] text-sm" aria-label={`CT setup, ${SITUATION_LABEL[sit]}`}>
                                                    <SelectValue>{setup ? CT_SETUP_LABEL[setup] : "IGL decides"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={AUTO}>IGL decides</SelectItem>
                                                    {CT_SETUPS.map(s => <SelectItem key={s} value={s}>{CT_SETUP_LABEL[s]}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            {setup && <RateNote cell={detail?.ctSetups[setup]} />}
                                        </div>
                                        {setup && <p className="text-xs text-ink-3">{CT_SETUP_HINT[setup]}.</p>}
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                </div>

                <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
                    A fixed call is predictable. Each time the same T call runs again on a map, the other side reads it more often,
                    and a stack that keeps sitting on one site gets hit on the other. &ldquo;IGL decides&rdquo; mixes the calls for you.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!book.t && !book.ct} onClick={copyToAll}>Use these calls on every map</Button>
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!book.t && !book.ct} onClick={() => save({})}>Clear {getMapName(mapId)}</Button>
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" disabled={!Object.keys(playbook).length} onClick={copyCode}>Copy share code</Button>
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs" aria-expanded={importing} onClick={() => setImporting(v => !v)}>Paste a code</Button>
                </div>
                {importing && (
                    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); importCode() }}>
                        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="PB1 Mirage:r.r.eA/2.g.g" aria-label="Playbook share code" className="h-8 min-w-0 flex-1 font-mono text-xs" />
                        <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={!code.trim()}>Import</Button>
                    </form>
                )}
            </div>
        </Panel>
    )
}
