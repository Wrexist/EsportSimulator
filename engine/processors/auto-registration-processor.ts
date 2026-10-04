/**
 * Tournament auto-registration for the player's team.
 *
 * Each week, look ahead 4 weeks at upcoming tournament instances. For
 * any INVITE or POINTS entry-type tournament the team isn't already
 * registered/qualified for, check eligibility (worldRanking,
 * circuitPoints) and auto-register if the engine says we can.
 *
 * Non-critical: wraps the QualificationEngine call in try/catch so a
 * downstream engine bug never blocks the week tick. Errors get logged
 * via lib/logger instead of being silently swallowed.
 *
 * Extracted from store/game-store.ts. Mutates `save` in place.
 */

import type { GameSave } from "../save-types"
import { FULL_TOURNAMENT_CALENDAR, type TournamentDefinition } from "@/data/tournament-calendar"
import { REGISTRATION_TUNING } from "@/lib/balance-tuning"
import {
    buildInstanceId,
    getSeasonFromWeek,
    getSeriesIdFromTournamentId,
    isQualificationForTournament,
    normalizeQualificationStatus,
} from "../circuit-engine"
import { seniorRosterEligibility } from "../recruitment"
import { QualificationEngine } from "../tournament-qualification"
import { logger } from "@/lib/logger"

const LOOKAHEAD_WEEKS = 4
/** Club region -> regional qualifier region (RMRs exist for EU, NA and ASIA). */
const QUALIFIER_REGION: Record<string, string> = { CIS: "EU", MENA: "EU", BR: "NA", SA: "NA", OCE: "ASIA", OCEANIA: "ASIA" }

interface AutoRegistrationContext {
    playerTeamId: string
    nextId: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { lastRngSeed: number; currentWeek: number } & Record<string, any>,
        prefix: string,
        ...parts: Array<string | number | null | undefined>
    ) => string
}

/**
 * The Register button's qualifier double-entry rules: no qualifier while
 * already in its main event, and only one qualifier per main event.
 */
function openEntryBlocked(save: GameSave, teamId: string, def: TournamentDefinition, seasonNumber: number): boolean {
    if (!def.qualifierFor) return false
    const entered = (instanceId: string) => save.tournamentQualifications.some(q =>
        q.teamId === teamId && (q.status === "QUALIFIED" || q.status === "REGISTERED") &&
        isQualificationForTournament(q, instanceId, save.currentWeek))
    if (entered(buildInstanceId(def.qualifierFor, seasonNumber))) return true
    return FULL_TOURNAMENT_CALENDAR.some(s => s.qualifierFor === def.qualifierFor && s.id !== def.id
        && entered(buildInstanceId(s.id, seasonNumber)))
}

export function applyAutoRegistration(save: GameSave, ctx: AutoRegistrationContext): void {
    if (!ctx.playerTeamId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myTeam = save.teams.find((t: any) => t.id === ctx.playerTeamId)
    if (!myTeam || !seniorRosterEligibility(save, myTeam).eligible) return

    try {
        // Earliest first (then id) so sibling open qualifiers resolve deterministically.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upcoming: any[] = save.tournaments.filter((t: any) =>
            t.startWeek >= save.currentWeek &&
            t.startWeek <= save.currentWeek + LOOKAHEAD_WEEKS
        )
        // Open events usually have no instance yet when entry opens (the
        // Register button works from the calendar too), so project the
        // calendar's open definitions into the look-ahead window.
        if (REGISTRATION_TUNING.AUTO_REGISTER_OPEN_QUALIFIERS) {
            const known = new Set(upcoming.map(t => t.id))
            const season = getSeasonFromWeek(save.currentWeek)
            for (const def of FULL_TOURNAMENT_CALENDAR) {
                if (def.entryType !== "OPEN") continue
                for (const s of [season, season + 1]) {
                    const startWeek = (s - 1) * 52 + def.startWeek
                    const id = buildInstanceId(def.id, s)
                    if (startWeek < save.currentWeek || startWeek > save.currentWeek + LOOKAHEAD_WEEKS || known.has(id)) continue
                    upcoming.push({ id, seriesId: def.id, name: def.name, startWeek, seasonNumber: s })
                    known.add(id)
                }
            }
        }
        // Same week: the club's own region first (EU club -> EU RMR), then id.
        const regionRank = (t: { id: string; seriesId?: string }) => {
            const def = FULL_TOURNAMENT_CALENDAR.find(d => d.id === (t.seriesId || getSeriesIdFromTournamentId(t.id)))
            const home = QUALIFIER_REGION[String(myTeam.region)] ?? myTeam.region
            return def && home && def.region === home ? 0 : 1
        }
        upcoming.sort((a, b) => a.startWeek - b.startWeek || regionRank(a) - regionRank(b) || String(a.id).localeCompare(String(b.id)))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upcoming.forEach((t: any) => {
            const tournamentSeriesId = t.seriesId || getSeriesIdFromTournamentId(t.id)
            const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(def => def.id === tournamentSeriesId)
            if (!tournamentDef) return
            // INVITE/POINTS entries the club has earned, plus open events
            // (REGISTRATION_TUNING): every open qualifier, and open main events
            // for clubs outside the S-tier league. Closed qualifiers still
            // need qualification first.
            const isOpen = tournamentDef.entryType === "OPEN" && REGISTRATION_TUNING.AUTO_REGISTER_OPEN_QUALIFIERS
                && (tournamentDef.tier === "QUALIFIER" || myTeam.leagueTier !== "S_TIER")
            if (!(tournamentDef.entryType === "INVITE" || tournamentDef.entryType === "POINTS" || isOpen)) return
            if (isOpen && openEntryBlocked(save, myTeam.id, tournamentDef, t.seasonNumber || getSeasonFromWeek(t.startWeek || save.currentWeek))) return

            const isRegistered = save.tournamentQualifications.some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (q: any) =>
                    q.teamId === myTeam.id &&
                    isQualificationForTournament(q, t.id, save.currentWeek)
            )
            if (isRegistered) return

            // worldRanking can be undefined for freshly-created teams; the
            // checkEligibility signature requires a number, so fall back
            // to 999 (matches the pattern used elsewhere in the store).
            const eligibility = QualificationEngine.checkEligibility(
                tournamentDef,
                myTeam,
                myTeam.worldRanking ?? 999,
                save.circuitPoints,
                save.tournamentQualifications,
            )
            if (!eligibility.canRegister) return

            save.tournamentQualifications.push(normalizeQualificationStatus({
                tournamentId: t.id,
                seriesId: tournamentSeriesId,
                instanceId: t.id,
                seasonNumber: t.seasonNumber || getSeasonFromWeek(t.startWeek || save.currentWeek),
                teamId: myTeam.id,
                status: "REGISTERED",
                ...(isOpen ? {} : { qualifiedVia: "AUTO_INVITE" as const }),
            }, save.currentWeek))

            save.eventsLog.unshift({
                id: ctx.nextId(save, "evt_auto_reg", t.id),
                type: "TOURNAMENT_UPDATE",
                week: save.currentWeek,
                acknowledged: false,
                data: {
                    tournamentId: t.id,
                    title: "Auto-Registration",
                    message: isOpen
                        ? `Team automatically entered the open event ${t.name} (open entry, eligible squad).`
                        : `Team automatically registered for ${t.name} (Eligible via ${tournamentDef.entryType})`,
                    severity: "success",
                },
            })
        })
    } catch (err) {
        // Auto-registration is non-critical to the week tick — log so we
        // can debug if it ever breaks but don't propagate the error.
        logger.error("[auto-registration] skipped due to engine error", err)
    }
}
