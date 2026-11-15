/**
 * Audit 2026-11-15 (MODES-17): a free agent in the Create-team roster
 * builder asks the same wage the Transfers market shows for him.
 */
import { autoContract, type PlayerWithTeamInfo } from "@/components/onboarding/roster-builder-contract"
import { signingWageAsk } from "@/components/transfer/negotiation-rules"
import players from "@/public/data/snapshot/players.json"
import teams from "@/public/data/snapshot/teams.json"
import type { PlayerSaveData } from "@/engine/save-types"

const rostered = new Set((teams as unknown as Array<{ rosterIds: string[] }>).flatMap(t => t.rosterIds))
const freeAgents = (players as unknown as PlayerSaveData[]).filter(p => !rostered.has(p.id) && !p.isRetired)
const asFreeAgent = (p: PlayerSaveData): PlayerWithTeamInfo => ({ ...p, currentTeamId: null, currentTeamName: null, existingContract: null, isFreeAgent: true, ovr: 0 })

test("every snapshot free agent's builder wage is his market wage ask, for the new club's reputation", () => {
    expect(freeAgents.length).toBeGreaterThan(50)
    for (const reputation of [0, 25, 50]) {
        const club = { reputation }
        for (const p of freeAgents) {
            const deal = autoContract(asFreeAgent(p), 1, club)
            expect(deal.salaryPerWeek).toBe(signingWageAsk(p, 1, club))
            expect(deal).toMatchObject({ startWeek: 1, endWeek: 53, transferFee: 0, buyout: 0 })
        }
    }
})
