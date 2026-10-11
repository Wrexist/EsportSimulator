"use client"

import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import {
    ARCHETYPE_INFO, DRESSING_ROOM_RULES, PROMISE_LABEL, TRAIT_INFO,
    activePromise, captainDefeatShield, captainId, getArchetype, mentorTrainingFactor,
} from "@/engine/personality"
import { PERSONALITY_TUNING } from "@/lib/balance-tuning"
import type { PlayerSaveData } from "@/engine/save-types"
import { ArchetypeChip, TraitChip, playstyleTraits } from "./PersonalityChips"

/**
 * Personality on the player page: archetype with every effect the engine
 * applies, playstyle traits with their match effect, and his dressing-room
 * status at the managed club (captain, mentor, bench run, promise).
 */
export function PersonalityPanel({ player }: { player: PlayerSaveData }) {
    const team = useGameStore(s => s.teams.find(t => t.rosterIds.includes(player.id)))
    const isOwn = useGameStore(s => s.playerTeamId === team?.id)
    const players = useGameStore(s => s.players)
    const currentWeek = useGameStore(s => s.currentWeek)
    const archetype = getArchetype(player)
    const info = ARCHETYPE_INFO[archetype]
    const traits = playstyleTraits(player)
    const lookup = (id: string) => players.find(p => p.id === id)

    const status: string[] = []
    if (team) {
        const captain = captainId(team, lookup)
        if (captain === player.id) status.push(`Captain of ${team.name}: when he plays, defeats cost the lineup ${Math.round(captainDefeatShield(player) * 100)}% less morale.`)
        const asMentor = team.dressingRoom?.mentorships?.find(m => m.mentorId === player.id)
        if (asMentor) status.push(`Mentors ${lookup(asMentor.menteeId)?.nickname ?? "a youngster"}.`)
        const factor = mentorTrainingFactor(team, player.id, lookup)
        if (factor > 1) {
            const mentor = team.dressingRoom?.mentorships?.find(m => m.menteeId === player.id)
            status.push(`Mentored by ${lookup(mentor?.mentorId ?? "")?.nickname ?? "a veteran"}: training gains +${Math.round((factor - 1) * 100)}%.`)
        }
        const apps = player.personality?.apps
        if (apps && apps.teamId === team.id) {
            if (apps.benched >= PERSONALITY_TUNING.BENCH_MATCHES && apps.regular && !player.injury) status.push(`Sat out ${apps.benched} official matches in a row: losing morale each week until he plays.`)
            else if (apps.regular) status.push("Regular starter.")
        }
    }
    const promise = activePromise(player)
    if (promise) status.push(`Promise: “${PROMISE_LABEL[promise.kind].promise}” — settles by week ${promise.deadlineWeek} (${Math.max(0, promise.deadlineWeek - currentWeek)} weeks left).`)
    const last = player.personality?.lastPromise
    if (last && !promise) status.push(`${last.outcome === "KEPT" ? PROMISE_LABEL[last.kind].kept : PROMISE_LABEL[last.kind].broken} (week ${last.week}).`)
    if (isOwn && (player.personality?.unhappyWeeks ?? 0) > 0) status.push(`Morale under ${PERSONALITY_TUNING.UNHAPPY_MORALE} for ${player.personality!.unhappyWeeks} week${player.personality!.unhappyWeeks === 1 ? "" : "s"}.`)

    return (
        <Panel title="Personality" actions={<ArchetypeChip archetype={archetype} />}>
            <p className="text-sm text-ink-2">{info.short}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-1">
                {info.effects.map(line => <li key={line} className="flex gap-2"><span aria-hidden className="text-gold">•</span><span>{line}</span></li>)}
            </ul>
            {traits.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-line pt-3">
                    {traits.map(t => (
                        <div key={t} className="flex items-start gap-2 text-sm">
                            <TraitChip trait={t} className="mt-0.5 shrink-0" />
                            <span className="text-ink-2">{TRAIT_INFO[t].effect}</span>
                        </div>
                    ))}
                </div>
            )}
            {status.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm text-ink-2">
                    {status.map(line => <li key={line}>{line}</li>)}
                </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{DRESSING_ROOM_RULES.join(" ")}</p>
        </Panel>
    )
}
