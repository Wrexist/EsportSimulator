/**
 * G1 playbook + G12 share codes: calls reach the round plan, repeats get
 * read, AI-only matches are untouched, codes round-trip.
 */
import { seriesRunnerFor } from "@/engine/match/calibration/run"
import { buildSide, even } from "@/engine/match/calibration/fixtures"
import { decodePlaybook, encodePlaybook, playSituation, sanitizePlaybook, type Playbook } from "@/engine/match/playbook"
import { MapId, type RoundResult } from "@/types"

const runner = seriesRunnerFor("script-v1")!
const away = buildSide({ id: "AWAY", skills: even(70) })
const homeWith = (playbook?: Playbook) => {
    const base = buildSide({ id: "HOME", skills: even(70) })
    return { ...base, team: { ...base.team, ...(playbook ? { playbook } : {}) } }
}
const play = (playbook: Playbook | undefined, i: number) =>
    runner.managed({ id: `pb-test-${i}`, seed: 1000 + i, map: MapId.MIRAGE, home: homeWith(playbook), away, managedTeamId: "HOME" })
const rounds = (res: ReturnType<typeof play>) => res.maps.flatMap(m => m.rounds as RoundResult[])

describe("playbook calls in the round plan", () => {
    test("a fixed T call and CT setup are what the rounds run", () => {
        const book: Playbook = { [MapId.MIRAGE]: { t: { full: { strategy: "split", site: "B" } }, ct: { full: "stack-A" } } }
        let tFull = 0, ctFull = 0
        for (let i = 0; i < 3; i++) for (const r of rounds(play(book, i))) {
            if (r.buys?.home !== "FULL" || !r.plan) continue
            if (r.tTeam === "HOME") { tFull++; expect(r.plan.tStrategy).toBe("split"); expect(r.plan.site).toBe("B") }
            else { ctFull++; expect(r.plan.ctSetup).toBe("stack-A"); expect(r.plan.read).toBe(r.plan.site === "A" ? "right" : "wrong") }
        }
        expect(tFull).toBeGreaterThan(5)
        expect(ctFull).toBeGreaterThan(5)
    })

    test("a call that keeps repeating is read more often", () => {
        const book: Playbook = { [MapId.MIRAGE]: { t: { pistol: { strategy: "execute" }, force: { strategy: "execute" }, full: { strategy: "execute" } } } }
        let auto = 0, autoN = 0, fixed = 0, fixedN = 0
        for (let i = 0; i < 12; i++) {
            for (const r of rounds(play(undefined, i))) if (r.tTeam === "HOME" && r.buys?.home === "FULL") { autoN++; if (r.plan?.read === "right") auto++ }
            for (const r of rounds(play(book, i))) if (r.tTeam === "HOME" && r.buys?.home === "FULL") { fixedN++; if (r.plan?.read === "right") fixed++ }
        }
        expect(fixed / fixedN).toBeGreaterThan(auto / autoN + 0.2)
    })

    test("no playbook: the series plays exactly as before (other maps' calls change nothing)", () => {
        const elsewhere: Playbook = { [MapId.NUKE]: { t: { full: { strategy: "rush" } } } }
        for (let i = 0; i < 2; i++) {
            const a = rounds(play(undefined, i)).map(r => [r.winner, r.plan?.tStrategy, r.plan?.site, r.plan?.ctSetup])
            const b = rounds(play(elsewhere, i)).map(r => [r.winner, r.plan?.tStrategy, r.plan?.site, r.plan?.ctSetup])
            expect(b).toEqual(a)
        }
    })
})

describe("playbook data", () => {
    test("situations by buy", () => {
        expect(playSituation("pistol", "T")).toBe("pistol")
        expect(playSituation("eco", "T")).toBeNull()
        expect(playSituation("eco", "CT")).toBe("force")
        expect(playSituation("half", "T")).toBe("force")
        expect(playSituation("full", "CT")).toBe("full")
    })

    test("sanitize drops invalid entries", () => {
        expect(sanitizePlaybook({ Mirage: { t: { full: { strategy: "yolo" }, pistol: { strategy: "rush", site: "C" } }, ct: { eco: "2-1-2", full: "stack-B" } }, Nuke: "x" }))
            .toEqual({ Mirage: { t: { pistol: { strategy: "rush" } }, ct: { full: "stack-B" } } })
    })

    test("share codes round-trip and reject garbage", () => {
        const book: Playbook = {
            Mirage: { t: { pistol: { strategy: "rush" }, force: { strategy: "rush", site: "B" }, full: { strategy: "execute", site: "A" } }, ct: { pistol: "2-1-2", full: "aggressive" } },
            Nuke: { ct: { force: "stack-A" } },
        }
        const code = encodePlaybook(book)
        expect(code).toBe("PB1 Mirage:r.rB.eA/2.-.g Nuke:-.-.-/-.A.-")
        expect(decodePlaybook(code)).toEqual(book)
        expect(decodePlaybook("  " + code.toLowerCase().replace("pb1", "PB1") + " ", ["Mirage"])).toBeNull() // lower-case letters are other calls
        expect(decodePlaybook(code, ["Mirage"])).toEqual({ Mirage: book.Mirage })
        expect(decodePlaybook("PB1 mirage:r.-.-/-.-.-", ["Mirage"])).toEqual({ Mirage: { t: { pistol: { strategy: "rush" } } } })
        expect(decodePlaybook("hello")).toBeNull()
        expect(decodePlaybook("PB1 Mirage:x.-.-/-.-.-")).toBeNull()
        expect(decodePlaybook("PB1 Mirage:r.-/-.-.-")).toBeNull()
    })
})
