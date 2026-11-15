/**
 * The field of an event on the week it starts.
 *
 * 1. Clubs that came through the event's qualifiers ("Via …") have their
 *    places kept for them.
 * 2. Invited / qualified clubs, then registered clubs, best world ranking
 *    first. The managed club keeps a registered place ahead of a computer
 *    club's registration or invite, never ahead of a qualifier winner.
 * 3. Remaining places go to the best-ranked computer clubs that may enter:
 *    a qualifier never takes a club that is in (or invited to) the event it
 *    leads to, nor one already playing a sibling qualifier, and a regional
 *    qualifier takes clubs of its region.
 *
 * Registrations that did not make the field are removed, so no club is left
 * "Registered" for an event it never played.
 */
import type { TournamentDefinition } from "@/data/tournament-calendar"
import type { GameSave, TeamSaveData } from "../save-types"
import { buildInstanceId, isQualificationForTournament } from "../circuit-engine"
import { QualificationEngine } from "../tournament-qualification"
import { TournamentManager } from "../tournament-manager"
import { feederEvents, qualifierEntryBlock, regionAllows } from "./qualification-path"

/**
 * Hands out the places of this event's qualifiers that finished but are not
 * settled yet. On the daily calendar a qualifier's final is played on its day
 * of the week before the event starts, and the standings step that settles it
 * runs after this tick's events have started, so without this its winners
 * would miss the field (COMP-16). The standings step later pays the prizes and
 * repeats the same (idempotent) qualification.
 */
function settleFinishedQualifiers(save: GameSave, definition: TournamentDefinition, season: number): void {
    for (const feeder of feederEvents(definition.id)) {
        const qualifier = save.tournaments.find(t => t.id === buildInstanceId(feeder.id, season))
        if (!qualifier?.isCompleted || qualifier.rewardsGranted) continue
        save.tournamentQualifications = QualificationEngine.processQualifierResults(
            save.tournamentQualifications || [], { ...feeder, id: qualifier.id }, TournamentManager.calculatePlacements(save, qualifier),
        )
    }
}

export function buildEventField(
    save: GameSave,
    definition: TournamentDefinition,
    instanceId: string,
    season: number,
    playerTeamId: string,
): string[] {
    const teamById = new Map(save.teams.map(t => [t.id, t]))
    const rankOf = (id: string) => teamById.get(id)?.worldRanking || 999
    const byRank = (a: string, b: string) => rankOf(a) - rankOf(b) || a.localeCompare(b)

    settleFinishedQualifiers(save, definition, season)

    const rows = (save.tournamentQualifications || []).filter(q =>
        isQualificationForTournament(q, instanceId) && (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED"))

    // A qualifier drops entrants that meanwhile reached the event it leads to
    // (an invite after they signed up) or a sibling qualifier.
    const blocked = new Set<string>()
    if (definition.qualifierFor) {
        for (const q of rows) {
            if (q.status === "REGISTERED" && q.teamId !== playerTeamId && qualifierEntryBlock(save, q.teamId, definition, season)) blocked.add(q.teamId)
            if (q.status === "REGISTERED" && q.teamId === playerTeamId && qualifierEntryBlock(save, q.teamId, definition, season) === "in_main") blocked.add(q.teamId)
        }
    }

    const via: string[] = [], qualified: string[] = [], registered: string[] = []
    const seen = new Set<string>()
    for (const q of rows) {
        if (seen.has(q.teamId) || blocked.has(q.teamId) || !teamById.has(q.teamId)) continue
        seen.add(q.teamId)
        if (q.status !== "REGISTERED" && q.qualifiedVia?.startsWith("Via ")) via.push(q.teamId)
        else if (q.status !== "REGISTERED") qualified.push(q.teamId)
        else registered.push(q.teamId)
    }
    via.sort(byRank); qualified.sort(byRank); registered.sort(byRank)

    let participants = [...via, ...qualified, ...registered]
    if (participants.length > definition.slots) {
        const kept = participants.slice(0, definition.slots)
        // The managed club keeps its place ahead of computer clubs, but never
        // ahead of a club that came through a qualifier.
        if (participants.includes(playerTeamId) && !kept.includes(playerTeamId)) {
            for (let i = kept.length - 1; i >= Math.min(via.length, kept.length); i--) {
                if (kept[i] !== playerTeamId) { kept[i] = playerTeamId; break }
            }
        }
        participants = kept
    }

    // Registrations that are not in the field are withdrawn.
    const inField = new Set(participants)
    const dropped = new Set([...blocked, ...registered.filter(id => !inField.has(id))])
    if (dropped.size > 0) {
        save.tournamentQualifications = save.tournamentQualifications.filter(q =>
            !(dropped.has(q.teamId) && q.status === "REGISTERED" && isQualificationForTournament(q, instanceId)))
    }

    const remaining = definition.slots - participants.length
    if (remaining > 0) {
        let available: TeamSaveData[] = [...save.teams]
            .sort((a, b) => byRank(a.id, b.id))
            .filter(t => t.id !== playerTeamId && !inField.has(t.id) && !blocked.has(t.id))
        if (definition.qualifierFor) {
            available = available.filter(t => regionAllows(definition, t) && !qualifierEntryBlock(save, t.id, definition, season))
        }
        // League-tier events take their tier first, then others if short.
        if (definition.requiredLeagueTier) {
            const strict = available.filter(t => t.leagueTier === definition.requiredLeagueTier)
            available = strict.length >= remaining ? strict : [...strict, ...available.filter(t => t.leagueTier !== definition.requiredLeagueTier)]
        }
        participants = [...participants, ...available.slice(0, remaining).map(t => t.id)]
    }

    return [...new Set(participants)].sort(byRank)
}
