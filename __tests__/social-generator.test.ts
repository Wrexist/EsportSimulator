/**
 * Social feed generator — guards the rewrite that replaced the old
 * Math.random() feed (which could render two identical posts side by side,
 * reshuffled every render, and referenced players[0] instead of the roster).
 */

import { generateSocialPosts, type SocialFeedInput } from "@/lib/social-generator"
import type {
    GameSave, TeamSaveData, PlayerSaveData, StaffSaveData,
    CompletedMatchSaveData, MatchSaveData,
} from "@/engine/save-types"

function makePlayer(id: string, over: Partial<PlayerSaveData> = {}): PlayerSaveData {
    return {
        id, nickname: id, name: `${id} Full`, age: 22, nationality: "SE",
        role: "RIFLER", skill: 70, potential: 85,
        ...over,
    } as unknown as PlayerSaveData
}

function makeTeam(id: string, over: Partial<TeamSaveData> = {}): TeamSaveData {
    return {
        id, name: `Team ${id}`, rosterIds: [], budget: 100_000,
        fanbase: 20_000, followers: 20_000, reputation: 50, worldRanking: 10,
        ...over,
    } as unknown as TeamSaveData
}

function makeInput(over: Partial<SocialFeedInput> = {}): SocialFeedInput {
    const roster = [makePlayer("ace"), makePlayer("smokey"), makePlayer("entryfrag")]
    const playerTeam = makeTeam("player", { rosterIds: roster.map(p => p.id), worldRanking: 5 })
    const rivalA = makeTeam("rivA", { worldRanking: 1 })
    const rivalB = makeTeam("rivB", { worldRanking: 2 })
    const rivalC = makeTeam("rivC", { worldRanking: 3 })
    const lastMatch = {
        id: "m1", homeTeamId: "player", awayTeamId: "rivA", week: 9,
        result: { homeScore: 2, awayScore: 1, winnerId: "player", mvpPlayerId: "ace" },
    } as unknown as CompletedMatchSaveData
    const rivalMatch = {
        id: "m2", homeTeamId: "rivB", awayTeamId: "rivC", week: 9,
        result: { homeScore: 2, awayScore: 0, winnerId: "rivB" },
    } as unknown as CompletedMatchSaveData
    const nextMatch = {
        id: "m3", homeTeamId: "player", awayTeamId: "rivB", week: 11,
    } as unknown as MatchSaveData
    return {
        playerTeam,
        teams: [playerTeam, rivalA, rivalB, rivalC],
        players: [...roster, makePlayer("listedGuy", { forSale: true } as never)],
        staff: [{ id: "c1", name: "Danny Sorensen", role: "coach", teamId: "player", level: 3 } as unknown as StaffSaveData],
        completedMatches: [lastMatch, rivalMatch],
        scheduledMatches: [nextMatch],
        currentWeek: 10,
        saveId: "save_test",
        ...over,
    }
}

describe("generateSocialPosts", () => {
    test("is deterministic for the same save + week, and changes across weeks", () => {
        const a = generateSocialPosts(makeInput())
        const b = generateSocialPosts(makeInput())
        expect(a).toEqual(b)

        const nextWeek = generateSocialPosts(makeInput({ currentWeek: 11 }))
        expect(nextWeek.map(p => p.content)).not.toEqual(a.map(p => p.content))
    })

    test("never renders two posts with identical content (the screenshot bug)", () => {
        const posts = generateSocialPosts(makeInput())
        const contents = posts.map(p => p.content)
        expect(new Set(contents).size).toBe(contents.length)
    })

    test("uses real game entities: roster MVP, coach, rival org, world top-3, fixture", () => {
        const posts = generateSocialPosts(makeInput())
        const all = posts.map(p => `${p.user.name} ${p.user.handle} ${p.content}`).join("\n")

        expect(all).toContain("ace")                 // MVP referenced by nickname
        expect(all).toContain("Danny Sorensen")      // real coach posts
        expect(all).toContain("Team rivB")           // rival org / rankings reference
        expect(all).toContain("Team rivA")           // world #1 in rankings or opponent
        // The user's own org account posts verified.
        const official = posts.find(p => p.teamId === "player")
        expect(official?.user.isVerified).toBe(true)
    })

    test("a player from the roster posts from their own handle after a win", () => {
        const posts = generateSocialPosts(makeInput())
        const playerPost = posts.find(p => p.user.handle === "@ace")
        expect(playerPost).toBeDefined()
        expect(playerPost!.user.isVerified).toBe(true)
    })

    test("handles empty data without crashing (no matches, no staff, no roster)", () => {
        const input = makeInput({
            completedMatches: [], scheduledMatches: [], staff: [],
            playerTeam: makeTeam("player", { rosterIds: [] }),
            players: [],
        })
        const posts = generateSocialPosts(input)
        expect(Array.isArray(posts)).toBe(true)
        // Rankings post still works from teams alone.
        expect(posts.length).toBeGreaterThan(0)
    })

    test("returns empty for no player team", () => {
        expect(generateSocialPosts(makeInput({ playerTeam: undefined }))).toEqual([])
    })
})
