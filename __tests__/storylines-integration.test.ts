/**
 * Phase 5.3 in the real week tick and the store: the tick raises the press
 * conference before the managed club's final (deterministically), and the
 * store action applies the answers.
 */
import { computeWeek } from "@/engine/worker/compute-week"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { TrainingFocus } from "@/types"
import type { GameSave } from "@/engine/save-types"
import { pressDataOf } from "@/engine/storylines/press"
import { createEventsSlice } from "@/store/slices/events-slice"
import { STORY_TUNING as S } from "@/lib/balance-tuning"

jest.mock("@/engine/worker/week-processor-bridge", () => {
    const { WeekProcessorBridge } = require("@/engine/worker/week-processor-client")
    return { weekProcessorBridge: new WeekProcessorBridge(() => { throw new Error("No browser worker in Node fixture") }) }
})
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))

const config = (save: GameSave) => ({ playerTeamId: save.playerTeamId, trainingFocus: new Map([[save.playerTeamId, { focus: TrainingFocus.AIM, intensity: 5 }]]) })

function finalNextWeek(): GameSave {
    const save = createLaunchFixture("first-week")
    const team = save.teams[0]
    save.scheduledMatches = [{ id: "qa_final", homeTeamId: team.id, awayTeamId: save.teams[1].id, tournamentId: "qa_cup", stage: "Grand Final", week: save.currentWeek + 1, format: "BO3", seed: 7 }]
    return save
}

test("the week tick raises the press conference before the managed final, the same way twice", async () => {
    const a = await computeWeek(finalNextWeek(), config(finalNextWeek()), 21)
    const b = await computeWeek(finalNextWeek(), config(finalNextWeek()), 21)
    expect(a.result.success).toBe(true)
    const press = a.save.eventsLog.find(e => e.id === "press_qa_final")!
    expect(pressDataOf(press)?.reason).toBe("FINAL")
    expect(pressDataOf(press)?.questions.map(q => q.topic)).toEqual(["MATCH", "PLAYER"])
    expect(press.data).toMatchObject({ deadlineWeek: a.save.currentWeek, matchId: "qa_final", defaultChoiceId: "no_one" })
    expect(String(press.data.ifUnanswered)).toContain("sends no one to the press conference: no effect")
    expect(a.save.newsFeed.find(n => n.id === "match_preview_qa_final")?.content).toBe("QA Aurora face AI Team 1 in the event final this week. QA Aurora come in fresh; AI Team 1 are ranked #2.")
    expect(JSON.stringify(a.save.eventsLog)).toBe(JSON.stringify(b.save.eventsLog))
    expect(JSON.stringify(a.save.storylines ?? [])).toBe(JSON.stringify(b.save.storylines ?? []))
})

test("the store's answerPressConference applies the answers and closes the conference", async () => {
    const { save } = await computeWeek(finalNextWeek(), config(finalNextWeek()), 21)
    const state = save as GameSave & Record<string, unknown>
    const set = (fn: unknown) => { if (typeof fn === "function") (fn as (s: unknown) => void)(state) }
    const slice = createEventsSlice(set as never, (() => state) as never)
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    const followers = team.followers ?? 0
    const morale = team.rosterIds.map(id => save.players.find(p => p.id === id)!.morale)
    const r = slice.answerPressConference("press_qa_final", { match: "bold" })
    expect(r.ok).toBe(true)
    expect(team.followers).toBe(followers + S.PRESS_BOLD_FANS)
    expect(team.rosterIds.map(id => save.players.find(p => p.id === id)!.morale)).toEqual(morale.map(m => Math.min(100, m + S.PRESS_BOLD_MORALE)))
    expect(save.eventsLog.find(e => e.id === "press_qa_final")?.selectedChoiceId).toBe("answered")
})
