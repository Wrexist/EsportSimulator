/**
 * Save migration ladder.
 *
 * Each migrateToV* step takes a partially-typed save record and returns
 * the same record bumped to the next saveVersion with any new required
 * fields backfilled. The functions are pure (no `this`, no I/O) so they
 * can be tested in isolation — see __tests__/save-manager.test.ts.
 *
 * Extracted from save-manager.ts (Phase H1). The SaveManager.migrateSave
 * method now delegates to runMigrationLadder; this module owns the
 * version-bump logic.
 */

import type {
    GameSave,
    TournamentSaveData,
    MatchSaveData,
    CompletedMatchSaveData,
    FinanceLedgerEntry,
    TeamSaveData,
    QualificationStatus,
} from "./save-types"
import {
    dedupeQualifications,
    normalizeQualificationStatus,
    resolveTournamentIdentity,
} from "./circuit-engine"
import { FOUNDING_LEGENDS } from "./hall-of-fame-data"
import { generateSeed } from "./rng"

/**
 * Migrate legacy save (no saveVersion or saveVersion 0) to v1.
 * Backfills every required top-level array + identity field.
 */
export function migrateToV1(save: Record<string, unknown>): Record<string, unknown> {
    return {
        ...save,
        saveVersion: 1,
        saveId: save.saveId || `migrated_${Date.now()}`,
        saveName: save.saveName || "Migrated Save",
        createdAt: save.createdAt || new Date().toISOString(),
        updatedAt: save.updatedAt || new Date().toISOString(),
        currentWeek: save.currentWeek ?? save.week ?? 1,
        gameStartDate: save.gameStartDate || new Date().toISOString(),

        teams: Array.isArray(save.teams) ? save.teams : [],
        players: Array.isArray(save.players) ? save.players : [],
        contracts: Array.isArray(save.contracts) ? save.contracts : [],
        tournaments: Array.isArray(save.tournaments) ? save.tournaments : [],
        scheduledMatches: Array.isArray(save.scheduledMatches) ? save.scheduledMatches : [],
        completedMatches: Array.isArray(save.completedMatches) ? save.completedMatches : [],
        financeLedger: Array.isArray(save.financeLedger) ? save.financeLedger : [],
        eventsLog: Array.isArray(save.eventsLog) ? save.eventsLog : [],
        acknowledgedEventIds: Array.isArray(save.acknowledgedEventIds) ? save.acknowledgedEventIds : [],

        hallOfFame: Array.isArray(save.hallOfFame) ? save.hallOfFame : FOUNDING_LEGENDS,

        lastRngSeed: save.lastRngSeed ?? save.seed ?? generateSeed(),

        legendaryPlayers: Array.isArray(save.legendaryPlayers) ? save.legendaryPlayers : [],

        weekTickState: null,
    }
}

/**
 * v2: backfill scoutedPlayers, circuitPoints, tournamentQualifications.
 */
export function migrateToV2(save: Record<string, unknown>): Record<string, unknown> {
    return {
        ...save,
        saveVersion: 2,
        scoutedPlayers: Array.isArray(save.scoutedPlayers) ? save.scoutedPlayers : [],
        circuitPoints: Array.isArray(save.circuitPoints) ? save.circuitPoints : [],
        tournamentQualifications: Array.isArray(save.tournamentQualifications) ? save.tournamentQualifications : [],
    }
}

/**
 * v3: introduce playerTeamId (recovered from financeLedger or teams[0]),
 * managerDetails, marketStaff, newsFeed, transferHistory, scheduledActivities.
 */
export function migrateToV3(save: Record<string, unknown>): Record<string, unknown> {
    const teams = Array.isArray(save.teams) ? save.teams : []
    let playerTeamId = (save.playerTeamId as string)

    // Recover playerTeamId from finance ledger if missing (V2 saves).
    if (!playerTeamId && Array.isArray(save.financeLedger) && save.financeLedger.length > 0) {
        playerTeamId = (save.financeLedger[0] as FinanceLedgerEntry).teamId
    }

    playerTeamId = playerTeamId || teams[0]?.id || "unknown"

    return {
        ...save,
        saveVersion: 3,
        playerTeamId,
        managerDetails: save.managerDetails || {
            name: (save.saveName as string) || "Manager",
            level: 1,
            xp: 0,
            reputation: 0,
            careerWins: 0,
            careerLosses: 0,
            championships: 0
        },
        marketStaff: save.marketStaff || [],
        newsFeed: save.newsFeed || [],
        transferHistory: save.transferHistory || [],
        scheduledActivities: save.scheduledActivities || []
    }
}

