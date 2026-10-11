/**
 * Phase 4.1 "Continue to next decision": every stop condition, with the
 * reason the manager sees.
 */
import { collectStopSignals, nextStop, type StopSource } from "@/lib/advance-stops"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { GameSave } from "@/engine/save-types"

function base(): GameSave {
    const save = createLaunchFixture("first-week")
    save.scheduledMatches = []
    save.timeMode = "WEEKLY"
    save.currentDay = 0
    save.currentWeek = 5
    return save
}
const src = (save: GameSave) => save as unknown as StopSource
const kinds = (save: GameSave) => collectStopSignals(src(save)).map(s => s.kind)

test("a quiet week has no stop", () => {
    expect(collectStopSignals(src(base()))).toEqual([])
})

test("a playable match stops, always, even once seen", () => {
    const save = base()
    save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, format: "BO3", stage: "Group", tournamentId: null, seed: 1 } as never]
    const stop = nextStop(src(save), new Set(["match:m1"]))
    expect(stop).toMatchObject({ kind: "match", reason: "Play AI Team 1 (BO3)", href: "/match/m1/tactics" })
})

test("daily mode only stops on match day", () => {
    const save = base()
    save.timeMode = "HYBRID_DAILY"
    save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, day: 3, format: "BO1", tournamentId: null, seed: 1 } as never]
    save.currentDay = 2
    expect(kinds(save)).not.toContain("match")
    save.currentDay = 3
    expect(kinds(save)).toContain("match")
})

test("an unplayable fixture warns before it is forfeited", () => {
    const save = base()
    save.teams[0].rosterIds = save.teams[0].rosterIds.slice(0, 4)
    save.scheduledMatches = [{ id: "m1", homeTeamId: save.playerTeamId, awayTeamId: "team_ai_1", week: 5, format: "BO1", tournamentId: null, seed: 1 } as never]
    const stops = collectStopSignals(src(save))
    expect(stops.map(s => s.kind)).toEqual(["forfeit"])
    expect(stops[0].reason).toMatch(/^Your match vs AI Team 1 will be forfeited: your roster has 4 active players/)
})

test("an injured player stops with name, injury and time out", () => {
    const save = base()
    save.players[0].injury = { type: "RSI", name: "Wrist Strain", weeksRemaining: 2 } as never
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "injury", reason: "PlayerA1 is injured (Wrist Strain, 2 weeks)", href: "/player/p_a1" })
})

test("an event choice that needs an answer stops", () => {
    const save = base()
    save.eventsLog.push({ id: "ev1", week: 5, type: "MORALE", acknowledged: false, data: { title: "Dressing room" }, choices: [{ id: "a", text: "Talk", effects: { morale: 2 } }] } as never)
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "event", reason: "Internal Morale needs an answer" })
})

test("a transfer offer stops with club, amount and player", () => {
    const save = base()
    save.eventsLog.push({ id: "off1", week: 5, type: "TRANSFER_OFFER", acknowledged: false, data: { teamName: "AI Team 2", playerName: "PlayerA3", offerAmount: 250000, expiresWeek: 7 }, choices: [{ id: "accept", text: "Accept", effects: {} }] } as never)
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "offer", reason: "AI Team 2 bid $250k for PlayerA3" })
})

test("a job offer names the club and its rank", () => {
    const save = base()
    save.eventsLog.push({ id: "job1", week: 5, type: "JOB_OFFER", acknowledged: false, data: { offeringTeamName: "Vitalis", offeringTeamRank: 7, deadlineWeek: 6 }, choices: [] } as never)
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "offer", reason: "Job offer from Vitalis (#7)" })
})

test("an expired or answered offer does not stop", () => {
    const save = base()
    save.eventsLog.push({ id: "off1", week: 1, type: "TRANSFER_OFFER", acknowledged: false, data: { teamName: "X", playerName: "Y", expiresWeek: 3 }, choices: [] } as never)
    save.eventsLog.push({ id: "off2", week: 5, type: "TRANSFER_OFFER", acknowledged: true, selectedChoiceId: "reject", data: { teamName: "X", playerName: "Y", expiresWeek: 7 }, choices: [] } as never)
    expect(kinds(save)).toEqual([])
})

test("a contract ending within two weeks stops; renewing it clears the stop", () => {
    const save = base()
    const contract = save.contracts.find(c => c.playerId === "p_a2")!
    contract.endWeek = 7
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "contract", reason: "PlayerA2's contract ends in 2 weeks", href: "/player/p_a2" })
    contract.endWeek = 59
    expect(kinds(save)).toEqual([])
})

test("a board review stops (and covers the season end)", () => {
    const save = base()
    save.newsFeed = [{ id: `board_pulse_w5_${save.playerTeamId}`, title: "The board is pleased", content: "", week: 5, category: "FINANCE" }]
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "board", reason: "Board review: The board is pleased" })
    save.currentWeek = 52
    save.newsFeed = [{ id: `board_review_s1_${save.playerTeamId}`, title: "Season verdict", content: "", week: 52, category: "FINANCE" }]
    expect(kinds(save)).toEqual(["board"])
})

test("season end stops when no board review came with it", () => {
    const save = base()
    save.currentWeek = 52
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "season", reason: "Season 1 is over" })
})

test("untitled decisions get a readable name; several new ones are one stop", () => {
    const save = base()
    save.eventsLog.push({ id: "fan", week: 5, type: "FAN", acknowledged: false, data: { hype: 10 }, choices: [{ id: "a", text: "Host Fan Meetup", effects: { money: -2000 } }] } as never)
    expect(nextStop(src(save), new Set())).toMatchObject({ kind: "event", reason: "A fan meetup request needs an answer" })
    save.eventsLog.push({ id: "spon", week: 5, type: "SPONSOR", acknowledged: false, data: {}, choices: [{ id: "b", text: "Negotiate", effects: { reputation: -5 } }] } as never)
    const grouped = nextStop(src(save), new Set())
    expect(grouped).toMatchObject({ kind: "event", reason: "2 decisions need an answer", keys: ["event:fan", "event:spon"] })
    expect(nextStop(src(save), new Set(grouped!.keys))).toBeNull()
})

test("seen stops pass; the highest-priority unseen one is next", () => {
    const save = base()
    save.players[0].injury = { type: "RSI", name: "Wrist Strain", weeksRemaining: 2 } as never
    save.contracts.find(c => c.playerId === "p_a2")!.endWeek = 6
    const first = nextStop(src(save), new Set())!
    expect(first.kind).toBe("injury")
    expect(nextStop(src(save), new Set([first.key]))?.kind).toBe("contract")
    expect(nextStop(src(save), new Set(collectStopSignals(src(save)).map(s => s.key)))).toBeNull()
})
