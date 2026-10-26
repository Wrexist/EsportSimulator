/**
 * G7 Draft Cup: the draft rules, and a full run on the real world snapshot
 * through the store (draft, cup, weekly advance, outcome and run score).
 */
import { useGameStore } from "@/store/game-store"
import {
    buildDraftPool, draftComplete, draftCupOutcome, draftPrice, draftSpent, pickCupField, clubStrength,
    DRAFT_BUDGET, DRAFT_POOL_PER_ROLE, DRAFT_PRICE_FLOOR, DRAFT_ROLES, type DraftPick, type DraftPool,
} from "@/engine/draft-cup"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import { buildDraftCupWorld } from "@/lib/draft-cup-world"
import type { GameSave } from "@/engine/save-types"

jest.mock("@/data", () => {
    const actual = jest.requireActual("@/data")
    const { SnapshotLoader } = jest.requireActual("@/data/snapshot-loader")
    const nodePath = jest.requireActual("node:path")
    return { ...actual, snapshotLoader: new SnapshotLoader(nodePath.join(process.cwd(), "public/data/snapshot")) }
})
jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined), recordNewCampaign: jest.fn() }))

jest.setTimeout(600_000)

/** Best affordable five: the priciest pick per role that still leaves the cheapest for the rest. */
function greedyDraft(pool: DraftPool, budget = DRAFT_BUDGET): DraftPick[] {
    const picks: DraftPick[] = []
    let left = budget
    DRAFT_ROLES.forEach((role, i) => {
        const reserve = DRAFT_ROLES.slice(i + 1).reduce((s, r) => s + Math.min(...pool[r].map(o => o.price)), 0)
        const option = pool[role].filter(o => o.price <= left - reserve).sort((a, b) => b.price - a.price)[0]
        picks.push({ playerId: option.playerId, role, price: option.price })
        left -= option.price
    })
    return picks
}

let world: GameSave
beforeAll(async () => { world = await buildDraftCupWorld() })
const byId = () => new Map(world.players.map(p => [p.id, p]))

describe("draft rules", () => {
    test("prices climb steeply and five stars do not fit", () => {
        expect(draftPrice(DRAFT_PRICE_FLOOR + 2)).toBe(1)
        expect(draftPrice(DRAFT_PRICE_FLOOR + 12)).toBeLessThan(draftPrice(DRAFT_PRICE_FLOOR + 22))
        expect(draftPrice(DRAFT_PRICE_FLOOR + 24) * 5).toBeGreaterThan(DRAFT_BUDGET)
    })

    test("prices follow the OVR the game shows, so the same OVR costs the same", () => {
        const pool = buildDraftPool(world.players, world.teams, [], 4)
        const priceAt = new Map<number, number>()
        for (const o of DRAFT_ROLES.flatMap(r => pool[r])) {
            expect(o.price).toBe(draftPrice(o.overall))
            expect(priceAt.get(o.overall) ?? o.price).toBe(o.price)
            priceAt.set(o.overall, o.price)
        }
    })

    test("the field comes from the difficulty band and the pool avoids it", () => {
        const players = byId() as never
        const open = pickCupField(world.teams, players, "open", 1)
        const elite = pickCupField(world.teams, players, "elite", 1)
        expect(open).toHaveLength(7)
        expect(new Set(elite).size).toBe(7)
        const mean = (ids: string[]) => ids.reduce((s, id) => s + clubStrength(world.teams.find(t => t.id === id)!, players), 0) / ids.length
        expect(mean(elite)).toBeGreaterThan(mean(open) + 5)
        const pool = buildDraftPool(world.players, world.teams, elite, 2)
        const inField = new Set(elite.flatMap(id => world.teams.find(t => t.id === id)!.rosterIds))
        for (const role of DRAFT_ROLES) {
            expect(pool[role]).toHaveLength(DRAFT_POOL_PER_ROLE)
            expect(pool[role].every(o => o.role === role && !inField.has(o.playerId))).toBe(true)
            expect(new Set(pool[role].map(o => o.playerId)).size).toBe(DRAFT_POOL_PER_ROLE)
        }
        // Every price range is on offer: the dearest option costs several times the cheapest.
        expect(Math.max(...pool.AWPER.map(o => o.price))).toBeGreaterThan(3 * Math.min(...pool.AWPER.map(o => o.price)))
        expect(buildDraftPool(world.players, world.teams, elite, 2)).toEqual(pool)
    })

    test("a draft is one player per role inside the budget", () => {
        const pool = buildDraftPool(world.players, world.teams, [], 3)
        const picks = greedyDraft(pool)
        expect(draftComplete(picks)).toBe(true)
        expect(draftSpent(picks)).toBeLessThanOrEqual(DRAFT_BUDGET)
        expect(draftComplete(picks.slice(0, 4))).toBe(false)
        expect(draftComplete([...picks.slice(0, 4), { ...picks[0] }])).toBe(false)
        expect(draftComplete(picks, draftSpent(picks) - 1)).toBe(false)
    })
})

