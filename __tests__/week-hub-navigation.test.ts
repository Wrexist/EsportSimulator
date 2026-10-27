/**
 * Phase 4.2: seven hubs (Home · Squad · Week · Match · Recruitment ·
 * Competition · Club), number keys follow them, every route belongs to the
 * right hub, and the cut screens redirect (Equipment → Facilities/Gear,
 * staff meeting → week plan booking, /match → the match centre target).
 */
import fs from "fs"
import path from "path"
import { GEAR_HREF, PRO_HIDDEN_HREFS, hubForPath, menuGroups, menuGroupsFor, navHubs, staffMeetingHref } from "@/lib/navigation"
import { NUMBER_KEY_ROUTES, SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { matchCentreHref, type MatchCentreState } from "@/app/match/match-centre"

const redirect = jest.fn((href: string) => { throw new Error(`NEXT_REDIRECT ${href}`) })
jest.mock("next/navigation", () => ({ redirect: (href: string) => redirect(href) }))

describe("seven hubs", () => {
    test("hub order and labels", () => {
        expect(navHubs.map(h => h.label)).toEqual(["Home", "Squad", "Week", "Match", "Recruitment", "Competition", "Club"])
    })

    test("FPL and Equipment are gone from the navigation; Legacy items live under Competition", () => {
        const hrefs = navHubs.flatMap(h => h.items.map(i => i.href))
        expect(hrefs).not.toContain("/fpl")
        expect(hrefs).not.toContain("/equipment")
        expect(navHubs.find(h => h.id === "legacy")).toBeUndefined()
        const competition = navHubs.find(h => h.id === "competition")!.items.map(i => i.href)
        expect(competition).toEqual(expect.arrayContaining(["/trophies", "/hall-of-fame"]))
    })

    test("Phase 4.7: the league opens Competition; the board is a Club tab", () => {
        expect(navHubs.find(h => h.id === "competition")!.items.map(i => i.href)).toEqual(["/league", "/tournaments", "/rankings", "/trophies", "/hall-of-fame"])
        const club = navHubs.find(h => h.id === "club")!.items.map(i => i.href)
        expect(club[0]).toBe("/finances")
        expect(club).toContain("/career/board")
        const board = menuGroups.flatMap(g => g.items).find(i => i.href === "/career/board")!
        expect(board.keywords).toMatch(/objectives/)
        expect(board.keywords).toMatch(/confidence/)
    })

    test("the Week hub holds the plan, training and the calendar", () => {
        expect(navHubs.find(h => h.id === "week")!.items.map(i => i.href)).toEqual(["/week", "/training", "/schedule"])
        expect(navHubs.find(h => h.id === "match")!.items[0].href).toBe("/match")
    })

    test("the search palette lists every hub and finds old names by keyword", () => {
        expect(menuGroups.map(g => g.label)).toEqual(navHubs.map(h => h.label))
        const facilities = menuGroups.flatMap(g => g.items).find(i => i.href === "/basecamp")!
        expect(facilities.keywords).toMatch(/equipment/)
        const plan = menuGroups.flatMap(g => g.items).find(i => i.href === "/week")!
        expect(plan.keywords).toMatch(/staff meeting/)
    })
})

describe("hubForPath covers every route", () => {
    const expected: Record<string, string | null> = {
        "/": "home",
        "/squad": "squad", "/staff": "squad", "/academy": "squad", "/stats": "squad", "/player/p1": "squad",
        "/week": "week", "/training": "week", "/schedule": "week", "/schedule/staff-meeting": "week",
        "/match": "match", "/match/m1/tactics": "match", "/match/m1/veto": "match", "/match/m1/live": "match", "/match/m1/result": "match",
        "/transfers": "recruitment", "/scouting": "recruitment",
        "/league": "competition",
        "/tournaments": "competition", "/tournaments/t1": "competition", "/rankings": "competition", "/trophies": "competition", "/hall-of-fame": "competition",
        "/finances": "club", "/sponsorships": "club", "/basecamp": "club", "/career": "club", "/career/board": "club", "/equipment": "club",
        "/settings": null, "/main-menu": null, "/new-game": null, "/load-game": null, "/desktop": null, "/credits": null, "/fpl": null,
    }

    test.each(Object.entries(expected))("%s → %s", (route, hub) => {
        expect(hubForPath(route)?.id ?? null).toBe(hub)
    })

    test("every page route in app/ is classified (a new screen must pick a hub or opt out)", () => {
        const root = path.resolve(__dirname, "..", "app")
        const routes: string[] = []
        const walk = (dir: string, prefix: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (!entry.isDirectory()) {
                    if (entry.name === "page.tsx") routes.push(prefix || "/")
                    continue
                }
                if (entry.name.startsWith("_") || entry.name.startsWith("(")) continue
                const seg = entry.name.startsWith("[") ? "x" : entry.name
                walk(path.join(dir, entry.name), `${prefix}/${seg}`)
            }
        }
        walk(root, "")
        const optOut = /^\/(settings|main-menu|new-game|load-game|desktop|credits|dev|map-editor|animations|fpl)(\/|$)/
        const unclassified = routes.filter(r => !optOut.test(r) && hubForPath(r) === null)
        expect(unclassified).toEqual([])
    })
})

