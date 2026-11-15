/**
 * Start-screen audit fixes (2026-11-15, area "start"). The screens run in the
 * browser only, so most checks read the component source; the logic they
 * rely on is exercised directly where it is pure.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { potentialOvr } from "@/lib/potential-ovr"

const src = (path: string) => readFileSync(join(__dirname, "..", path), "utf8")

describe("START-24 / MODES-16: roster builder potential is on the OVR scale", () => {
    const file = src("components/onboarding/RosterBuilderModal.tsx")
    test("the column shows potentialOvr, not raw skill → potential", () => {
        expect(file).toContain("potOvr: potentialOvr(p)")
        expect(file).not.toMatch(/player\.skill \|\| 50\)\} →/)
        expect(file).toContain('case "potential": return b.potOvr - a.potOvr')
    })
    test("a high-OVR pro never shows a potential below his OVR", () => {
        const pro = { id: "x", nickname: "x", age: 24, role: "RIFLER", skill: 78, potential: 81, aim: 95, reflexes: 92, rifle: 80, gameSense: 85 } as never
        expect(potentialOvr(pro)).toBeGreaterThanOrEqual(evaluatePlayer(pro).overallRating)
    })
})

describe("START-29: one name per club region", () => {
    const { clubRegionName, eventRegionName } = require("@/lib/display-names") as typeof import("@/lib/display-names")
    test("every club region code in the snapshot has a name", () => {
        const teams = JSON.parse(src("public/data/snapshot/teams.json")) as { region: string }[]
        // CIS and MENA are names already; every other code is translated.
        for (const code of new Set(teams.map(tm => tm.region))) {
            if (code !== "CIS" && code !== "MENA") expect(clubRegionName(code)).not.toBe(code)
        }
        expect(clubRegionName("BR")).toBe("South America")
        expect(clubRegionName("OCE")).toBe("Oceania")
        expect(clubRegionName("OCEANIA")).toBe("Oceania")
        expect(clubRegionName("EU")).toBe("Europe")
        expect(eventRegionName("BR")).toBe(clubRegionName("BR"))
    })
    test("the picker's detail pane and the pro setup use it", () => {
        expect(src("app/new-game/page.tsx")).toContain("{clubRegionName(selectedTeam.region)} ·")
        expect(src("app/new-game/pro/page.tsx")).toContain("clubRegionName(r)")
        expect(src("locales/en/newgame.ts")).not.toContain('"pro.region.EU"')
    })
})

describe("START-25: the club list fits 1024 px", () => {
    const file = src("app/new-game/page.tsx")
    test("narrower detail pane below 1280 px, fixed table, region folded under the name", () => {
        expect(file).toContain("lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_460px]")
        expect(file).toContain("w-full table-fixed border-collapse")
        expect(file).toMatch(/hidden w-36 px-3 xl:table-cell/)
    })
})

describe("START-34: one difficulty vocabulary", () => {
    const en = src("locales/en/newgame.ts")
    test("Create team's easiest level is Relaxed like an existing club's; the no-club start says Normal", () => {
        expect(en).toContain('"ct.diff.story": "Relaxed"')
        expect(en).toContain('"ng.diff.easy": "Relaxed"')
        expect(en).not.toContain("ng.diffScope")
        expect(en).toMatch(/"ng\.path\.unemployed\.sub": "[^"]*Normal difficulty/)
    })
})

describe("START-44: one phrasing for rank targets", () => {
    test("job offers say 'ranked #N or better' like the picker and the board", () => {
        const en = src("locales/en/legacy.ts")
        expect(en).toContain('"job.boardGoalRank": "Board: {{goal}}, finish the season ranked #{{rank}} or better."')
    })
    test("MODES-31: the sandbox switch has a visible tooltip", () => {
        expect(src("app/new-game/page.tsx")).toMatch(/<TooltipContent[^>]*>\{t\("ng\.sandboxHint"\)\}<\/TooltipContent>/)
    })
})

describe("START-36: load game", () => {
    const file = src("app/load-game/page.tsx")
    test("imported copies are tagged and a recovery without backup hides Recover", () => {
        expect(file).toContain('slot.saveId?.startsWith("imported_")')
        expect(file).toContain("noBackupIds.has(slot.saveId)")
        expect(src("engine/save-manager.ts")).toContain("migrated.saveId = `imported_")
    })
})

describe("START-26 / CROSSCUT-16 / START-44: the board brief fits short windows", () => {
    const file = src("components/moments/WelcomeMomentView.tsx")
    test("tightens below 800 px of height and puts the cards side by side from 768 px", () => {
        expect(file).toContain("[@media(max-height:800px)]:h-16")
        expect(file).toContain("[@media(max-height:800px)]:text-[length:clamp(32px,min(5.4vw,7vh),72px)]")
        expect(file).toContain("md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")
    })
    test("a practice fixture reads as on Home", () => {
        expect(file).toContain('first.isScrim ? `${t("common.scrim")} · ${t("home.practiceMatch")}`')
    })
})
