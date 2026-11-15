/**
 * Audit 2026-11-15, pro career and the modes around it:
 *  - MODES-01: the club-running screens and store actions are closed to a pro.
 *  - MODES-02: the pro's chosen role does not demote the club's own specialist.
 *  - MODES-07 / START-27: the pro sees no board brief, board storyline or club decisions.
 *  - MODES-08: a pro who outgrows his deal gets a raise.
 *  - MODES-09: a club offer to the pro holds Continue and comes from that club.
 *  - MODES-10: the coach fields a role-balanced five.
 *  - MODES-14 / MODES-28: the Draft Cup and between-clubs menus.
 * Manager careers keep their behaviour (each block checks that side too).
 */
import { produce, enableMapSet } from "immer"
import type { GameEventSaveData, GameSave, PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import type { StoreState } from "@/store/types"
import { createAcademySlice } from "@/store/slices/academy-slice"
import { createTeamFacilitiesSlice } from "@/store/slices/team-facilities-slice"
import { createTransferContractSlice } from "@/store/slices/transfer-contract-slice"
import { createStaffManagementSlice } from "@/store/slices/staff-management-slice"
import { proStaffRunRefusal } from "@/store/utils/pro-guard"
import { reconcileTeamRoles } from "@/engine/role-reconciler"
import { coachLineup, handClubDecisionsToStaff, ovrOf, processProWeek, proWage, PRO_TUNING } from "@/engine/pro-career"
import { boardPressure } from "@/engine/storylines/arcs/board-pressure"
import { getDecisionKind, getEventSender, type InboxContext } from "@/components/inbox/inbox-model"
import { BETWEEN_CLUBS_HREFS, PRO_HIDDEN_HREFS, isProHiddenPath, menuGroupsFor, navHubs, navHubsFor } from "@/lib/navigation"
import { nextStop, type StopSource } from "@/lib/advance-stops"
import { PlayerRole } from "@/types/enums"

enableMapSet()

function makePlayer(id: string, over: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, name: id, age: 22, nationality: "Sweden", role: "RIFLER",
        rifle: 70, awp: 60, pistol: 65, grenades: 60, creativity: 60, clutch: 60, tactic: 60, leader: 55,
        teamwork: 65, reaction: 70, eyesight: 70, morale: 75, form: 70, fatigue: 0, energy: 100, maxEnergy: 100,
        level: 1, xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], majorWins: 0,
        matchesPlayed: 0, totalMVPs: 0, skill: 70, potential: 85, productivity: 60, endurance: 70,
        ...over,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, over: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: id, shortName: id.slice(0, 4).toUpperCase(), budget: 1_000_000, rosterIds: [], staffIds: [],
        trophies: [], facilities: [], sponsors: [], fanbase: 1000, reputation: 50, region: "EU", facilitiesLevel: 1,
        leagueTier: "B_TIER", recentForm: [], ...over,
    } as unknown as TeamSaveData
}

const PRO = "pro_save1"
const proCareer = { playerId: PRO, startWeek: 1, clubs: [{ teamId: "player", fromWeek: 1 }] }

function harness(pro: boolean) {
    let state = {
        teams: [makeTeam("player", { rosterIds: ["a", "b", "c", "d", "e", PRO] })],
        players: ["a", "b", "c", "d", "e"].map(id => makePlayer(id)).concat(makePlayer(PRO), makePlayer("fa")),
        contracts: [], scheduledMatches: [], completedMatches: [], financeLedger: [], transferHistory: [], newsFeed: [],
        eventsLog: [], scoutedPlayers: [], staff: [], marketStaff: [], currentWeek: 10, playerTeamId: "player",
        ...(pro ? { proCareer } : {}),
    } as unknown as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    const get = () => state
    return {
        read: () => state,
        academy: createAcademySlice(set as never, get as never),
        facilities: createTeamFacilitiesSlice(set as never, get as never),
        transfers: createTransferContractSlice(set as never, get as never),
        staff: createStaffManagementSlice(set as never, get as never),
    }
}

