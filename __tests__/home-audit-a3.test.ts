/**
 * Regression tests for the 2026-11-15 Home audit fixes (HOME-01 … HOME-25).
 */
import { tournamentHref } from "@/components/ui/EntityLink"

describe("HOME-01: league draw links open the league table", () => {
    it("routes league division ids to /league", () => {
        expect(tournamentHref("league_s1_p1_cis_d4")).toBe("/league")
    })
    it("keeps real tournaments on their page", () => {
        expect(tournamentHref("iem_cologne_2026")).toBe("/tournaments/iem_cologne_2026")
    })
})
