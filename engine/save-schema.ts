/**
 * Zod-based schema validation for the GameSave envelope.
 *
 * This validates the *outer shape* of a save (metadata + presence/types of
 * top-level entity arrays) — deeply-nested fields are intentionally treated as
 * `unknown`/passthrough. The hand-rolled `collectValidationErrors` in
 * save-types.ts continues to enforce cross-entity invariants (e.g. orphan
 * roster references). The two layers complement each other.
 */

import { z } from "zod"
import { CURRENT_SAVE_VERSION, MIN_SUPPORTED_VERSION } from "./save-types"

const isoDate = z
    .string()
    .min(1, "ISO date string is required")
    .refine((v) => Number.isFinite(new Date(v).getTime()), {
        message: "Must be a parseable ISO date string",
    })

const arrayOfUnknown = z.array(z.unknown())

export const GameSaveSchema = z
    .object({
        // Metadata
        saveVersion: z.number().int().min(MIN_SUPPORTED_VERSION),
        saveId: z.string().min(1),
        saveName: z.string().min(1),
        createdAt: isoDate,
        updatedAt: isoDate,
        integrityHash: z.string().optional(),

        // Game state
        currentWeek: z.number().int().min(1),
        currentDay: z.number().int().min(0).max(6),
        timeMode: z.enum(["WEEKLY", "HYBRID_DAILY"]),
        gameStartDate: isoDate,

        // Manager
        playerTeamId: z.string().min(1),
        managerDetails: z.object({}).passthrough(),

        // Top-level entity arrays — presence/typing only
        teams: arrayOfUnknown,
        players: arrayOfUnknown,
        contracts: arrayOfUnknown,
        tournaments: arrayOfUnknown,
        staff: arrayOfUnknown,
        scheduledMatches: arrayOfUnknown,
        completedMatches: arrayOfUnknown,
        scheduledActivities: arrayOfUnknown,
        marketStaff: arrayOfUnknown,
        financeLedger: arrayOfUnknown,
        hallOfFame: arrayOfUnknown,
        eventsLog: arrayOfUnknown,
        newsFeed: arrayOfUnknown,
        acknowledgedEventIds: z.array(z.string()),
        scoutedPlayers: arrayOfUnknown,
        circuitPoints: arrayOfUnknown,
        tournamentQualifications: arrayOfUnknown,
        transferHistory: arrayOfUnknown,
        legendaryPlayers: arrayOfUnknown,

        // Academy
        academyPlayers: arrayOfUnknown,
        academyMatchHistory: arrayOfUnknown,
        academyRoster: z.object({}).passthrough(),
        academyTrainingSchedule: z.object({}).passthrough(),
        academyWeeklyReports: arrayOfUnknown,
        academyScoutingMissions: arrayOfUnknown,
        academyPendingProspects: z.array(z.string()),

        // RNG
        lastRngSeed: z.number(),

        // Transaction state
        weekTickState: z.unknown().nullable(),
    })
    .passthrough()

export type SaveValidationOk = { ok: true }
export type SaveValidationFail = {
    ok: false
    issues: string[]
    /**
     * True iff a saveVersion field exists and is greater than the version this
     * build supports. Callers should surface a "newer version" prompt.
     */
    newerVersion: boolean
    detectedVersion: number | null
}
export type SaveValidationResult = SaveValidationOk | SaveValidationFail

/**
 * Validate the outer shape of a parsed save object using Zod.
 *
 * Detects the "newer version" case before strict validation so the UI can
 * surface a precise error rather than a generic schema failure.
 */
export function validateSaveSchema(candidate: unknown): SaveValidationResult {
    const detectedVersion =
        candidate && typeof candidate === "object" && "saveVersion" in (candidate as Record<string, unknown>)
            && typeof (candidate as Record<string, unknown>).saveVersion === "number"
            ? ((candidate as Record<string, unknown>).saveVersion as number)
            : null

    if (detectedVersion !== null && detectedVersion > CURRENT_SAVE_VERSION) {
        return {
            ok: false,
            issues: [
                `Save was written by schema v${detectedVersion}; this build only supports up to v${CURRENT_SAVE_VERSION}.`,
            ],
            newerVersion: true,
            detectedVersion,
        }
    }

    const result = GameSaveSchema.safeParse(candidate)
    if (result.success) {
        return { ok: true }
    }

    const issues = result.error.issues.slice(0, 10).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
        return `${path}: ${issue.message}`
    })

    return {
        ok: false,
        issues,
        newerVersion: false,
        detectedVersion,
    }
}