const newContract = { salaryPerWeek: 800, startWeek: 10, endWeek: 62, buyout: 20_000 }

describe("MODES-01: the pro cannot run the club", () => {
    test("academy, facilities, signings, releases and staff are refused in a pro career and change nothing", () => {
        const h = harness(true)
        const refusal = proStaffRunRefusal()
        const before = h.read()
        expect(h.academy.buildAcademy("player")).toEqual(refusal)
        expect(h.facilities.upgradeFacility("player", "TRAINING")).toEqual(refusal)
        expect(h.transfers.transferPlayer("fa", "FA", "player", 0, newContract)).toEqual(refusal)
        expect(h.transfers.releasePlayer("a")).toEqual(refusal)
        expect(h.staff.hireStaff("s1").success).toBe(false)
        expect(h.staff.requestStaffMarketRefresh()).toEqual({ ...refusal, cost: 0 })
        expect(() => h.staff.fireStaff("s1")).toThrow(refusal.message)
        h.transfers.listPlayerForTransfer("a", 1000)
        expect(h.read()).toBe(before)
        expect(refusal.message).toBe("In a pro career the staff run the club.")
    })

    test("a manager career can still do all of it", () => {
        const h = harness(false)
        expect(h.academy.buildAcademy("player").success).toBe(true)
        expect(h.facilities.upgradeFacility("player", "TRAINING").success).toBe(true)
        expect(h.transfers.transferPlayer("fa", "FA", "player", 0, newContract).success).toBe(true)
        expect(h.read().teams[0].rosterIds).toContain("fa")
    })

    test("a transfer between two other clubs is not the pro's business and still runs", () => {
        const h = harness(true)
        expect(h.transfers.transferPlayer("fa", "FA", "other", 0, newContract)).not.toEqual(proStaffRunRefusal())
    })

    test("every hidden screen is closed by URL too, sub-pages and the old /equipment included", () => {
        for (const href of PRO_HIDDEN_HREFS) {
            expect(isProHiddenPath(href)).toBe(true)
            expect(isProHiddenPath(`${href}/x`)).toBe(true)
        }
        expect(isProHiddenPath("/equipment")).toBe(true)
        for (const open of ["/", "/squad", "/training", "/career", "/match/m1/tactics", "/stats", "/staffing"]) expect(isProHiddenPath(open)).toBe(false)
    })
})

describe("MODES-14 / MODES-28: menus follow what the mode can open", () => {
    test("a Draft Cup run drops the screens it blocks, and the Recruitment hub with them", () => {
        const hrefs = navHubsFor(false, true).flatMap(h => h.items.map(i => i.href))
        for (const blocked of ["/transfers", "/scouting", "/finances", "/sponsorships", "/basecamp", "/staff", "/academy"]) expect(hrefs).not.toContain(blocked)
        expect(hrefs).toEqual(expect.arrayContaining(["/squad", "/training", "/match", "/league"]))
        expect(navHubsFor(false, true).some(h => h.id === "recruitment")).toBe(false)
    })

    test("between clubs only the screens that still open are listed", () => {
        const hrefs = menuGroupsFor(false, false, true).flatMap(g => g.items.map(i => i.href))
        expect(new Set(hrefs)).toEqual(new Set(BETWEEN_CLUBS_HREFS))
    })

    test("a manager with a club sees every hub", () => {
        expect(navHubsFor(false)).toBe(navHubs)
        expect(navHubsFor(false, false, false)).toBe(navHubs)
    })
})

