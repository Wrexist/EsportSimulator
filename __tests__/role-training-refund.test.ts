/**
 * Regression for AUDIT_UX_2026-06 G2 + the pre-Steam economy audit.
 *
 * Cancelling role training refunds 50% of what was ACTUALLY PAID (weeksCompleted),
 * and that budget mutation must be written to the finance ledger (economy
 * invariant #5). Role training is pay-as-you-go (charged weekly), so an earlier
 * "refund 50% of REMAINING weeks" formula minted money that was never spent —
 * start→cancel in the same week returned weeklyCost*totalWeeks*0.5 for $0 paid.
 * The refund is now capped at half of the amount charged → always a net loss,
 * never farmable.
 */

import { TrainingManager } from "@/engine/training-manager"
import type { GameSave } from "@/engine/save-types"

function makeGame(weeksCompleted: number, budget = 50000): GameSave {
    return {
        currentWeek: 10,
        playerTeamId: "t1",
        teams: [{
            id: "t1",
            budget,
            trainingSlotsUsed: 1,
            activeRoleTraining: [{
                playerId: "p1",
                targetRole: "AWPER",
                totalWeeks: 8,
                weeksCompleted,
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
    it("refunds 50% of weeks PAID and writes a finance-ledger entry", () => {
        const game = makeGame(2)
        TrainingManager.cancelTraining(game, "t1", "p1")

        // paid = 2 weeks * $5000 = $10000; refund = floor(10000 * 0.5) = $5000
        expect(game.teams[0].budget).toBe(55000)

        const refund = game.financeLedger.find(e => e.type === "INCOME" && e.category === "TRAINING")
        expect(refund).toBeTruthy()
        expect(refund!.amount).toBe(5000)
        expect(refund!.balance).toBe(55000)
        expect(refund!.teamId).toBe("t1")
    })

    it("refunds $0 when cancelled before any week is paid (no money exploit)", () => {
        const game = makeGame(0)
        TrainingManager.cancelTraining(game, "t1", "p1")

        // 0 weeks paid → 0 refund → budget unchanged, no ledger entry minted
        expect(game.teams[0].budget).toBe(50000)
        expect(game.financeLedger.length).toBe(0)
        // slot is still released so the session can be restarted cleanly
        expect(game.teams[0].trainingSlotsUsed).toBe(0)
    })

    it("never refunds more than was paid (non-farmable at any progress level)", () => {
        for (let weeks = 0; weeks <= 8; weeks++) {
            const game = makeGame(weeks)
            const paid = weeks * 5000
            TrainingManager.cancelTraining(game, "t1", "p1")
            const refund = game.teams[0].budget - 50000
            expect(refund).toBeLessThanOrEqual(paid)
        }
    })
})
