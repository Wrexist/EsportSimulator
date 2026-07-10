/**
 * Regression for scout-accuracy-tier-dead.
 *
 * The pre-tick scouting-completion path (applyScoutingCompletion, inside
 * applyPreTickMutations) is what actually resolves a scouting mission each
 * week — it clears activeScoutingMission before the atomic
 * processScoutingMissions ever sees it. It used to hard-code scoutLevel to a
 * flat "EXPERT", so the assigned scout's accuracy and specialisation had ZERO
 * effect on report quality (an ELITE report was unreachable no matter how good
 * the scout). This pins that the resolved tier now follows scout accuracy.
 */

import { applyPreTickMutations } from "@/engine/processors/pre-tick-mutations"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, StaffSaveData, ScoutingMissionData } from "@/engine/save-types"

function nextId(_state: unknown, prefix: string, ...parts: Array<string | number | null | undefined>): string {
    return [prefix, ...parts.filter(Boolean)].join("_")
}

function scout(id: string, accuracy: number, specialization = "General"): StaffSaveData {
    return {
        id, name: id, role: "scout", teamId: "player",
        level: 3, xp: 0, xpToNextLevel: 1000, talentPoints: 0,
        unlockedTalentIds: [], salaryPerWeek: 1000, contractEndWeek: 100,
        specialization, stats: { accuracy },
    } as unknown as StaffSaveData
}

function makeDraft(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "player",
        teams: [],
        players: [{ id: "target", nickname: "Target" }],
        contracts: [],
        staff: [],
        scoutedPlayers: [],
        eventsLog: [],
        activeScoutingMission: undefined,
        lastRngSeed: 1,
        ...over,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GameSave
}

const mission = (scoutId?: string): ScoutingMissionData =>
    ({ playerId: "target", startWeek: 1, completionWeek: 10, scoutId }) as unknown as ScoutingMissionData

function run(draft: GameSave) {
    applyPreTickMutations(draft, {
        playerTeamId: "player", currentWeek: 10, rng: new SeededRNG(1), nextId,
    })
}

describe("applyScoutingCompletion — scout accuracy drives the report tier", () => {
    test("high-accuracy scout yields an ELITE report", () => {
        const draft = makeDraft({ activeScoutingMission: mission("s1"), staff: [scout("s1", 90)] })
        run(draft)
        expect(draft.scoutedPlayers[0].scoutLevel).toBe("ELITE")
        expect(draft.activeScoutingMission).toBeUndefined()
    })

    test("mid-accuracy scout yields EXPERT", () => {
        const draft = makeDraft({ activeScoutingMission: mission("s1"), staff: [scout("s1", 70)] })
        run(draft)
        expect(draft.scoutedPlayers[0].scoutLevel).toBe("EXPERT")
    })

    test("low-accuracy scout yields BASIC — no longer a flat EXPERT", () => {
        const draft = makeDraft({ activeScoutingMission: mission("s1"), staff: [scout("s1", 30)] })
        run(draft)
        expect(draft.scoutedPlayers[0].scoutLevel).toBe("BASIC")
    })

    test("a scouting specialist's multiplier can push a report up a tier", () => {
        // 80 alone → EXPERT; ×1.1 = 88 → ELITE.
        const general = makeDraft({ activeScoutingMission: mission("s1"), staff: [scout("s1", 80, "General")] })
        run(general)
        expect(general.scoutedPlayers[0].scoutLevel).toBe("EXPERT")

        const specialist = makeDraft({ activeScoutingMission: mission("s1"), staff: [scout("s1", 80, "Talent ID")] })
        run(specialist)
        expect(specialist.scoutedPlayers[0].scoutLevel).toBe("ELITE")
    })

    test("legacy mission with no resolvable scout keeps the EXPERT default", () => {
        const draft = makeDraft({ activeScoutingMission: mission(undefined), staff: [] })
        run(draft)
        expect(draft.scoutedPlayers[0].scoutLevel).toBe("EXPERT")
    })
})
