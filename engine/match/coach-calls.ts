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

import { t } from "@/lib/i18n"

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

/** The call's button label in the active language. */
export const coachCallLabel = (kind: CoachCallKind): string => t(`coach.${kind}`)

/** What the call does, in the active language. */
export const coachCallHint = (kind: CoachCallKind): string => t(`coach.hint.${kind}`)

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
    if (s.over) return t("coach.blocked.over")
    if (!coachCallsFor(s.ct).includes(kind)) return t("coach.blocked.side")
    if (s.calls.length >= COACH_CALLS_PER_ROUND) return t("coach.blocked.limit", { n: COACH_CALLS_PER_ROUND })
    if (s.t < COACH_CALL_FIRST) return t("coach.blocked.start")
    const wait = coachCallWait(s)
    if (wait !== null) return t("coach.blocked.wait", { s: wait })
    // After the plant only the CTs can still save; the Ts play it out.
    if (s.planted && (kind !== "save" || !s.ct)) return t("coach.blocked.planted")
    return null
}

/** Whole seconds until the next call is allowed after the last one, or null when there is no wait. */
export function coachCallWait(s: CoachCallState): number | null {
    const last = s.calls[s.calls.length - 1]
    return last && s.t - last.t < COACH_CALL_COOLDOWN ? Math.ceil(COACH_CALL_COOLDOWN - (s.t - last.t)) : null
}
