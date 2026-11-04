/**
 * HOME-06: the "Sponsor progress review" decision fired for a club with no
 * signed sponsor ("0 active deals"), while the week report paid sponsorship
 * income (the base-partner floor every club earns). It now needs a running
 * deal, counted the way the economy pays deals, and the roll is unchanged.
 */
import { EventProcessor } from "@/engine/processors/event-processor"
import { SeededRNG } from "@/engine/rng"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

function world(sponsors: TeamSaveData["sponsors"]): GameSave {
    return {
        currentWeek: 7, eventsLog: [], completedMatches: [], players: [],
        teams: [{ id: "t", rosterIds: [], sponsors } as unknown as TeamSaveData],
    } as unknown as GameSave
}

async function reviewFor(sponsors: TeamSaveData["sponsors"], seed: number) {
    const save = world(sponsors)
    const tx = { generatedEventIds: [] as string[] }
    const saveManager = { recordEventGenerated: async (t: typeof tx, id: string) => { t.generatedEventIds.push(id) } }
    const rng = new SeededRNG(seed)
    await EventProcessor.generateEvents(save, tx as never, rng, "t", saveManager as never)
    return { event: save.eventsLog.find(e => e.id.startsWith("sponsor_review_")), rngAfter: rng.getState() }
}

const deal = (remainingWeeks?: number) => ({ id: `s${remainingWeeks}`, weeklyPayout: 500, remainingWeeks }) as never

describe("HOME-06: sponsor progress review needs an active deal", () => {
    test("fires with an active deal and reports the active count", async () => {
        let found = false
        for (let seed = 1; seed < 400 && !found; seed++) {
            const { event } = await reviewFor([deal(10), deal(0)], seed)
            if (!event) continue
            found = true
            expect((event.data as { currentSponsors: number }).currentSponsors).toBe(1)
            // Same roll, no running deal: nothing, and the RNG advanced the same way.
            const none = await reviewFor([deal(0)], seed)
            expect(none.event).toBeUndefined()
            expect(none.rngAfter).toBe((await reviewFor([deal(10)], seed)).rngAfter)
            expect((await reviewFor([], seed)).event).toBeUndefined()
        }
        expect(found).toBe(true)
    })
})
