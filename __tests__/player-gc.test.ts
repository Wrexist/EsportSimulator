/**
 * Pre-Steam growth audit: save.players must not grow forever. The GC reclaims
 * retired AI players that nothing references, while never dropping a player still
 * reachable from a roster, contract, legend/HoF list, scouting, transfer history,
 * career MVP, or recent completed-match playerStats (where names resolve by id).
 */

import { garbageCollectRetiredPlayers } from "@/engine/processors/player-gc"
import type { GameSave } from "@/engine/save-types"

function player(id: string, over: Record<string, unknown> = {}) {
    return { id, nickname: id, isRetired: false, isLegendary: false, ...over }
}

function makeSave(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 520,
        playerTeamId: "t1",
        teams: [{ id: "t1", rosterIds: [] }],
        players: [],
        contracts: [],
        staff: [],
        scoutedPlayers: [],
        legendaryPlayers: [],
        hallOfFame: [],
        signedLegendIds: [],
        activelyPlayingLegendIds: [],
        transferHistory: [],
        completedMatches: [],
        ...(over as object),
    } as unknown as GameSave
}

describe("garbageCollectRetiredPlayers", () => {
    it("removes a retired, non-legendary, unreferenced player", () => {
        const save = makeSave({ players: [player("dead", { isRetired: true }) as never] })
        const removed = garbageCollectRetiredPlayers(save)
        expect(removed).toBe(1)
        expect(save.players).toHaveLength(0)
    })

    it("keeps active players and signable (non-retired) free agents", () => {
        const save = makeSave({
            players: [player("active") as never, player("freeagent") as never],
        })
        expect(garbageCollectRetiredPlayers(save)).toBe(0)
        expect(save.players.map(p => p.id).sort()).toEqual(["active", "freeagent"])
    })

    it("keeps a retired player still on a roster or under contract", () => {
        const save = makeSave({
            teams: [{ id: "t1", rosterIds: ["rostered"] } as never],
            contracts: [{ playerId: "contracted", teamId: "t1" } as never],
            players: [
                player("rostered", { isRetired: true }) as never,
                player("contracted", { isRetired: true }) as never,
            ],
        })
        expect(garbageCollectRetiredPlayers(save)).toBe(0)
        expect(save.players).toHaveLength(2)
    })

    it("keeps retired legends (flag, legendaryPlayers, HoF)", () => {
        const save = makeSave({
            legendaryPlayers: [{ id: "legend_clone" } as never],
            hallOfFame: [{ id: "hof_guy" } as never],
            players: [
                player("flagged", { isRetired: true, isLegendary: true }) as never,
                player("legend_clone", { isRetired: true }) as never,
                player("hof_guy", { isRetired: true }) as never,
            ],
        })
        expect(garbageCollectRetiredPlayers(save)).toBe(0)
        expect(save.players).toHaveLength(3)
    })

    it("keeps retired players referenced by recent match history, transfers, scouting", () => {
        const save = makeSave({
            completedMatches: [
                { result: { mvpPlayerId: "mvp", playerStats: { statline: {} } } } as never,
            ],
            transferHistory: [{ playerId: "traded", playerName: "Traded" } as never],
            scoutedPlayers: [{ playerId: "scouted", scoutedWeek: 1, scoutLevel: "BASIC" } as never],
            players: [
                player("mvp", { isRetired: true }) as never,
                player("statline", { isRetired: true }) as never,
                player("traded", { isRetired: true }) as never,
                player("scouted", { isRetired: true }) as never,
                player("nobody", { isRetired: true }) as never, // the only one droppable
            ],
        })
        const removed = garbageCollectRetiredPlayers(save)
        expect(removed).toBe(1)
        expect(save.players.map(p => p.id)).not.toContain("nobody")
        expect(save.players.map(p => p.id).sort()).toEqual(["mvp", "scouted", "statline", "traded"])
    })
})
