/**
 * Squad audit 2026-11-17: regressions for the squad-area fixes.
 */
import path from "node:path"
import { SnapshotLoader } from "@/data/snapshot-loader"
import type { GameSave, PlayerSaveData, StaffSaveData } from "@/engine/save-types"
import { renderToStaticMarkup } from "react-dom/server"
import { produce, enableMapSet } from "immer"
import { createAcademySlice, DEFAULT_ACADEMY_WEEK } from "@/store/slices/academy-slice"
import { ACADEMY_LEVELS } from "@/engine/academy-constants"
import type { StoreState } from "@/store/types"
import { Trans } from "@/lib/trans"
import { t } from "@/lib/i18n"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { benchedUpgrade, startingSwapFor } from "@/lib/lineup-upgrade"
import { scoutReportTier, STAFF_ROLE_ORDER } from "@/components/staff/staff-effects"
import { hubForPath } from "@/lib/navigation"

enableMapSet()

describe("NEWPLAYER-01: a better signing on the bench", () => {
    let save: GameSave
    beforeAll(async () => {
        const loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
        await loader.loadSnapshot()
        save = loader.createCareerFromSnapshot("NP01", loader.getSnapshot()!.teams[0].id, 1, 3917)!
    }, 60_000)
    const ovr = (p: PlayerSaveData) => evaluatePlayer(p).overallRating

    test("the reveal swaps him with the weakest starter of his role; prep flags the benched upgrade", () => {
        const team = save.teams.find(tm => tm.rosterIds.length >= 5)!
        const starters = team.rosterIds.slice(0, 5).map(id => save.players.find(p => p.id === id)!)
        const weakest = starters.reduce((w, p) => (ovr(p) < ovr(w) ? p : w))
        const signing = save.players.find(p => p.role === weakest.role && !p.isRetired && !p.injury && ovr(p) > ovr(weakest) + 5 && !save.teams.some(tm => tm.rosterIds.includes(p.id)))!
        expect(signing).toBeDefined()
        const roster = [...team.rosterIds.slice(0, 5), signing.id]
        const sameRole = starters.filter(p => p.role === signing.role)
        const target = sameRole.reduce((w, p) => (ovr(p) < ovr(w) ? p : w))
        const swap = startingSwapFor(roster, save.players, signing.id)!
        expect(swap).toMatchObject({ benchId: signing.id, benchIndex: 5, starterId: target.id, starterIndex: roster.indexOf(target.id) })
        expect(benchedUpgrade(roster, save.players)).toMatchObject({ benchId: signing.id, starterId: target.id })
        // Already starting, or not better: nothing to offer.
        expect(startingSwapFor([signing.id, ...roster.slice(1, 5), roster[0]], save.players, signing.id)).toBeNull()
        const swapped = roster.map(id => (id === target.id ? signing.id : id === signing.id ? target.id : id))
        expect(startingSwapFor(swapped, save.players, target.id)).toBeNull()
        expect(benchedUpgrade(swapped, save.players)).toBeNull()
        // An injured bench player is not suggested.
        const hurt = save.players.map(p => (p.id === signing.id ? { ...p, injury: { type: "MINOR" } as never } : p))
        expect(startingSwapFor(roster, hurt, signing.id)).toBeNull()
        expect(benchedUpgrade(roster, hurt)).toBeNull()
    })

    test("the reveal line says best possible five", () => {
        expect(t("mo.sign.bestFive")).toBe("Best possible five OVR")
        expect(t("mo.sign.start", { name: "NioLife" })).toBe("Start him (replaces NioLife)")
    })
})

function academyHarness(initial: Partial<StoreState>) {
    let state = initial as StoreState
    const set = (patch: Partial<StoreState> | ((draft: StoreState) => void)) => {
        state = typeof patch === "function" ? produce(state, patch as (s: StoreState) => void) : { ...state, ...patch }
    }
    return { state: () => state, slice: createAcademySlice(set as never, () => state) }
}

