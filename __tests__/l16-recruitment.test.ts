import { produce } from "immer"
import { createLaunchFixture, FixtureStorage } from "../scripts/launch/fixtures"
import { createScoutingSlice } from "@/store/slices/scouting-slice"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import { createTeamSettingsSlice } from "@/store/slices/team-settings-slice"
import { processScoutingMissions } from "@/engine/processors/scouting-mission-processor"
import { getVisibleStats, scoutedRatingSortValue } from "@/engine/scouting-system"
import { recruitmentBudget, recruitmentSalary, recruitmentRole } from "@/engine/recruitment"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { signFreeAgent } from "@/engine/ai/roster-management"
import { processAIToAITransfers } from "@/engine/ai/transfer-market"
import { SaveManager } from "@/engine/save-manager"
import { SeededRNG } from "@/engine/rng"
import type { StoreState } from "@/store/types"
import type { StaffSaveData } from "@/engine/save-types"

function fixture() {
    const save = createLaunchFixture("first-week")
    save.scheduledMatches = []
    save.staff = [{ id: "l16_scout", name: "QA Scout", teamId: save.playerTeamId, role: "scout", level: 4,
        contractEndWeek: 104, salaryPerWeek: 1000, stats: { accuracy: 90 } } as StaffSaveData]
    save.teams[0].staffIds = ["l16_scout"]
    return save
}

function harness() {
    let state = { ...fixture(), addToast: jest.fn() } as unknown as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch) : { ...state, ...patch }
    }
    const get = () => state
    Object.assign(state, createScoutingSlice(set, get), createTransferContractSlice(set, get), createTeamSettingsSlice(set, get))
    return { get, set }
}

test("scout, compare, sign, bench swap and production export/import preserve the same identity and OVR", () => {
    const h = harness()
    const player = h.get().players.find(p => p.id === "qa_free_agent")!
    const teamId = h.get().playerTeamId!
    const unknown = getVisibleStats(player, [], [], h.get().currentWeek)
    expect(Array.isArray(unknown.ovrRange)).toBe(true)
    expect(unknown.exactStats).toBeUndefined()
    const budget = h.get().teams[0].budget
    h.get().startScoutingMission(player.id)
    expect(h.get().teams[0].budget).toBe(budget - 3000)
    h.get().startScoutingMission(player.id)
    expect(h.get().financeLedger.filter(e => e.description === "Scouting Mission")).toHaveLength(1)
    h.set(s => { s.currentWeek = s.activeScoutingMission!.completionWeek; processScoutingMissions(s as never) })
    const report = getVisibleStats(player, h.get().scoutedPlayers, [], h.get().currentWeek)
    expect(report.ovrRange).toBe(evaluatePlayer(player, undefined, undefined, h.get().currentWeek).overallRating)
    const salary = recruitmentSalary(player, h.get().currentWeek)
    const result = h.get().transferPlayer(player.id, "FA", teamId, 0, { salaryPerWeek: salary,
        startWeek: h.get().currentWeek, endWeek: h.get().currentWeek + 104, buyout: 0 })
    expect(result.success).toBe(true)
    h.get().swapRosterPositions(teamId, 5, 0)
    expect(h.get().teams[0].rosterIds[0]).toBe(player.id)
    const manager = new SaveManager(new FixtureStorage())
    const loaded = manager.importSave(manager.exportSave(h.get() as never)).save!
    expect(loaded).toBeTruthy()
    expect(loaded.teams[0].rosterIds[0]).toBe(player.id)
    expect(loaded.contracts.filter(c => c.playerId === player.id)).toHaveLength(1)
    expect(loaded.scoutedPlayers).toEqual(h.get().scoutedPlayers)
    expect(loaded.teams[0].budget).toBe(budget - 3000)
})

test.each(["missing", "rival", "expired", "retired"])("invalid scouting (%s) does not spend cash", kind => {
    const h = harness()
    h.set(s => {
        if (kind === "rival") s.staff[0].teamId = s.teams[1].id
        if (kind === "expired") s.staff[0].contractEndWeek = s.currentWeek
        if (kind === "retired") s.players.find(p => p.id === "qa_free_agent")!.isRetired = true
    })
    const budget = h.get().teams[0].budget
    h.get().startScoutingMission(kind === "missing" ? "missing" : "qa_free_agent")
    expect(h.get().activeScoutingMission).toBeUndefined()
    expect(h.get().teams[0].budget).toBe(budget)
    expect(h.get().addToast).toHaveBeenCalled()
})