describe("MODES-02: the pro's role and the club's specialist", () => {
    test("a bench pro who picked AWPer leaves the club's AWPer his role", () => {
        const awper = makePlayer("awp", { role: PlayerRole.AWPER, awp: 90, skill: 70, rifle: 70 })
        const pro = makePlayer(PRO, { role: PlayerRole.AWPER, roleLocked: true, awp: 60 })
        reconcileTeamRoles([awper, makePlayer("b"), makePlayer("c"), makePlayer("d"), makePlayer("e"), pro])
        expect(awper.role).toBe(PlayerRole.AWPER)
        expect(pro.role).toBe(PlayerRole.AWPER)
    })

    test("with no AWPer at the club the pro holds the slot, and a team-mate is not made one", () => {
        const other = makePlayer("x", { awp: 80, skill: 60, rifle: 60 })
        const pro = makePlayer(PRO, { role: PlayerRole.AWPER, roleLocked: true, awp: 60 })
        reconcileTeamRoles([other, pro])
        expect(pro.role).toBe(PlayerRole.AWPER)
        expect(other.role).toBe(PlayerRole.RIFLER)
    })

    test("manager career unchanged: a player signed for a role still takes its slot", () => {
        const awper = makePlayer("awp", { role: PlayerRole.AWPER, awp: 90, skill: 70, rifle: 70 })
        const signed = makePlayer("new", { role: PlayerRole.AWPER, roleLocked: true, awp: 60 })
        reconcileTeamRoles([awper, signed])
        expect(signed.role).toBe(PlayerRole.AWPER)
        expect(awper.role).toBe(PlayerRole.RIFLER)
    })
})

function proSave(roster: PlayerSaveData[], over: Partial<GameSave> = {}): GameSave {
    return {
        saveId: "save1", currentWeek: 20, playerTeamId: "player",
        teams: [makeTeam("player", { rosterIds: roster.map(p => p.id) })],
        players: roster, contracts: [], eventsLog: [],
        proCareer: { ...proCareer, lastOfferWeek: 20 },
        ...over,
    } as unknown as GameSave
}

describe("MODES-10: the coach's five", () => {
    test("the club's only IGL starts over a slightly better rifler", () => {
        const riflers = ["r1", "r2", "r3", "r4", "r5"].map((id, i) => makePlayer(id, { skill: 72 - i, rifle: 72 - i }))
        const igl = makePlayer("igl", { role: PlayerRole.IGL, skill: 66, rifle: 66, leader: 85, tactic: 85 })
        const save = proSave([...riflers, igl])
        coachLineup(save, save.teams[0])
        const five = save.teams[0].rosterIds.slice(0, 5)
        expect(five).toContain("igl")
        // Starters and bench are each ordered best first.
        const ovr = (id: string) => ovrOf(save.players.find(p => p.id === id)!, save.currentWeek)
        expect(five.map(ovr)).toEqual([...five.map(ovr)].sort((a, b) => b - a))
    })

    test("an injured player is not picked", () => {
        const roster = ["a", "b", "c", "d", "e", "f"].map((id, i) => makePlayer(id, { skill: 80 - i }))
        roster[0].injury = { name: "Wrist", weeksRemaining: 2 } as never
        const save = proSave(roster)
        coachLineup(save, save.teams[0])
        expect(save.teams[0].rosterIds.slice(0, 5)).not.toContain("a")
    })
})

describe("MODES-08: a raise when the pro outgrows his deal", () => {
    test("paid well under his rating's wage, he is raised; close to it, nothing changes", () => {
        const pro = makePlayer(PRO, { skill: 85, rifle: 85, reaction: 85 })
        const save = proSave([pro, ...["a", "b", "c", "d"].map(id => makePlayer(id))])
        const wage = proWage(ovrOf(pro, save.currentWeek))
        save.contracts = [{ playerId: PRO, teamId: "player", salaryPerWeek: 150, startWeek: 1, endWeek: 105, buyout: 0 }] as never
        processProWeek(save)
        expect(save.contracts[0].salaryPerWeek).toBe(wage)

        const close = Math.ceil(wage / PRO_TUNING.RAISE_WHEN_BEHIND) + 1
        save.contracts[0].salaryPerWeek = close
        processProWeek(save)
        expect(save.contracts[0].salaryPerWeek).toBe(close)
    })
})

