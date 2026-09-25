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
import { Button } from "@/components/ui/button"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"

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
    const attributes = ["rifle", "awp", "pistol", "grenades", "clutch", "reaction", "tactic", "teamwork", "potential"] as const
    const candidates = state.players.filter(p => p.id !== player.id && !p.isRetired && (knownIds.includes(p.id) || state.watchlistedPlayerIds.includes(p.id)))
    return <section className="max-w-5xl space-y-5 rounded-xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex items-center gap-5">
            <PlayerPortrait src={player.portraitPath} seed={player.id} size={96} alt={player.nickname} className="h-24 w-24 rounded-xl" />
            <div><p className="text-xs text-slate-400">Recruitment profile · {report.scoutingLevel.toLowerCase()} report</p>
                <h1 className="text-3xl font-semibold">{player.nickname}</h1>
                <p className="text-sm text-slate-300">{owner?.name || (academyHeld ? "Academy prospect" : "Free agent")} · {player.age} yrs · {player.role}</p>
                <CountryFlag country={player.nationality} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div><p className="text-slate-400">Overall estimate</p><p className="text-2xl">{formatScoutedRating(report.ovrRange)}</p></div>
            <div><p className="text-slate-400">Opening wage expectation</p><p>${recruitmentSalary(player, state.currentWeek).toLocaleString()}/wk</p></div>
            <div><p className="text-slate-400">Contract</p><p>{contract ? `${contract.endWeek - state.currentWeek} weeks remaining` : "No active senior contract"}</p></div>
        </div>
        <p className="text-sm text-slate-400">Ranges are scouting estimates. A better scout narrows them; an elite report reveals all attributes. Wage and contract terms are confirmed during negotiation.</p>
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => state.toggleWatchlistPlayer(player.id)}>{state.watchlistedPlayerIds.includes(player.id) ? "Remove from shortlist" : "Shortlist player"}</Button>
            {!knownIds.includes(player.id) && <Button variant="outline" disabled={!!mission || report.scoutingLevel === "ELITE" || player.isRetired}
                onClick={() => state.startScoutingMission(player.id)}>{report.isScouted ? "Improve report · $3,000" : "Scout player · $3,000"}</Button>}
            {!academyHeld && !player.isRetired && owner?.id !== state.playerTeamId && <Button onClick={() => setNegotiating(true)}>Negotiate contract</Button>}
            <Button variant="ghost" asChild><Link href="/scouting">Scouting department</Link></Button>
        </div>
        {mission?.playerId === player.id && <div className="flex items-center justify-between gap-4 text-sm border border-white/10 rounded-lg p-3">
            <p>Report due in {Math.max(0, mission.completionWeek - state.currentWeek)} {mission.completionWeek - state.currentWeek === 1 ? "week" : "weeks"}. Mission fee is non-refundable.</p>
            <Button variant="ghost" onClick={state.cancelScoutingMission}>Cancel scouting</Button>
        </div>}
        <label className="block text-sm text-slate-300">Compare with squad or shortlist
            <select className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-900 p-3" value={comparisonId} onChange={e => setComparisonId(e.target.value)}>
                <option value="">Select a player</option>{candidates.map(p => <option value={p.id} key={p.id}>{p.nickname} · {p.role}</option>)}
            </select>
        </label>
        <table className="w-full text-sm"><thead><tr className="text-left text-slate-400"><th className="py-2">Attribute</th><th>{player.nickname}</th>{compared && <th>{compared.nickname}</th>}</tr></thead>
            <tbody><tr className="border-t border-white/10"><td className="py-3">Overall</td><td>{formatScoutedRating(report.ovrRange)}</td>{other && <td>{formatScoutedRating(other.ovrRange)}</td>}</tr>
                {attributes.map(key => <tr className="border-t border-white/5" key={key}><td className="py-2 capitalize">{key}</td><td>{report.exactStats?.[key] === undefined ? "Not yet known" : Math.round(report.exactStats[key]!)}</td>{other && <td>{other.exactStats?.[key] === undefined ? "Not yet known" : Math.round(other.exactStats[key]!)}</td>}</tr>)}</tbody>
        </table>
        <p className="text-xs text-slate-400">After signing, use Squad to choose your starting five. Match and tournament eligibility are checked when selecting the lineup.</p>
        <NegotiationModal playerId={player.id} isOpen={negotiating} onClose={() => setNegotiating(false)} />
    </section>
}
