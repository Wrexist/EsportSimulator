/**
 * Match-day audit fixes (2026-11-17): regression tests for MATCHDAY-01..25 and
 * NEWPLAYER-07/08/10/14/18/20 where the logic is testable outside the
 * browser. Screen-level checks were made in the running game (fixes/matchday/).
 */
import fs from "fs"
import path from "path"
import { historyWindow, roundLabel } from "@/components/match/LiveMatchScoreboard"
import { t } from "@/lib/i18n"

const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8")

describe("MATCHDAY-16/17: the scorebug in overtime", () => {
    const rounds = (n: number, homeWins: (r: number) => boolean) =>
        Array.from({ length: n }, (_, i) => ({ round: i + 1, winner: homeWins(i + 1) ? "home" as const : "away" as const }))

    test("regulation: 24 cells, nothing folded", () => {
        expect(historyWindow(rounds(10, r => r % 2 === 0), 11)).toEqual({ from: 1, to: 24, folded: [] })
        expect(historyWindow(rounds(24, r => r <= 12), 24)).toEqual({ from: 1, to: 24, folded: [] })
    })
    test("overtime shows only the running MR3 set, regulation folded into its score", () => {
        const w = historyWindow(rounds(26, r => r <= 12 || r === 25), 27)
        expect(w.from).toBe(25)
        expect(w.to).toBe(30)
        expect(w.folded).toEqual([{ from: 1, to: 24, home: 12, away: 12 }])
    })
    test("a later set folds the earlier sets too; the strip never grows past 6 cells + chips (Anubis 16–19, 35 rounds)", () => {
        // 12–12, OT1 3–3, OT2: home wins 31, away 32–35 → 16–19
        const homeWins = (r: number) => r <= 12 || (r >= 25 && r <= 27) || r === 31
        const w = historyWindow(rounds(35, homeWins), 35)
        expect(w.from).toBe(31)
        expect(w.to).toBe(36)
        expect(w.folded).toEqual([
            { from: 1, to: 24, home: 12, away: 12 },
            { from: 25, to: 30, home: 3, away: 3 },
        ])
        expect(w.to - w.from + 1).toBeLessThanOrEqual(6)
    })
    test("the break after an overtime set already shows the next set (round 31 about to start)", () => {
        expect(historyWindow(rounds(30, r => r % 2 === 0), 31).from).toBe(31)
        // ...while the set's last round is still the one on screen
        expect(historyWindow(rounds(30, r => r % 2 === 0), 30).from).toBe(25)
    })
    test("round label: regulation keeps 'RND n / 24'; overtime names the set and its round", () => {
        expect(roundLabel(7)).toBe(t("scoreboard.rnd", { n: 7 }))
        expect(roundLabel(25)).toBe("OT 1 · RND 1 / 6")
        expect(roundLabel(30)).toBe("OT 1 · RND 6 / 6")
        expect(roundLabel(35)).toBe("OT 2 · RND 5 / 6")
    })
    test("the loss bonus row is clipped and can never be drawn under the score", () => {
        const sb = src("components/match/LiveMatchScoreboard.tsx")
        expect(sb).toMatch(/flex min-w-0 items-center gap-3 overflow-hidden">\s*\{!finished && <LossBonus level=\{homeLossLevel\}/)
        expect(sb).toMatch(/flex min-w-0 flex-row-reverse items-center gap-3 overflow-hidden">\s*\{!finished && <LossBonus level=\{awayLossLevel\}/)
        expect(sb).not.toMatch(/Math\.max\(24, rounds\.length\)/)
    })
})

describe("live hook: round end (MATCHDAY-01, MATCHDAY-14)", () => {
    const hook = src("hooks/useLiveMatch.ts")
    test("MATCHDAY-01: a round end no longer resets the scorebug clock to 1:55 (the next round start does)", () => {
        expect(hook).not.toMatch(/settle\(\)/)
        const start = hook.slice(hook.indexOf("const startNextRound = useCallback"), hook.indexOf("startNextRoundRef.current = startNextRound"))
        expect(start).toMatch(/setRoundTime\(ROUND_SECONDS\)/)
        expect(start).toMatch(/setBombTime\(BOMB_SECONDS\)/)
    })
    test("MATCHDAY-14: a played-out match ends the feed with the same Final line as a skipped one", () => {
        const seriesEnd = hook.slice(hook.indexOf('if (transition === "SERIES_END") {'), hook.indexOf('} else if (transition === "MAP_END") {'))
        expect(seriesEnd).toMatch(/divider: true, message: finalFeedLine\(runtime, runtime\.result\.maps, roundState\)/)
        expect(hook).toMatch(/const finalLine = finalFeedLine\(runtime, done\.state\.maps, sim\)/)
    })
})

describe("live feed (MATCHDAY-06, MATCHDAY-12)", () => {
    test("MATCHDAY-06: the round-end line names the winner first, no '(Winner: X)' suffix", () => {
        expect(t("feed.roundEnd", { team: "Trock Drivers", line: "The defence holds firm." })).toBe("Trock Drivers · The defence holds firm.")
        for (const lang of ["de", "es", "fr", "pl", "pt-BR", "ru"]) {
            const json = JSON.parse(src(`public/locales/${lang}.json`)) as Record<string, string>
            expect(json["feed.roundEnd"]).toBe("{{team}} · {{line}}")
        }
    })
    test("MATCHDAY-12: killer and victim keep at least six letters; tags shrink to a dot on a narrow feed", () => {
        const feed = src("components/match/live/LiveFeed.tsx")
        expect(feed.match(/min-w-\[7ch\] shrink truncate/g)?.length).toBe(2)
        expect(feed).not.toMatch(/min-w-\[3ch\]/)
        expect(feed).toMatch(/@max-\[20rem\]:sr-only">\{tag\.label\}/)
    })
})

describe("MATCHDAY-15: the radar scrubber's bomb clock turns with the scorebug", () => {
    test("the label is refreshed when it changes, not only on whole round seconds", () => {
        const scrub = src("components/match/RadarScrubber.tsx")
        expect(scrub).toMatch(/if \(\(sec !== lastSecond \|\| label !== lastLabel\) && timeRef\.current\)/)
    })
})

describe("MATCHDAY-02: the leave dialog and the lock around a paused match agree", () => {
    test("the dialog says the rest of the game is locked; the lock says the match is paused and resumes it", () => {
        expect(t("dock.leaveBody")).toMatch(/rest of the game is locked until the match is finished/)
        expect(t("guard.body")).toMatch(/paused/)
        expect(t("guard.back")).toBe("Resume match")
        const guard = src("components/layout/MatchNavigationGuard.tsx")
        expect(guard).toMatch(/router\.push\(`\/match\/\$\{activeMatchId\}\/live`\)/)
    })
    test("the top bar's match-day notice (Prepare / Sim match) is hidden while that match is being played", () => {
        const ctl = src("components/report/AdvanceControl.tsx")
        expect(ctl).toMatch(/!\(advanceStop\.kind === "match" && \(!pendingMatchId \|\| pendingIsLive\)\) && <StopNotice \/>/)
    })
})

describe("match prep (MATCHDAY-03/23/25, NEWPLAYER-08/10/14)", () => {
    const prep = src("app/match/[id]/tactics/page.tsx")
    test("MATCHDAY-03: on one column the primary action comes right under the header", () => {
        expect(prep).toMatch(/<aside className="contents min-w-0 xl:block xl:space-y-4">/)
        expect(prep).toMatch(/<Panel className="order-first xl:order-none" title=\{liveProgress/)
    })
    test("MATCHDAY-23: a fixture later this week is locked with its day; veto, start and quick sim refuse with the date", () => {
        expect(prep).toMatch(/const notDue = !!match && fixtureNotDueYet\(\{ currentWeek, currentDay, timeMode \}, match\)/)
        expect(prep).toMatch(/\) : notDue \? \(\s*<Button disabled variant="outline"[^>]*data-testid="prep-plays-on">/)
        for (const fn of ["handleQuickSim", "handleAutoVeto", "handleStartMatch"]) {
            const body = prep.slice(prep.indexOf(`const ${fn} = `), prep.indexOf(`const ${fn} = `) + 400)
            expect(body).toMatch(/if \(refuseNotDue\(\)\) return/)
        }
        expect(prep).toMatch(/&& !notDue && !completedMatches\.some/)
        expect(t("prep.unlocksOn", { date: "Monday, Nov 30" })).toBe("This match is played on Monday, Nov 30. Advance the days to play it.")
        expect(t("prep.playsOn", { date: "Monday, Nov 30" })).toBe("Plays Monday, Nov 30")
    })
    test("MATCHDAY-25: a played match shows score and outcome instead of the stakes", () => {
        expect(prep).toMatch(/\{played \? \(\s*<div[^>]*data-testid="prep-played-outcome">/)
        expect(prep).toMatch(/data-testid="prep-played-score"/)
    })
    test("NEWPLAYER-08: the win chance has a Why? with the factors", () => {
        expect(prep).toMatch(/<details[^>]*data-testid="win-why">/)
        expect(t("prep.why.ratingDown", { n: "2.4" })).toBe("Their five rate 2.4 points higher in duels (aim and condition).")
        expect(t("prep.why.map", { map: "Inferno", pct: 41, own: "Neutral", their: "Best map" })).toBe("Inferno: 41% · comfort: you Neutral, them Best map")
    })
    test("NEWPLAYER-10: the counter math sits behind 'How much is this worth?'; the tip no longer says 'honest'", () => {
        expect(prep).toMatch(/<details[^>]*data-testid="counter-math">[\s\S]{0,400}prep\.worthIt[\s\S]{0,300}prep\.counterExplain/)
        expect(t("tip.tactics.1")).not.toMatch(/honest/i)
        const honest: Record<string, RegExp> = { de: /ehrlich/i, es: /honesta/i, fr: /honnête/i, pl: /uczciw/i, "pt-BR": /honesta/i, ru: /честн/i }
        for (const [lang, re] of Object.entries(honest)) {
            const json = JSON.parse(src(`public/locales/${lang}.json`)) as Record<string, string>
            expect(json["tip.tactics.1"]).not.toMatch(re)
        }
    })
    test("NEWPLAYER-10: the squad load chip names the injury risk, with a 0.1% floor", () => {
        expect(t("load.chip", { band: "Fresh", risk: "0.1%" })).toBe("Fresh · 0.1% injury risk")
        expect(src("components/squad/LoadChip.tsx")).toMatch(/riskPct\(Math\.max\(w\.risk, 0\.001\)\)/)
    })
    test("NEWPLAYER-14: qualifier path line, upcoming fixtures in 'Your matches', no filler sentence", () => {
        expect(t("prep.qualPath.other", { count: 3, event: "Closed Qualifier", k: 2 })).toBe("3 wins away from Closed Qualifier (top 2 go through).")
        expect(prep).toMatch(/data-testid="prep-qual-path"/)
        const tm = src("app/tournaments/[id]/page.tsx")
        expect(tm).toMatch(/const upcomingMatches = scheduledMatches/)
        expect(tm).toMatch(/if \(playerMatches\.length === 0 && upcomingMatches\.length === 0\) return emptyBlock/)
        expect(src("data/tournaments.json")).not.toMatch(/purest form of competitive meritocracy/)
    })
})
