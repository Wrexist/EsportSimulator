/**
 * Start-area audit fixes (2026-11-17), pure helpers: START-49 pro nickname
 * clash, START-68 the Create team step a reload reopens.
 */
import { proNicknameTaken } from "@/engine/pro-career"
import { normalizeCareerDraft, restorableCreateTeamStep } from "@/lib/new-career-draft"

describe("START-49: a pro nickname may not repeat a player's", () => {
    const players = [{ nickname: "LkSx" }, { nickname: "s1mple" }, {}]
    test("same name in any case or spacing is taken", () => {
        expect(proNicknameTaken("LkSx", players)).toBe(true)
        expect(proNicknameTaken("  lksx ", players)).toBe(true)
        expect(proNicknameTaken("S1MPLE", players)).toBe(true)
    })
    test("a new name, or an empty one, is free", () => {
        expect(proNicknameTaken("Nova", players)).toBe(false)
        expect(proNicknameTaken("  ", players)).toBe(false)
    })
})

describe("START-68: a reload in Create team keeps its step", () => {
    const custom = { name: "Phoenix", shortName: "PHX", region: "EU", difficulty: "normal", logoIndex: 0, primaryColor: "#000000", secondaryColor: "#ffffff" }
    test("the draft keeps a known step and drops an unknown one", () => {
        expect(normalizeCareerDraft({ version: 1, managerName: "Neo", custom, ctStep: "colors" })?.ctStep).toBe("colors")
        expect(normalizeCareerDraft({ version: 1, managerName: "Neo", custom, ctStep: "launch" })?.ctStep).toBeUndefined()
    })
    test("a later step reopens only when the name step is complete", () => {
        const draft = normalizeCareerDraft({ version: 1, managerName: "Neo", custom, ctStep: "difficulty" })
        expect(restorableCreateTeamStep(draft)).toBe("difficulty")
        expect(restorableCreateTeamStep({ ...draft!, managerName: "N" })).toBe("name")
        expect(restorableCreateTeamStep({ ...draft!, custom: { ...draft!.custom!, shortName: "P" } })).toBe("name")
        expect(restorableCreateTeamStep({ managerName: "Neo", ctStep: "review" })).toBe("name")
        expect(restorableCreateTeamStep(null)).toBe("name")
    })
})
