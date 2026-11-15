/**
 * Match-day audit fixes (2026-11-15): regression tests for the logic behind
 * MATCHDAY-01..21 and CROSSCUT-01/11/17 that is testable outside the browser.
 * Screen-level checks were made in the running game (fixes/matchday/).
 */
import fs from "fs"
import path from "path"
import { fixtureNotDueYet } from "@/lib/playable-match"

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