test("report upgrades deduplicate old entries, never downgrade, and cancellation leaves no free report", () => {
    const h = harness()
    h.set({ scoutedPlayers: [{ playerId: "qa_free_agent", scoutedWeek: 1, scoutLevel: "BASIC" }] })
    h.get().startScoutingMission("qa_free_agent")
    h.set(s => { s.currentWeek = s.activeScoutingMission!.completionWeek; processScoutingMissions(s as never); processScoutingMissions(s as never) })
    expect(h.get().scoutedPlayers).toHaveLength(1)
    expect(h.get().scoutedPlayers[0].scoutLevel).toBe("ELITE")
    expect(h.get().eventsLog.filter(e => e.type === "SCOUTING_COMPLETE")).toHaveLength(1)
    const second = harness()
    second.get().startScoutingMission("qa_free_agent")
    second.get().cancelScoutingMission()
    expect(second.get().activeScoutingMission).toBeUndefined()
    expect(second.get().scoutedPlayers).toHaveLength(0)
    expect(second.get().teams[0].budget).toBe(197000)
})

test("academy-held players cannot be signed through the canonical transfer action", () => {
    const h = harness()
    h.set({ academyPendingProspects: ["qa_free_agent"] })
    const before = h.get().teams[0].budget
    expect(h.get().transferPlayer("qa_free_agent", "FA", h.get().playerTeamId!, 0).message).toContain("academy")
    expect(h.get().teams[0].budget).toBe(before)
})

test("lineup changes reject foreign teams, fractional indices and an active match", () => {
    const h = harness()
    const initial = h.get().teams.map(t => [...t.rosterIds])
    h.get().swapRosterPositions(h.get().teams[1].id, 0, 1)
    h.get().swapRosterPositions(h.get().playerTeamId!, 0.5, 1)
    h.set({ activeMatchId: "in-progress" })
    h.get().swapRosterPositions(h.get().playerTeamId!, 0, 1)
    expect(h.get().teams.map(t => t.rosterIds)).toEqual(initial)
})

test("expired offers explain failure and do not transfer money or ownership", () => {
    const h = harness()
    const playerId = h.get().teams[0].rosterIds[0]
    h.set(s => { s.players.find(p => p.id === playerId)!.forSale = true; s.eventsLog.push({ id: "old_offer", type: "TRANSFER_OFFER", week: 1,
        acknowledged: false, data: { playerId, teamId: s.teams[1].id, offerAmount: 10000, expiresWeek: s.currentWeek } }) })
    const before = h.get().teams.map(t => ({ budget: t.budget, roster: [...t.rosterIds] }))
    h.get().acceptTransferOffer("old_offer")
    expect(h.get().teams.map(t => ({ budget: t.budget, roster: t.rosterIds }))).toEqual(before)
    expect(h.get().eventsLog.find(e => e.id === "old_offer")!.selectedChoiceId).toBe("expired")
    expect(h.get().addToast).toHaveBeenCalled()
})

test("AI affordability includes existing wages and cannot be bypassed by an urgent vacancy", () => {
    const save = fixture()
    const team = save.teams[1]
    team.rosterIds.pop()
    save.contracts.push({ playerId: team.rosterIds[0], teamId: team.id, salaryPerWeek: 100000,
        startWeek: 0, endWeek: 104, buyout: 0 })
    const target = save.players.find(p => p.id === "qa_free_agent")!
    expect(recruitmentBudget(save, team)(recruitmentSalary(target, save.currentWeek))).toBe(false)
    signFreeAgent(team, save, true)
    expect(team.rosterIds).not.toContain(target.id)
})

test("AI sale cannot strip a five-player seller; valid trades conserve cash and ledger both sides", () => {
    const save = fixture()
    const seller = save.teams[1]
    const buyer = { ...save.teams[0], id: "ai_buyer", rosterIds: [] as string[], budget: 5000000 }
    save.teams.push(buyer)
    const target = save.players.find(p => p.id === seller.rosterIds[0])!
    target.forSale = true
    for (let seed = 1; seed < 100; seed++) processAIToAITransfers(save, save.playerTeamId, new SeededRNG(seed))
    expect(seller.rosterIds).toHaveLength(5)
    seller.rosterIds.push("qa_free_agent")
    const cash = save.teams.reduce((sum, t) => sum + t.budget, 0)
    for (let seed = 1; seed < 100 && !buyer.rosterIds.length; seed++) processAIToAITransfers(save, save.playerTeamId, new SeededRNG(seed))
    expect(buyer.rosterIds).toHaveLength(1)
    expect(save.teams.reduce((sum, t) => sum + t.budget, 0)).toBe(cash)
    const ledger = save.financeLedger.filter(e => e.id.startsWith("fin_ai_transfer"))
    expect(ledger).toHaveLength(2)
    expect(ledger[0].amount).toBe(ledger[1].amount)
    expect(seller.rosterIds).toHaveLength(5)
})

test("zero skill stays zero; OVR is the shared evaluation; sorting uses the visible estimate", () => {
    const player = { ...fixture().players[0], skill: 0 }
    const known = getVisibleStats(player, [], [player.id], 1)
    expect(known.skillRange).toBe(0)
    expect(known.ovrRange).toBe(evaluatePlayer(player, undefined, undefined, 1).overallRating)
    expect(scoutedRatingSortValue([30, 60])).toBe(45)
    expect(recruitmentRole("ENTRY")).toBe(recruitmentRole("ENTRY_FRAGGER"))
})
