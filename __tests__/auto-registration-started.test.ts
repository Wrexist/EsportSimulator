/**
 * Automatic entry never signs the managed club up for an event whose field
 * is already set (verification 2026-11-18). On an event's start week the tick
 * has built its field; a sign-up added afterwards stayed "Registered" for an
 * event the club never played (comp-season-integration, "nothing of season 1
 * leaks into season 2", after COMP-05 kept the club out while it clashed).
 */
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { applyAutoRegistration } from "@/engine/processors/auto-registration-processor"
import type { GameSave, TournamentSaveData } from "@/engine/save-types"

const EVENT = "elisa_masters_espoo_s1" // INVITE, ranked #40 or better, starts in week 44

function world(stage: string, startWeek: number, extra: Partial<TournamentSaveData> = {}): GameSave {
    const save = createLaunchFixture("first-week")
    save.currentWeek = 44
    save.teams[0].worldRanking = 4
    save.tournamentQualifications = []
    save.tournaments = [{
        id: EVENT, seriesId: "elisa_masters_espoo", instanceId: EVENT, seasonNumber: 1, name: "Electra Masters Espoo",
        shortName: "Electra Masters", region: "EU", tier: "B_TIER", format: "bracket", currentStage: stage,
        teamIds: stage === "Registration" ? [] : save.teams.slice(1).map(t => t.id), standings: [], prizePool: 150_000,
        startWeek, duration: 1, endWeek: startWeek + 1, ...extra,
    } as unknown as TournamentSaveData]
    return save
}

const signUps = (save: GameSave) => save.tournamentQualifications.filter(q => q.teamId === save.playerTeamId && q.tournamentId === EVENT)
const run = (save: GameSave) => applyAutoRegistration(save, { playerTeamId: save.playerTeamId!, nextId: (_s, prefix, ...parts) => `${prefix}_${parts.join("_")}` })

test("an eligible club is still signed up for an event that has not started", () => {
    const save = world("Registration", 45)
    run(save)
    expect(signUps(save)).toHaveLength(1)
    expect(save.eventsLog.some(e => e.id.startsWith("evt_auto_reg"))).toBe(true)
})

test("no sign-up, and no inbox notice, for an event that started this week without the club", () => {
    const save = world("Bracket", 44)
    run(save)
    expect(signUps(save)).toEqual([])
    expect(save.eventsLog.some(e => e.id.startsWith("evt_auto_reg"))).toBe(false)
})

test("none for a finished event either", () => {
    const save = world("Completed", 44, { isCompleted: true })
    run(save)
    expect(signUps(save)).toEqual([])
})
