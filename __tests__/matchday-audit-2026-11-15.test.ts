/**
 * Match-day audit fixes (2026-11-15): regression tests for the logic behind
 * MATCHDAY-01..21 and CROSSCUT-01/11/17 that is testable outside the browser.
 * Screen-level checks were made in the running game (fixes/matchday/).
 */
import fs from "fs"
import path from "path"
import { fixtureNotDueYet } from "@/lib/playable-match"
import { playerLine } from "@/lib/match-reasons"
import { tn, t } from "@/lib/i18n"
import { dividerText } from "@/components/match/live/LiveFeed"
import type { LogEntry, PlayerMatchStats } from "@/types"

const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8")

describe("CROSSCUT-01: a fixture whose date has not come cannot be started or vetoed", () => {
    const weekly = { currentWeek: 1, currentDay: 0, timeMode: "WEEKLY" }
    const daily = { currentWeek: 1, currentDay: 0, timeMode: "HYBRID_DAILY" }
    test("a later week is never due (both time modes)", () => {
        expect(fixtureNotDueYet(weekly, { week: 2, day: 1 })).toBe(true)
        expect(fixtureNotDueYet(daily, { week: 2, day: 1 })).toBe(true)
    })
    test("this week: due in weekly mode; in daily mode only from its day", () => {
        expect(fixtureNotDueYet(weekly, { week: 1, day: 2 })).toBe(false)
        expect(fixtureNotDueYet(daily, { week: 1, day: 2 })).toBe(true)
        expect(fixtureNotDueYet({ ...daily, currentDay: 2 }, { week: 1, day: 2 })).toBe(false)
        // No day recorded: the end of the week.
        expect(fixtureNotDueYet(daily, { week: 1 })).toBe(true)
        expect(fixtureNotDueYet({ ...daily, currentDay: 6 }, { week: 1 })).toBe(false)
    })
    test("an overdue fixture is not 'not due' (the prep page handles expired ones)", () => {
        expect(fixtureNotDueYet(daily, { week: 0, day: 6 })).toBe(false)
    })
    test("the live hook and the veto page both use the gate; a started match still resumes", () => {
        const hook = src("hooks/useLiveMatch.ts")
        expect(hook).toMatch(/activeMatchState\?\.matchId !== id && fixtureNotDueYet\(\{ currentWeek, currentDay, timeMode \}, foundMatch\)/)
        const veto = src("app/match/[id]/veto/page.tsx")
        expect(veto).toMatch(/fixtureNotDueYet\(s, foundMatch\)/)
    })
})

