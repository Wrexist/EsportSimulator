/**
 * SMOKE-B-06: the branding pass replaces trademarks as whole words only, so
 * "OG" → "OverGrowth" never lands inside "Cologne" or "recognition".
 */
import fs from "fs"
import path from "path"
import { safeDescription, safeTournamentName, TEAM_NAME_MAP, TOURNAMENT_NAME_MAP, SPONSOR_NAME_MAP } from "@/lib/safe-branding/name-transform"
import { runMigrationLadder } from "@/engine/save-migrations"
import { CURRENT_SAVE_VERSION } from "@/engine/save-types"

describe("safe-branding whole-word transform (SMOKE-B-06)", () => {
    it("leaves words that only contain a key alone", () => {
        expect(safeTournamentName("Cologne Open")).toBe("Cologne Open")
        expect(safeDescription("A chance to earn recognition and prize money.")).toBe("A chance to earn recognition and prize money.")
        expect(safeDescription("A conference of rising talent")).toBe("A conference of rising talent")
    })

    it("still rewrites the trademarks themselves", () => {
        expect(safeTournamentName("IEM Cologne 2025")).toBe("Summer Open Colone 2025")
        expect(safeTournamentName("iem_katowice_2025")).toBe("Winter Open_katowice_2025") // ids: "_" separates words, as before
        expect(safeDescription("OG beat FaZe at the PGL Major.")).toBe("OverGrowth beat Phaze at the Premier Major.")
    })

    it("no shipped tournament text has a brand replacement inside a word", () => {
        const file = path.join(process.cwd(), "data", "tournaments.json")
        const text = fs.readFileSync(file, "utf8")
        const values = new Set([...Object.values(TOURNAMENT_NAME_MAP), ...Object.values(TEAM_NAME_MAP), ...Object.values(SPONSOR_NAME_MAP)])
        expect(text).not.toMatch(/[A-Za-z]OverGrowth|OverGrowth[a-z]/)
        for (const v of values) {
            const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            expect({ v, hit: new RegExp(`[A-Za-z]${esc}|${esc}[a-z]`).test(text) }).toEqual({ v, hit: false })
        }
    })

    it("a loaded save's tournaments drop the mangled names", () => {
        const save = runMigrationLadder({
            saveVersion: CURRENT_SAVE_VERSION,
            tournaments: [{ id: "iem_cologne_open_s1", name: "Summer Open Colone Open Qualifier", shortName: "ColOverGrowthne Open" }],
        }) as unknown as { tournaments: Array<{ shortName: string; name: string }> }
        expect(save.tournaments[0].shortName).toBe("Colone Open")
        expect(save.tournaments[0].name).toBe("Summer Open Colone Open Qualifier")
    })
})
