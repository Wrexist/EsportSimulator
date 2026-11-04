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

import { eventText } from "@/lib/news-ref"
import type { GameSave } from "../save-types"
import type { SaveIndexes } from "@/store/indexes"
import { logger } from "@/lib/logger"
import { scoutTierFromAccuracy } from "../scouting-system"
import { getSpecializationMultiplier } from "../staff-specialization"

export function processScoutingMissions(save: GameSave, idx?: SaveIndexes): void {
    if (!save.activeScoutingMission) return

    const mission = save.activeScoutingMission
    if (save.currentWeek < mission.completionWeek) return

    const team = save.teams?.find(t => t.id === save.playerTeamId)
    const scout = save.staff?.find(s => s.id === mission.scoutId && s.role === "scout"
        && s.teamId === team?.id && team?.staffIds?.includes(s.id)
        && (s.contractEndWeek == null || s.contractEndWeek > save.currentWeek))
    const target = save.players.find(p => p.id === mission.playerId && !p.isRetired)
    if (!scout || !target) {
        save.eventsLog.push({ id: `scouting_cancelled_${save.currentWeek}_${mission.playerId}`, type: "SCOUTING_COMPLETE",
            week: save.currentWeek, acknowledged: false,
            data: { ...eventText({ key: "evn.scoutCancel.t" }, { key: "evn.scoutCancel.m" }), text: "Scouting mission ended without a report: the assigned scout or player is no longer available. The commissioned mission fee is not refunded." } })
        save.activeScoutingMission = undefined
        return
    }
    const accuracy = (scout.stats?.accuracy ?? 50) * getSpecializationMultiplier(scout)
    const ranks = ["BASIC", "ADVANCED", "EXPERT", "ELITE"] as const
    const existing = (save.scoutedPlayers || []).filter(s => s.playerId === mission.playerId)
    const scoutLevel = ranks[Math.max(ranks.indexOf(scoutTierFromAccuracy(accuracy)), ...existing.map(s => ranks.indexOf(s.scoutLevel)))]
    save.scoutedPlayers = (save.scoutedPlayers || []).filter(s => s.playerId !== mission.playerId)
    save.scoutedPlayers.push({ playerId: mission.playerId, scoutedWeek: save.currentWeek, scoutLevel })

    // Surface a news event so the user actually sees the scouting result.
    const scoutedPlayer = idx?.playerIndex.get(mission.playerId)
        ?? save.players.find(p => p.id === mission.playerId)
    if (scoutedPlayer) {
        save.eventsLog.push({
            id: `scouting_complete_${save.currentWeek}_${mission.playerId}`,
            type: "SCOUTING_COMPLETE",
            week: save.currentWeek,
            data: {
                ...eventText({ key: "evn.scoutDone.t" }, { key: scoutLevel === "ELITE" ? "evn.scoutDone.full" : "evn.scoutDone.m", params: { name: scoutedPlayer.nickname, report: { key: `report.${scoutLevel}` } } }),
                playerId: mission.playerId,
                text: `Scouting report complete for ${scoutedPlayer.nickname}. ${scoutLevel === "ELITE" ? "Full attributes are available." : `${scoutLevel.toLowerCase()} report available; some attributes remain estimates.`}`,
                playerName: scoutedPlayer.nickname,
            },
            acknowledged: false,
        })
    }

    save.activeScoutingMission = undefined
    logger.debug(`[Scouting] Completed mission for ${mission.playerId}`)
}