describe("MATCHDAY-03: the veto page never re-runs a finished veto or a live match's veto", () => {
    test("on the way in it sends a done veto, a live match or a future fixture to the prep page", () => {
        const veto = src("app/match/[id]/veto/page.tsx")
        expect(veto).toMatch(/if \(vetoSequence\.length === 0\) \{[\s\S]*?foundMatch\.vetoComplete \|\| liveMatchInProgress\(s, id\) \|\| fixtureNotDueYet\(s, foundMatch\)[\s\S]*?router\.replace\(`\/match\/\$\{id\}\/tactics`\)/)
    })
})

describe("match prep page (MATCHDAY-02, CROSSCUT-11, CROSSCUT-17)", () => {
    const prep = src("app/match/[id]/tactics/page.tsx")
    test("MATCHDAY-02: 'Match day' only when the fixture is due; a later day of the week is named", () => {
        expect(prep).toMatch(/isMatchWeek \? \(fixtureNotDueYet\(\{ currentWeek, currentDay, timeMode \}, match\) \? formatGameCalendarDate\(matchDate, \{ weekday: "long" \}\) : t\("home\.matchDay"\)\)/)
    })
    test("CROSSCUT-17: a played match's panel says Played with the final score, not 'ready to play'", () => {
        expect(prep).toMatch(/isCompleted \? t\("prep\.played"\) : mapsLocked \? t\("prep\.ready"\)/)
        expect(prep).toMatch(/: finalLine !== null \? finalLine/)
    })
    test("CROSSCUT-11: the club name wraps (two lines at most) instead of being cut, labels stay on one line", () => {
        const block = prep.slice(prep.indexOf("function TeamBlock"), prep.indexOf("export default function"))
        expect(block).not.toMatch(/\btruncate\b/)
        expect(block).toMatch(/line-clamp-2/)
        expect(block.match(/whitespace-nowrap/g)?.length).toBeGreaterThanOrEqual(2)
    })
})

describe("MATCHDAY-06: the match-day notice stays off the match's own screens", () => {
    test("the top bar hides the match stop notice under /match/<that match>/", () => {
        const ctl = src("components/report/AdvanceControl.tsx")
        expect(ctl).toMatch(/advanceStop\?\.kind === "match" \? advanceStop\.href\?\.match\(\/\^\\\/match\\\/\[\^\/\]\+\\\/\/\)\?\.\[0\]/)
        expect(ctl).toMatch(/advanceStop && !running && !onStopMatch && <StopNotice \/>/)
    })
})

describe("MATCHDAY-09/12/13: result analysis wording", () => {
    const base = { playerId: "p", matchId: "m", kills: 8, deaths: 13, assists: 2, headshots: 3, adr: 61, kast: 62, rating: 0.72, clutches: 0, firstKills: 0, firstDeaths: 1, mapsPlayed: 1 } as PlayerMatchStats
    const quietTally = { openings: 1, openingDeaths: 1, trades: 1, clutches: [], multikills: 0, utility: 0 }
    test("MATCHDAY-09: a low rating with nothing to name is a quiet game, not a steady one", () => {
        expect(playerLine(base, quietTally)).toBe("8–13, 61 damage per round: a quiet game.")
        expect(playerLine({ ...base, rating: 1.0 }, quietTally)).toBe("8–13, 61 damage per round: a steady game.")
    })
    test("MATCHDAY-12: the summary counts take singular and plural forms", () => {
        expect(tn("insight.underdogWins", 1)).toBe("1 round won with the weaker buy")
        expect(tn("insight.underdogWins", 2)).toBe("2 rounds won with the weaker buy")
        expect(t("insight.headline.won", { own: 13, total: 19, pw: 1, pt: 2, under: tn("insight.underdogWins", 1), fav: tn("insight.favouredLosses", 0) }))
            .toBe("Match won: you took 13 of 19 rounds; pistol rounds 1/2; 1 round won with the weaker buy, 0 lost with the stronger one.")
        expect(src("lib/match-insights.ts")).toMatch(/under: tn\('insight\.underdogWins', underdogWins\), fav: tn\('insight\.favouredLosses', favouredLosses\)/)
    })
    test("MATCHDAY-13: key rounds call the cheapest buy a save, like the live card", () => {
        expect(t("insight.kr.underdogWin", { own: t("insight.buy.eco"), opp: t("insight.buy.full") })).toBe("Won on a save against a full buy")
    })
})

describe("MATCHDAY-15: feed section breaks are dividers, not dashed text", () => {
    test("divider rows and legacy dashed rows read as dividers; other rows do not", () => {
        expect(dividerText({ type: "SYSTEM", divider: true, message: "Half time: switching sides" } as LogEntry)).toBe("Half time: switching sides")
        expect(dividerText({ type: "SYSTEM", message: "--- HALF TIME: SWITCHING SIDES ---" } as LogEntry)).toBe("HALF TIME: SWITCHING SIDES")
        expect(dividerText({ type: "SYSTEM", message: "Round 3 started" } as LogEntry)).toBeNull()
        expect(dividerText({ type: "ROUND_END", divider: true, message: "x" } as LogEntry)).toBeNull()
    })
    test("no feed text carries the dashes any more; a best-of-one names score and map", () => {
        for (const k of ["feed.halfTime", "feed.nextMap", "feed.overtimeStart", "feed.overtimeNewSet", "feed.overtimeSwitch", "feed.final"]) expect(t(k)).not.toMatch(/---/)
        expect(t("feed.finalMap", { team: "Trock Drivers", score: "13–8", map: "Overpass" })).toBe("Final: Trock Drivers win 13–8 on Overpass")
        const hook = src("hooks/useLiveMatch.ts")
        expect(hook.match(/type: "SYSTEM", divider: true/g)?.length).toBe(5)
        expect(hook).toMatch(/runtime\.canonicalMaps\.length === 1 && playedMaps\.length === 1/)
    })
})

describe("MATCHDAY-16: the dock says Paused and goes inert on the final board", () => {
    const bar = src("components/match/LiveMatchControlBar.tsx")
    test("a grey Paused badge replaces LIVE while paused mid-round", () => {
        expect(bar).toMatch(/\{pausedMidRound \? \([\s\S]*?t\("dock\.paused"\)[\s\S]*?\) : inProgress \?/)
    })
    test("auto tactics, speed, pacing and key rounds are disabled once finished", () => {
        expect(bar.match(/disabled=\{finished\}/g)?.length).toBe(4)
    })
})

describe("MATCHDAY-17/19/20: live and veto layout contracts", () => {
    test("MATCHDAY-17: killer and victim keep a minimum width; the location drops first on a narrow feed", () => {
        const feed = src("components/match/live/LiveFeed.tsx")
        expect(feed.match(/min-w-\[3ch\] shrink truncate font-semibold/g)?.length).toBe(2)
        expect(feed).toMatch(/@max-\[26rem\]:hidden" data-kill-location/)
        expect(feed).toMatch(/<section className="@container /)
    })
    test("MATCHDAY-19: the series score is a labelled line, not unlabelled pips", () => {
        const sb = src("components/match/LiveMatchScoreboard.tsx")
        expect(sb).not.toMatch(/SeriesPips/)
        expect(sb).toMatch(/t\("scoreboard\.series"/)
        expect(t("scoreboard.series", { n: 2, of: 3, home: 1, away: 0 })).toBe("Map 2 of 3 · Series 1–0")
    })
    test("MATCHDAY-20: a finished ban or pick keeps its team; the decider never repeats 'Decider'", () => {
        const veto = src("app/match/[id]/veto/page.tsx")
        expect(veto).toMatch(/const text = mapName \? \(by \? `\$\{mapName\} · \$\{by\}` : mapName\) : by \?\? "—"/)
    })
})
