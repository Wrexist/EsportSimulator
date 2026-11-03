/**
 * ENGINE-04 / CROSSCUT-04: ledger rows written for clubs the manager does
 * not run show in Finances once he takes the club over, so they must read
 * like his own rows: no "AI" and no raw facility enum values. Rows written
 * by older builds are rewritten on load.
 */

import { manageAcademy, manageFacilities, manageStaff } from "@/engine/ai/infrastructure"
import { modernizeFacilityDescription, modernizeLedgerDescription } from "@/engine/ledger-wording"
import { runMigrationLadder } from "@/engine/save-migrations"
import { SeededRNG } from "@/engine/rng"
import { readFileSync } from "fs"
import { join } from "path"
import { createLaunchFixture } from "../scripts/launch/fixtures"
import type { GameSave, TeamSaveData } from "@/engine/save-types"

// The wording is under test here, not the AI budget rule: every commit passes.
jest.mock("@/engine/ai/club-budget", () => ({
    ...jest.requireActual("@/engine/ai/club-budget"),
    aiCanCommit: () => true,
    aiClubBudget: () => ({ income: 1_000_000, costs: 0, net: 1_000_000, margin: 0, headroom: 1_000_000 }),
}))

/** An RNG whose every roll passes the low-probability AI gates. */
function alwaysRng(): SeededRNG {
    const rng = new SeededRNG(7)
    rng.next = () => 0.001
    return rng
}

function richAiClub(save: GameSave): TeamSaveData {
    const team = save.teams.find(t => t.id !== save.playerTeamId)!
    team.budget = 50_000_000
    team.financialState = "STABLE"
    team.facilities = []
    team.academyFacility = undefined
    save.staff = save.staff.filter(s => s.teamId !== team.id)
    team.staffIds = []
    return team
}

describe("AI club ledger rows use neutral wording", () => {
    test("regression: hiring, building and upgrading write no 'AI' and no raw enum", () => {
        const save = createLaunchFixture("first-week", 4401)
        const team = richAiClub(save)
        const before = save.financeLedger.length
        for (let i = 0; i < 12; i++) {
            save.currentWeek += 1
            manageStaff(team, save, alwaysRng())
            manageFacilities(team, save, alwaysRng())
            manageAcademy(team, save, alwaysRng())
        }
        const rows = save.financeLedger.slice(before).filter(r => r.teamId === team.id)
        const text = rows.map(r => r.description)
        expect(text.some(d => d.startsWith("Hired "))).toBe(true)
        expect(text.some(d => d.startsWith("Built ") && d.endsWith(" facility"))).toBe(true)
        expect(text.some(d => /^Upgraded .+ facility to level \d$/.test(d))).toBe(true)
        expect(text).toContain("Built youth academy")
        expect(text.some(d => /^Upgraded youth academy to level \d$/.test(d))).toBe(true)
        for (const d of text) {
            expect(d).not.toMatch(/\bAI\b/)
            expect(d).not.toMatch(/TRAINING|RECOVERY|TACTICAL|FANZONE/)
        }
        for (const f of team.facilities ?? []) expect(f.description).not.toMatch(/TRAINING|RECOVERY|TACTICAL|FANZONE/)
    })

    test("older wording is rewritten", () => {
        expect(modernizeLedgerDescription("AI hired Dr. Smith (coach)")).toBe("Hired Dr. Smith (coach)")
        expect(modernizeLedgerDescription("AI built TRAINING facility")).toBe("Built training facility")
        expect(modernizeLedgerDescription("AI built FANZONE facility")).toBe("Built fan zone facility")
        expect(modernizeLedgerDescription("AI upgraded TACTICAL facility to Level 3")).toBe("Upgraded tactical facility to level 3")
        expect(modernizeLedgerDescription("AI built Youth Academy")).toBe("Built youth academy")
        expect(modernizeLedgerDescription("AI upgraded Youth Academy to Level 2")).toBe("Upgraded youth academy to level 2")
        expect(modernizeLedgerDescription("AI something else")).toBe("Something else")
        expect(modernizeLedgerDescription("Weekly wages")).toBe("Weekly wages")
        expect(modernizeFacilityDescription("AI-assisted strategic simulator.")).toBe("Data-driven strategic simulator.")
        expect(modernizeFacilityDescription("TRAINING facility")).toBe("Training facility")
        expect(modernizeFacilityDescription("Basic training setup")).toBe("Basic training setup")
    })

    test("regression: loading an existing save rewrites its old 'AI …' ledger rows", () => {
        const save = createLaunchFixture("first-week", 4402)
        const other = save.teams.find(t => t.id !== save.playerTeamId)!.id
        const row = (id: string, description: string) => ({ id, week: 1, teamId: other, type: "EXPENSE", category: "FACILITIES", amount: 1, description, balance: 1 })
        save.financeLedger.push(
            row("a", "AI built RECOVERY facility") as never,
            row("b", "AI hired Dr. Kovac (analyst)") as never,
            row("c", "Prize money") as never,
        )
        const club = save.teams.find(t => t.id === other)!
        club.facilities = [
            ...(club.facilities ?? []),
            { id: "old_tac", type: "TACTICAL", level: 4, monthlyCost: 1, description: "AI-assisted strategic simulator." },
            { id: "old_ai_built", type: "FANZONE", level: 1, monthlyCost: 1, description: "FANZONE facility" },
        ] as never
        const loaded = runMigrationLadder(JSON.parse(JSON.stringify(save)))
        const byId = new Map(loaded.financeLedger.map(r => [r.id, r.description]))
        expect(byId.get("a")).toBe("Built recovery facility")
        expect(byId.get("b")).toBe("Hired Dr. Kovac (analyst)")
        expect(byId.get("c")).toBe("Prize money")
        const facilities = loaded.teams.flatMap(t => t.facilities ?? [])
        expect(facilities.find(f => f.id === "old_tac")?.description).toBe("Data-driven strategic simulator.")
        expect(facilities.find(f => f.id === "old_ai_built")?.description).toBe("Fan zone facility")
        expect(loaded.financeLedger.some(r => r.description.startsWith("AI "))).toBe(false)
    })
})

describe("no player-facing 'AI' wording (CROSSCUT-04)", () => {
    // Strings only: identifiers (aiRoll, AIManager) and comments are fine.
    const stringsIn = (file: string): string[] => {
        const src = readFileSync(join(__dirname, "..", file), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "")
            .replace(/\s\/\/.*$/gm, "")
        const jsx = Array.from(src.matchAll(/>([^<>]+)</g), m => m[1])
        const literals = Array.from(src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g), m => m[2])
        return [...jsx, ...literals]
    }

    test.each([
        "app/basecamp/_components/GearCatalog.tsx",
        "store/slices/team-facilities-slice.ts",
        "engine/ai/infrastructure.ts",
    ])("%s", file => {
        expect(stringsIn(file).filter(s => /\bAI\b/.test(s))).toEqual([])
    })
})
