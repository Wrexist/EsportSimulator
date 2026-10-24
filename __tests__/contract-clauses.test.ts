/**
 * G13 contract clauses: the wage he asks moves with the clauses, release
 * clauses get paid by AI clubs, sell-on shares reach the club that sold him,
 * and appearance bonuses are paid for official matches only.
 */
import { CLAUSE_TUNING, NO_CLAUSES, clauseFields, releaseClauseFee, releaseTriggerChance, sanitizeClauseFields, settleSellOn, wageWithClauses } from "@/engine/contract-clauses"
import { canPayReleaseClause, processReleaseClauses } from "@/engine/ai/transfer-market"
import { settlePlayerContractBonuses } from "@/engine/processors/player-contract-bonuses"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { GameSave } from "@/engine/save-types"
import { buildDraftCupWorld } from "@/lib/draft-cup-world"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.setTimeout(300_000)

let world: GameSave
beforeAll(async () => {
    world = await buildDraftCupWorld()
    // A sixth player, so a clause can be paid.
    const mine = world.teams.find(t => t.id === world.playerTeamId)!
    const spare = world.players.find(p => !p.isRetired && !world.teams.some(t => t.rosterIds.includes(p.id)))
    if (spare && mine.rosterIds.length < 6) mine.rosterIds.push(spare.id)
})

describe("wage with clauses", () => {
    test("a release clause and bonuses lower the wage he asks, within their caps", () => {
        expect(wageWithClauses(1000, NO_CLAUSES)).toBe(1000)
        expect(wageWithClauses(1000, { ...NO_CLAUSES, release: "high" })).toBeLessThan(1000)
        expect(wageWithClauses(1000, { ...NO_CLAUSES, release: "low" })).toBeLessThan(wageWithClauses(1000, { ...NO_CLAUSES, release: "high" }))
        expect(wageWithClauses(1000, { ...NO_CLAUSES, appearanceBonus: 200 })).toBeCloseTo(1000 - 200 * CLAUSE_TUNING.APPEARANCE_WAGE_CREDIT)
        // Capped: a huge bonus never takes more than its share of the wage.
        expect(wageWithClauses(1000, { ...NO_CLAUSES, appearanceBonus: 1e6, titleBonus: 1e6 })).toBeCloseTo(1000 * (1 - CLAUSE_TUNING.APPEARANCE_MAX_SHARE - CLAUSE_TUNING.TITLE_MAX_SHARE))
    })

    test("contract fields carry the clause fee and bonuses; bad fields are dropped", () => {
        expect(releaseClauseFee("none", 10_000)).toBe(0)
        expect(clauseFields({ release: "low", appearanceBonus: 300, titleBonus: 0 }, 10_000)).toEqual({ releaseClause: 500_000, appearanceBonus: 300 })
        expect(clauseFields(NO_CLAUSES, 10_000)).toEqual({})
        expect(releaseTriggerChance(releaseClauseFee("low", 1000), 1000)).toBeCloseTo(CLAUSE_TUNING.RELEASE_TRIGGER_LOW)
        expect(releaseTriggerChance(releaseClauseFee("high", 1000), 1000)).toBeCloseTo(CLAUSE_TUNING.RELEASE_TRIGGER_HIGH)
        expect(sanitizeClauseFields({ releaseClause: -5, appearanceBonus: Number.NaN, sellOn: { teamId: "x", pct: 2 } })).toEqual({})
    })
})

function fixture(): GameSave {
    const save = createLaunchFixture("first-week")
    save.saveId = "clauses"
    return save
}

