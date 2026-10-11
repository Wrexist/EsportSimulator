/**
 * Phase 5.4b season review: the week tick that closes a season queues its
 * review once, after any title or tier-move moment; the queue keeps it across
 * a reload; Continue waits for it. The review's pages are built from the
 * save only (getSeasonReview, the board's verdict, the league table, the
 * managed club's storylines when 5.3 provides them).
 */
import { createLaunchFixture, FixtureStorage } from "@/scripts/launch/fixtures"
import { SeededRNG } from "@/engine/rng"
import { SaveManager } from "@/engine/save-manager"
import { AtomicWeekProcessor } from "@/engine/atomic-week-processor"
import { recordOfficialMatch, recordTierMove, recordTitle } from "@/engine/official-stats"
import { closeSeason } from "@/engine/season-honours"
import { adjustManagerReputation, openStint } from "@/engine/manager-timeline"
import { boardVerdictFor, reviewVerdict } from "@/engine/board-expectations"
import {
    dismissMoment, momentHeadline, queueMoment, restoreMomentQueue, seasonReviewKey, seasonReviewMoment,
    type Moment, type MomentHolder,
} from "@/engine/moments"
import { collectStopSignals, nextMoment, type StopSource } from "@/lib/advance-stops"
import { buildSeasonReviewView, readStorylineArcs } from "@/lib/season-review-view"
import { buildSaveSnapshot } from "@/store/utils/build-save-snapshot"
import { useGameStore } from "@/store/game-store"
import type { GameSave, LeagueState, MatchSaveData } from "@/engine/save-types"
import type { MapResult, MatchResult, RoundResult } from "@/types"
import { TrainingFocus } from "@/types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

/** A script-v1 map: each round's winners each kill one loser (100 damage). */
function map(name: string, home: string[], away: string[], h: number, a: number): MapResult {
    const rounds: RoundResult[] = []
    const round = (w: string[], l: string[]): RoundResult => ({
        roundNumber: rounds.length + 1, winner: "ct", winType: "ELIMINATION", ctTeam: "x", tTeam: "y", kills: [],
        events: l.map((v, i) => ({ type: "KILL", time: i * 10, playerId: w[i % w.length], victimId: v } as never)), damage: Object.fromEntries(w.map(id => [id, 100])),
    })
    for (let i = 0; i < h; i++) rounds.push(round(home, away))
    for (let i = 0; i < a; i++) rounds.push(round(away, home))
    return { map: name, ctStartTeamId: "x", tStartTeamId: "y", rounds, finalScore: { team1: h, team2: a }, homeScore: h, awayScore: a, mvpPlayerId: home[0] } as unknown as MapResult
}

/** One official BO1 between two clubs in `week` (home wins h–a, away wins when a > h). */
function play(save: GameSave, id: string, homeId: string, awayId: string, week: number, h: number, a: number) {
    const home = save.teams.find(t => t.id === homeId)!, away = save.teams.find(t => t.id === awayId)!
    const m: MatchSaveData = { id, homeTeamId: home.id, awayTeamId: away.id, tournamentId: "league_s1_t_d1", stage: "R", week, format: "BO1", seed: week }
    const winner = h > a ? home.id : away.id
    const result: MatchResult = {
        engineVersion: "script-v1", winnerId: winner, homeScore: h > a ? 1 : 0, awayScore: h > a ? 0 : 1,
        maps: [map("Mirage", home.rosterIds, away.rosterIds, h, a)], mvpPlayerId: (h > a ? home : away).rosterIds[0], playerStats: {},
        lineups: { [home.id]: home.rosterIds, [away.id]: away.rosterIds },
    }
    save.currentWeek = week
    recordOfficialMatch(save, m, result)
}

