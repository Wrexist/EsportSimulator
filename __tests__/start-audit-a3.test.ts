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

describe("START-42 / START-40: Back never leaves the app", () => {
    const { canGoBackInApp, goBackOr } = require("@/lib/navigation-back") as typeof import("@/lib/navigation-back")
    const router = () => ({ back: jest.fn(), push: jest.fn() })
    const win = (navigation: unknown, length: number) => ({ navigation, history: { length } }) as unknown as Window
    test("the Navigation API decides when present (about:blank before the app is not app history)", () => {
        expect(canGoBackInApp(win({ canGoBack: false }, 2))).toBe(false)
        expect(canGoBackInApp(win({ canGoBack: true }, 2))).toBe(true)
    })
    test("without it, the history length", () => {
        expect(canGoBackInApp(win(undefined, 1))).toBe(false)
        expect(canGoBackInApp(win(undefined, 3))).toBe(true)
        expect(canGoBackInApp(undefined)).toBe(false)
    })
    test("goBackOr falls back to the given screen", () => {
        const r = router()
        goBackOr(r, "/main-menu", win({ canGoBack: false }, 2))
        expect(r.push).toHaveBeenCalledWith("/main-menu")
        expect(r.back).not.toHaveBeenCalled()
        const r2 = router()
        goBackOr(r2, "/main-menu", win({ canGoBack: true }, 2))
        expect(r2.back).toHaveBeenCalled()
    })
    test("Credits and the Draft Cup setup use it", () => {
        expect(src("app/credits/page.tsx")).toContain('goBackOr(router, "/main-menu")')
        const dc = src("app/new-game/draft-cup/page.tsx")
        expect(dc).toContain('goBackOr(router, "/main-menu")')
        expect(dc).toContain('t("dc.namesShort")')
        expect(dc).not.toContain("dc.newGame")
    })
})

describe("START-37: one row per action in the controls list", () => {
    const { SHORTCUT_GROUPS } = require("@/lib/keyboard-shortcuts") as typeof import("@/lib/keyboard-shortcuts")
    test("no action is listed twice (Space covers two contexts and Esc two meanings, by design)", () => {
        const all = SHORTCUT_GROUPS.flatMap(g => g.shortcuts.map(s => s.description))
        expect(all.length).toBe(new Set(all).size)
        const combos = SHORTCUT_GROUPS.flatMap(g => g.shortcuts.flatMap(s => [s.keys, ...(s.altKeys ? [s.altKeys] : [])].map(k => k.join("+"))))
        for (const k of ["Ctrl+S", "F2", "Ctrl+L", "F3", "F1", "?", "9", "F10"]) expect(combos).toContain(k)
        expect(all).not.toContain("shortcuts.quickSave")
        expect(all).not.toContain("shortcuts.openSettings")
    })
})

describe("START-32 / START-38 / START-39: settings", () => {
    test("the main-menu dialog has a fixed height and links to saves and achievements", () => {
        const modal = src("components/settings/SettingsModal.tsx")
        expect(modal).toContain("h-[min(720px,calc(100dvh-4rem))]")
        expect(modal).toContain('<Link href="/settings"')
    })
    test("volume sliders follow the sound switch; the page keeps preferences and names the game", () => {
        const sections = src("components/settings/SettingsSections.tsx")
        expect(sections.match(/disabled=\{!s\.soundEnabled\}/g)).toHaveLength(3)
        const page = src("app/settings/page.tsx")
        expect(page).not.toContain('localStorage.removeItem("skipQuickSimConfirm")')
        expect(page).not.toContain("settings.panel.language")
        expect(page).toContain("Esports Manager: FPS v")
        expect(src("app/credits/page.tsx")).toContain("Esports Manager: FPS ·")
        const en = src("locales/en/settings.ts")
        expect(en).not.toContain("Map Studio")
        expect(en).not.toContain("Text size is UI scale")
    })
})

describe("START-33: the Skip guide button", () => {
    test("its accessible name is its visible text; the way back is a tooltip and a toast", () => {
        const file = src("components/dashboard/GettingStartedChecklist.tsx")
        expect(file).not.toContain('aria-label={t("firstSession.skipLabel")}')
        expect(file).toContain('title={t("firstSession.skipLabel")}')
        expect(file).toContain('toast.info(t("firstSession.skipLabel"))')
        expect(src("locales/en/home.ts")).toContain("Settings → Gameplay → Replay")
    })
})

describe("START-43: the top bar outside a career", () => {
    test("shows the logotype to the main menu and no career search", () => {
        const bar = src("components/layout/TopBar.tsx")
        expect(bar).toContain('<Link href="/main-menu" aria-label={t("ng.mainMenu")}')
        expect(bar).toContain("{!hideCareerControls && <NavigationSearch")
    })
})
