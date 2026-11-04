/**
 * SQUAD-16: releasing staff pays severance (two weeks' wage, or the rest of
 * the contract when shorter); the staff market Refresh is free once per week
 * and then costs about one week of the average market wage. The free week is
 * saved (staffMarketRefreshWeek) and old saves without it still load.
 */

import { produce, enableMapSet } from "immer"
import { createStaffManagementSlice } from "@/store/slices/staff-management-slice"
import { normalizeStaffRefreshWeek, staffRefreshCost, staffRefreshFee, staffSeverance, STAFF_SEVERANCE_WEEKS } from "@/engine/staff-economy"
import { buildSaveSnapshot, type SaveSnapshotState } from "@/store/utils/build-save-snapshot"
import { collectValidationErrors } from "@/engine/save-types"
import { runMigrationLadder } from "@/engine/save-migrations"
import { useGameStore } from "@/store/game-store"
import { saveManager } from "@/engine"
import { debouncedStorage } from "@/engine/storage-adapter"
import { storedText } from "@/lib/stored-text"
import { registerLocale, setLocale } from "@/lib/i18n"
import { readFileSync } from "fs"
import { join } from "path"
import type { StaffSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

enableMapSet()

function harness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    const get = () => state
    return { state: () => state, slice: createStaffManagementSlice(set as never, get as never) }
}

const team = (id: string, over: Partial<TeamSaveData> = {}) =>
    ({ id, name: id, budget: 100_000, rosterIds: [], staffIds: [], ...over }) as unknown as TeamSaveData

const member = (id: string, over: Partial<StaffSaveData> = {}) =>
    ({ id, name: `Staff ${id}`, role: "coach", teamId: "player", level: 2, salaryPerWeek: 1000, contractEndWeek: 60, stats: {}, ...over }) as unknown as StaffSaveData

function base(over: Partial<StoreState> = {}): Partial<StoreState> {
    return {
        teams: [team("player", { staffIds: ["s1"] }), team("rival", { staffIds: ["r1"] })],
        players: [], contracts: [],
        staff: [member("s1"), member("r1", { teamId: "rival" })],
        marketStaff: [member("m1", { teamId: "", salaryPerWeek: 800 }), member("m2", { teamId: "", salaryPerWeek: 1200 })],
        financeLedger: [], newsFeed: [],
        currentWeek: 10, playerTeamId: "player", lastRngSeed: 7,
        ...(over as object),
    }
}

describe("staffSeverance", () => {
    test("two weeks' wage on a long contract", () => {
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: 60 }, 10)).toEqual({ weeks: 2, wage: 1500, amount: 3000 })
        expect(STAFF_SEVERANCE_WEEKS).toBe(2)
    })
    test("the rest of the contract when fewer than two weeks are left", () => {
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: 11 }, 10)).toEqual({ weeks: 1, wage: 1500, amount: 1500 })
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: 12 }, 10).amount).toBe(3000)
    })
    test("an ended contract pays nothing; an open-ended one pays two weeks", () => {
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: 10 }, 10).amount).toBe(0)
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: 3 }, 10).amount).toBe(0)
        expect(staffSeverance({ salaryPerWeek: 1500, contractEndWeek: undefined }, 10).amount).toBe(3000)
    })
})

