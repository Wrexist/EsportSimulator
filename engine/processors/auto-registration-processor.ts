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
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import {
    getSeasonFromWeek,
    getSeriesIdFromTournamentId,
    isQualificationForTournament,
    normalizeQualificationStatus,
} from "../circuit-engine"
import { QualificationEngine } from "../tournament-qualification"
import { logger } from "@/lib/logger"

const LOOKAHEAD_WEEKS = 4

interface AutoRegistrationContext {
    playerTeamId: string
    nextId: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { lastRngSeed: number; currentWeek: number } & Record<string, any>,
        prefix: string,
        ...parts: Array<string | number | null | undefined>
    ) => string
}

export function applyAutoRegistration(save: GameSave, ctx: AutoRegistrationContext): void {
    if (!ctx.playerTeamId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myTeam = save.teams.find((t: any) => t.id === ctx.playerTeamId)
    if (!myTeam) return

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upcoming = save.tournaments.filter((t: any) =>
            t.startWeek >= save.currentWeek &&
            t.startWeek <= save.currentWeek + LOOKAHEAD_WEEKS
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upcoming.forEach((t: any) => {
            const tournamentSeriesId = t.seriesId || getSeriesIdFromTournamentId(t.id)
            const tournamentDef = FULL_TOURNAMENT_CALENDAR.find(def => def.id === tournamentSeriesId)
            if (!tournamentDef) return
            // Only auto-register for INVITE/POINTS — qualifier tournaments
            // require the player to opt in explicitly.
            if (!(tournamentDef.entryType === "INVITE" || tournamentDef.entryType === "POINTS")) return

            const isRegistered = save.tournamentQualifications.some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (q: any) =>
                    q.teamId === myTeam.id &&
                    isQualificationForTournament(q, t.id, save.currentWeek)
            )
            if (isRegistered) return

            const eligibility = QualificationEngine.checkEligibility(
                tournamentDef,
                myTeam,
                myTeam.worldRanking,
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
                qualifiedVia: "AUTO_INVITE",
            }, save.currentWeek))

            save.eventsLog.unshift({
                id: ctx.nextId(save, "evt_auto_reg", t.id),
                type: "TOURNAMENT_UPDATE",
                week: save.currentWeek,
                acknowledged: false,
                data: {
                    tournamentId: t.id,
                    title: "Auto-Registration",
                    message: `Team automatically registered for ${t.name} (Eligible via ${tournamentDef.entryType})`,
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