const ctx = (over: Partial<InboxContext> = {}): InboxContext => ({
    currentWeek: 20, playerTeamId: "player", rosterIds: new Set(["a", PRO]), playerName: id => id, ...over,
})
const ev = (id: string, over: Partial<GameEventSaveData> = {}): GameEventSaveData =>
    ({ id, type: "INFO", week: 20, acknowledged: false, data: {}, ...over }) as GameEventSaveData
const choices = [{ id: "x", text: "X", effects: {} }] as unknown as GameEventSaveData["choices"]

describe("MODES-07 / MODES-09: the pro's inbox", () => {
    test("club decisions and bids are the staff's; the pro's own stay his", () => {
        const pro = ctx({ proPlayerId: PRO })
        const press = ev("press_m1", { type: "PRESS" as never, choices })
        const fans = ev("fan_meet_20", { type: "FAN" as never, choices })
        const bid = ev("bid", { type: "TRANSFER_OFFER" as never, data: { playerId: "a", teamId: "ai", expiresWeek: 22 } })
        const offer = ev("pro_offer_big_20", { type: "CAREER_UPDATE" as never, data: { playerId: PRO, offeringTeamId: "big", offeringTeamName: "Big Club" }, choices })
        const knock = ev("knock_x", { type: "INJURY" as never, data: { playerId: PRO }, choices })
        expect(getDecisionKind(press, pro)).toBeNull()
        expect(getDecisionKind(fans, pro)).toBeNull()
        expect(getDecisionKind(bid, pro)).toBeNull()
        expect(getDecisionKind(offer, pro)).toBe("choice")
        expect(getDecisionKind(knock, pro)).toBe("choice")
        // A manager answers all of them.
        expect(getDecisionKind(press, ctx())).toBe("choice")
        expect(getDecisionKind(bid, ctx())).toBe("transfer_offer")
        // The offer is from the club that makes it.
        expect(getEventSender(offer, pro)).toBe("Big Club")
        expect(getEventSender(ev("pro_start_x", { type: "CAREER_UPDATE" as never }), pro)).toBe("Club board")
    })

    test("the staff let a bid for the pro lapse instead of leaving it open", () => {
        const save = proSave([makePlayer(PRO)], {
            eventsLog: [ev("bid_pro", { type: "TRANSFER_OFFER" as never, data: { playerId: PRO, teamId: "ai", expiresWeek: 23 } })],
        })
        expect(handClubDecisionsToStaff(save)).toBe(1)
        expect(save.eventsLog[0].data.expiresWeek).toBe(20)
    })

    test("no board-pressure storyline in a pro career", () => {
        const base = {
            week: 40, managed: makeTeam("player"),
            save: { boardState: { teamId: "player", confidence: 10 }, managerDetails: { tenureStartWeek: 1 }, currentWeek: 40 },
        }
        const manager = boardPressure.detect(base as never)
        expect(manager.length).toBeGreaterThan(0)
        expect(boardPressure.detect({ ...base, save: { ...base.save, proCareer } } as never)).toEqual([])
    })

    test("a club offer holds Continue until it is answered, even after it stopped once", () => {
        const offer = ev("pro_offer_big_20", { type: "CAREER_UPDATE" as never, data: { playerId: PRO, deadlineWeek: 22, continueStopped: true }, choices })
        const state = {
            currentWeek: 20, currentDay: 1, timeMode: "HYBRID_DAILY", playerTeamId: "player",
            teams: [makeTeam("player")], players: [], contracts: [], scheduledMatches: [], completedMatches: [], eventsLog: [offer],
        } as unknown as StopSource
        const stop = nextStop(state, new Set([`event:${offer.id}`]))
        expect(stop?.key).toBe(`event:${offer.id}`)
        // Any other decision stops once only.
        const other = { ...offer, id: "fan_meet_20" }
        expect(nextStop({ ...state, eventsLog: [other] }, new Set([`event:${other.id}`]))).toBeNull()
        // Answered: no stop.
        expect(nextStop({ ...state, eventsLog: [{ ...offer, selectedChoiceId: "stay" }] }, new Set())).toBeNull()
    })
})
