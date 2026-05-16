/**
 * Active scouting mission processor.
 *
 * When the active mission's completionWeek is reached:
 *   - Records the player in save.scoutedPlayers at "EXPERT" tier
 *   - Pushes a NEWS event so the user sees the report landed
 *   - Clears activeScoutingMission so a new mission can be started
 *
 * Extracted from atomic-week-processor.ts. No instance state required.
 */

import type { GameSave } from "../save-types"
import type { SaveIndexes } from "@/store/indexes"
import { logger } from "@/lib/logger"

export function processScoutingMissions(save: GameSave, idx?: SaveIndexes): void {
    if (!save.activeScoutingMission) return

    const mission = save.activeScoutingMission
    if (save.currentWeek < mission.completionWeek) return

    if (!save.scoutedPlayers) save.scoutedPlayers = []
    save.scoutedPlayers.push({
        playerId: mission.playerId,
        scoutedWeek: save.currentWeek,
        scoutLevel: "EXPERT" as const,
    })

    // Surface a news event so the user actually sees the scouting result.
    const scoutedPlayer = idx?.playerIndex.get(mission.playerId)
        ?? save.players.find(p => p.id === mission.playerId)
    if (scoutedPlayer) {
        save.eventsLog.push({
            id: `scouting_complete_${save.currentWeek}_${mission.playerId}`,
            type: "NEWS",
            week: save.currentWeek,
            data: {
                text: `Scouting report complete for ${scoutedPlayer.nickname}. Full stats are now visible.`,
                playerName: scoutedPlayer.nickname,
            },
            acknowledged: false,
        })
    }

    save.activeScoutingMission = undefined
    logger.debug(`[Scouting] Completed mission for ${mission.playerId}`)
}
