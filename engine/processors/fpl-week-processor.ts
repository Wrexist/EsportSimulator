/**
 * FPL (Individual Rankings) weekly processor.
 *
 * Wraps the `processFPLWeek` engine call with the smart-scheduling
 * context the engine needs (tournaments, scheduled matches, scheduled
 * activities, team roster mappings) and surfaces FPL_PROMOTIONS /
 * FPL_DEMOTIONS events on tier changes.
 *
 * Returns true on success, false on engine failure — the caller can
 * decide whether to toast the failure. Extracted from advanceWeek.
 */

import type { GameSave } from "../save-types"
import { processFPLWeek } from "../fpl-engine"
import { SeededRNG } from "../rng"
import { logger } from "@/lib/logger"

const FPL_RNG_MAX = 999_999

export function applyFplWeek(save: GameSave, weekRng: SeededRNG): boolean {
    if (!save.fplData) return true

    try {
        // Derive a dedicated FPL RNG from the week's main RNG so the FPL
        // stream is deterministic without polluting the main chain.
        const fplRng = new SeededRNG(weekRng.int(1, FPL_RNG_MAX))

        const fplResult = processFPLWeek(
            save.fplData,
            save.players,
            save.currentWeek,
            fplRng,
            save.tournaments,
            save.scheduledMatches,
            save.scheduledActivities,
            save.teams.map(t => ({ id: t.id, rosterIds: t.rosterIds })),
        )
        save.fplData = fplResult.fplData

        // Season-end tier changes surface as inbox notifications.
        if (fplResult.tierChanges && fplResult.tierChanges.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const promotions = fplResult.tierChanges.filter((c: any) => c.reason === "PROMOTION")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const demotions = fplResult.tierChanges.filter((c: any) => c.reason === "DEMOTION")

            if (promotions.length > 0) {
                save.eventsLog.unshift({
                    id: `fpl_promotions_${save.currentWeek}`,
                    type: "PLAYER_UPDATE",
                    week: save.currentWeek,
                    acknowledged: false,
                    data: {
                        title: "FPL Promotions",
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        message: `${promotions.map((p: any) => p.playerName).join(", ")} promoted to FPL Pro after stellar FPL Challenger season!`,
                        severity: "success",
                    },
                })
            }
            if (demotions.length > 0) {
                save.eventsLog.unshift({
                    id: `fpl_demotions_${save.currentWeek}`,
                    type: "PLAYER_UPDATE",
                    week: save.currentWeek,
                    acknowledged: false,
                    data: {
                        title: "FPL Relegations",
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        message: `${demotions.map((d: any) => d.playerName).join(", ")} relegated to FPL Challenger after struggling in FPL Pro.`,
                        severity: "info",
                    },
                })
            }
        }

        return true
    } catch (err) {
        // FPL is non-critical to the week tick — log so we can debug if
        // it ever breaks but don't propagate the error.
        logger.error("[fpl-week] processing failed", err)
        return false
    }
}
