/**
 * Tests for the circuit-engine tournament-identity primitives.
 *
 * These pure functions sit underneath every tournament-related code
 * path (registration, qualification, season-mapping, the v5 save
 * migration's dedup logic). Pinning them directly catches regressions
 * that would otherwise only surface at runtime as confused tournament
 * state across multiple seasons.
 */

import {
    getSeasonFromWeek,
    getSeriesIdFromTournamentId,
    getSeasonFromTournamentId,
    buildInstanceId,
    resolveTournamentIdentity,
    isSameSeriesSeason,
    isSameSeriesSeasonFromIds,
} from "@/engine/circuit-engine"

describe("getSeasonFromWeek", () => {
    test("week 1 → season 1", () => {
        expect(getSeasonFromWeek(1)).toBe(1)
    })

    test("week 52 → season 1 (boundary at end of season 1)", () => {
        expect(getSeasonFromWeek(52)).toBe(1)
    })

    test("week 53 → season 2 (start of season 2)", () => {
        expect(getSeasonFromWeek(53)).toBe(2)
    })

    test("week 104 → season 2", () => {
        expect(getSeasonFromWeek(104)).toBe(2)
    })

    test("week 105 → season 3", () => {
        expect(getSeasonFromWeek(105)).toBe(3)
    })

    test("zero/negative weeks clamp to season 1", () => {
        expect(getSeasonFromWeek(0)).toBe(1)
        expect(getSeasonFromWeek(-10)).toBe(1)
    })
})

describe("getSeriesIdFromTournamentId + getSeasonFromTournamentId", () => {
    test("id with explicit _sN suffix: series strips the suffix, season parses correctly", () => {
        expect(getSeriesIdFromTournamentId("iem_katowice_s3")).toBe("iem_katowice")
        expect(getSeasonFromTournamentId("iem_katowice_s3")).toBe(3)
    })

    test("id WITHOUT a season suffix: series returns as-is, season returns null", () => {
        expect(getSeriesIdFromTournamentId("blast_paris")).toBe("blast_paris")
        expect(getSeasonFromTournamentId("blast_paris")).toBeNull()
    })

    test("empty id is handled gracefully", () => {
        expect(getSeriesIdFromTournamentId("")).toBe("")
        expect(getSeasonFromTournamentId("")).toBeNull()
    })

    test("_s with non-numeric suffix doesn't parse a season", () => {
        // "iem_special" — _s is part of a regular word, not a season marker
        expect(getSeriesIdFromTournamentId("iem_special")).toBe("iem_special")
        expect(getSeasonFromTournamentId("iem_special")).toBeNull()
    })

    test("season 0 in the id is treated as missing (no positive integer)", () => {
        expect(getSeasonFromTournamentId("event_s0")).toBeNull()
    })
})

describe("buildInstanceId", () => {
    test("normal case: combines series + season", () => {
        expect(buildInstanceId("iem_katowice", 3)).toBe("iem_katowice_s3")
    })

    test("non-positive season clamps to 1", () => {
        expect(buildInstanceId("iem", 0)).toBe("iem_s1")
        expect(buildInstanceId("iem", -5)).toBe("iem_s1")
    })

    test("fractional season is floored", () => {
        expect(buildInstanceId("iem", 3.9)).toBe("iem_s3")
    })

    test("undefined/null season defaults to 1", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(buildInstanceId("iem", undefined as any)).toBe("iem_s1")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(buildInstanceId("iem", null as any)).toBe("iem_s1")
    })
})

describe("resolveTournamentIdentity", () => {
    test("id with explicit season: identity all comes from the id", () => {
        const ident = resolveTournamentIdentity("iem_katowice_s2", 200)
        expect(ident.seriesId).toBe("iem_katowice")
        expect(ident.seasonNumber).toBe(2)
        expect(ident.instanceId).toBe("iem_katowice_s2")
    })

    test("id WITHOUT season: derives season from fallbackWeek and constructs instanceId", () => {
        // Week 55 → season 2
        const ident = resolveTournamentIdentity("dreamhack_atlanta", 55)
        expect(ident.seriesId).toBe("dreamhack_atlanta")
        expect(ident.seasonNumber).toBe(2)
        expect(ident.instanceId).toBe("dreamhack_atlanta_s2")
    })

    test("no fallbackWeek defaults to season 1", () => {
        const ident = resolveTournamentIdentity("dreamhack_atlanta")
        expect(ident.seasonNumber).toBe(1)
        expect(ident.instanceId).toBe("dreamhack_atlanta_s1")
    })
})

describe("isSameSeriesSeason + isSameSeriesSeasonFromIds", () => {
    test("identical identities return true", () => {
        const a = { seriesId: "iem", instanceId: "iem_s1", seasonNumber: 1 }
        const b = { seriesId: "iem", instanceId: "iem_s1", seasonNumber: 1 }
        expect(isSameSeriesSeason(a, b)).toBe(true)
    })

    test("different seasons of the same series → false", () => {
        const a = { seriesId: "iem", instanceId: "iem_s1", seasonNumber: 1 }
        const b = { seriesId: "iem", instanceId: "iem_s2", seasonNumber: 2 }
        expect(isSameSeriesSeason(a, b)).toBe(false)
    })

    test("same season number but different series → false", () => {
        const a = { seriesId: "iem", instanceId: "iem_s1", seasonNumber: 1 }
        const b = { seriesId: "blast", instanceId: "blast_s1", seasonNumber: 1 }
        expect(isSameSeriesSeason(a, b)).toBe(false)
    })

    test("ids in different formats resolve to the same identity (round-trip)", () => {
        // One id has explicit season, the other doesn't but the fallback
        // resolves to the same season.
        // Week 55 → season 2, so "iem" with fallback=55 and "iem_s2" should match.
        expect(isSameSeriesSeasonFromIds("iem_s2", "iem", 55)).toBe(true)
    })
})
