/**
 * Tests for CommentaryManager — the seeded live-match caster.
 *
 * Focus:
 *   - selectKillType() escalates a kill to the loudest matching pool
 *     (ace > multikill > weapon > utility/headshot > trade > assist >
 *     generic) so the ~35 highlight lines are actually reachable.
 *   - Every authored CommentaryType has a non-empty template pool.
 *   - The no-immediate-repeat guard never prints the same line twice in a row.
 *   - Generic kill lines never leak an unfilled {assister} placeholder.
 *   - Assist lines fill {assister} when one is provided.
 */

import { commentaryManager, type CommentaryType, type KillCommentarySignals } from "@/engine/commentary-manager"

const ALL_TYPES: CommentaryType[] = [
    "MATCH_START", "ROUND_START", "KILL_GENERIC", "KILL_ASSIST", "KILL_HS",
    "KILL_AWP", "KILL_NADE", "KILL_KNIFE", "TRADE_KILL", "MULTIKILL_2",
    "MULTIKILL_3", "MULTIKILL_4", "ACE", "PLANT", "DEFUSE", "EXPLODE",
    "ROUND_WIN_T", "ROUND_WIN_CT", "TIMEOUT", "CLUTCH_WIN", "ECO_WIN",
]

describe("selectKillType — highlight escalation", () => {
    const cases: Array<[string, KillCommentarySignals, CommentaryType]> = [
        ["ace (isAce)", { isAce: true }, "ACE"],
        ["ace (5-count)", { multiKillCount: 5 }, "ACE"],
        ["ace beats weapon", { isAce: true, weaponId: "awp" }, "ACE"],
        ["4k", { multiKillCount: 4 }, "MULTIKILL_4"],
        ["3k", { multiKillCount: 3 }, "MULTIKILL_3"],
        ["2k", { multiKillCount: 2 }, "MULTIKILL_2"],
        ["multikill beats weapon", { multiKillCount: 3, weaponId: "awp" }, "MULTIKILL_3"],
        ["awp", { weaponId: "AWP" }, "KILL_AWP"],
        ["awp beats headshot", { weaponId: "awp", isHeadshot: true }, "KILL_AWP"],
        ["knife", { weaponId: "knife" }, "KILL_KNIFE"],
        ["nade/utility", { isUtility: true }, "KILL_NADE"],
        ["utility beats headshot", { isUtility: true, isHeadshot: true }, "KILL_NADE"],
        ["headshot", { isHeadshot: true }, "KILL_HS"],
        ["trade", { isTrade: true }, "TRADE_KILL"],
        ["headshot beats trade", { isHeadshot: true, isTrade: true }, "KILL_HS"],
        ["assist", { hasAssister: true }, "KILL_ASSIST"],
        ["plain frag", {}, "KILL_GENERIC"],
        ["single kill is not a multikill", { multiKillCount: 1 }, "KILL_GENERIC"],
    ]

    test.each(cases)("%s -> correct pool", (_label, signals, expected) => {
        expect(commentaryManager.selectKillType(signals)).toBe(expected)
    })

    test("every kill highlight pool is reachable from some signal set", () => {
        const reachable = new Set(cases.map(([, , type]) => type))
        for (const t of ["ACE", "MULTIKILL_4", "MULTIKILL_3", "MULTIKILL_2",
            "KILL_AWP", "KILL_KNIFE", "KILL_NADE", "KILL_HS", "TRADE_KILL",
            "KILL_ASSIST", "KILL_GENERIC"] as CommentaryType[]) {
            expect(reachable.has(t)).toBe(true)
        }
    })
})

describe("template pools — authored content is reachable", () => {
    test("every CommentaryType renders a non-empty, non-placeholder line", () => {
        const ctx = { player: "s1mple", victim: "ZywOo", assister: "device", team: "NAVI", map: "Sandstone", round: 7 }
        for (const type of ALL_TYPES) {
            const line = commentaryManager.generate(type, ctx)
            expect(typeof line).toBe("string")
            expect(line.length).toBeGreaterThan(0)
            // No unresolved token should survive when full context is supplied.
            expect(line).not.toMatch(/\{[a-z]+\}/)
        }
    })

    test("generateKill routes signals through the right pool and renders", () => {
        const ctx = { player: "Twistzz", victim: "ropz", assister: "broky" }
        const aceLine = commentaryManager.generateKill({ isAce: true }, ctx)
        expect(aceLine).toContain("Twistzz")
        expect(aceLine).not.toMatch(/\{[a-z]+\}/)
    })
})

describe("no-immediate-repeat guard", () => {
    test.each(["KILL_GENERIC", "TIMEOUT", "MULTIKILL_2", "ROUND_WIN_CT"] as CommentaryType[])(
        "%s never emits the same line twice in a row",
        (type) => {
            let prev: string | null = null
            for (let i = 0; i < 60; i++) {
                const line = commentaryManager.generate(type, { player: "P", victim: "V" })
                expect(line).not.toBe(prev)
                prev = line
            }
        }
    )
})

describe("assister placeholder safety", () => {
    test("KILL_GENERIC never contains an {assister} token (no literal leak)", () => {
        // Render many generic lines with NO assister supplied — none should
        // ever surface a literal "{assister}".
        for (let i = 0; i < 100; i++) {
            const line = commentaryManager.generate("KILL_GENERIC", { player: "P", victim: "V" })
            expect(line).not.toContain("{assister}")
        }
    })

    test("KILL_ASSIST fills the assister when one is provided", () => {
        for (let i = 0; i < 40; i++) {
            const line = commentaryManager.generate("KILL_ASSIST", { player: "P", victim: "V", assister: "A" })
            expect(line).not.toMatch(/\{[a-z]+\}/)
            expect(line).toContain("A")
        }
    })
})
