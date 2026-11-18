/**
 * The qualification path (COMP-02/08/16): Open -> Closed -> Main, RMR ->
 * Major. Calendar feasibility, ranked invites, who may enter a qualifier and
 * how an event's field is built when it starts.
 */
import { FULL_TOURNAMENT_CALENDAR, getTournamentById, type TournamentDefinition } from "@/data/tournament-calendar"
import { QualificationEngine } from "@/engine/tournament-qualification"
import { TournamentManager } from "@/engine/tournament-manager"
import { buildEventField } from "@/engine/tournament/event-field"
import {
    feederEvents, feederSlots, hasRankedInvites, inviteLeadWeeks, qualifierEntryBlock, rankedInvitees, regionAllows, withdrawFromQualifiers,
} from "@/engine/tournament/qualification-path"
import { updateStandings } from "@/engine/processors/standings-processor"
import { runMigrationLadder } from "@/engine/save-migrations"
import { instanceName } from "@/lib/tournament-instances"
import { SeededRNG } from "@/engine/rng"
import { tournamentFixture } from "@/scripts/launch/l19-tournament-audit"
import { createLaunchFixture } from "../scripts/launch/fixtures"
import type { BracketMatchSaveData, CompletedMatchSaveData, GameSave, QualificationStatus } from "@/engine/save-types"

const def = (id: string) => getTournamentById(id) as TournamentDefinition
const REGIONS = ["EU", "NA", "ASIA", "CIS", "BR"]

/** A world of `n` clubs ranked 1..n, regions in turn, with the managed club last. */
function world(n = 60): GameSave {
    const teams = Array.from({ length: n }, (_, i) => ({
        id: `c${String(i + 1).padStart(2, "0")}`, name: `Club ${i + 1}`, worldRanking: i + 1, region: REGIONS[i % REGIONS.length], rosterIds: [], trophies: [],
    }))
    return {
        teams, players: [], tournaments: [], tournamentQualifications: [], scheduledMatches: [], completedMatches: [],
        playerTeamId: "c60", currentWeek: 1, gameStartDate: "2026-11-15T00:00:00.000Z",
    } as unknown as GameSave
}
const row = (tournamentId: string, teamId: string, status: QualificationStatus["status"], qualifiedVia: string): QualificationStatus =>
    ({ tournamentId, teamId, status, qualifiedVia } as QualificationStatus)

/** Weeks a qualifier needs at one round a week. */
function weeksNeeded(d: TournamentDefinition): number {
    if (d.format === "swiss") return 5 // five Swiss rounds; an RMR has no playoff (COMP-03)
    return Math.ceil(Math.log2(d.slots))
}

describe("calendar: the qualifier path fits", () => {
    const qualifiers = FULL_TOURNAMENT_CALENDAR.filter(d => d.qualifierFor)

    test.each(qualifiers.map(d => [d.id]))("%s is played inside its weeks and before the event it feeds", id => {
        const q = def(id), target = def(q.qualifierFor!)
        expect(weeksNeeded(q)).toBeLessThanOrEqual(q.duration)
        expect(q.startWeek + weeksNeeded(q) - 1).toBeLessThan(target.startWeek)
        // A Swiss qualifier hands out no more places than its 16-club Swiss stage has 3-win clubs.
        if (q.format === "swiss") expect(q.qualifierSlots ?? 0).toBeLessThanOrEqual(8)
    })

    test("events with invites and qualifiers: invites + qualifier places = slots", () => {
        const fed = FULL_TOURNAMENT_CALENDAR.filter(d => hasRankedInvites(d) && feederSlots(d.id) > 0)
        expect(fed.map(d => d.id)).toEqual(expect.arrayContaining(["iem_katowice", "major_copenhagen", "major_shanghai", "iem_cologne", "thunderpick_wc"]))
        for (const d of fed) expect([d.id, (d.inviteSlots ?? 0) + feederSlots(d.id)]).toEqual([d.id, d.slots])
        // The Majors: 8 invites, 16 through the RMRs.
        expect(feederSlots("major_copenhagen")).toBe(16)
        expect(def("major_copenhagen").inviteSlots).toBe(8)
    })

    test("invites go out before the first qualifier of the path starts", () => {
        expect(def("iem_katowice").startWeek - inviteLeadWeeks(def("iem_katowice"))).toBeLessThanOrEqual(def("iem_katowice_open").startWeek)
        expect(def("major_copenhagen").startWeek - inviteLeadWeeks(def("major_copenhagen"))).toBeLessThanOrEqual(def("copenhagen_rmr_eu").startWeek)
        expect(feederEvents("iem_katowice").map(d => d.id).sort()).toEqual(["iem_katowice_closed_eu", "iem_katowice_open"])
    })

    test("stored names carry the year the event is played in, or the season", () => {
        expect(instanceName(def("iem_katowice"), 1, "2026-11-15T00:00:00.000Z")).toBe("Winter Open Katova 2027")
        expect(instanceName(def("iem_katowice"), 2, "2026-11-15T00:00:00.000Z")).toBe("Winter Open Katova 2028")
        expect(instanceName({ name: "Some League", startWeek: 3, duration: 4 }, 2, null)).toBe("Some League S2")
    })
})

