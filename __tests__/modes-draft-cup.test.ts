/**
 * Audit 2026-11-15 (MODES-13): unspent draft points are a tie-breaker. A
 * run that goes one round further always outscores one that saved its whole
 * budget, so drafting the five cheapest players is not the best strategy.
 */
import { DRAFT_BUDGET, DRAFT_CUP_SCORE, draftCupOutcome, type DraftCupFinish, type DraftCupState } from "@/engine/draft-cup"

const ORDER: DraftCupFinish[] = ["quarter", "semi", "final", "champion"]

test("the whole budget left is worth less than one finish step", () => {
    const steps = ORDER.slice(1).map((f, i) => DRAFT_CUP_SCORE.finish[f] - DRAFT_CUP_SCORE.finish[ORDER[i]])
    expect(DRAFT_BUDGET * DRAFT_CUP_SCORE.perBudgetPointLeft).toBeLessThan(Math.min(...steps))
})

/** A run lost in `stage`, having won `wins` series 2–1 by 13–11 maps. */
function run(stage: string | null, spent: number) {
    const cup: DraftCupState = {
        tournamentId: "cup", teamId: "me", difficulty: "pro", budget: DRAFT_BUDGET, startWeek: 1,
        picks: [{ playerId: "p", role: "IGL", price: spent }],
    }
    const stages = ["Quarter-final", "Semi-final", "Grand final"]
    const lostAt = stage ? stages.indexOf(stage) : 3
    const bracket = stages.slice(0, Math.min(3, lostAt + 1)).map((s, i) => ({
        id: `m${i}`, stage: s, homeTeamId: "me", awayTeamId: `o${i}`, isCompleted: true, winnerId: i === lostAt ? `o${i}` : "me",
    }))
    const completedMatches = bracket.map(m => ({
        id: m.id, tournamentId: "cup", homeTeamId: "me", awayTeamId: m.awayTeamId,
        result: { winnerId: m.winnerId, maps: m.winnerId === "me" ? [{ homeScore: 13, awayScore: 11 }, { homeScore: 11, awayScore: 13 }, { homeScore: 13, awayScore: 11 }] : [{ homeScore: 11, awayScore: 13 }, { homeScore: 13, awayScore: 11 }, { homeScore: 11, awayScore: 13 }] },
    }))
    const tournaments = [{ id: "cup", playoffBracket: bracket, isCompleted: lostAt === 3, winnerId: lostAt === 3 ? "me" : bracket[lostAt].winnerId }]
    return draftCupOutcome({ draftCup: cup, tournaments, completedMatches } as never)!
}

test("a cheap runner-up scores below a full-budget champion, and a cheap semi-finalist below a full-budget finalist", () => {
    const cheapFinal = run("Grand final", 9)
    const fullChampion = run(null, 100)
    expect(cheapFinal.finish).toBe("final")
    expect(fullChampion.finish).toBe("champion")
    expect(cheapFinal.budgetLeft).toBe(91)
    expect(fullChampion.score).toBeGreaterThan(cheapFinal.score)
    expect(run("Grand final", 100).score).toBeGreaterThan(run("Semi-final", 9).score)
    // Same finish: the saved points still break the tie.
    expect(run("Semi-final", 9).score).toBeGreaterThan(run("Semi-final", 100).score)
})
