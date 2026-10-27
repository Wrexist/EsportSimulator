/**
 * Mid-round coach calls (roadmap R2, "coach the round").
 *
 * While the live radar plays a round, the manager may make a call for their
 * team: the round is played again from the same seed with the call taking
 * effect at that second (round-sim/sight.ts), so everything before the call
 * stays exactly as it was shown and only what follows changes. The round
 * played without the call is kept as the comparison: the result screen says
 * whether the call won or lost the round.
 */

export type CoachCallKind = "go" | "swing" | "rotateA" | "rotateB" | "hold" | "save"

export interface CoachCall {
    /** Round seconds (engine clock) when the call is made. */
    t: number
    kind: CoachCallKind
}

/** A call as recorded on the round: what the round would have been without it. */
export interface CoachCallRecord extends CoachCall {
    /** The managed team's result in the same round played with the earlier calls but without this one. */
    without: "won" | "lost"
}

export const COACH_CALLS_PER_ROUND = 2
/** Round seconds between two calls in the same round. */
export const COACH_CALL_COOLDOWN = 10
/** No call in the first seconds of the round (the plan is still being set). */
export const COACH_CALL_FIRST = 3

export const T_CALLS: readonly CoachCallKind[] = ["go", "swing", "save"]
export const CT_CALLS: readonly CoachCallKind[] = ["rotateA", "rotateB", "hold", "save"]

export const COACH_CALL_LABEL: Record<CoachCallKind, string> = {
    go: "Go now",
    swing: "Fake and swing",
    rotateA: "Rotate to A",
    rotateB: "Rotate to B",
    hold: "Hold for retake",
    save: "Save",
}

export const COACH_CALL_HINT: Record<CoachCallKind, string> = {
    go: "Hit the site now with everyone, before the defence sets up.",
    swing: "Turn the hit around and take the other site.",
    rotateA: "Everyone not on A moves to A.",
    rotateB: "Everyone not on B moves to B.",
    hold: "A site that is lost is given up: fall back and retake it together.",
    save: "Give the round up and keep the weapons.",
}

export function coachCallsFor(ct: boolean): readonly CoachCallKind[] {
    return ct ? CT_CALLS : T_CALLS
}

export interface CoachCallState {
    /** Round seconds on the engine clock. */
    t: number
    ct: boolean
    calls: readonly CoachCall[]
    planted: boolean
    over: boolean
}

/** Why a call cannot be made now, or null when it can. */
export function coachCallBlocked(kind: CoachCallKind, s: CoachCallState): string | null {
    if (s.over) return "The round is over"
    if (!coachCallsFor(s.ct).includes(kind)) return "Not a call for this side"
    if (s.calls.length >= COACH_CALLS_PER_ROUND) return `${COACH_CALLS_PER_ROUND} calls per round`
    if (s.t < COACH_CALL_FIRST) return "Let the round start"
    const last = s.calls[s.calls.length - 1]
    if (last && s.t - last.t < COACH_CALL_COOLDOWN) return `Wait ${Math.ceil(COACH_CALL_COOLDOWN - (s.t - last.t))} s`
    // After the plant only the CTs can still save; the Ts play it out.
    if (s.planted && (kind !== "save" || !s.ct)) return "The bomb is down"
    return null
}
