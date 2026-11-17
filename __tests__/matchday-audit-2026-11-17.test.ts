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
