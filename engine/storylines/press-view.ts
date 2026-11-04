/**
 * Press conferences (Phase 5.3): shapes and read helpers, light enough for
 * the UI bundle. The engine side lives in ./press.ts.
 */

import type { GameEventSaveData } from "../save-types"
import type { ChoiceEffects } from "../event-choice"
import { t, tRef, type TextRef } from "@/lib/i18n"

export type PressReason = "FINAL" | "DERBY" | "TOP10" | "DECIDER"
export type PressTopic = "MATCH" | "STORY" | "PLAYER" | "FORM"

export interface PressAnswer {
    id: string
    /** The manager's line, in English (kept for older saves and the ledger). */
    text: string
    /** The same line as a translation key: shown in the active language. */
    ref?: TextRef
    effects: ChoiceEffects
    /** Settled by the match result (a bold claim): applied once the match is played. */
    afterResult?: { win: ChoiceEffects; loss: ChoiceEffects }
}

export interface PressQuestion {
    id: string
    topic: PressTopic
    /** In English (kept for older saves). */
    text: string
    /** The same question as a translation key: shown in the active language. */
    ref?: TextRef
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

/** "Final", "Derby", … in the active language. */
export const pressReasonLabel = (r: PressReason): string => t(`press.reason.${r}`)

/** A question or answer in the active language (saves from before translation keep their English text). */
export const pressText = (item: { text: string; ref?: TextRef }): string => (item.ref ? tRef(item.ref) : item.text)

export const PRESS_PREFIX = "press_"
export const pressEventId = (matchId: string) => `${PRESS_PREFIX}${matchId}`

export function pressDataOf(event: Pick<GameEventSaveData, "id" | "data"> | undefined): PressData | null {
    if (!event || !event.id.startsWith(PRESS_PREFIX)) return null
    const press = (event.data as { press?: PressData } | undefined)?.press
    return press && Array.isArray(press.questions) ? press : null
}
