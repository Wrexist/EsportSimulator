/**
 * Headless season (COMP-02/08/16): the real week processor over a fresh
 * career world, the way the store runs a week on the daily calendar
 * (automatic entry, computer registrations, the week tick, then every
 * fixture of the week on its day). Runs a whole season and into the next.
 *
 * The day cursor moves as in the store (audit 2026-11-17, COMP-01): the tick
 * runs with last week's Sunday still on the cursor (advanceToWeekEnd sets 6
 * before advanceWeek), then advanceDay sets `currentDay` to each day before
 * that day's fixtures are played. A test whose cursor never moved let late
 * rounds take days that had already passed, which hid qualifiers overrunning
 * into their main event's week.
 *
 * Slow (about three minutes): one world is simulated once and every test
 * reads it.
 */
import path from "node:path"
import { enableMapSet } from "immer"
import { computeWeek } from "@/engine/worker/compute-week"
import { SnapshotLoader } from "@/data/snapshot-loader"
import { AIManager } from "@/engine/ai-manager"
import { TrainingFocus } from "@/types"
import { applyAutoRegistration } from "@/engine/processors/auto-registration-processor"
import { TournamentManager } from "@/engine/tournament-manager"
import { SeededRNG } from "@/engine/rng"
import { FULL_TOURNAMENT_CALENDAR, getTournamentById } from "@/data/tournament-calendar"
import { playAutoMatch } from "@/engine/processors/auto-match"
import { feederEvents, hasRankedInvites } from "@/engine/tournament/qualification-path"
import { isMajorTournament } from "@/engine/official-stats"
import { swissOrder } from "@/engine/tournament/swiss-handlers"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

enableMapSet()
jest.setTimeout(20 * 60 * 1000)

const WEEKS = 58 // season 1, then season 2's Kato Open
let save: GameSave
/** World ranking of every club on the week each event started. */
const ranksAtStart = new Map<string, Map<string, number>>()
/** World ranking of each invited club on the week its invite appeared ("event|club"). */
const rankWhenInvited = new Map<string, number>()
/** World ranking of every club on the week an event's first invites went out. */
const ranksAtInvite = new Map<string, Map<string, number>>()
/** Circuit points of every club when each event's field was built. */
const pointsAtStart = new Map<string, Map<string, number>>()

