/**
 * Regression for AUDIT_UX_2026-06 G2 — cancelling role training refunds 50% of
 * the remaining cost, and that budget mutation must be written to the finance
 * ledger (economy invariant #5). Before the fix the refund credited budget
 * silently, so the ledger no longer reconciled.
 */

import { TrainingManager } from "@/engine/training-manager"
import type { GameSave } from "@/engine/save-types"

function makeGame(): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "t1",
        teams: [{
            id: "t1",
            budget: 50000,
            trainingSlotsUsed: 1,
            activeRoleTraining: [{
                playerId: "p1",
                targetRole: "AWPER",
                totalWeeks: 8,
                weeksCompleted: 2,
                weeklyCost: 5000,
            }],
        }],
        players: [{ id: "p1", nickname: "Star" }],
        contracts: [],
        staff: [],
        completedMatches: [],
        scheduledMatches: [],
        tournaments: [],
        financeLedger: [],
        eventsLog: [],
    } as unknown as GameSave
}

describe("role-training cancel refund", () => {
    it("credits a 50% refund AND writes a finance-ledger entry", () => {
        const game = makeGame()
        TrainingManager.cancelTraining(game, "t1", "p1")

        // remaining = 8 - 2 = 6 weeks; refund = floor(5000 * 6 * 0.5) = 15000
        expect(game.teams[0].budget).toBe(65000)

        const refund = game.financeLedger.find(e => e.type === "INCOME" && e.category === "TRAINING")
        expect(refund).toBeTruthy()
        expect(refund!.amount).toBe(15000)
        expect(refund!.balance).toBe(65000)
        expect(refund!.teamId).toBe("t1")
    })
})
