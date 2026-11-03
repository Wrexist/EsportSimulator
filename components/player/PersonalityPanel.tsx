"use client"
import { t, tn } from "@/lib/i18n"

import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import {
    ARCHETYPE_INFO, dressingRoomRules, PROMISE_LABEL, TRAIT_INFO,
    activePromise, captainDefeatShield, captainId, getArchetype, mentorTrainingFactor,
} from "@/engine/personality"
import { PERSONALITY_TUNING, STORY_TUNING } from "@/lib/balance-tuning"
import type { PlayerSaveData } from "@/engine/save-types"
import { ArchetypeChip, TraitChip, playstyleTraits } from "./PersonalityChips"

/**
 * Personality on the player page: archetype with every effect the engine
 * applies, playstyle traits with their match effect, and his dressing-room
 * status at the managed club (captain, mentor, bench run, promise).
 */
export function PersonalityPanel({ player }: { player: PlayerSaveData }) {
    const team = useGameStore(s => s.teams.find(tm => tm.rosterIds.includes(player.id)))
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
        if (captain === player.id) status.push(t("player.personality.captain", { team: team.name, pct: Math.round(captainDefeatShield(player) * 100) }))
        const asMentor = team.dressingRoom?.mentorships?.find(m => m.mentorId === player.id)
        if (asMentor) status.push(t("player.personality.mentors", { name: lookup(asMentor.menteeId)?.nickname ?? t("player.personality.aYoungster") }))
        const factor = mentorTrainingFactor(team, player.id, lookup)
        if (factor > 1) {
            const mentor = team.dressingRoom?.mentorships?.find(m => m.menteeId === player.id)
            status.push(t("player.personality.mentoredBy", { name: lookup(mentor?.mentorId ?? "")?.nickname ?? t("player.personality.aVeteran"), pct: Math.round((factor - 1) * 100) }))
        }
        const apps = player.personality?.apps
        if (apps && apps.teamId === team.id) {
            if (apps.benched >= PERSONALITY_TUNING.BENCH_MATCHES && apps.regular && !player.injury) status.push(tn("player.personality.satOut", apps.benched))
            else if (apps.regular) status.push(t("player.personality.regular"))
        }
    }
    const promise = activePromise(player)
    if (promise) status.push(tn("player.personality.promise", Math.max(0, promise.deadlineWeek - currentWeek), { promise: PROMISE_LABEL[promise.kind].promise, week: promise.deadlineWeek }))
    const last = player.personality?.lastPromise
    if (last && !promise) status.push(t("player.personality.lastPromise", { outcome: last.outcome === "KEPT" ? PROMISE_LABEL[last.kind].kept : PROMISE_LABEL[last.kind].broken, week: last.week }))
    // Phase 5.3: the last-dance storyline's persuasion (engine/retirement-chance.ts).
    if (player.personality?.persuadedSeason === Math.floor((currentWeek - 1) / 52) + 1) status.push(t("player.personality.persuaded", { factor: STORY_TUNING.PERSUADE_RETIREMENT_FACTOR }))
    if (isOwn && (player.personality?.unhappyWeeks ?? 0) > 0) status.push(tn("player.personality.unhappy", player.personality!.unhappyWeeks!, { morale: PERSONALITY_TUNING.UNHAPPY_MORALE }))

    return (
        <Panel title={t("player.personality.title")} actions={<ArchetypeChip archetype={archetype} />}>
            <p className="text-sm text-ink-2">{info.short}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-1">
                {info.effects.map(line => <li key={line} className="flex gap-2"><span aria-hidden className="text-gold">•</span><span>{line}</span></li>)}
            </ul>
            {traits.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-line pt-3">
                    {traits.map(trait => (
                        <div key={trait} className="flex items-start gap-2 text-sm">
                            <TraitChip trait={trait} className="mt-0.5 shrink-0" />
                            <span className="text-ink-2">{TRAIT_INFO[trait].effect}</span>
                        </div>
                    ))}
                </div>
            )}
            {status.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm text-ink-2">
                    {status.map(line => <li key={line}>{line}</li>)}
                </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{dressingRoomRules().join(" ")}</p>
        </Panel>
    )
}
