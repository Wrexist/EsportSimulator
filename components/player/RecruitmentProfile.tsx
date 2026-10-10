"use client"

import { useState } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData } from "@/engine/save-types"
import { getVisibleStats, formatScoutedRating } from "@/engine/scouting-system"
import { academyHeldPlayerIds, recruitmentSalary } from "@/engine/recruitment"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { Button } from "@/components/ui/button"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { formatCurrency } from "@/lib/utils-extended"

const ATTRIBUTES = [
    ["skill", "Aim"], ["rifle", "Rifle"], ["awp", "AWP"], ["pistol", "Pistol"], ["grenades", "Utility"], ["clutch", "Clutch"],
    ["reaction", "Reaction"], ["tactic", "Tactics"], ["teamwork", "Teamwork"], ["potential", "Potential"],
] as const

/** Recruitment reads only the report's permitted attributes. The squad profile remains separate. */
export function RecruitmentProfile({ player }: { player: PlayerSaveData }) {
    const state = useGameStore(useShallow(s => ({ teams: s.teams, players: s.players, playerTeamId: s.playerTeamId,
        scoutedPlayers: s.scoutedPlayers, currentWeek: s.currentWeek, contracts: s.contracts,
        watchlistedPlayerIds: s.watchlistedPlayerIds, activeScoutingMission: s.activeScoutingMission,
        academyPlayers: s.academyPlayers, academyPendingProspects: s.academyPendingProspects,
        startScoutingMission: s.startScoutingMission, cancelScoutingMission: s.cancelScoutingMission,
        toggleWatchlistPlayer: s.toggleWatchlistPlayer })))
    const [negotiating, setNegotiating] = useState(false)
    const [comparisonId, setComparisonId] = useState("")
    const ownTeam = state.teams.find(t => t.id === state.playerTeamId)
    const owner = state.teams.find(t => t.rosterIds.includes(player.id))
    const knownIds = [...(ownTeam?.rosterIds || []), ...state.academyPlayers.map(p => p.playerId)]
    const report = getVisibleStats(player, state.scoutedPlayers, knownIds, state.currentWeek)
    const compared = state.players.find(p => p.id === comparisonId)
    const other = compared && getVisibleStats(compared, state.scoutedPlayers, knownIds, state.currentWeek)
    const mission = state.activeScoutingMission
    const academyHeld = academyHeldPlayerIds(state).has(player.id)
    const contract = state.contracts.find(c => c.playerId === player.id && c.teamId === owner?.id && c.endWeek > state.currentWeek)
    const candidates = state.players.filter(p => p.id !== player.id && !p.isRetired && (knownIds.includes(p.id) || state.watchlistedPlayerIds.includes(p.id)))
    const shortlisted = state.watchlistedPlayerIds.includes(player.id)
    const canNegotiate = !academyHeld && !player.isRetired && owner?.id !== state.playerTeamId
    const realName = player.name && player.name !== player.nickname ? player.name : null
    // Aim always has a scouted range; the rest stay unknown until the report reveals them.
    const fmt = (stats: typeof report, key: (typeof ATTRIBUTES)[number][0]) =>
        stats.exactStats?.[key] !== undefined ? Math.round(stats.exactStats[key]!)
            : key === "skill" ? formatScoutedRating(stats.skillRange)
                : <span className="text-ink-3">Unknown</span>

    return (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
            <section className="min-w-0 self-start overflow-hidden rounded-[10px] border border-line bg-panel">
                <div className="relative flex h-[200px] items-end justify-center border-b border-line bg-raised">
                    <div className="absolute left-4 top-4 flex min-w-0 items-center gap-2">
                        {owner && <TeamLogoDisplay team={owner} size={24} />}
                        <span className="truncate text-sm font-semibold text-ink-1">{owner?.name || (academyHeld ? "Academy prospect" : "Free agent")}</span>
                    </div>
                    <span className="absolute right-4 top-4 rounded-sm border border-line-strong bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">
                        {report.scoutingLevel.toLowerCase()} report
                    </span>
                    <div className="h-[168px] w-[168px] overflow-hidden rounded-t-lg">
                        <PlayerPortrait src={player.portraitPath} seed={player.id} size={168} alt={player.nickname} variant="hero" className="rounded-none border-0" />
                    </div>
                </div>
                <div className="space-y-5 p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="premium-eyebrow">Recruitment profile</p>
                            <h1 className="truncate font-display text-5xl font-bold uppercase leading-none text-ink-1">{player.nickname}</h1>
                            <div className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                                <CountryFlag country={player.nationality} size={16} />
                                <span className="truncate">{realName ?? String(player.nationality || "").toUpperCase()}</span>
                                <span className="text-ink-3">·</span>
                                <span className="tabular-nums">{player.age} yrs</span>
                            </div>
                            <div className="mt-3"><RoleTag role={player.role} /></div>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className="font-display text-5xl font-bold leading-none tabular-nums text-ink-1">{formatScoutedRating(report.ovrRange)}</p>
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Overall est.</p>
                        </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
                        <div className="bg-panel px-3 py-2.5">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Wage ask</dt>
                            <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink-1">
                                {formatCurrency(recruitmentSalary(player, state.currentWeek, ownTeam), "$", false)}<span className="ml-1 font-sans text-xs font-normal text-ink-3">/ wk</span>
                            </dd>
                        </div>
                        <div className="bg-panel px-3 py-2.5">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Contract</dt>
                            <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink-1">{contract ? `${contract.endWeek - state.currentWeek} wks` : "None"}</dd>
                        </div>
                    </dl>

                    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                        {canNegotiate && <Button className="flex-1" onClick={() => setNegotiating(true)}>Negotiate contract</Button>}
                        <Button variant="outline" className="flex-1" onClick={() => state.toggleWatchlistPlayer(player.id)}>{shortlisted ? "Remove from shortlist" : "Shortlist"}</Button>
                        {!knownIds.includes(player.id) && (
                            <Button variant="outline" className="flex-1" disabled={!!mission || report.scoutingLevel === "ELITE" || player.isRetired}
                                onClick={() => state.startScoutingMission(player.id)}>
                                {report.isScouted ? "Improve report · $3,000" : "Scout · $3,000"}
                            </Button>
                        )}
                    </div>
                    {mission?.playerId === player.id && (
                        <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-ink-2">
                            <p>Report due in {Math.max(0, mission.completionWeek - state.currentWeek)} {mission.completionWeek - state.currentWeek === 1 ? "week" : "weeks"}. The fee is non-refundable.</p>
                            <Button variant="ghost" size="sm" onClick={state.cancelScoutingMission}>Cancel</Button>
                        </div>
                    )}
                </div>
            </section>

            <div className="min-w-0 space-y-4">
                <Panel
                    title="Scouting report"
                    actions={
                        <label className="flex items-center gap-2 text-xs text-ink-3">
                            Compare with
                            <select
                                className="h-8 rounded border border-line bg-shell px-2 text-sm text-ink-1"
                                value={comparisonId}
                                onChange={e => setComparisonId(e.target.value)}
                            >
                                <option value="">Nobody</option>
                                {candidates.map(p => <option value={p.id} key={p.id}>{p.nickname} · {p.role}</option>)}
                            </select>
                        </label>
                    }
                    padded={false}
                >
                    <table data-slot="table" className="w-full border-collapse text-left">
                        <thead data-slot="table-header">
                            <tr className="border-b border-line">
                                <th data-slot="table-head" className="pl-4">Attribute</th>
                                <th data-slot="table-head" className="px-3 text-right">{player.nickname}</th>
                                {compared && <th data-slot="table-head" className="pr-4 text-right">{compared.nickname}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="h-10 border-b border-line">
                                <td className="pl-4 text-sm font-semibold text-ink-1">Overall</td>
                                <td className="px-3 text-right text-sm font-semibold tabular-nums text-ink-1">{formatScoutedRating(report.ovrRange)}</td>
                                {other && <td className="pr-4 text-right text-sm font-semibold tabular-nums text-ink-1">{formatScoutedRating(other.ovrRange)}</td>}
                            </tr>
                            {ATTRIBUTES.map(([key, label]) => (
                                <tr key={key} className="h-10 border-b border-line last:border-0">
                                    <td className="pl-4 text-sm text-ink-2">{label}</td>
                                    <td className="px-3 text-right text-sm tabular-nums text-ink-1">{fmt(report, key)}</td>
                                    {other && <td className="pr-4 text-right text-sm tabular-nums text-ink-1">{fmt(other, key)}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                        Ranges are estimates. A better scout narrows them and an elite report shows every attribute. Wage and length are settled in negotiation; after signing, pick your starting five in Squad.
                    </p>
                </Panel>
                <p className="text-sm text-ink-3">
                    Looking for more options? <Link href="/scouting" className="font-semibold text-ink-2 hover:text-gold">Open scouting</Link>
                </p>
            </div>
            <NegotiationModal playerId={player.id} isOpen={negotiating} onClose={() => setNegotiating(false)} />
        </div>
    )
}