describe("SQUAD-51: a new academy trains from the first update", () => {
    const base = (overrides: Partial<StoreState> = {}): Partial<StoreState> => ({
        teams: [{ id: "me", name: "me", budget: 10_000_000, rosterIds: [], academyFacility: undefined } as never],
        players: [
            { id: "p1", nickname: "Kid", role: "AWPER", age: 17, skill: 50, potential: 80 } as never,
            { id: "p2", nickname: "Kid2", role: "AWPER", age: 17, skill: 50, potential: 80 } as never,
        ],
        contracts: [], staff: [], academyPlayers: [], academyPendingProspects: [],
        academyRoster: { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null } as never,
        academyTrainingSchedule: {} as never, newsFeed: [], eventsLog: [], financeLedger: [],
        lastRngSeed: 1, currentWeek: 5, playerTeamId: "me",
        ...(overrides as object),
    })

    test("building seeds the default week; a set schedule is kept", () => {
        const h = academyHarness(base())
        expect(h.slice.buildAcademy("me").success).toBe(true)
        expect(h.state().academyTrainingSchedule).toMatchObject(DEFAULT_ACADEMY_WEEK)
        const kept = academyHarness(base({ academyTrainingSchedule: { 2: "tactics_basic" } as never }))
        kept.slice.buildAcademy("me")
        expect(kept.state().academyTrainingSchedule).toEqual({ 2: "tactics_basic" })
        expect(ACADEMY_LEVELS[1].buildCost).toBeGreaterThan(0)
    })

    test("an enrolled prospect takes his role's slot, else a free one", () => {
        const h = academyHarness(base({ teams: [{ id: "me", name: "me", budget: 10_000_000, rosterIds: [], academyFacility: { level: 3, builtWeek: 1 } } as never] }))
        expect(h.slice.enrollProspect("p1").success).toBe(true)
        expect(h.slice.enrollProspect("p2").success).toBe(true)
        const roster = h.state().academyRoster as Record<string, string | null>
        const ids = h.state().academyPlayers.map(ap => ap.id)
        expect(roster.AWPer).toBe(ids[0])
        expect(Object.values(roster)).toContain(ids[1])
    })
})

describe("NEWPLAYER-04 and SQUAD-59", () => {
    test("a scout shows the report tier his accuracy gives, not his staff level", () => {
        const scout = (accuracy: number) => ({ id: "s", role: "scout", level: 5, stats: { accuracy } } as unknown as StaffSaveData)
        expect(scoutReportTier(scout(30))).not.toBe(scoutReportTier(scout(99)))
        expect(STAFF_ROLE_ORDER).toEqual(["coach", "analyst", "psychologist", "scout"])
    })

    test("Trans picks the plural form with count", () => {
        const b = (v: string) => <b>{v}</b>
        expect(renderToStaticMarkup(<Trans k="player.pointsToSpend" count={1} tags={{ b }} />)).toBe("<b>1</b> point to spend")
        expect(renderToStaticMarkup(<Trans k="player.pointsToSpend" count={3} tags={{ b }} />)).toBe("<b>3</b> points to spend")
    })
})

test("SQUAD-54: area eyebrows follow Season N · <section>", () => {
    expect(t("st.eyebrow", { season: 2 })).toBe("Season 2 · Squad")
    expect(t("ac.eyebrowLevel", { season: 1, n: 3 })).toBe("Season 1 · Academy level 3")
    expect(t("tr.eyebrowWeek", { season: 1, n: 4 })).toBe("Season 1 · Week 4 · Training")
})

describe("SQUAD-55: your own club page sits under Squad", () => {
    test("hubForPath maps /team/<own id> to Squad, other clubs to Competition", () => {
        expect(hubForPath("/team/team_1", "team_1")?.id).toBe("squad")
        expect(hubForPath("/team/team%201", "team 1")?.id).toBe("squad")
        expect(hubForPath("/team/team_2", "team_1")?.id).toBe("competition")
        expect(hubForPath("/team/team_1")?.id).toBe("competition")
    })
})