test.each([["as drafted", false], ["with a dominant side, so the cup is won", true]])("a full Draft Cup run through the store, %s", async (_label, dominant) => {
    const players = byId() as never
    const opponentIds = pickCupField(world.teams, players, "open", 11)
    const pool = buildDraftPool(world.players, world.teams, opponentIds, 12)
    const picks = greedyDraft(pool)
    await useGameStore.getState().initializeNewGame("Draft run", world.playerTeamId, undefined, {
        draftCup: {
            world: structuredClone(world),
            setup: { teamName: "Test Five", shortName: "tst", primaryColor: "#3B82F6", secondaryColor: "#1E40AF", difficulty: "open", budget: DRAFT_BUDGET, picks, opponentIds },
        },
    })
    let s = useGameStore.getState()
    expect(s.error ?? null).toBeNull()
    const cup = s.draftCup!
    expect(cup).toBeTruthy()
    expect(s.playerTeamId).toBe(cup.teamId)
    const team = s.teams.find(t => t.id === cup.teamId)!
    expect(team.name).toBe("Test Five")
    expect(team.shortName).toBe("TST")
    expect([...team.rosterIds].sort()).toEqual(picks.map(p => p.playerId).sort())
    for (const pick of picks) {
        expect(s.players.find(p => p.id === pick.playerId)!.role).toBe(pick.role)
        expect(s.contracts.filter(c => c.playerId === pick.playerId).map(c => c.teamId)).toEqual([cup.teamId])
        expect(s.teams.filter(t => t.rosterIds.includes(pick.playerId)).map(t => t.id)).toEqual([cup.teamId])
    }
    // Not in the league, and in no tournament but the cup.
    expect(team.leagueDivisionId).toBeUndefined()
    expect(JSON.stringify(s.league ?? {})).not.toContain(cup.teamId)
    const tournament = s.tournaments.find(t => t.id === cup.tournamentId)!
    expect([...tournament.teamIds].sort()).toEqual([cup.teamId, ...opponentIds].sort())
    expect(tournament.playoffBracket!.filter(m => m.stage.startsWith("Quarter")).length).toBe(4)
    // The quarter-final is this week.
    const firstMatch = s.scheduledMatches.find(m => m.tournamentId === cup.tournamentId && (m.homeTeamId === cup.teamId || m.awayTeamId === cup.teamId))!
    expect(firstMatch.week).toBe(s.currentWeek)
    expect(s.eventsLog.some(e => e.id.startsWith("evt_draft_cup_"))).toBe(true)

    // G13: a title bonus on one drafted contract is paid only if the cup is won.
    useGameStore.setState(st => ({ contracts: st.contracts.map(c => c.playerId === picks[0].playerId && c.teamId === cup.teamId ? { ...c, tournamentWinBonus: 7_000 } : c) }))
    if (dominant) useGameStore.setState(st => ({ players: st.players.map(p => picks.some(k => k.playerId === p.id) ? { ...p, skill: 99, rifle: 99, awp: 99, reaction: 99, clutch: 99, eyesight: 99, form: 100 } : p) }))

    let played = 0
    for (let guard = 0; guard < 6 && !draftCupOutcome(useGameStore.getState() as never); guard++) {
        s = useGameStore.getState()
        const mine = s.scheduledMatches.find(m => m.week === s.currentWeek && (m.homeTeamId === cup.teamId || m.awayTeamId === cup.teamId))
        if (mine) {
            expect(mine.tournamentId).toBe(cup.tournamentId)
            // Day-by-day calendar: jump to match day (the advance control does this in the app).
            if (s.timeMode === "HYBRID_DAILY") useGameStore.setState({ currentDay: Math.max(s.currentDay, mine.day ?? 0) })
            const ok = await useGameStore.getState().simulateInstantMatch(mine.id)
            if (!ok) throw new Error(JSON.stringify(useGameStore.getState().toasts.slice(-3)))
            played++
            continue
        }
        await useGameStore.getState().advanceWeek()
        expect(useGameStore.getState().error ?? null).toBeNull()
    }
    // The result screen settles the run: trophy, prize money and title bonuses (no week tick follows).
    expect(await useGameStore.getState().settleDraftCup()).toBe(true)
    s = useGameStore.getState()
    // A side drafted for one cup never takes a world rank, and the drafted five get the field's facilities.
    const finalTeam = s.teams.find(t => t.id === cup.teamId)!
    expect(finalTeam.worldRanking).toBeUndefined()
    expect(s.teams.filter(t => t.worldRanking != null).map(t => t.worldRanking!).sort((a, b) => a - b)).toEqual(s.teams.filter(t => t.id !== cup.teamId).map((_, i) => i + 1))
    const outcome = draftCupOutcome(s as never)!
    expect(outcome).toBeTruthy()
    expect(played).toBe(outcome.finish === "champion" ? 3 : outcome.finish === "final" ? 3 : outcome.finish === "semi" ? 2 : 1)
    expect(outcome.seriesWon).toBe(played - (outcome.finish === "champion" ? 0 : 1))
    expect(outcome.score).toBeGreaterThan(0)
    expect(outcome.breakdown.reduce((n, b) => n + b.points, 0)).toBe(outcome.score)
    const titleBonus = s.financeLedger.filter(e => e.id.endsWith(`_${picks[0].playerId}_title`))
    expect(titleBonus.map(e => e.amount)).toEqual(outcome.finish === "champion" ? [7_000] : [])
    if (dominant) expect(outcome.finish).toBe("champion")
    expect(s.teams.find(t => t.id === cup.teamId)!.trophies?.map(t => t.tournamentId) ?? []).toEqual(outcome.finish === "champion" ? [cup.tournamentId] : [])
    // No club offers the Draft Cup manager a job, even when one is forced.
    expect(s.eventsLog.filter(e => e.type === "JOB_OFFER")).toEqual([])
    const probe = JSON.parse(JSON.stringify(s)) as GameSave
    JobOfferGenerator.forceJobOffer(probe)
    expect(JobOfferGenerator.createDismissalOffers(probe)).toEqual([])
    expect(probe.eventsLog.filter(e => e.type === "JOB_OFFER")).toEqual([])
    // No other competition ever scheduled the drafted team.
    expect(s.scheduledMatches.concat(s.completedMatches).filter(m => (m.homeTeamId === cup.teamId || m.awayTeamId === cup.teamId) && m.tournamentId !== cup.tournamentId)).toEqual([])
})
