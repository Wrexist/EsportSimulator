/**
 * Press conferences (Phase 5.3): shapes and read helpers, light enough for
 * the UI bundle. The engine side lives in ./press.ts.
 */

import type { GameEventSaveData } from "../save-types"
import type { ChoiceEffects } from "../event-choice"

export type PressReason = "FINAL" | "DERBY" | "TOP10" | "DECIDER"
export type PressTopic = "MATCH" | "STORY" | "PLAYER" | "FORM"

export interface PressAnswer {
    id: string
    /** The manager's line. */
    text: string
    effects: ChoiceEffects
}

export interface PressQuestion {
    id: string
    topic: PressTopic
    text: string
    /** The storyline the question comes from. */
    arcId?: string
    answers: PressAnswer[]
}

export interface PressData {
    reason: PressReason
    matchId: string
    opponentId: string
    questions: PressQuestion[]
}

export const PRESS_REASON_LABEL: Record<PressReason, string> = {
    FINAL: "Final",
    DERBY: "Derby",
    TOP10: "Top-10 clash",
    DECIDER: "League decider",
}

export const PRESS_PREFIX = "press_"
export const pressEventId = (matchId: string) => `${PRESS_PREFIX}${matchId}`

export function pressDataOf(event: Pick<GameEventSaveData, "id" | "data"> | undefined): PressData | null {
    if (!event || !event.id.startsWith(PRESS_PREFIX)) return null
    const press = (event.data as { press?: PressData } | undefined)?.press
    return press && Array.isArray(press.questions) ? press : null
}