/**
 * v4: backfill the entire academy substate.
 */
export function migrateToV4(save: Record<string, unknown>): Record<string, unknown> {
    return {
        ...save,
        saveVersion: 4,
        academyPlayers: Array.isArray(save.academyPlayers) ? save.academyPlayers : [],
        academyMatchHistory: Array.isArray(save.academyMatchHistory) ? save.academyMatchHistory : [],
        academyRoster: save.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
        academyTrainingSchedule: save.academyTrainingSchedule || {},
        academyWeeklyReports: Array.isArray(save.academyWeeklyReports) ? save.academyWeeklyReports : [],
        academyScoutingMissions: Array.isArray(save.academyScoutingMissions) ? save.academyScoutingMissions : [],
        academyPendingProspects: Array.isArray(save.academyPendingProspects) ? save.academyPendingProspects : []
    }
}

/**
 * v5: introduce hybrid day cursor, normalize tournament identity, deduplicate
 * legacy base + seasonal tournament rows.
 */
export function migrateToV5(save: Record<string, unknown>): Record<string, unknown> {
    const currentWeek =
        (typeof save.currentWeek === "number" && Number.isFinite(save.currentWeek) && save.currentWeek > 0)
            ? Math.floor(save.currentWeek)
            : 1

    const timeMode = save.timeMode === "HYBRID_DAILY" ? "HYBRID_DAILY" : "WEEKLY"
    const rawCurrentDay = (save.currentDay as number)
    const currentDay = (typeof rawCurrentDay === "number" && Number.isFinite(rawCurrentDay))
        ? Math.max(0, Math.min(6, Math.floor(rawCurrentDay)))
        : (timeMode === "HYBRID_DAILY" ? 0 : 6)

    const tournaments = Array.isArray(save.tournaments)
        ? (save.tournaments as TournamentSaveData[])
        : []

    const replacementById = new Map<string, string>()
    const grouped = new Map<string, TournamentSaveData[]>()

    for (const row of tournaments) {
        const identity = resolveTournamentIdentity(row.id, row.startWeek || currentWeek)
        const normalized: TournamentSaveData = {
            ...row,
            seriesId: row.seriesId || identity.seriesId,
            seasonNumber: row.seasonNumber || identity.seasonNumber,
            instanceId: row.instanceId || identity.instanceId,
        }
        const key = `${normalized.seriesId}:${normalized.seasonNumber}`
        const bucket = grouped.get(key) || []
        bucket.push(normalized)
        grouped.set(key, bucket)
    }

    const canonicalTournaments: TournamentSaveData[] = []
    for (const bucket of grouped.values()) {
        bucket.sort((left, right) => {
            const leftScore =
                (left.isCompleted ? 1000 : 0)
                + ((left.playoffBracket?.length || 0) * 10)
                + (left.teamIds?.length || 0)
                + (left.id === left.instanceId ? 5 : 0)
            const rightScore =
                (right.isCompleted ? 1000 : 0)
                + ((right.playoffBracket?.length || 0) * 10)
                + (right.teamIds?.length || 0)
                + (right.id === right.instanceId ? 5 : 0)
            return rightScore - leftScore
        })

        const canonical = { ...bucket[0] }
        for (let i = 0; i < bucket.length; i++) {
            const candidate = bucket[i]
            if (candidate.id !== canonical.id) {
                replacementById.set(candidate.id, canonical.id)
            }

            if (!canonical.winnerId && candidate.winnerId) canonical.winnerId = candidate.winnerId
            if (!canonical.isCompleted && candidate.isCompleted) canonical.isCompleted = true
            if (!canonical.rewardsGranted && candidate.rewardsGranted) canonical.rewardsGranted = true

            if ((candidate.teamIds?.length || 0) > 0) {
                canonical.teamIds = [...new Set([...(canonical.teamIds || []), ...candidate.teamIds])]
            }

            if ((canonical.playoffBracket?.length || 0) === 0 && (candidate.playoffBracket?.length || 0) > 0) {
                canonical.playoffBracket = candidate.playoffBracket
            }

            if ((canonical.standings?.length || 0) === 0 && (candidate.standings?.length || 0) > 0) {
                canonical.standings = candidate.standings
            }
        }

        if (canonical.startWeek > currentWeek) {
            // Remove phantom future state from legacy snapshot-seeded rows.
            canonical.teamIds = []
            canonical.standings = []
            canonical.playoffBracket = []
            canonical.currentStage = "Registration"
            canonical.isCompleted = false
            canonical.winnerId = undefined
            canonical.rewardsGranted = false
        }

        canonicalTournaments.push(canonical)
    }

    canonicalTournaments.sort((a, b) => {
        if (a.startWeek !== b.startWeek) return a.startWeek - b.startWeek
        return a.id.localeCompare(b.id)
    })

    const remapTournamentId = (id: string): string => replacementById.get(id) || id

    const scheduledMatches = Array.isArray(save.scheduledMatches)
        ? (save.scheduledMatches as MatchSaveData[]).map(match => ({
            ...match,
            tournamentId: match.tournamentId ? remapTournamentId(match.tournamentId) : match.tournamentId
        }))
        : []

    const completedMatches = Array.isArray(save.completedMatches)
        ? (save.completedMatches as CompletedMatchSaveData[]).map(match => ({
            ...match,
            tournamentId: match.tournamentId ? remapTournamentId(match.tournamentId) : match.tournamentId
        }))
        : []

    const teams = Array.isArray(save.teams)
        ? (save.teams as TeamSaveData[]).map(team => ({
            ...team,
            trophies: (team.trophies || []).map(trophy => ({
                ...trophy,
                tournamentId: remapTournamentId(trophy.tournamentId)
            }))
        }))
        : []

    const rawQualifications = Array.isArray(save.tournamentQualifications)
        ? (save.tournamentQualifications as QualificationStatus[])
        : []

    const normalizedQualifications = dedupeQualifications(
        rawQualifications.map(row => normalizeQualificationStatus({
            ...row,
            tournamentId: remapTournamentId(row.tournamentId),
            instanceId: row.instanceId ? remapTournamentId(row.instanceId) : row.instanceId,
            sourceInstanceId: row.sourceInstanceId ? remapTournamentId(row.sourceInstanceId) : row.sourceInstanceId
        }, currentWeek)),
        currentWeek
    )

    return {
        ...save,
        saveVersion: 5,
        currentWeek,
        currentDay,
        timeMode,
        tournaments: canonicalTournaments,
        scheduledMatches,
        completedMatches,
        teams,
        tournamentQualifications: normalizedQualifications,
    }
}

/**
 * v6: every new field (fplData, careerStats, gameOverReason, gameOverWeek)
 * is optional and initialises naturally as undefined — version bump only.
 */
export function migrateToV6(save: Record<string, unknown>): Record<string, unknown> {
    return {
        ...save,
        saveVersion: 6,
    }
}

/**
 * Run the full ladder up to the current version. Each step is no-op
 * if the save already meets its target version.
 *
 * Throws if `save` is not a non-null object.
 */
export function runMigrationLadder(save: unknown): GameSave {
    if (!save || typeof save !== "object") {
        throw new Error("Invalid save data")
    }

    let migrated = save as Record<string, unknown>
    const version = (migrated.saveVersion as number) || 0

    if (version < 1) migrated = migrateToV1(migrated)
    if (version < 2) migrated = migrateToV2(migrated)
    if (version < 3) migrated = migrateToV3(migrated)
    if (version < 4) migrated = migrateToV4(migrated)
    if (version < 5) migrated = migrateToV5(migrated)
    if (version < 6) migrated = migrateToV6(migrated)

    return migrated as unknown as GameSave
}