/** Season 1 played by the managed club (official maps, a Major, a league title, a promotion, a board review). */
function playedSeason(seed = 54001): GameSave {
    const save = createLaunchFixture("first-week", seed)
    const [mine, rival, third] = save.teams
    openStint(save)
    for (let w = 2; w <= 26; w++) play(save, `s_${w}`, mine.id, rival.id, w, 13, w % 9)
    play(save, "s_loss", rival.id, mine.id, 27, 13, 2)
    for (let w = 28; w <= 40; w++) play(save, `o_${w}`, rival.id, third.id, w, 13, 6)
    recordTitle(save, mine, { tournamentId: "major_copenhagen_s1", name: "Northern Major", tier: "S_TIER", week: 30, season: 1 })
    recordTitle(save, mine, { tournamentId: "league_s1_europe_d1", name: "Europe Division 1 S1 Split 2", tier: "LEAGUE", week: 49, season: 1 })
    recordTitle(save, rival, { tournamentId: "cup_s1", name: "Nordic Cup", tier: "B_TIER", week: 35, season: 1 })
    save.league = {
        version: 1,
        history: [
            { id: "s1", season: 1, split: 1, divisions: [{ id: "league_s1_europe_d2", name: "Europe Division 2", region: "EUROPE", level: 2, table: [[rival.id, 30, 10, 2], [mine.id, 27, 9, 3]], promoted: [rival.id, mine.id] }] },
            { id: "s2", season: 1, split: 2, divisions: [{ id: "league_s1_europe_d1", name: "Europe Division 1", region: "EUROPE", level: 1, table: [[mine.id, 33, 11, 1], [rival.id, 24, 8, 4]], championId: mine.id }] },
        ],
    } as LeagueState
    recordTierMove(save, 1, mine.id, "A_TIER", "S_TIER", 6)
    save.currentWeek = 52
    save.managerDetails.reputation = 50
    save.boardState = { ...(save.boardState ?? {}), teamId: mine.id, confidence: 81, seasonExpectation: "CONTEND", expectationSetSeason: 2, lastReviewedSeason: 1, onNotice: false,
        lastReview: { week: 52, kind: "SEASON", delta: 18, confidence: 81, summary: "League objective met: 1st in Europe Division 1 (target 4th). Season ranking met: #6, 2 trophies (target #9)" } } as GameSave["boardState"]
    adjustManagerReputation(save, 6, "Season 1 board review: expectations exceeded")
    save.currentWeek = 53
    closeSeason(save, 1)
    return save
}

const review = (season: number, week = 53): Moment => seasonReviewMoment(season, week, "team")
const title = (key: string): Moment => ({ key, kind: "title", week: 53, tournamentId: key, tournamentName: key, tier: "A_TIER", major: false, prize: 1000, prizeBooked: true, repGain: 2 })
const promotion = (key: string): Moment => ({ key, kind: "promotion", week: 52, scope: "world", season: 1, fromLabel: "A-Tier", toLabel: "S-Tier" })

describe("season review moment: queue", () => {
    test("one per season: queued once, never again after it was shown", () => {
        const h: MomentHolder = {}
        expect(queueMoment(h, review(1))).toBe(true)
        expect(queueMoment(h, review(1))).toBe(false)
        expect(h.momentQueue!.map(m => m.key)).toEqual([seasonReviewKey(1)])
        dismissMoment(h, seasonReviewKey(1))
        expect(queueMoment(h, review(1))).toBe(false)
        expect(queueMoment(h, review(2, 105))).toBe(true)
        expect(momentHeadline(review(2))).toBe("Season 2 review")
    })

    test("always last: a promotion or title decided while the review waits is shown first", () => {
        const h: MomentHolder = {}
        queueMoment(h, promotion("promotion:world:1"))
        queueMoment(h, review(1))
        queueMoment(h, title("title:late_cup"))
        expect(h.momentQueue!.map(m => m.kind)).toEqual(["promotion", "title", "season-review"])
        const order: string[] = []
        while (h.momentQueue?.length) { const head = nextMoment(h)!; order.push(head.kind); dismissMoment(h, head.key) }
        expect(order).toEqual(["promotion", "title", "season-review"])
    })

    test("a legacy title celebration also comes before the review, even from a mis-ordered saved queue", () => {
        const legacy = { tournamentId: "t_major", tournamentName: "Major", tier: "S_TIER" }
        expect(nextMoment({ momentQueue: [review(1)], pendingCelebration: legacy as never })?.kind).toBe("title")
        expect(nextMoment({ momentQueue: [review(1), title("title:x")] })?.key).toBe("title:x")
        expect(nextMoment({ momentQueue: [review(1)] })?.key).toBe(seasonReviewKey(1))
    })

    test("survives a reload: restored from the save and carried by the snapshot", () => {
        const queue = [promotion("promotion:world:1"), review(1)]
        expect(restoreMomentQueue(JSON.parse(JSON.stringify(queue)))).toEqual(queue)
        const snap = buildSaveSnapshot({ ...useGameStore.getState(), momentQueue: queue, seenMomentKeys: [] } as never)
        expect(JSON.parse(JSON.stringify(snap)).momentQueue).toEqual(queue)
    })

    test("Continue stops for it like any moment", () => {
        const save = createLaunchFixture("first-week")
        save.scheduledMatches = []
        save.momentQueue = [review(1)]
        expect(collectStopSignals(save as unknown as StopSource)[0]).toMatchObject({ kind: "moment", reason: "Season 1 review" })
    })
})