describe("release clauses and sell-on", () => {
    test("an AI club that can pay takes a player with a low clause; you keep the fee", () => {
        // The real world: AI clubs with their real cash decide whether they can pay (no mocks).
        let taken: string[] = []
        let save!: GameSave
        for (let week = 1; week < 200 && !taken.length; week++) {
            save = structuredClone(world)
            save.currentWeek = week
            const mine = save.teams.find(t => t.id === save.playerTeamId)!
            const target = save.players.find(p => p.id === mine.rosterIds[0])!
            const c = save.contracts.find(x => x.playerId === target.id && x.teamId === mine.id)!
            c.endWeek = week + 100
            c.releaseClause = releaseClauseFee("low", c.salaryPerWeek)
            taken = processReleaseClauses(save, mine.id)
        }
        expect(taken).toHaveLength(1)
        const mine = save.teams.find(t => t.id === save.playerTeamId)!
        expect(mine.rosterIds).not.toContain(taken[0])
        expect(save.financeLedger.some(e => e.teamId === mine.id && e.description.startsWith("Release clause"))).toBe(true)
        expect(save.eventsLog.some(e => e.id === `evt_release_${save.currentWeek}_${taken[0]}`)).toBe(true)
        expect(save.contracts.filter(c => c.playerId === taken[0]).map(c => c.teamId)).not.toContain(mine.id)
    })

    test("a club pays only with the cash to spare and for a player who beats someone it has", () => {
        const save = structuredClone(world)
        const club = save.teams.find(t => t.id !== save.playerTeamId && t.rosterIds.length >= 5 && t.rosterIds.length < 7)!
        const own = save.players.filter(p => club.rosterIds.includes(p.id))
        const better = { ...own[0], id: "x_better", skill: Math.max(...own.map(p => p.skill)) + 5 }
        const worse = { ...own[0], id: "x_worse", skill: Math.min(...own.map(p => p.skill)) - 1 }
        club.budget = 1e9
        expect(canPayReleaseClause(save, club, better, 1000)).toBe(true)
        expect(canPayReleaseClause(save, club, worse, 1000)).toBe(false)
        club.budget = 1000
        expect(canPayReleaseClause(save, club, better, 1000)).toBe(false)
    })

    test("no clause, no trigger; and never below six players", () => {
        const save = fixture()
        for (const t of save.teams) if (t.id !== save.playerTeamId) t.budget = 50_000_000
        for (let week = 1; week < 100; week++) { save.currentWeek = week; expect(processReleaseClauses(save, save.playerTeamId)).toEqual([]) }
        const mine = save.teams.find(t => t.id === save.playerTeamId)!
        mine.rosterIds = mine.rosterIds.slice(0, 5)
        for (const c of save.contracts) if (c.teamId === mine.id) { c.releaseClause = 1; c.endWeek = 999 }
        for (let week = 1; week < 100; week++) { save.currentWeek = week; expect(processReleaseClauses(save, mine.id)).toEqual([]) }
    })

    test("a sell-on share moves from the selling club to the club owed it", () => {
        const save = fixture()
        const [owed, seller] = save.teams
        const before = { owed: owed.budget, seller: seller.budget }
        const playerId = seller.rosterIds[0]
        const contract = { playerId, teamId: seller.id, salaryPerWeek: 1000, startWeek: 0, endWeek: 99, buyout: 0, sellOn: { teamId: owed.id, pct: 0.15 } }
        expect(settleSellOn(save, contract, "P", 200_000)).toBe(30_000)
        expect(owed.budget - before.owed).toBe(30_000)
        expect(before.seller - seller.budget).toBe(30_000)
        expect(settleSellOn(save, { ...contract, sellOn: undefined }, "P", 200_000)).toBe(0)
    })
})

test("appearance bonuses are paid for official matches only", () => {
    const save = fixture()
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    const playerId = team.rosterIds[0]
    const c = save.contracts.find(x => x.playerId === playerId && x.teamId === team.id)!
    c.appearanceBonus = 500
    c.startWeek = 0
    c.endWeek = save.currentWeek + 50
    const budget = team.budget
    settlePlayerContractBonuses(save, "friendly_1", team.id, true, [playerId], undefined, undefined, false)
    expect(team.budget).toBe(budget)
    settlePlayerContractBonuses(save, "official_1", team.id, false, [playerId], undefined, undefined, true)
    expect(budget - team.budget).toBe(500)
    settlePlayerContractBonuses(save, "official_1", team.id, false, [playerId], undefined, undefined, true)
    expect(budget - team.budget).toBe(500)
})
