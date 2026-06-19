/**
 * Tests for the scouting-mission completion processor.
 *
 * Report tier is no longer a flat "EXPERT" — it's driven by the assigned
 * scout's accuracy stat (× specialist bonus), so a better scout yields a
 * higher-fidelity report (tighter stat bands in getVisibleStats).
 */

import { processScoutingMissions } from "@/engine/processors/scouting-mission-processor"
import { scoutTierFromAccuracy } from "@/engine/scouting-system"
import type { GameSave, ScoutingMissionData, StaffSaveData } from "@/engine/save-types"

function makeSave(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        players: [{ id: "target", nickname: "Target" }],
        staff: [],
        scoutedPlayers: [],
        eventsLog: [],
        activeScoutingMission: undefined,
        ...over,
    } as unknown as GameSave
}

const mission = (scoutId: string, completionWeek = 10) =>
    ({ playerId: "target", startWeek: 1, completionWeek, scoutId }) as unknown as ScoutingMissionData

const scout = (id: string, accuracy?: number, specialization = "General") =>
    ({
        id, role: "scout", name: id, teamId: "player", level: 3, salaryPerWeek: 1000,
        specialization, stats: accuracy !== undefined ? { accuracy } : undefined,
    }) as unknown as StaffSaveData

describe("processScoutingMissions — accuracy drives report tier", () => {
    test("mission not yet complete → no entry, mission preserved", () => {
        const save = makeSave({ currentWeek: 8, activeScoutingMission: mission("s1", 10), staff: [scout("s1", 90)] })
        processScoutingMissions(save)
        expect(save.scoutedPlayers).toHaveLength(0)
        expect(save.activeScoutingMission).toBeDefined()
    })

    test("high-accuracy scout → ELITE report; mission cleared", () => {
        const save = makeSave({ activeScoutingMission: mission("s1"), staff: [scout("s1", 90)] })
        processScoutingMissions(save)
        expect(save.scoutedPlayers[0].scoutLevel).toBe("ELITE")
        expect(save.activeScoutingMission).toBeUndefined()
    })

    test("mid-accuracy scout → EXPERT report", () => {
        const save = makeSave({ activeScoutingMission: mission("s1"), staff: [scout("s1", 70)] })
        processScoutingMissions(save)
        expect(save.scoutedPlayers[0].scoutLevel).toBe("EXPERT")
    })

    test("a SCOUTING-specialist scout's +10% can push a report up a tier", () => {
        // accuracy 80 alone → EXPERT (>=65, <85); ×1.1 = 88 → ELITE.
        const base = makeSave({ activeScoutingMission: mission("s1"), staff: [scout("s1", 80, "General")] })
        processScoutingMissions(base)
        expect(base.scoutedPlayers[0].scoutLevel).toBe("EXPERT")

        const spec = makeSave({ activeScoutingMission: mission("s1"), staff: [scout("s1", 80, "Talent ID")] })
        processScoutingMissions(spec)
        expect(spec.scoutedPlayers[0].scoutLevel).toBe("ELITE")
    })

    test("missing / fired scout falls back to ADVANCED", () => {
        const save = makeSave({ activeScoutingMission: mission("default_scout"), staff: [] })
        processScoutingMissions(save)
        expect(save.scoutedPlayers[0].scoutLevel).toBe("ADVANCED")
    })
})

describe("scoutTierFromAccuracy — tier boundaries", () => {
    test("thresholds at 85 / 65 / 45", () => {
        expect(scoutTierFromAccuracy(85)).toBe("ELITE")
        expect(scoutTierFromAccuracy(84)).toBe("EXPERT")
        expect(scoutTierFromAccuracy(65)).toBe("EXPERT")
        expect(scoutTierFromAccuracy(64)).toBe("ADVANCED")
        expect(scoutTierFromAccuracy(45)).toBe("ADVANCED")
        expect(scoutTierFromAccuracy(44)).toBe("BASIC")
        expect(scoutTierFromAccuracy(0)).toBe("BASIC")
    })
})