describe("ranked invites (COMP-02/16)", () => {
    test("a Major invites the top 8 and never more, however often it runs as the ranking moves", () => {
        const major = def("major_copenhagen")
        const save = world()
        const ranked = () => save.teams.map(t => ({ id: t.id, worldRanking: t.worldRanking! }))
        save.tournamentQualifications = QualificationEngine.generateAutoInvites([], major, ranked(), 5, 1)
        // The ranking moves: 9th and 10th climb into the top 8.
        save.teams[8].worldRanking = 1; save.teams[9].worldRanking = 2
        save.tournamentQualifications = QualificationEngine.generateAutoInvites(save.tournamentQualifications, major, ranked(), 6, 1)
        const invites = save.tournamentQualifications.filter(q => q.qualifiedVia === "Direct Invite" && q.status === "QUALIFIED")
        expect(invites).toHaveLength(8)
        expect(invites.map(q => q.teamId).sort()).toEqual(["c01", "c02", "c03", "c04", "c05", "c06", "c07", "c08"])
    })

    test("a club that signed up is upgraded to the invite; a qualifier place is kept", () => {
        const kato = def("iem_katowice")
        const rows = [row("iem_katowice_s1", "c01", "REGISTERED", "Registered"), row("iem_katowice_s1", "c02", "QUALIFIED", "Via Kato Closed")]
        const out = QualificationEngine.generateAutoInvites(rows, kato, world().teams.map(t => ({ id: t.id, worldRanking: t.worldRanking! })), 5, 1)
        expect(out.find(q => q.teamId === "c01")).toMatchObject({ status: "QUALIFIED", qualifiedVia: "Direct Invite" })
        expect(out.find(q => q.teamId === "c02")?.qualifiedVia).toBe("Via Kato Closed")
        expect(out.filter(q => q.qualifiedVia === "Direct Invite")).toHaveLength(kato.inviteSlots!)
    })

    test("the invited managed club cannot register; a club that is not invited is told the invite is required", () => {
        const kato = { ...def("iem_katowice"), id: "iem_katowice_s1" }
        const team = { id: "c05", region: "EU", rosterIds: ["p1", "p2", "p3", "p4", "p5"] } as never
        const notInvited = QualificationEngine.checkEligibility(kato, team, 5, [], [])
        expect(notInvited.canRegister).toBe(false)
        const invited = QualificationEngine.checkEligibility(kato, team, 5, [], [row("iem_katowice_s1", "c05", "QUALIFIED", "Direct Invite")])
        expect(invited.eligible).toBe(true)
    })
})

describe("who may play a qualifier (COMP-02/08)", () => {
    test("projected invitees, clubs in the main event and clubs in a sibling qualifier are kept out", () => {
        const save = world()
        const open = def("iem_katowice_open"), closed = def("iem_katowice_closed_eu")
        // Before the invites go out the world's top 12 are projected invitees.
        expect(rankedInvitees(def("iem_katowice"), save.teams)).toHaveLength(12)
        expect(qualifierEntryBlock(save, "c01", open, 1)).toBe("invited")
        expect(qualifierEntryBlock(save, "c20", open, 1)).toBeNull()
        save.tournamentQualifications = [row("iem_katowice_s1", "c20", "QUALIFIED", "Direct Invite")]
        expect(qualifierEntryBlock(save, "c20", closed, 1)).toBe("in_main")
        const rmrEu = def("copenhagen_rmr_eu"), rmrNa = def("copenhagen_rmr_na")
        save.tournamentQualifications = [row("copenhagen_rmr_na_s1", "c30", "REGISTERED", "Registered")]
        expect(qualifierEntryBlock(save, "c30", rmrEu, 1)).toBe("sibling")
        expect(qualifierEntryBlock(save, "c30", rmrNa, 1)).toBeNull()
    })

    test("regional qualifiers take their region's clubs (CIS plays the EU RMR, Brazil the Americas RMR)", () => {
        expect(regionAllows(def("copenhagen_rmr_eu"), { region: "CIS" })).toBe(true)
        expect(regionAllows(def("copenhagen_rmr_eu"), { region: "NA" })).toBe(false)
        expect(regionAllows(def("copenhagen_rmr_na"), { region: "BR" })).toBe(true)
        expect(regionAllows(def("iem_katowice_open"), { region: "ASIA" })).toBe(true)
    })

    test("a newly invited club leaves the qualifiers it signed up for", () => {
        const save = world()
        save.tournamentQualifications = [row("iem_katowice_open_s1", "c03", "REGISTERED", "Registered"), row("iem_katowice_open_s1", "c40", "REGISTERED", "Registered")]
        withdrawFromQualifiers(save, def("iem_katowice"), 1, ["c03"])
        expect(save.tournamentQualifications.map(q => q.teamId)).toEqual(["c40"])
    })
})

