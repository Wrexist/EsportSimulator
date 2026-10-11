/**
 * Storylines (Phase 5.3): save shapes.
 *
 * GameSave.storylines holds every active arc and the most recent resolved
 * ones (STORY_TUNING.KEEP_RESOLVED), newest first. Optional and additive: an
 * older save simply has none until the first trigger (no save-version bump).
 *
 * An arc is built from real state (a contract, map ratings, a fixture, the
 * board) and moves through 2–4 beats. A beat publishes news, raises an inbox
 * decision (engine/decision-deadlines.ts gives it a deadline and the default
 * it states) or resolves the arc. Answers apply through the shared effect
 * code (engine/event-choice.ts).
 */

export type StoryArcKind =
    | "CONTRACT_STANDOFF"
    | "RISING_STAR"
    | "SLUMP"
    | "RIVALRY"
    | "LAST_DANCE"
    | "RIFT"
    | "GIANT_KILLER"
    | "BOARD_PRESSURE"

export const STORY_ARC_KINDS: readonly StoryArcKind[] = [
    "CONTRACT_STANDOFF", "RISING_STAR", "SLUMP", "RIVALRY", "LAST_DANCE", "RIFT", "GIANT_KILLER", "BOARD_PRESSURE",
]

/** One beat as it happened. */
export interface StoryLogEntry {
    week: number
    /** One broadcast line with the real names and numbers. */
    text: string
    /** Answer given at this beat (choice id), when it raised a decision. */
    choice?: string
}

export interface StoryArc {
    /** `<kind>_<club>_<subject>_<week>`, stable. */
    id: string
    kind: StoryArcKind
    /** Club the story is about. */
    teamId: string
    /** The managed club's story: beats may raise decisions. Other clubs' stories are news only. */
    managed: boolean
    /** Players the story is about, protagonist first. */
    playerIds: string[]
    /** Other clubs involved (the rival, the clubs beaten). */
    clubIds: string[]
    /** Index of the next beat to run. */
    beat: number
    startedWeek: number
    updatedWeek: number
    /** Earliest week the next beat may run. */
    nextWeek: number
    state: "ACTIVE" | "RESOLVED"
    /** How it ended: RENEWED, LEFT, REQUEST, RECOVERED, DROPPED, WON, LOST, RETIRED, PLAYS_ON, … */
    outcome?: string
    /** Open decision raised by the current beat (an eventsLog id). */
    eventId?: string
    /** Answer to the arc's decision, once given (or applied by default). */
    choice?: string
    /** Facts captured along the way (numbers and ids, no prose). */
    facts: Record<string, number | string>
    log: StoryLogEntry[]
}

/**
 * PlayerSaveData.formWindow: a managed player's official map ratings at his
 * current club, newest last (STORY_TUNING.FORM_WINDOW maps). Written by
 * engine/official-stats.ts for the managed club's side of every official
 * match; reset when he changes club.
 */
export interface FormWindow {
    clubId: string
    ratings: number[]
}