beforeAll(async () => {
    // Some engine paths still draw from Math.random: seed it so every run
    // simulates the same world.
    let mathSeed = Number(process.env.COMP_SIM_SEED ?? 1) >>> 0
    jest.spyOn(Math, "random").mockImplementation(() => {
        mathSeed = (Math.imul(mathSeed, 1664525) + 1013904223) >>> 0
        return mathSeed / 4294967296
    })
    const loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
    const loaded = await loader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const snap = loader.getSnapshot()!
    // Manage the world #5 club: good enough for the Majors, not invited everywhere.
    const club = [...snap.teams].sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999))[4]
    save = loader.createCareerFromSnapshot("comp-season", club.id, 1)! as GameSave
    AIManager.initializeTeamData(save)
    save.lastRngSeed = 4242
    let n = 0
    const nextId = (_s: unknown, prefix: string, ...parts: unknown[]) => `${prefix}_${parts.join("_")}_${n++}`
    for (let i = 0; i < WEEKS; i++) {
        const rng = new SeededRNG(save.lastRngSeed)
        applyAutoRegistration(save, { playerTeamId: save.playerTeamId!, nextId: nextId as never })
        TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, rng)
        // The ranking the tick's invites are sent by (it is updated later in the tick).
        const ranksBefore = new Map(save.teams.map(c => [c.id, c.worldRanking ?? 999]))
        const pointsBefore = new Map((save.circuitPoints ?? []).map(c => [c.teamId, c.points]))
        // The store runs the tick from last week's Sunday (advanceToWeekEnd).
        if (i > 0) save.currentDay = 6
        const before = new Set(save.tournaments.filter(t => t.teamIds.length && t.currentStage !== "Registration").map(t => t.id))
        const r = await computeWeek(save, { playerTeamId: save.playerTeamId!, trainingFocus: new Map([[save.playerTeamId!, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, rng.getState())
        if (!r.result.success) throw Error(r.result.error)
        save = { ...r.save, lastRngSeed: r.rngState } as GameSave
        delete (save as Partial<GameSave>).gameOverReason
        for (const q of save.tournamentQualifications) {
            const key = `${q.tournamentId}|${q.teamId}`
            if (q.qualifiedVia === "Direct Invite" && !rankWhenInvited.has(key)) rankWhenInvited.set(key, ranksBefore.get(q.teamId) ?? 999)
            if (q.qualifiedVia === "Direct Invite" && !ranksAtInvite.has(q.tournamentId)) ranksAtInvite.set(q.tournamentId, ranksBefore)
        }
        for (const t of save.tournaments) {
            if (!before.has(t.id) && t.teamIds.length && !ranksAtStart.has(t.id)) ranksAtStart.set(t.id, new Map(save.teams.map(c => [c.id, c.worldRanking ?? 999])))
            if (!before.has(t.id) && t.teamIds.length && !pointsAtStart.has(t.id)) pointsAtStart.set(t.id, pointsBefore)
        }
        // The week's days: every due fixture on its day (store timedDaySim), the managed club's too.
        const prng = new SeededRNG(save.lastRngSeed)
        for (let day = 0; day <= 6; day++) {
            // advanceDay moves the cursor before the day's fixtures are played.
            save.currentDay = day
            for (let pass = 0; pass < 8; pass++) {
                const removed = new Set<string>()
                const due = save.scheduledMatches.filter(m => m.week <= save.currentWeek && (m.day ?? 6) <= day)
                    .sort((a, b) => ((a.day ?? 6) - (b.day ?? 6)) || a.id.localeCompare(b.id))
                for (const m of due) {
                    const home = save.teams.find(t => t.id === m.homeTeamId), away = save.teams.find(t => t.id === m.awayTeamId)
                    if (home && away) playAutoMatch(save, m, home, away, { rng: prng, playerTeamId: save.playerTeamId!, removedMatchIds: removed })
                }
                if (!removed.size) break
                save.scheduledMatches = save.scheduledMatches.filter(m => !removed.has(m.id))
            }
        }
        save.lastRngSeed = prng.getState()
    }
})

const instance = (id: string) => save.tournaments.find(t => t.id === id) as TournamentSaveData
const s1 = (seriesId: string) => instance(`${seriesId}_s1`)
/** Last week a match of this instance was played. */
const lastMatchWeek = (id: string) => Math.max(0, ...save.completedMatches.filter(m => m.tournamentId === id).map(m => m.week),
    ...(instance(id)?.playoffBracket ?? []).filter(m => m.isCompleted && m.week).map(m => m.week!))
const viaRows = (mainId: string) => save.tournamentQualifications.filter(q => q.tournamentId === mainId && q.qualifiedVia?.startsWith("Via "))

const mainEvents = () => FULL_TOURNAMENT_CALENDAR.filter(d => d.tier !== "QUALIFIER" && d.format !== "league" && d.startWeek <= 52)
const fedEvents = () => FULL_TOURNAMENT_CALENDAR.filter(d => feederEvents(d.id).length > 0)

describe("a headless season of the qualification path", () => {
    test("every season-1 event was created and finished", () => {
        for (const d of FULL_TOURNAMENT_CALENDAR) {
            const t = s1(d.id)
            expect([d.id, !!t]).toEqual([d.id, true])
            expect([d.id, t.isCompleted]).toEqual([d.id, true])
        }
    })

    test("every main event has exactly its slot count", () => {
        for (const d of mainEvents()) expect([d.id, s1(d.id).teamIds.length]).toEqual([d.id, d.slots])
        // Qualifiers are full too.
        for (const d of FULL_TOURNAMENT_CALENDAR.filter(x => x.qualifierFor)) expect([d.id, s1(d.id).teamIds.length]).toEqual([d.id, d.slots])
    })

    test("qualifier winners actually enter the main event", () => {
        for (const d of fedEvents()) {
            const main = s1(d.id)
            const places = FULL_TOURNAMENT_CALENDAR.filter(f => f.qualifierFor === d.id).reduce((n, f) => n + (f.qualifierSlots ?? 0), 0)
            const rows = viaRows(main.id)
            expect([d.id, rows.length]).toEqual([d.id, places])
            for (const q of rows) expect([d.id, q.teamId, main.teamIds.includes(q.teamId)]).toEqual([d.id, q.teamId, true])
        }
    })

    test("no club is both invited to an event and in that event's qualifiers", () => {
        for (const d of fedEvents()) {
            const invited = save.tournamentQualifications.filter(q => q.tournamentId === `${d.id}_s1` && q.qualifiedVia === "Direct Invite").map(q => q.teamId)
            for (const f of feederEvents(d.id)) {
                const both = invited.filter(id => s1(f.id).teamIds.includes(id))
                expect([d.id, f.id, both]).toEqual([d.id, f.id, []])
            }
        }
    })

    test("qualifiers finish before their main event starts", () => {
        for (const f of FULL_TOURNAMENT_CALENDAR.filter(x => x.qualifierFor)) {
            const q = s1(f.id), main = s1(f.qualifierFor!)
            expect([f.id, lastMatchWeek(q.id) < main.startWeek]).toEqual([f.id, true])
        }
    })

    test("the world's top clubs reach the Majors", () => {
        for (const major of FULL_TOURNAMENT_CALENDAR.filter(d => isMajorTournament(`${d.id}_s1`) && hasRankedInvites(d))) {
            const t = s1(major.id)
            const top8 = (ranks: Map<string, number>) => [...ranks.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8).map(([id]) => id)
            // Invites go out when the RMRs start: the world top 8 of that
            // week are all at the Major.
            const invitedTop = top8(ranksAtInvite.get(t.id)!)
            expect([major.id, invitedTop.filter(id => !t.teamIds.includes(id))]).toEqual([major.id, []])
            // A club that climbed into the top 8 since then had its chance in
            // an RMR: none of the opening week's top 8 is missing without one.
            const rmrEntrants = new Set(feederEvents(major.id).flatMap(f => s1(f.id).teamIds))
            const lockedOut = top8(ranksAtStart.get(t.id)!).filter(id => !t.teamIds.includes(id) && !rmrEntrants.has(id))
            expect([major.id, lockedOut]).toEqual([major.id, []])
            const invited = save.tournamentQualifications.filter(q => q.tournamentId === t.id && q.qualifiedVia === "Direct Invite").map(q => q.teamId)
            expect(invited).toHaveLength(major.inviteSlots!)
            for (const id of invited) expect([id, rankWhenInvited.get(`${t.id}|${id}`)! <= 16]).toEqual([id, true])
        }
    })

    test("the Majors play two 16-club Swiss stages to the end (COMP-02)", () => {
        for (const major of FULL_TOURNAMENT_CALENDAR.filter(d => isMajorTournament(`${d.id}_s1`))) {
            const t = s1(major.id)
            const invited = save.tournamentQualifications.filter(q => q.tournamentId === t.id && q.qualifiedVia === "Direct Invite").map(q => q.teamId)
            // Stage 1: the 16 clubs that came through the RMRs.
            expect(t.swissStage1).toHaveLength(16)
            expect(t.swissStage1!.filter(r => invited.includes(r.teamId))).toEqual([])
            // Stage 2: the 8 invited clubs and the 8 best of stage 1.
            expect(t.standings).toHaveLength(16)
            expect([...invited].sort()).toEqual([...t.swissInvites!].sort())
            for (const id of invited) expect(t.standings.some(r => r.teamId === id)).toBe(true)
            // Both stages are played out: every club has 3 wins or 3 losses.
            for (const r of [...t.swissStage1!, ...t.standings]) expect([major.id, r.teamId, r.wins === 3 || r.losses === 3]).toEqual([major.id, r.teamId, true])
            // The 8 three-win clubs of stage 2 are the playoff, seeded in Swiss order.
            const playoff = (t.playoffBracket ?? []).filter(m => !m.id.includes("_swiss_r"))
            const inPlayoff = new Set(playoff.flatMap(m => [m.homeTeamId, m.awayTeamId]).filter(Boolean))
            expect([...inPlayoff].sort()).toEqual(t.standings.filter(r => r.wins === 3).map(r => r.teamId).sort())
            // It fits its weeks and every club of the field is placed.
            expect(lastMatchWeek(t.id)).toBeLessThan(t.startWeek + major.duration)
            expect(TournamentManager.calculatePlacements(save, t)).toHaveLength(24)
        }
    })

    test("an RMR is decided by its Swiss table: its places go to the 3-win clubs in Swiss order (COMP-03)", () => {
        for (const rmr of FULL_TOURNAMENT_CALENDAR.filter(d => d.qualifierFor && d.format === "swiss")) {
            const t = s1(rmr.id)
            expect((t.playoffBracket ?? []).filter(m => !m.id.includes("_swiss_r"))).toEqual([])
            const expected = swissOrder(t.standings).slice(0, rmr.qualifierSlots).map(r => r.teamId)
            const via = save.tournamentQualifications.filter(q => q.tournamentId === `${rmr.qualifierFor}_s1` && q.qualifiedVia === `Via ${rmr.shortName}`).map(q => q.teamId)
            expect([rmr.id, [...via].sort()]).toEqual([rmr.id, [...expected].sort()])
            for (const id of expected) expect(t.standings.find(r => r.teamId === id)!.wins).toBe(3)
        }
    })

    test("the Elite World Final is the top 8 of the circuit points table (COMP-04)", () => {
        const t = s1("blast_world_final")
        const points = pointsAtStart.get(t.id)!
        const ranks = ranksAtStart.get(t.id)!
        const top8 = [...save.teams].map(c => c.id)
            .sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || (ranks.get(a) ?? 999) - (ranks.get(b) ?? 999) || a.localeCompare(b))
            .slice(0, 8)
        expect([...t.teamIds].sort()).toEqual([...top8].sort())
    })

    test("a computer club in a Major is not put into a smaller event in the same weeks (COMP-05)", () => {
        for (const major of FULL_TOURNAMENT_CALENDAR.filter(d => isMajorTournament(`${d.id}_s1`))) {
            const t = s1(major.id)
            const majorWeeks = [t.startWeek, lastMatchWeek(t.id)]
            for (const other of save.tournaments.filter(x => /_s1$/.test(x.id) && x.id !== t.id && x.format !== "league" && x.tier !== "S_TIER" && x.tier !== "QUALIFIER")) {
                // Events whose own weeks overlap the Major's (the field is built
                // for those weeks; a final that overran by a week is not a clash).
                if (other.startWeek > majorWeeks[1] || other.startWeek + other.duration - 1 < majorWeeks[0]) continue
                const via = new Set(save.tournamentQualifications.filter(q => q.tournamentId === other.id && q.qualifiedVia?.startsWith("Via ")).map(q => q.teamId))
                const both = other.teamIds.filter(id => t.teamIds.includes(id) && id !== save.playerTeamId && !via.has(id))
                expect([major.id, other.id, both]).toEqual([major.id, other.id, []])
            }
        }
    })

    test("league events play inside the weeks the calendar lists, a club never twice a day (COMP-10)", () => {
        for (const d of FULL_TOURNAMENT_CALENDAR.filter(x => x.format === "league" && x.startWeek <= 52)) {
            const t = s1(d.id)
            const rows = (t.playoffBracket ?? []).filter(m => m.stage === "League Match")
            const n = t.teamIds.length
            expect([d.id, rows.length, rows.every(m => m.isCompleted)]).toEqual([d.id, (n * (n - 1)) / 2, true])
            expect([d.id, Math.min(...rows.map(m => m.week!)), lastMatchWeek(t.id) < d.startWeek + d.duration]).toEqual([d.id, d.startWeek, true])
            const days = new Set<string>()
            for (const m of save.completedMatches.filter(x => x.tournamentId === t.id)) for (const club of [m.homeTeamId, m.awayTeamId]) {
                const key = `${club}|${m.week}|${m.day}`
                expect([d.id, key, days.has(key)]).toEqual([d.id, key, false])
                days.add(key)
            }
        }
    })

    test("a won qualifier is no title; trophies are kept per season", () => {
        const trophies = save.teams.flatMap(t => t.trophies ?? [])
        expect(trophies.filter(t => t.tier === "QUALIFIER")).toEqual([])
        for (const t of save.teams) {
            const ids = (t.trophies ?? []).map(x => x.tournamentId)
            expect(new Set(ids).size).toBe(ids.length)
        }
        // Every finished season-1 title went to its winner's cabinet.
        for (const d of mainEvents()) {
            const t = s1(d.id)
            const winner = save.teams.find(c => c.id === t.winnerId)!
            expect([d.id, winner.trophies.some(x => x.tournamentId === t.id)]).toEqual([d.id, true])
        }
    })
})

