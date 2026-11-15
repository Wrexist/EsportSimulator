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
