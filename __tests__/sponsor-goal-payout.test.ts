/**
 * Direct contract test for the shared sponsor-goal payout helper, now the
 * single source of truth for both the weekly and per-match sponsor-goal
 * processors. Pins idempotency + player-only notification so a future edit to
 * the helper can't silently regress either caller.
 */

import { paySponsorGoalBonus } from "@/engine/processors/sponsor-goal-payout"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

function makeSave(over: Partial<GameSave> = {}): GameSave {
    return {
        currentWeek: 4,
        playerTeamId: "player",
        financeLedger: [],
        eventsLog: [],
        ...over,
    } as unknown as GameSave
}

const team = (id = "player", budget = 10_000): TeamSaveData => ({ id, budget }) as unknown as TeamSaveData

const base = (save: GameSave, t: TeamSaveData) => ({
    save, team: t, sponsorName: "Acme", goalDescription: "Win Matches",
    bonusPayout: 5_000, ledgerId: "L1", eventId: "E1",
})

describe("paySponsorGoalBonus", () => {
    test("pays once: budget bump + ledger entry + player event", () => {
        const save = makeSave()
        const t = team()
        paySponsorGoalBonus(base(save, t))
        expect(t.budget).toBe(15_000)
        expect(save.financeLedger).toHaveLength(1)
        expect(save.financeLedger[0].id).toBe("L1")
        expect(save.financeLedger[0].balance).toBe(15_000)
        expect(save.eventsLog).toHaveLength(1)
    })

    test("idempotent — a second call with the same ledgerId is a no-op", () => {
        const save = makeSave()
        const t = team()
        paySponsorGoalBonus(base(save, t))
        paySponsorGoalBonus(base(save, t))
        expect(t.budget).toBe(15_000) // not 20,000
        expect(save.financeLedger).toHaveLength(1)
        expect(save.eventsLog).toHaveLength(1)
    })

    test("respects a threaded ledgerIdSet for cross-week dedup", () => {
        const save = makeSave()
        const t = team()
        const ledgerIdSet = new Set<string>(["L1"])
        paySponsorGoalBonus({ ...base(save, t), ledgerIdSet })
        expect(t.budget).toBe(10_000) // already in the set → skipped
        expect(save.financeLedger).toHaveLength(0)
    })

    test("a non-player team gets the payout but NO event", () => {
        const save = makeSave()
        const t = team("ai_team")
        paySponsorGoalBonus(base(save, t))
        expect(t.budget).toBe(15_000)
        expect(save.financeLedger).toHaveLength(1)
        expect(save.eventsLog).toHaveLength(0)
    })
})