describe("season review moment: the week tick that closes the season", () => {
    async function tick(save: GameSave) {
        const processor = new AtomicWeekProcessor(new SaveManager(new FixtureStorage()))
        const res = await processor.processWeek(save, { playerTeamId: save.playerTeamId!, trainingFocus: new Map([[save.playerTeamId!, { focus: TrainingFocus.AIM, intensity: 5 }]]) }, new SeededRNG(7))
        expect(res.success).toBe(true)
    }

    test("week 52 to 53 queues the review once, after the moments already waiting; the next week adds none", async () => {
        const save = createLaunchFixture("season-boundary", 54002)
        const [mine, rival] = save.teams
        for (let w = 2; w <= 30; w++) play(save, `b_${w}`, mine.id, rival.id, w, 13, 4)
        save.currentWeek = 52
        save.scheduledMatches = []
        queueMoment(save, promotion("promotion:world:1"))
        await tick(save)
        expect(save.currentWeek).toBe(53)
        expect(save.recordBook!.honours.map(h => h.season)).toEqual([1])
        const reviews = save.momentQueue!.filter(m => m.kind === "season-review")
        expect(reviews).toEqual([expect.objectContaining({ key: seasonReviewKey(1), season: 1, teamId: mine.id, week: 53 })])
        expect(save.momentQueue!.at(-1)?.kind).toBe("season-review")
        expect(nextMoment(save)?.key).toBe("promotion:world:1")
        // The awards message still goes to the inbox (it reopens the review).
        expect(save.eventsLog.some(e => e.id === "pro_top20_season1")).toBe(true)

        await tick(save)
        expect(save.momentQueue!.filter(m => m.kind === "season-review")).toHaveLength(1)
        // Shown: never queued again for that season.
        dismissMoment(save, seasonReviewKey(1))
        queueMoment(save, review(1))
        expect(save.momentQueue!.some(m => m.kind === "season-review")).toBe(false)
    })
})

