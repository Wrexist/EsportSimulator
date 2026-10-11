/**
 * Phase 5.3 screens render what the engine recorded: the Home Storylines
 * panel (beat, player, open decision), the press panel (questions, answers,
 * the exact effect chips), the player's storyline log and the inbox context.
 */
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { useGameStore } from "@/store/game-store"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import { processStorylines } from "@/engine/storylines"
import { createPressConference } from "@/engine/storylines/press"
import { StorylinesPanel } from "@/components/storylines/StorylinesPanel"
import { PressPanel } from "@/components/storylines/PressConference"
import { PlayerStorylines } from "@/components/storylines/PlayerStorylines"
import { StoryContext } from "@/components/storylines/StoryContext"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import type { GameSave } from "@/engine/save-types"

jest.mock("@/engine/worker/week-processor-bridge", () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock("@/engine/manager-career-profile", () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => "/", useParams: () => ({}) }))

const initial = { ...useGameStore.getState() }

function career(): { save: GameSave; playerId: string } {
    const save = createLaunchFixture("first-week", 53003)
    const team = save.teams[0]
    const playerId = team.rosterIds[1]
    const p = save.players.find(x => x.id === playerId)!
    p.avgRating = 1.05
    p.formWindow = { clubId: team.id, ratings: [0.8, 0.75, 0.82, 0.7, 0.78] }
    save.currentWeek = 6
    processStorylines(save)
    save.currentWeek = 7
    processStorylines(save)
    save.scheduledMatches = [{ id: "ui_final", homeTeamId: team.id, awayTeamId: save.teams[1].id, tournamentId: "ui_cup", stage: "Grand Final", week: 7, format: "BO3", seed: 1 }]
    createPressConference(save)
    return { save, playerId }
}

function load(save: GameSave) {
    useGameStore.setState({ ...initial, ...structuredClone(save), isLoading: false, isInitialized: true, _hasHydrated: true } as never)
    // Server rendering reads the store's initial state.
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
}

test("Home storylines panel: the beat, the player and the open decision", () => {
    const { save, playerId } = career()
    load(save)
    const name = save.players.find(p => p.id === playerId)!.nickname
    const html = renderToStaticMarkup(<StorylinesPanel />)
    expect(html).toContain("Storylines")
    expect(html).toContain("1 active")
    expect(html).toContain("Slump")
    expect(html).toContain(`The press asks whether ${name} keeps his place.`)
    expect(html).toContain(`href="/player/${playerId}"`)
    expect(html).toContain("Your call · answer by week 9")
    expect(html).toContain("Decide")
})

test("Press panel: questions, quoted answers and the effect each applies", () => {
    const { save, playerId } = career()
    load(save)
    const name = save.players.find(p => p.id === playerId)!.nickname
    const html = renderToStaticMarkup(<PressPanel matchId="ui_final" />)
    expect(html).toContain("Press conference")
    expect(html).toContain("Optional · before the match")
    expect(html).toContain(`${name} is rated 0.77 over his last 5 official maps. Does he keep his place?`)
    expect(html).toContain("We are here to lift the trophy.")
    expect(html).toContain(`+${S.PRESS_BOLD_MORALE} morale (squad)`)
    expect(html).toContain(`+${S.PRESS_BOLD_FANS.toLocaleString("en-US")} fans`)
    expect(html).toContain(`+${S.PRESS_PLAYER_BACK_MORALE} morale (${name})`)
    expect(html).toContain("Face the press")
    expect(html).toContain("Send no one")
    expect(renderToStaticMarkup(<PressPanel matchId="no_such_match" />)).toBe("")
})

test("player storyline log and the inbox context list every beat", () => {
    const { save, playerId } = career()
    load(save)
    const arc = save.storylines![0]
    const log = renderToStaticMarkup(<PlayerStorylines playerId={playerId} />)
    expect(log).toContain("Active")
    for (const entry of arc.log) expect(log).toContain(entry.text.replace(/'/g, "&#x27;"))
    const context = renderToStaticMarkup(<StoryContext arcId={arc.id} />)
    expect(context).toContain("Storyline · Slump")
    expect(renderToStaticMarkup(<PlayerStorylines playerId="nobody" />)).toBe("")
})
