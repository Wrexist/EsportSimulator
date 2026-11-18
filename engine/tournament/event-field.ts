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
 *
 * A club plays one event at a time where it can (COMP-05): a computer club
 * passes up an invite or sign-up when it plays a bigger event in the same
 * weeks, and the ranked fill takes clubs with no other event in those weeks
 * first. A points event (Elite World Final) is the top of the circuit points
 * table (COMP-04).
 */
import { getTournamentById, type TournamentDefinition } from "@/data/tournament-calendar"
import type { GameSave, TeamSaveData } from "../save-types"
import { buildInstanceId, getSeriesIdFromTournamentId, isQualificationForTournament } from "../circuit-engine"
import { QualificationEngine } from "../tournament-qualification"
import { TournamentManager } from "../tournament-manager"
import { clashes, clubEventWindows, eventWeight, feederEvents, qualifierEntryBlock, regionAllows } from "./qualification-path"

/**
 * Hands out the places of this event's qualifiers that finished but are not
 * settled yet. On the daily calendar a qualifier's final is played on its day
 * of the week before the event starts, and the standings step that settles it
 * runs after this tick's events have started, so without this its winners
 * would miss the field (COMP-16). The standings step later pays the prizes and
 * repeats the same (idempotent) qualification.
 */
function settleFinishedQualifiers(save: GameSave, definition: TournamentDefinition, season: number): void {
    const settle = (feeder: TournamentDefinition, qualifier: GameSave["tournaments"][number] | undefined) => {
        if (!qualifier?.isCompleted || qualifier.rewardsGranted) return
        save.tournamentQualifications = QualificationEngine.processQualifierResults(
            save.tournamentQualifications || [], { ...feeder, id: qualifier.id }, TournamentManager.calculatePlacements(save, qualifier),
        )
    }
    for (const feeder of feederEvents(definition.id)) settle(feeder, save.tournaments.find(t => t.id === buildInstanceId(feeder.id, season)))
    // Every other qualifier that just finished too: its winners are entered in
    // their event from now on, so this event does not take them for the same
    // weeks (an EU RMR's clubs are not pulled into a Showdown that runs into
    // the Major, COMP-05).
    for (const qualifier of save.tournaments) {
        const feeder = getTournamentById(getSeriesIdFromTournamentId(qualifier.id))
        if (feeder?.qualifierFor && feeder.qualifierFor !== definition.id) settle(feeder, qualifier)
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

    // The event's weeks, and every club's other events (COMP-05).
    const from = save.currentWeek, to = save.currentWeek + Math.max(1, definition.duration) - 1
    const otherEvents = clubEventWindows(save)
    const busy = (id: string, minWeight = 0) => clashes(otherEvents.get(id), instanceId, from, to, minWeight)

    if (definition.entryType === "POINTS") return pointsField(save, definition, instanceId, byRank)

    const rows = (save.tournamentQualifications || []).filter(q =>
        isQualificationForTournament(q, instanceId) && (q.status === "QUALIFIED" || q.status === "REGISTERED" || q.status === "INVITED"))

    // A qualifier drops entrants that meanwhile reached the event it leads to
    // (an invite after they signed up) or a sibling qualifier.
    const blocked = new Set<string>()
    if (definition.qualifierFor) {
        for (const q of rows) {
            if (q.status === "REGISTERED" && q.teamId !== playerTeamId && qualifierEntryBlock(save, q.teamId, definition, season)) blocked.add(q.teamId)
            if (q.status === "REGISTERED" && q.teamId === playerTeamId && qualifierEntryBlock(save, q.teamId, definition, season) === "in_main") blocked.add(q.teamId)
            // A regional qualifier takes its region's clubs, sign-ups included (COMP-07).
            const club = teamById.get(q.teamId)
            if (q.status === "REGISTERED" && club && !regionAllows(definition, club)) blocked.add(q.teamId)
        }
    }
    // A computer club with an invite or sign-up passes it up for a bigger
    // event in the same weeks (a Major over the Thunder Cup). Places won in
    // a qualifier are always taken; the managed club decides for itself.
    const weight = eventWeight(definition)
    const declined = new Set<string>()
    for (const q of rows) {
        if (q.teamId === playerTeamId || q.qualifiedVia?.startsWith("Via ") || !busy(q.teamId, weight + 1)) continue
        if (q.status === "REGISTERED") blocked.add(q.teamId)
        else declined.add(q.teamId)
    }

    const via: string[] = [], qualified: string[] = [], registered: string[] = []
    const seen = new Set<string>()
    for (const q of rows) {
        if (seen.has(q.teamId) || blocked.has(q.teamId) || declined.has(q.teamId) || !teamById.has(q.teamId)) continue
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
    if (dropped.size > 0 || declined.size > 0) {
        save.tournamentQualifications = save.tournamentQualifications.filter(q => !(isQualificationForTournament(q, instanceId)
            && ((dropped.has(q.teamId) && q.status === "REGISTERED") || (declined.has(q.teamId) && !q.qualifiedVia?.startsWith("Via ")))))
    }

    const remaining = definition.slots - participants.length
    if (remaining > 0) {
        // Clubs with no other event in these weeks first, each group by ranking.
        let available: TeamSaveData[] = [...save.teams]
            .sort((a, b) => Number(busy(a.id)) - Number(busy(b.id)) || byRank(a.id, b.id))
            .filter(t => t.id !== playerTeamId && !inField.has(t.id) && !blocked.has(t.id) && !declined.has(t.id))
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

/**
 * A points event (the Elite World Final, "the top 8 in circuit standings"):
 * the clubs with the most circuit points, the managed club included when it
 * is among them (COMP-04). Sign-ups outside that top are withdrawn.
 */
function pointsField(
    save: GameSave,
    definition: TournamentDefinition,
    instanceId: string,
    byRank: (a: string, b: string) => number,
): string[] {
    const points = new Map((save.circuitPoints ?? []).map(c => [c.teamId, c.points]))
    const field = [...save.teams]
        .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || byRank(a.id, b.id))
        .slice(0, definition.slots)
        .map(t => t.id)
    const inField = new Set(field)
    save.tournamentQualifications = (save.tournamentQualifications || []).filter(q =>
        !(q.status === "REGISTERED" && !inField.has(q.teamId) && isQualificationForTournament(q, instanceId)))
    return field.sort(byRank)
}