describe("the field when an event starts", () => {
    test("Major: 8 invites + 16 RMR qualifiers, even when stronger clubs signed up", () => {
        const save = world()
        const major = def("major_copenhagen")
        const rows: QualificationStatus[] = []
        for (let i = 1; i <= 8; i++) rows.push(row("major_copenhagen_s1", `c${String(i).padStart(2, "0")}`, "QUALIFIED", "Direct Invite"))
        for (let i = 41; i <= 56; i++) rows.push(row("major_copenhagen_s1", `c${i}`, "QUALIFIED", i <= 48 ? "Via EU RMR" : "Via Americas RMR"))
        // Clubs ranked 9-20 registered themselves (an old save): they don't take RMR places.
        for (let i = 9; i <= 20; i++) rows.push(row("major_copenhagen_s1", `c${String(i).padStart(2, "0")}`, "REGISTERED", "Registered"))
        save.tournamentQualifications = rows
        const field = buildEventField(save, major, "major_copenhagen_s1", 1, save.playerTeamId)
        expect(field).toHaveLength(24)
        for (let i = 41; i <= 56; i++) expect(field).toContain(`c${i}`)
        for (let i = 1; i <= 8; i++) expect(field).toContain(`c0${i}`)
        // The registrations that did not make it are withdrawn.
        expect(save.tournamentQualifications.some(q => q.status === "REGISTERED" && q.tournamentId === "major_copenhagen_s1")).toBe(false)
    })

    test("the managed club's registration beats a computer club's, never a qualifier winner's", () => {
        const save = world()
        const kato = def("iem_katowice") // 16 = 12 invites + 4 via the closed qualifier
        const rows: QualificationStatus[] = []
        for (let i = 1; i <= 12; i++) rows.push(row("iem_katowice_s1", `c${String(i).padStart(2, "0")}`, "QUALIFIED", "Direct Invite"))
        for (let i = 30; i <= 33; i++) rows.push(row("iem_katowice_s1", `c${i}`, "QUALIFIED", "Via Kato Closed"))
        rows.push(row("iem_katowice_s1", "c60", "REGISTERED", "Registered"))
        save.tournamentQualifications = rows
        const field = buildEventField(save, kato, "iem_katowice_s1", 1, "c60")
        expect(field).toHaveLength(16)
        expect(field).toEqual(expect.arrayContaining(["c30", "c31", "c32", "c33", "c60"]))
    })

    test("a closed qualifier is filled with clubs of its region that are not invited to the main event", () => {
        const save = world()
        const closed = def("iem_katowice_closed_eu")
        save.tournamentQualifications = [row("iem_katowice_closed_eu_s1", "c41", "QUALIFIED", "Via Kato Open"), row("iem_katowice_closed_eu_s1", "c42", "QUALIFIED", "Via Kato Open")]
        for (let i = 1; i <= 12; i++) save.tournamentQualifications.push(row("iem_katowice_s1", `c${String(i).padStart(2, "0")}`, "QUALIFIED", "Direct Invite"))
        const field = buildEventField(save, closed, "iem_katowice_closed_eu_s1", 1, "c60")
        expect(field).toHaveLength(8)
        expect(field).toEqual(expect.arrayContaining(["c41", "c42"]))
        const invited = new Set(save.tournamentQualifications.filter(q => q.qualifiedVia === "Direct Invite").map(q => q.teamId))
        const teamById = new Map(save.teams.map(t => [t.id, t]))
        for (const id of field.filter(id => id !== "c41" && id !== "c42")) {
            expect(invited.has(id)).toBe(false)
            expect(["EU", "CIS"]).toContain(teamById.get(id)!.region)
        }
    })

    test("a qualifier that finished during the week before is settled first, so its winners are in (COMP-16)", () => {
        const save = tournamentFixture("bracket", 8, 7)
        const rmr = save.tournaments[0]
        rmr.id = "copenhagen_rmr_asia_s1"; rmr.tier = "QUALIFIER"
        TournamentManager.initializeTournament(save, rmr.id, rmr.teamIds, new SeededRNG(16))
        for (let round = 0; round < 6 && !rmr.isCompleted; round++) {
            for (const scheduled of [...save.scheduledMatches]) {
                const m = rmr.playoffBracket!.find(b => b.id === scheduled.id) as BracketMatchSaveData
                const winner = m.homeTeamId!, loser = m.awayTeamId!
                save.completedMatches.push({ ...m, homeTeamId: winner, awayTeamId: loser, result: { winnerId: winner, homeScore: 2, awayScore: 0, maps: [] } } as unknown as CompletedMatchSaveData)
                save.scheduledMatches = save.scheduledMatches.filter(x => x.id !== m.id)
                TournamentManager.processMatchResult(save, m.id, winner, loser)
            }
            TournamentManager.repairTournamentProgression(save, rmr.id)
        }
        expect(rmr.isCompleted).toBe(true)
        expect(rmr.rewardsGranted).toBeFalsy() // the standings step has not run yet
        const top2 = TournamentManager.calculatePlacements(save, rmr).filter(p => p.position <= 2).map(p => p.teamId)
        // 30 stronger clubs that would take every open place if the RMR places were not handed out.
        for (const t of save.teams) t.worldRanking = (t.worldRanking ?? 0) + 100
        for (let i = 1; i <= 30; i++) save.teams.push({ ...save.teams[0], id: `strong_${i}`, name: `Strong ${i}`, worldRanking: i })
        const field = buildEventField(save, def("major_copenhagen"), "major_copenhagen_s1", 1, save.playerTeamId)
        expect(field).toEqual(expect.arrayContaining(top2))
    })
})

