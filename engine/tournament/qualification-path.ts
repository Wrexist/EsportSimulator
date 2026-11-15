/**
 * The qualification path between calendar events (Open -> Closed -> Main,
 * RMR -> Major) and who may enter which step of it.
 *
 * One set of rules for every entry route: the managed club's automatic entry,
 * the Register button, computer clubs' registrations and the field fill when
 * an event starts. A club invited to (or projected to be invited to) an event
 * never plays that event's qualifiers, a club plays at most one qualifier per
 * target, and regional qualifiers (EU / Americas / Asia) take clubs of their
 * region only.
 */
import { FULL_TOURNAMENT_CALENDAR, type TournamentDefinition } from "@/data/tournament-calendar"
import type { GameSave, QualificationStatus, TeamSaveData } from "../save-types"
import { buildInstanceId, isQualificationForTournament } from "../circuit-engine"

/** Club region -> regional qualifier region (RMRs exist for EU, NA and ASIA). */
export const QUALIFIER_REGION: Record<string, string> = { CIS: "EU", MENA: "EU", BR: "NA", SA: "NA", OCE: "ASIA", OCEANIA: "ASIA" }

const ENTERED: ReadonlySet<QualificationStatus["status"]> = new Set(["QUALIFIED", "REGISTERED", "INVITED"])

function definition(id: string): TournamentDefinition | undefined {
    return FULL_TOURNAMENT_CALENDAR.find(d => d.id === id)
}

/** Events this one feeds, nearest first (Kato Open -> Kato Closed -> Winter Open Katova). */
export function downstreamEvents(def: TournamentDefinition): TournamentDefinition[] {
    const chain: TournamentDefinition[] = []
    let cursor = def.qualifierFor ? definition(def.qualifierFor) : undefined
    while (cursor && !chain.includes(cursor)) {
        chain.push(cursor)
        cursor = cursor.qualifierFor ? definition(cursor.qualifierFor) : undefined
    }
    return chain
}

/** Every qualifier that feeds this event, directly or through another qualifier. */
export function feederEvents(defId: string): TournamentDefinition[] {
    const out: TournamentDefinition[] = []
    const visit = (id: string) => {
        for (const d of FULL_TOURNAMENT_CALENDAR) {
            if (d.qualifierFor === id && !out.includes(d)) { out.push(d); visit(d.id) }
        }
    }
    visit(defId)
    return out
}

/** Places the direct feeder qualifiers hand out for this event. */
export function feederSlots(defId: string): number {
    return FULL_TOURNAMENT_CALENDAR.filter(d => d.qualifierFor === defId).reduce((sum, d) => sum + Math.max(0, d.qualifierSlots || 0), 0)
}

/** Does this event hand out invites by world ranking (top `inviteSlots`)? */
export function hasRankedInvites(def: TournamentDefinition): boolean {
    return (def.entryType === "INVITE" || def.entryType === "QUALIFIER") && (def.inviteSlots ?? 0) > 0
}

/**
 * Weeks before the start that invites go out: four, or earlier when the
 * event's qualifier path starts earlier, so invited clubs are known before
 * the first qualifier is filled.
 */
export function inviteLeadWeeks(def: TournamentDefinition): number {
    let lead = 4
    for (const f of feederEvents(def.id)) {
        const weeks = def.startWeek - f.startWeek
        if (weeks > lead) lead = weeks
    }
    return lead
}

/** Clubs that get (or would get, at today's ranking) a ranked invite. */
export function rankedInvitees(def: TournamentDefinition, teams: Pick<TeamSaveData, "id" | "worldRanking">[]): string[] {
    if (!hasRankedInvites(def)) return []
    return [...teams]
        .filter(t => !def.requiredRanking || (t.worldRanking ?? 999) <= def.requiredRanking)
        .sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999) || a.id.localeCompare(b.id))
        .slice(0, def.inviteSlots)
        .map(t => t.id)
}

/** Has this event instance handed out its ranked invites yet? */
export function invitesIssued(rows: QualificationStatus[], instanceId: string): boolean {
    return rows.some(q => q.qualifiedVia === "Direct Invite" && q.status !== "REGISTERED" && isQualificationForTournament(q, instanceId))
}

export function isEnteredIn(rows: QualificationStatus[], teamId: string, instanceId: string, week?: number): boolean {
    return rows.some(q => q.teamId === teamId && ENTERED.has(q.status) && isQualificationForTournament(q, instanceId, week))
}

/** May a club of this region play this regional qualifier? International events take everyone. */
export function regionAllows(def: TournamentDefinition, team: Pick<TeamSaveData, "region">): boolean {
    if (def.tier !== "QUALIFIER" || !def.region || def.region === "INTERNATIONAL") return true
    const region = String(team.region ?? "")
    return (QUALIFIER_REGION[region] ?? region) === def.region
}

/**
 * Why a club may not enter this qualifier (null when it may). Applies to the
 * managed club's automatic entry and to every computer club; the Register
 * button checks the same main-event and sibling rules.
 */
export function qualifierEntryBlock(
    save: Pick<GameSave, "tournamentQualifications" | "teams" | "tournaments">,
    teamId: string,
    def: TournamentDefinition,
    season: number,
): "in_main" | "invited" | "sibling" | null {
    if (!def.qualifierFor) return null
    const rows = save.tournamentQualifications ?? []
    for (const target of downstreamEvents(def)) {
        const instanceId = buildInstanceId(target.id, season)
        if (isEnteredIn(rows, teamId, instanceId)) return "in_main"
        if (hasRankedInvites(target) && !invitesIssued(rows, instanceId) && rankedInvitees(target, save.teams).includes(teamId)) return "invited"
    }
    for (const sibling of FULL_TOURNAMENT_CALENDAR) {
        if (sibling.qualifierFor !== def.qualifierFor || sibling.id === def.id) continue
        const instanceId = buildInstanceId(sibling.id, season)
        if (isEnteredIn(rows, teamId, instanceId)) return "sibling"
        const started = save.tournaments.find(t => t.id === instanceId)
        if (started && started.currentStage !== "Registration" && started.teamIds.includes(teamId)) return "sibling"
    }
    return null
}

/**
 * A club just got its invite: it leaves the event's qualifiers that have not
 * started (its registration row and its place in the sign-up list).
 */
export function withdrawFromQualifiers(save: GameSave, mainDef: TournamentDefinition, season: number, teamIds: string[]): void {
    if (teamIds.length === 0) return
    const leaving = new Set(teamIds)
    for (const feeder of feederEvents(mainDef.id)) {
        const instanceId = buildInstanceId(feeder.id, season)
        const instance = save.tournaments.find(t => t.id === instanceId)
        if (instance && instance.currentStage !== "Registration") continue
        save.tournamentQualifications = save.tournamentQualifications.filter(q =>
            !(leaving.has(q.teamId) && q.status === "REGISTERED" && isQualificationForTournament(q, instanceId)))
        if (instance) instance.teamIds = instance.teamIds.filter(id => !leaving.has(id))
    }
}