describe("fireStaff severance", () => {
    test("pays two weeks' wage, books it as staff wages and removes the member", () => {
        const h = harness(base())
        h.slice.fireStaff("s1")
        const s = h.state()
        expect(s.teams[0].budget).toBe(98_000)
        expect(s.teams[0].staffIds).toEqual([])
        expect(s.staff.map(x => x.id)).toEqual(["r1"])
        expect(s.financeLedger).toHaveLength(1)
        expect(s.financeLedger[0]).toMatchObject({ type: "EXPENSE", category: "WAGES_STAFF", amount: 2000, balance: 98_000, teamId: "player", description: "Staff severance: Staff s1" })
    })

    test("a contract with one week left pays one week", () => {
        const h = harness(base({ staff: [member("s1", { contractEndWeek: 11 })] }))
        h.slice.fireStaff("s1")
        expect(h.state().teams[0].budget).toBe(99_000)
        expect(h.state().financeLedger[0].amount).toBe(1000)
    })

    test("blocked with a clear message when the club cannot pay; nothing changes", () => {
        const h = harness(base({ teams: [team("player", { staffIds: ["s1"], budget: 1999 })] }))
        expect(() => h.slice.fireStaff("s1")).toThrow("Releasing Staff s1 costs $2,000 in severance; the club has $1,999.")
        expect(h.state().staff).toHaveLength(2)
        expect(h.state().teams[0].staffIds).toEqual(["s1"])
        expect(h.state().teams[0].budget).toBe(1999)
        expect(h.state().financeLedger).toHaveLength(0)
    })

    test("exactly enough money is enough", () => {
        const h = harness(base({ teams: [team("player", { staffIds: ["s1"], budget: 2000 })] }))
        h.slice.fireStaff("s1")
        expect(h.state().teams[0].budget).toBe(0)
    })

    test("another club's staff cannot be released and its budget is untouched", () => {
        const h = harness(base())
        expect(() => h.slice.fireStaff("r1")).toThrow(/own staff/)
        expect(h.state().teams[1].budget).toBe(100_000)
        expect(h.state().financeLedger).toHaveLength(0)
    })
})

describe("staff market refresh pricing", () => {
    test("fee is one week of the average market wage, rounded to $10", () => {
        expect(staffRefreshFee([{ salaryPerWeek: 800 }, { salaryPerWeek: 1200 }])).toBe(1000)
        expect(staffRefreshFee([{ salaryPerWeek: 1001 }, { salaryPerWeek: 1002 }, { salaryPerWeek: 1010 }])).toBe(1000)
        expect(staffRefreshFee([])).toBe(0)
    })
    test("free when the week differs (new career / old save), paid when used this week", () => {
        const market = [{ salaryPerWeek: 800 }, { salaryPerWeek: 1200 }]
        expect(staffRefreshCost(market, 10, undefined)).toEqual({ free: true, cost: 0 })
        expect(staffRefreshCost(market, 10, 9)).toEqual({ free: true, cost: 0 })
        expect(staffRefreshCost(market, 10, 10)).toEqual({ free: false, cost: 1000 })
        expect(staffRefreshCost([], 10, 10)).toEqual({ free: true, cost: 0 })
    })

    test("first refresh is free and stores the week; the second costs the fee; next week is free again", () => {
        const h = harness(base())
        const first = h.slice.requestStaffMarketRefresh()
        expect(first).toMatchObject({ success: true, cost: 0 })
        expect(h.state().staffMarketRefreshWeek).toBe(10)
        expect(h.state().teams[0].budget).toBe(100_000)
        expect(h.state().marketStaff.length).toBe(20)
        const marketBefore = h.state().marketStaff.map(s => s.id)

        const fee = staffRefreshFee(h.state().marketStaff)
        expect(fee).toBeGreaterThan(0)
        const second = h.slice.requestStaffMarketRefresh()
        expect(second).toMatchObject({ success: true, cost: fee })
        expect(h.state().teams[0].budget).toBe(100_000 - fee)
        expect(h.state().financeLedger.at(-1)).toMatchObject({ category: "WAGES_STAFF", type: "EXPENSE", amount: fee, description: "Staff market refresh", balance: 100_000 - fee })
        expect(h.state().marketStaff.map(s => s.id)).not.toEqual(marketBefore)

        // Week rolls over: free again.
        const h2 = harness({ ...h.state(), currentWeek: 11 })
        const budget = h2.state().teams[0].budget
        expect(h2.slice.requestStaffMarketRefresh()).toMatchObject({ success: true, cost: 0 })
        expect(h2.state().teams[0].budget).toBe(budget)
        expect(h2.state().staffMarketRefreshWeek).toBe(11)
    })

    test("a paid refresh is blocked when the club cannot afford it; the market stays", () => {
        const h = harness(base({ staffMarketRefreshWeek: 10, teams: [team("player", { budget: 999 })] }))
        const before = h.state().marketStaff
        const r = h.slice.requestStaffMarketRefresh()
        expect(r.success).toBe(false)
        expect(r.cost).toBe(1000)
        expect(r.message).toBe("Another refresh this week costs $1,000; the club has $999.")
        expect(h.state().marketStaff).toBe(before)
        expect(h.state().teams[0].budget).toBe(999)
        expect(h.state().financeLedger).toHaveLength(0)
    })

    test("the internal refresh (new career, empty market, weekly rotation) stays free and leaves the week alone", () => {
        const h = harness(base({ staffMarketRefreshWeek: 10 }))
        h.slice.refreshStaffMarket()
        expect(h.state().teams[0].budget).toBe(100_000)
        expect(h.state().staffMarketRefreshWeek).toBe(10)
        expect(h.state().financeLedger).toHaveLength(0)
    })
})