describe("a qualifier is not a title (COMP-12)", () => {
    test("winning a qualifier pays its prize and hands out the place, but no trophy", () => {
        const save = tournamentFixture("bracket", 8)
        const q = save.tournaments[0]
        q.id = "iem_katowice_closed_eu_s1"; q.tier = "QUALIFIER"; q.name = "Winter Open Katova EU Closed Qualifier"
        TournamentManager.initializeTournament(save, q.id, q.teamIds, new SeededRNG(12))
        for (let round = 0; round < 6 && !q.isCompleted; round++) {
            for (const scheduled of [...save.scheduledMatches]) {
                const m = q.playoffBracket!.find(b => b.id === scheduled.id) as BracketMatchSaveData
                save.completedMatches.push({ ...m, result: { winnerId: m.homeTeamId, homeScore: 2, awayScore: 0, maps: [] } } as unknown as CompletedMatchSaveData)
                save.scheduledMatches = save.scheduledMatches.filter(x => x.id !== m.id)
                TournamentManager.processMatchResult(save, m.id, m.homeTeamId!, m.awayTeamId!)
            }
            TournamentManager.repairTournamentProgression(save, q.id)
        }
        updateStandings(save)
        expect(q.rewardsGranted).toBe(true)
        expect(save.teams.flatMap(t => t.trophies ?? [])).toHaveLength(0)
        expect(save.financeLedger.some(e => e.category === "PRIZE" && e.teamId === q.winnerId)).toBe(true)
        expect(save.tournamentQualifications.filter(r => r.tournamentId === "iem_katowice_s1" && r.qualifiedVia?.startsWith("Via"))).toHaveLength(4)
    })

    test("loading a save drops qualifier trophies from older builds", () => {
        const save = createLaunchFixture("first-week", 1201)
        save.teams[0].trophies = [
            { tournamentId: "iem_katowice_open_s1", tournamentName: "Kato Open", week: 5, tier: "QUALIFIER" },
            { tournamentId: "iem_katowice_s1", tournamentName: "Winter Open Katova 2027", week: 12, tier: "S_TIER" },
        ] as never
        const loaded = runMigrationLadder(JSON.parse(JSON.stringify(save)))
        expect(loaded.teams[0].trophies.map(t => t.tournamentId)).toEqual(["iem_katowice_s1"])
    })
})
