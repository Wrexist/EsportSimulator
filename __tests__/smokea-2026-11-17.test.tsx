/**
 * Smoke test A (2026-11-17): regressions for SMOKE-A-01 … SMOKE-A-16.
 */
import fs from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import type { BracketMatchSaveData, BoardState, TournamentSaveData } from "@/engine/save-types"
import { t } from "@/lib/i18n"
import { CashChart, type CashPoint } from "@/components/finance/CashChart"
import { getBoardSanctionedFee } from "@/engine/board-expectations"
import { projectedMatchesFor } from "@/components/schedule/projected-matches"
import TournamentBracket from "@/components/tournament/TournamentBracket"
import { instanceName } from "@/lib/tournament-instances"
import { FULL_TOURNAMENT_CALENDAR, getTournamentById } from "@/data/tournament-calendar"

const src = (p: string) => fs.readFileSync(p, "utf8")

describe("SMOKE-A-01/02/03: weeks on screen are season weeks", () => {
    test("the event page, finances, career, club profile, week report and stats go through lib/season-week", () => {
        const event = src("app/tournaments/[id]/page.tsx")
        expect(event).not.toMatch(/t\("tm\.weekRange", \{ from: startWeek, to: endWeek \}\)/)
        expect(event).not.toMatch(/t\("common\.week", \{ n: (startWeek|week|playerNextMatch\.week) \}\)/)
        expect(event).not.toMatch(/tabular-nums text-ink-3">\{match\.week\}</)
        const fin = src("app/finances/page.tsx")
        expect(fin).toMatch(/weekLabel\(currentWeek \+ 1, currentWeek\)/)
        expect(fin).toMatch(/weekLabel\(group\.week, currentWeek\)/)
        expect(fin).not.toMatch(/text-ink-3">\{e\.week\}</)
        expect(src("app/career/page.tsx")).toMatch(/car\.kpi\.week", \{ week: weekOfSeason\(currentWeek\) \}/)
        expect(src("components/team/TeamProfile.tsx")).not.toMatch(/common\.weekShort", \{ n: (m|tr)\.week \}/)
        expect(src("components/report/WeekReportView.tsx")).toMatch(/weekLabelShort\(line\.week, report\.week\)/)
        expect(src("app/stats/page.tsx")).not.toMatch(/sx\.weekShort", \{ n: m\.week \}/)
    })

    test("the cash chart labels season weeks and names another season in its tooltips", () => {
        const points: CashPoint[] = [
            { week: 51, balance: 500_000, net: -10_000, projected: false },
            { week: 52, balance: 490_000, net: -10_000, projected: false },
            { week: 53, balance: 480_000, net: -10_000, projected: false },
            { week: 54, balance: 470_000, net: -10_000, projected: true },
        ]
        const html = renderToStaticMarkup(<CashChart points={points} nowWeek={53} />)
        expect(html).not.toMatch(/>W5[34]</)
        expect(html).toContain(">W1<")
        // Week 52 of season 1, seen from season 2, names its season.
        expect(html).toContain(t("fin.tipBalance", { week: t("common.seasonWeekNo", { w: 52, s: 1 }), amount: "$490,000" }))
        expect(html).toContain(t("fin.tipBalance", { week: "1", amount: "$480,000" }))
    })
})

describe("SMOKE-A-13: negative funds", () => {
    test("an all-negative balance keeps zero on the axis and never repeats a tick", () => {
        const points: CashPoint[] = [0, 1, 2, 3].map(i => ({ week: 10 + i, balance: -1_400_000 - i * 1000, net: -1000, projected: i > 1 }))
        const html = renderToStaticMarkup(<CashChart points={points} nowWeek={11} />)
        const ticks = [...html.matchAll(/text-anchor="end" font-size="11" class="fill-ink-3">([^<]+)</g)].map(m => m[1]).filter(l => l !== t("fin.net"))
        expect(new Set(ticks).size).toBe(ticks.length)
        expect(ticks[0]).toBe("$0")
    })
    test("the board fee cap is never negative", () => {
        const board = { confidence: 60, onNotice: false } as BoardState
        expect(getBoardSanctionedFee(board, -1_375_000).maxFee).toBe(0)
        expect(getBoardSanctionedFee(undefined, -5).maxFee).toBe(0)
        expect(getBoardSanctionedFee(board, 100_000).maxFee).toBe(80_000)
    })
    test("the out-of-cash count stops at its limit", () => {
        expect(src("app/finances/page.tsx")).toMatch(/n: Math\.min\(team\.consecutiveInsolventWeeks \?\? 0, 8\), max: 8/)
    })
})

describe("SMOKE-A-11: one runway", () => {
    test("Home uses the /finances runway (cashRunway from today's funds, retraining included)", () => {
        const home = src("app/page.tsx")
        expect(home).toMatch(/const homeRunway = cashRunway\(playerTeam\?\.budget \?\? 0, homeNet\)/)
        expect(home).not.toMatch(/Math\.floor\(finance\.runwayWeeks\)/)
        expect(src("app/finances/page.tsx")).toMatch(/const runway = cashRunway\(funds, net\)/)
    })
})

describe("SMOKE-A-08 / A-12: one record and one rank", () => {
    test("/stats leaves scrims out of its record", () => {
        expect(src("app/stats/page.tsx")).toMatch(/const official = teamMatches\.filter\(m => !m\.isScrim\)/)
    })
    test("/rankings orders by the stored world rank", () => {
        const page = src("app/rankings/page.tsx")
        expect(page).toMatch(/\.sort\(\(a, b\) => \(\(a\.worldRanking \|\| Infinity\) - \(b\.worldRanking \|\| Infinity\)\) \|\| compareRanking\(a, b\)\)/)
        expect(page).not.toMatch(/b\.elo \|\| 1000/)
    })
})

describe("SMOKE-A-09: the calendar forecast stops at the last round", () => {
    const labels = { nextStage: "Next", upcomingStage: "Upcoming", forecast: "Forecast" }
    const bm = (id: string, over: Partial<BracketMatchSaveData>): BracketMatchSaveData =>
        ({ id, week: 5, stage: "Final", isCompleted: false, ...over } as BracketMatchSaveData)
    test("drawn in the final: no Bracket · TBD weeks", () => {
        const bracket = [
            bm("sf1", { stage: "Semi-final 1", week: 4, homeTeamId: "me", awayTeamId: "a", isCompleted: true, winnerId: "me", loserId: "a" }),
            bm("sf2", { stage: "Semi-final 2", week: 4, homeTeamId: "b", awayTeamId: "c", isCompleted: true, winnerId: "b", loserId: "c" }),
            bm("f", { week: 5, homeTeamId: "me", awayTeamId: "b", sourceMatchIds: ["sf1", "sf2"] }),
        ]
        const tour = { id: "kato_s1", name: "Kato Open", teamIds: ["me", "a", "b", "c"], isCompleted: false, startWeek: 3, endWeek: 7, playoffBracket: bracket } as unknown as TournamentSaveData
        const scheduled = [{ id: "f", week: 5, tournamentId: "kato_s1", homeTeamId: "me", awayTeamId: "b" }]
        expect(projectedMatchesFor({ playerTeamId: "me", currentWeek: 4, tournaments: [tour], tournamentQualifications: [], scheduledMatches: scheduled, completedMatches: [] }, labels)).toEqual([])
    })
    test("the stage window ends at the event's last week (endWeek is the week after)", () => {
        const tour = { id: "kato_s1", name: "Kato Open", teamIds: ["me"], isCompleted: false, startWeek: 8, endWeek: 10, playoffBracket: [] } as unknown as TournamentSaveData
        const weeks = projectedMatchesFor({ playerTeamId: "me", currentWeek: 8, tournaments: [tour], tournamentQualifications: [], scheduledMatches: [], completedMatches: [] }, labels).map(p => p.week)
        expect(weeks).toEqual([8, 9])
    })
})

describe("SMOKE-A-10: one name per event", () => {
    test("a qualifier is named with its event's year everywhere", () => {
        const qualifier = FULL_TOURNAMENT_CALENDAR.find(d => d.qualifierFor && !/\b20\d{2}\b/.test(d.name))
        expect(qualifier).toBeDefined()
        const name = instanceName(qualifier!, 1, "2026-11-23")
        expect(name).toMatch(/\b20\d{2}\b/)
        expect(getTournamentById(qualifier!.id)).toBeDefined()
        for (const file of ["app/tournaments/page.tsx", "app/tournaments/[id]/page.tsx", "components/schedule/TournamentDetailsModal.tsx"]) {
            expect(src(file)).not.toMatch(/getDynamicTournamentName\(/)
            expect(src(file)).toMatch(/instanceName\(/)
        }
    })
})

describe("SMOKE-A-14: the 3rd-place match", () => {
    test("is drawn under the final, with no connector", () => {
        const team = (id: string) => ({ id, name: id.toUpperCase() })
        const match = (id: string, round: string) => ({ id, round, team1: team(`${id}a`), team2: team(`${id}b`), status: "scheduled" as const })
        const html = renderToStaticMarkup(<TournamentBracket
            matches={[match("sf1", "Semi-final 1"), match("sf2", "Semi-final 2"), match("tp", "3rd Place Decider"), match("gf", "Grand Final")]}
            rounds={["Semi-final 1", "3rd Place Decider", "Grand Final"]}
        />)
        const third = html.indexOf("data-third-place")
        expect(third).toBeGreaterThan(html.indexOf('data-match-id="gf"'))
        expect(html.indexOf('data-match-id="tp"')).toBeGreaterThan(third)
        // Connectors: one per semi-final only.
        expect(html.match(/absolute -right-8 top-1\/2 w-8 border-t/g)?.length).toBe(2)
    })
})

describe("SMOKE-A-04/06/07/15/16: small UI fixes", () => {
    test("A-04: the guide toast waits for the week report", () => {
        expect(src("components/dashboard/GettingStartedChecklist.tsx")).toMatch(/if \(toastPending\.current && !reportOpen && !state\.loading\)/)
    })
    test("A-06: the five and the signature share one row", () => {
        const view = src("components/moments/SigningRevealView.tsx")
        expect(view).toMatch(/mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3/)
        expect(src("components/moments/MomentFrame.tsx")).toMatch(/\[@media\(max-height:760px\)\]:py-6/)
    })
    test("A-07: a planted bomb is an icon, and the scorebug hides its timer under a break card", () => {
        const sb = src("components/match/LiveMatchScoreboard.tsx")
        expect(sb).toMatch(/<Bomb size=\{14\}[^>]*aria-label=\{t\("scoreboard\.bomb"\)\}/)
        expect(sb).toMatch(/const showTimer = gameState\.time >= 0 && !buyPhase && !onBreak/)
        expect(src("app/match/[id]/live/page.tsx")).toMatch(/onBreak=\{!!breakCard\}/)
    })
    test("A-15: the weekly focus list scrolls to its hash itself", () => {
        expect(src("components/dashboard/WeeklyFocusWidget.tsx")).toMatch(/window\.location\.hash === "#weekly-focus"/)
    })
    test("A-16: the lock overlay's toast names the score", () => {
        expect(t("matchGuard.finished", { home: "Trock Drivers", homeScore: 2, awayScore: 1, away: "NRGX" })).toBe("Match finished: Trock Drivers 2–1 NRGX")
        const guard = src("components/layout/MatchNavigationGuard.tsx")
        expect(guard).not.toMatch(/matchError\.resolved/)
        expect(guard).toMatch(/t\("matchGuard\.finished"/)
    })
})
