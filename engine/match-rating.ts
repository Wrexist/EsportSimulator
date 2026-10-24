/**
 * Match rating: the one number the shown OVR is built from, made of what the
 * match engine actually plays with (engine/match/round-sim/profile.ts).
 *
 * In skill points: `skill` (the engine's aim, AIM_PER_SKILL per point), plus
 * the role weapon's aim adjustment converted to skill points (the AWPer's AWP,
 * everyone else's rifle, with the engine's own clamps and weapon mastery),
 * plus the situational attributes at the weights they were measured to be
 * worth in maps.
 *
 * Weights measured 2026-10-24 with paired seeds on the sight engine
 * (scripts/ratings/ovr-agreement.ts exchange: one attribute +15 for all five
 * starters, 1,200 paired maps each; round-share gain relative to skill's):
 * the weapon aim adjustment at about 0.8 of its duel value (rifle +15 for
 * the four non-AWPers: 0.27 skill points per rifle point against 0.29 in a
 * duel; for all five: 0.18; a weapon is not in hand every round),
 * trading 0.13, pistol / eyesight / clutch / entry / stress resistance /
 * reaction about 0.05 each; leader, tactic, teamwork, creativity and grenades
 * measured within noise of zero, so they do not move OVR.
 * Re-measure when match tuning changes (docs/revamp/calibration/OVR_2026-10.md).
 */

import { aimPoints, buildProfile } from "./match/round-sim/profile"
import { TUNING } from "./match/round-sim/tuning"

/** Skill points per attribute point above its neutral value. */
export const MATCH_RATING_WEIGHTS = {
    /** Share of the weapon aim adjustment's duel value. */
    weaponAim: 0.8,
    trading: 0.13,
    situational: 0.05,
} as const

/** Neutral values: the engine's defaults, where an attribute adds nothing. */
const NEUTRAL = { trading: 50, reaction: 50, entry: 50, eyesight: 70, clutch: 60, stressResistance: 50, pistol: 60 } as const

/** Bound on everything except skill and weapon aim, so one maxed side stat cannot carry a rating. */
export const MATCH_RATING_SIDE_CAP = 6

type RatedPlayer = Parameters<typeof buildProfile>[0]

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d)

/** Engine strength in skill points (unrounded, unclamped). */
export function matchRating(player: RatedPlayer): number {
    const prof = buildProfile(player)
    const weapon = aimPoints(prof, prof.role === "awp" ? "awp" : "rifle") - TUNING.AIM_PER_SKILL * prof.skill
    const aim = prof.skill + MATCH_RATING_WEIGHTS.weaponAim * weapon / TUNING.AIM_PER_SKILL
    const p = player as unknown as Record<string, unknown>
    const situational = (["reaction", "entry", "eyesight", "clutch", "stressResistance", "pistol"] as const)
        .reduce((s, k) => s + (num(p[k], NEUTRAL[k]) - NEUTRAL[k]), 0) * MATCH_RATING_WEIGHTS.situational
    const trading = (num(p.trading, NEUTRAL.trading) - NEUTRAL.trading) * MATCH_RATING_WEIGHTS.trading
    const side = Math.max(-MATCH_RATING_SIDE_CAP, Math.min(MATCH_RATING_SIDE_CAP, situational + trading))
    return aim + side
}

/**
 * Places the OVR scale where it was: without it a new world's median OVR
 * drops from 58 to 52, and the tier thresholds, wage levels and price curve
 * (all set on the old scale) would all shift. A constant, so it changes no
 * comparison between two players or clubs.
 */
export const OVR_SCALE_OFFSET = 6

/** The shown OVR: match rating on the OVR scale, rounded, 1-99. */
export function overallFromMatchRating(rating: number): number {
    return Math.min(99, Math.max(1, Math.round(rating + OVR_SCALE_OFFSET)))
}

/**
 * Reputation turned into real strength (skill points) for the starting world.
 *
 * The OVR used to add a prestige bonus of up to +25 on top of the player's
 * attributes, while the engine never saw it, so the famous clubs looked best
 * and played like everyone else. A new career (data/snapshot-loader.ts) and
 * the v11 save migration add the same bonus to `skill` (and `potential`, so
 * growth headroom is unchanged) once, which keeps the world's order and makes
 * the engine play it. After that, prestige changes value and reputation only.
 */
export function reputationLift(proScore: number): number {
    const s = Math.max(0, Math.min(100, proScore))
    return Math.round(Math.pow(s / 100, 1.5) * 25)
}
