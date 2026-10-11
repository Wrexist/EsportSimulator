"use client"

/**
 * Home "Storylines" panel (Phase 5.3): the managed club's active stories with
 * their latest beat and what comes next (an open decision with its deadline,
 * or the next beat), a line on other clubs' stories, and the biggest rival.
 */

import Link from "next/link"
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { Button } from "@/components/ui/button"
import { useInboxDrawer } from "@/components/inbox/inbox-drawer-store"
import type { GameSave } from "@/engine/save-types"
import type { StoryArc } from "@/engine/storylines/types"
import { STORY_KIND_LABEL, activeArcs, arcHeadline, nextHint, worldArcs } from "@/engine/storylines/view"
import { getRivalriesWithNames } from "@/engine/history-tracker"
import { cn } from "@/lib/utils"

interface OpenDecision { id: string; deadline: number | null }

function ArcRow({ arc, decision, names, currentWeek }: { arc: StoryArc; decision: OpenDecision | null; names: Map<string, string>; currentWeek: number }) {
    const openInbox = useInboxDrawer(s => s.openInbox)
    const subjects = arc.playerIds.map(id => ({ id, name: names.get(id) })).filter(s => s.name)
    return (
        <li className="space-y-1.5 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{STORY_KIND_LABEL[arc.kind]}</p>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-3">Since week {((arc.startedWeek - 1) % 52) + 1}</span>
            </div>
            <p className="text-sm font-semibold leading-snug text-ink-1">{arcHeadline(arc)}</p>
            {subjects.length > 0 && (
                <p className="flex flex-wrap gap-x-3 text-xs">
                    {subjects.map(s => <Link key={s.id} href={`/player/${s.id}`} className="font-semibold text-ink-2 hover:text-gold">{s.name}</Link>)}
                </p>
            )}
            {decision ? (
                <div className="flex items-center justify-between gap-3 pt-0.5">
                    <span className={cn("text-xs", decision.deadline != null && decision.deadline <= currentWeek ? "text-caution" : "text-ink-3")}>
                        Your call{decision.deadline != null ? ` · answer by week ${((decision.deadline - 1) % 52) + 1}` : ""}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => openInbox("decisions", decision.id)}>Decide</Button>
                </div>
            ) : (
                <p className="text-xs text-ink-3">Next: {nextHint(arc)}</p>
            )}
        </li>
    )
}

export function StorylinesPanel({ className }: { className?: string }) {
    const { storylines, playerTeamId, eventsLog, players, teams, currentWeek } = useGameStore(useShallow(s => ({
        storylines: s.storylines,
        playerTeamId: s.playerTeamId,
        eventsLog: s.eventsLog,
        players: s.players,
        teams: s.teams,
        currentWeek: s.currentWeek,
    })))
    const active = useMemo(() => activeArcs(storylines, playerTeamId), [storylines, playerTeamId])
    const elsewhere = useMemo(() => worldArcs(storylines, playerTeamId).slice(0, 2), [storylines, playerTeamId])
    const names = useMemo(() => {
        const ids = new Set(active.flatMap(a => a.playerIds))
        return new Map(players.filter(p => ids.has(p.id)).map(p => [p.id, p.nickname || p.name]))
    }, [active, players])
    const decisions = useMemo(() => {
        const out = new Map<string, OpenDecision>()
        for (const arc of active) {
            if (!arc.eventId) continue
            const e = eventsLog.find(x => x.id === arc.eventId)
            const data = (e?.data ?? {}) as { deadlineWeek?: number; isWithdrawn?: boolean }
            if (e && e.selectedChoiceId === undefined && !data.isWithdrawn && (data.deadlineWeek == null || data.deadlineWeek >= currentWeek)) {
                out.set(arc.id, { id: e.id, deadline: typeof data.deadlineWeek === "number" ? data.deadlineWeek : null })
            }
        }
        return out
    }, [active, eventsLog, currentWeek])
    const rival = useMemo(() => {
        if (!playerTeamId) return null
        const top = getRivalriesWithNames({ teams } as unknown as GameSave, playerTeamId)[0]
        return top && top.matchesPlayed >= 3 ? top : null
    }, [teams, playerTeamId])

    return (
        <Panel
            title="Storylines"
            className={className}
            padded={false}
            actions={<span className="text-xs tabular-nums text-ink-3">{active.length ? `${active.length} active` : "None active"}</span>}
        >
            {active.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-3">No story is running at your club. They start from real events: form, contracts, rivalries, veterans and the board.</p>
            ) : (
                <ul className="divide-y divide-line">
                    {active.map(arc => <ArcRow key={arc.id} arc={arc} decision={decisions.get(arc.id) ?? null} names={names} currentWeek={currentWeek} />)}
                </ul>
            )}
            {elsewhere.length > 0 && (
                <div className="space-y-1 border-t border-line px-4 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Around the scene</p>
                    {elsewhere.map(a => <p key={a.id} className="text-xs leading-snug text-ink-2">{arcHeadline(a)}</p>)}
                </div>
            )}
            {rival && (
                <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
                    Biggest rival: <span className="font-semibold text-ink-2">{rival.opponentName}</span>
                    <span className="tabular-nums"> · {rival.wins}–{rival.losses} in {rival.matchesPlayed} meetings · {rival.intensity.toLowerCase()}</span>
                </p>
            )}
        </Panel>
    )
}