describe("season review data", () => {
    test("your season: league finish, record, titles with their art, tier move, best player, results and the board", () => {
        const save = playedSeason()
        const view = buildSeasonReviewView(save, 1)!
        const [mine] = save.teams
        expect(view.final).toBe(true)
        expect(view.club.teamName).toBe(mine.name)
        expect(view.club.league).toMatchObject({ position: 1, of: 2, division: "Europe Division 1", split: 2, label: "1st" })
        expect(view.club.record).toEqual({ wins: 25, losses: 1 })
        expect(view.club.trophies.map(t => [t.name, t.art])).toEqual([["Northern Major", "major"], ["Europe Division 1 S1 Split 2", "league"]])
        expect(view.club.tierMove).toEqual({ direction: "promoted", from: "A-Tier", to: "S-Tier" })
        expect(view.club.worldTier).toBe("S-Tier")
        expect(view.club.bestPlayer?.ours).toBe(true)
        // Scores are from the club's side (a BO1 reads in rounds).
        expect(view.club.worstLoss).toMatchObject({ score: "2–13", margin: 11, week: 27 })
        expect(view.club.biggestWin?.margin).toBe(13)
        expect(view.club.board).toMatchObject({ outcome: "EXCEEDED", label: "Expectations exceeded", confidence: 81, delta: 18 })
        expect(view.club.board?.reasons).toEqual(["League objective met: 1st in Europe Division 1 (target 4th)", "Season ranking met: #6, 2 trophies (target #9)"])
        expect(view.success).toBe(true)
    })

    test("awards, Top 20 and team of the season carry the honours' real numbers; the club's players are marked", () => {
        const save = playedSeason()
        const h = save.recordBook!.honours[0]
        const view = buildSeasonReviewView(save, 1)!
        expect(view.awards.mvp).toMatchObject({ playerId: h.mvp!.playerId, rating: h.mvp!.rating, kills: h.mvp!.kills, deaths: h.mvp!.deaths, maps: h.mvp!.maps })
        expect(view.awards.top20.map(p => p.rank)).toEqual(h.top20.map((_, i) => i + 1))
        expect(view.awards.top20.filter(p => p.ours).map(p => p.playerId)).toEqual(h.top20.filter(w => w.teamId === save.teams[0].id).map(w => w.playerId))
        expect(view.teamOfSeason.map(p => p.playerId)).toEqual(h.teamOfSeason.map(w => w.playerId))
        expect(view.awards.minMaps).toBe(h.minMaps)
        expect(view.pages).toEqual(["club", "mvp", ...(view.awards.rookie ? ["rookie"] : []), "top20", "team", "records", "story"])
    })

    test("records and champions of the season; all-time records that fell are marked", () => {
        const save = playedSeason()
        const view = buildSeasonReviewView(save, 1)!
        const biggest = view.records.find(r => r.key === "biggestWin")!
        expect(biggest).toMatchObject({ value: "13–0", ours: true })
        expect(biggest.detail).toContain("+13 rounds")
        expect(view.records.find(r => r.key === "longestWinStreak")?.value).toBe("25 wins")
        expect(view.records.every(r => r.allTime === save.recordBook!.honours[0].brokenRecords.includes(r.key))).toBe(true)
        // Majors first, then by tier; each champion with its club.
        expect(view.titles.map(t => [t.name, t.art, t.ours])).toEqual([
            ["Northern Major", "major", true],
            ["Nordic Cup", "B", false],
            ["Europe Division 1 S1 Split 2", "league", true],
        ])
    })

    test("story: the season's facts in calendar order when there are no storylines", () => {
        const view = buildSeasonReviewView(playedSeason(), 1)!
        expect(view.story?.source).toBe("season")
        const beats = view.story!.arcs[0].beats
        const at = (prefix: string) => beats.findIndex(b => b.title.startsWith(prefix))
        const order = ["Biggest win", "2nd of 2 in Europe Division 2: promoted", "Heaviest defeat", "Won Northern Major", "Won Europe Division 1", "1st of 2 in Europe Division 1: division champions", "Promoted to S-Tier", "Board review: expectations exceeded"]
        expect(order.map(at)).toEqual(order.map((_, i) => i))
        expect(beats).toHaveLength(order.length)
        expect(beats.find(b => b.title === "Won Northern Major")).toMatchObject({ when: "Week 30", tone: "gold" })
    })

    test("story: the managed club's storylines when 5.3 provides them, read defensively", () => {
        const save = playedSeason() as GameSave & { storylines?: unknown }
        const me = save.teams[0].id
        save.storylines = [
            { id: "a", title: "Rising star", teamId: me, season: 1, summary: "A rookie forced his way in.", beats: [{ week: 12, headline: "Debut: 1.31 rating" }, { week: 20, text: "Contract talks" }, 5, null] },
            { id: "b", title: "Other club drama", teamId: "someone_else", season: 1, beats: [] },
            { id: "c", title: "Last season", teamId: me, season: 0 },
            { id: "d", teamId: me, season: 1 },
            "junk",
        ]
        const view = buildSeasonReviewView(save, 1)!
        expect(view.story).toEqual({
            source: "storylines",
            arcs: [{ title: "Rising star", summary: "A rookie forced his way in.", beats: [{ when: "Week 12", title: "Debut: 1.31 rating", tone: "neutral" }, { when: "Week 20", title: "Contract talks", tone: "neutral" }] }],
        })
        expect(readStorylineArcs(undefined, me, 1)).toEqual([])
        expect(readStorylineArcs({ not: "an array" }, me, 1)).toEqual([])
    })

    test("the board verdict reads back from the reputation log once the board has moved on", () => {
        const save = playedSeason()
        save.boardState!.lastReview = { week: 78, kind: "MID_SEASON", delta: -3, confidence: 70, summary: "x" }
        expect(boardVerdictFor(save, 1)).toEqual({ outcome: "EXCEEDED", reasons: [] })
        expect(boardVerdictFor(save, 2)).toBeUndefined()
        expect([reviewVerdict(12), reviewVerdict(0), reviewVerdict(-12), reviewVerdict(-13)]).toEqual(["EXCEEDED", "MET", "MISSED", "FAILED"])
    })

    test("a quiet season: no ranked players means no award pages, and no review for seasons without a record", () => {
        const save = createLaunchFixture("first-week", 54003)
        save.currentWeek = 53
        closeSeason(save, 1)
        const view = buildSeasonReviewView(save, 1)!
        expect(view.pages).toEqual(["club"])
        expect(view.success).toBe(false)
        expect(view.club.board).toBeUndefined()
        expect(buildSeasonReviewView(save, 3)).toBeNull()
    })
})