describe("season 1 to season 2", () => {
    test("season 1 is archived: names carry 2027, past winners stay", () => {
        expect(s1("iem_katowice").name).toBe("Winter Open Katova 2027")
        expect(s1("major_copenhagen").name).toMatch(/2027$/)
        const champion = save.teams.find(c => c.id === s1("iem_katowice").winnerId)!
        expect(champion.trophies.find(x => x.tournamentId === "iem_katowice_s1")?.tournamentName).toBe("Winter Open Katova 2027")
        expect(save.careerStats?.seasons?.[0]?.seasonNumber).toBe(1)
    })

    test("nothing of season 1 leaks into season 2", () => {
        // Season-2 instances are new rows with their own year and their own field.
        const open2 = instance("iem_katowice_open_s2")
        expect(open2).toBeDefined()
        expect(open2.name).toBe("Winter Open Katova Open Qualifier 2028")
        expect(open2.startWeek).toBe(54)
        expect(open2.teamIds).toHaveLength(getTournamentById("iem_katowice_open")!.slots)
        // Its own fixtures, all in season 2.
        const open2Matches = save.completedMatches.filter(m => m.tournamentId === open2.id)
        expect(open2Matches.length).toBeGreaterThan(0)
        expect(open2Matches.filter(m => m.week < 54)).toEqual([])
        // No club is left "Registered" for a season-1 event that is over.
        const staleRegistrations = save.tournamentQualifications.filter(q =>
            q.status === "REGISTERED" && /_s1$/.test(q.tournamentId) && instance(q.tournamentId)?.isCompleted && !instance(q.tournamentId).teamIds.includes(q.teamId))
        expect(staleRegistrations).toEqual([])
        // Season-2 invites for Winter Open Katova went out (it starts in week 61) and are separate from season 1's.
        const invites2 = save.tournamentQualifications.filter(q => q.tournamentId === "iem_katowice_s2" && q.qualifiedVia === "Direct Invite")
        expect(invites2).toHaveLength(getTournamentById("iem_katowice")!.inviteSlots!)
        // Invited clubs don't play season 2's open qualifier.
        for (const q of invites2) expect(open2.teamIds.includes(q.teamId)).toBe(false)
    })
})
