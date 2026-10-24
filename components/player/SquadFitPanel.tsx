"use client"

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData } from "@/engine/save-types"
import { squadFit, type FitTone } from "@/engine/squad-fit"
import { recruitmentSalary } from "@/engine/recruitment"
import { formatCurrency } from "@/lib/utils-extended"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"

const DOT: Record<FitTone, string> = { good: "bg-positive", warn: "bg-negative", info: "bg-ink-3" }
const SR: Record<FitTone, string> = { good: "Good:", warn: "Warning:", info: "" }

/**
 * How a transfer target would sit in your dressing room at his asking wage,
 * using only what scouting shows of him (engine/squad-fit.ts).
 */
export function SquadFitPanel({ player, rating, exact, leader }: { player: PlayerSaveData; rating: number; exact: boolean; leader?: number }) {
    const { teams, players, playerTeamId, contracts, currentWeek } = useGameStore(useShallow(s => ({
        teams: s.teams, players: s.players, playerTeamId: s.playerTeamId, contracts: s.contracts, currentWeek: s.currentWeek,
    })))
    const team = teams.find(t => t.id === playerTeamId)
    const result = useMemo(() => {
        if (!team) return null
        const byId = new Map(players.map(p => [p.id, p]))
        const wage = recruitmentSalary(player, currentWeek, team)
        return { wage, lines: squadFit({ target: player, team, lookup: id => byId.get(id), contracts, currentWeek, wage, visible: { rating, exact, leader } }) }
    }, [team, players, player, contracts, currentWeek, rating, exact, leader])
    if (!result) return null
    return (
        <Panel title="Dressing room fit" eyebrow={`At about ${formatCurrency(result.wage, "$", false)} / wk`}>
            <ul className="space-y-2">
                {result.lines.map((l, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                        <span aria-hidden="true" className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", DOT[l.tone])} />
                        <span>{SR[l.tone] && <span className="sr-only">{SR[l.tone]} </span>}{l.text}</span>
                    </li>
                ))}
            </ul>
        </Panel>
    )
}
