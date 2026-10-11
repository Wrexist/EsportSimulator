/**
 * Round scrubber model: tick marks for one round's script (kills, plant,
 * defuse / explosion, grenades), the span of the timeline and clamping of a
 * review time. Pure; the live round only shows what has already happened.
 */

import type { Side, UtilityKind } from "@/engine/match/round-script-types"
import type { PreparedRadarScript } from "./radar-scene"

export type ScrubTickKind = "kill" | "plant" | "defuse" | "explode" | "utility"

export interface ScrubTick {
    t: number
    kind: ScrubTickKind
    /** Side that made it happen (killer, planter, defuser, thrower). */
    side: Side | null
    label: string
    utility?: UtilityKind
    headshot?: boolean
}

/** Default round length shown for a live round (1:55). */
export const ROUND_SECONDS = 115

const UTILITY_NAME: Record<UtilityKind, string> = { smoke: "Smoke", flash: "Flash", molotov: "Molotov", he: "HE grenade" }

export function formatRoundClock(t: number): string {
    const s = Math.max(0, Math.floor(t))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Ticks of a round, in time order. `upTo` hides everything after it (the live
 * round: no spoilers). Kills are coloured by the killer's side.
 */
export function scrubberTicks(prep: PreparedRadarScript, upTo = Infinity): ScrubTick[] {
    const name = (i: number) => (i >= 0 ? prep.players[i].name : "?")
    const out: ScrubTick[] = []
    for (const d of prep.deaths) {
        if (d.t > upTo) continue
        out.push({ t: d.t, kind: "kill", side: d.killerSide, label: `${formatRoundClock(d.t)} ${name(d.killer)} killed ${name(d.victim)}${d.headshot ? " (headshot)" : ""}`, headshot: d.headshot })
    }
    for (const u of prep.utility) {
        if (u.t > upTo) continue
        out.push({ t: u.t, kind: "utility", side: u.side, utility: u.kind, label: `${formatRoundClock(u.t)} ${UTILITY_NAME[u.kind]} by ${name(u.thrower)}` })
    }
    if (prep.plant && prep.plant.t <= upTo) {
        out.push({ t: prep.plant.t, kind: "plant", side: "T", label: `${formatRoundClock(prep.plant.t)} Bomb planted at ${prep.plant.site} by ${name(prep.plant.planter)}` })
    }
    if (prep.defuse?.success && prep.defuse.tEnd <= upTo) {
        out.push({ t: prep.defuse.tEnd, kind: "defuse", side: "CT", label: `${formatRoundClock(prep.defuse.tEnd)} Bomb defused by ${name(prep.defuse.defuser)}` })
    }
    if (prep.explodeAt !== undefined && prep.explodeAt <= upTo) {
        out.push({ t: prep.explodeAt, kind: "explode", side: "T", label: `${formatRoundClock(prep.explodeAt)} Bomb exploded` })
    }
    return out.sort((a, b) => a.t - b.t || order(a.kind) - order(b.kind))
}

const order = (k: ScrubTickKind) => (k === "utility" ? 0 : k === "kill" ? 1 : 2)

/**
 * Seconds the timeline spans. A finished round spans its script; the live
 * round spans the regular round time, stretched by what is already known
 * (a planted bomb's 40 s), so the bar does not give away when it ends.
 */
export function scrubberSpan(prep: PreparedRadarScript, liveTime?: number): number {
    if (liveTime === undefined) return Math.max(1, Math.ceil(prep.endTime))
    let span = ROUND_SECONDS
    if (prep.plant && prep.plant.t <= liveTime) span = Math.max(span, prep.plant.t + 40 + 5)
    return Math.max(span, Math.ceil(liveTime))
}

/** A review time clamped to the round (and, for the live round, to what has happened). */
export function clampReviewTime(t: number, span: number, liveLimit?: number): number {
    const max = liveLimit === undefined ? span : Math.min(span, liveLimit)
    return Math.max(0, Math.min(max, Number.isFinite(t) ? t : 0))
}