describe("ledger lines are translated when shown", () => {
    beforeAll(() => registerLocale("de", JSON.parse(readFileSync(join(__dirname, "..", "public", "locales", "de.json"), "utf8"))))
    afterEach(() => setLocale("en"))
    test("severance and refresh lines resolve to their keys", () => {
        setLocale("de")
        expect(storedText("Staff severance: Dr. Smith")).toBe("Abfindung Mitarbeiter: Dr. Smith")
        expect(storedText("Staff market refresh")).toBe("Mitarbeitermarkt aktualisiert")
    })
})

describe("save: staffMarketRefreshWeek", () => {
    const snapshotState = (over: Record<string, unknown> = {}) => ({
        saveId: "save_staff", saveName: "S", currentWeek: 10, currentDay: 6, timeMode: "WEEKLY", playerTeamId: "player",
        managerDetails: { name: "M", level: 1, xp: 0, reputation: 0, careerWins: 0, careerLosses: 0, championships: 0 },
        teams: [{ id: "player", name: "P", budget: 1000, rosterIds: [], staffIds: [] }], players: [], contracts: [], tournaments: [], staff: [], scheduledMatches: [], completedMatches: [],
        financeLedger: [], eventsLog: [], acknowledgedEventIds: [], lastRngSeed: 1, ...over,
    }) as unknown as SaveSnapshotState

    test("the builder writes it and it survives JSON", () => {
        const snap = JSON.parse(JSON.stringify(buildSaveSnapshot(snapshotState({ staffMarketRefreshWeek: 10 }))))
        expect(snap.staffMarketRefreshWeek).toBe(10)
    })

    test("an old save without the field validates and migrates with it absent (free refresh)", () => {
        const old = buildSaveSnapshot(snapshotState()) as unknown as Record<string, unknown>
        delete old.staffMarketRefreshWeek
        expect(collectValidationErrors(old)).toEqual([])
        for (let version = 0; version <= 12; version++) {
            const migrated = runMigrationLadder({ ...old, saveVersion: version })
            expect(migrated.staffMarketRefreshWeek).toBeUndefined()
        }
    })

    test("normalizer keeps a whole week and drops malformed values", () => {
        expect(normalizeStaffRefreshWeek(12)).toBe(12)
        expect(normalizeStaffRefreshWeek(0)).toBe(0)
        for (const bad of [undefined, null, "12", 1.5, -1, NaN, Infinity, {}]) expect(normalizeStaffRefreshWeek(bad)).toBeUndefined()
    })

    describe("loadGame", () => {
        const initial = useGameStore.getState()
        beforeEach(async () => { await Promise.resolve(); useGameStore.setState({ ...initial }) })
        afterEach(async () => { jest.restoreAllMocks(); await debouncedStorage.flush() })

        const load = async (extra: Record<string, unknown>) => {
            const save = { ...saveManager.createSave("Staff load", { teams: [], players: [], contracts: [], staff: [], playerTeamId: "player" }), ...extra }
            jest.spyOn(saveManager, "loadGame").mockResolvedValue({ save } as never)
            await useGameStore.getState().loadGame(save.saveId)
            return useGameStore.getState().staffMarketRefreshWeek
        }

        test("restores a saved week", async () => {
            expect(await load({ staffMarketRefreshWeek: 4 })).toBe(4)
        })
        test("an old save (no field) or a malformed one loads with the refresh free", async () => {
            useGameStore.setState({ staffMarketRefreshWeek: 4 })
            expect(await load({})).toBeUndefined()
            expect(await load({ staffMarketRefreshWeek: "soon" })).toBeUndefined()
        })
    })
})