describe("number keys follow the hubs", () => {
    test("1 and 3–8 open the seven hubs in order, 9 is settings, 2 stays the inbox", () => {
        const hubRoutes = navHubs.map(h => h.items[0].href)
        expect([NUMBER_KEY_ROUTES["1"], NUMBER_KEY_ROUTES["3"], NUMBER_KEY_ROUTES["4"], NUMBER_KEY_ROUTES["5"], NUMBER_KEY_ROUTES["6"], NUMBER_KEY_ROUTES["7"], NUMBER_KEY_ROUTES["8"]])
            .toEqual(hubRoutes)
        expect(NUMBER_KEY_ROUTES["9"]).toBe("/settings")
        expect(NUMBER_KEY_ROUTES["2"]).toBeUndefined()
    })

    test("the shortcut list describes the same keys", () => {
        const nav = SHORTCUT_GROUPS.find(g => g.label === "Navigation")!.shortcuts
        const describe = (key: string) => nav.find(s => s.keys[0] === key)?.description ?? ""
        expect(describe("4")).toMatch(/week/i)
        expect(describe("5")).toMatch(/match/i)
        expect(describe("8")).toMatch(/club/i)
    })
})

describe("cut screens redirect", () => {
    test("/equipment → Facilities, Gear tab", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { default: EquipmentRedirect } = require("@/app/equipment/page") as { default: () => void }
        expect(() => EquipmentRedirect()).toThrow(`NEXT_REDIRECT ${GEAR_HREF}`)
        expect(GEAR_HREF).toBe("/basecamp?tab=gear")
    })

    test("/schedule/staff-meeting → week plan with the meeting booking on the same day", async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { default: MeetingRedirect } = require("@/app/schedule/staff-meeting/page") as { default: (p: { searchParams: Promise<Record<string, string>> }) => Promise<void> }
        await expect(MeetingRedirect({ searchParams: Promise.resolve({ week: "12", day: "3" }) })).rejects.toThrow("NEXT_REDIRECT /week?book=meeting&week=12&day=3")
        await expect(MeetingRedirect({ searchParams: Promise.resolve({ week: "abc" }) })).rejects.toThrow("NEXT_REDIRECT /week?book=meeting")
        expect(staffMeetingHref()).toBe("/week?book=meeting")
    })
})

describe("/match → match centre target", () => {
    const team = (id: string) => ({ id, rosterIds: ["a", "b", "c", "d", "e"].map(x => `${id}_${x}`) })
    const players = ["me", "opp"].flatMap(t => ["a", "b", "c", "d", "e"].map(x => ({ id: `${t}_${x}` })))
    const base = (over: Partial<MatchCentreState> = {}): MatchCentreState => ({
        playerTeamId: "me", activeMatchId: null, currentWeek: 10, currentDay: 2, timeMode: "HYBRID_DAILY",
        teams: [team("me"), team("opp")], players, scheduledMatches: [], completedMatches: [], ...over,
    })
    const fixture = (id: string, week: number, day: number) => ({ id, week, day, homeTeamId: "me", awayTeamId: "opp" })

    test("a match in progress wins", () => {
        expect(matchCentreHref(base({ activeMatchId: "m1", scheduledMatches: [fixture("m1", 10, 2)] }))).toBe("/match/m1/live")
    })
    test("the playable fixture opens its prep", () => {
        expect(matchCentreHref(base({ scheduledMatches: [fixture("m1", 10, 1)] }))).toBe("/match/m1/tactics")
    })
    test("a fixture later this week still opens its prep", () => {
        expect(matchCentreHref(base({ scheduledMatches: [fixture("m2", 10, 5)] }))).toBe("/match/m2/tactics")
    })
    test("otherwise the latest result, else the calendar", () => {
        const done = [{ ...fixture("old", 8, 5) }, { ...fixture("last", 9, 6) }, { id: "x", week: 9, day: 6, homeTeamId: "a", awayTeamId: "b" }]
        expect(matchCentreHref(base({ completedMatches: done, scheduledMatches: [fixture("later", 12, 5)] }))).toBe("/match/last/result")
        expect(matchCentreHref(base())).toBe("/schedule")
    })
    test("no career → Home", () => {
        expect(matchCentreHref(base({ playerTeamId: null }))).toBe("/")
    })
})

test("a pro career's search palette leaves out the club-running screens", () => {
    const hrefs = menuGroupsFor(true).flatMap(g => g.items).map(i => i.href)
    expect(hrefs.some(h => PRO_HIDDEN_HREFS.has(h))).toBe(false)
    expect(hrefs).toContain("/career")
    expect(menuGroupsFor(false)).toBe(menuGroups)
})
