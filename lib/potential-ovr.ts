/**
 * Potential on the OVR scale (SQUAD-03 / START-14 / HOME-15).
 *
 * `player.potential` is a ceiling on the attribute scale: training and
 * natural growth raise each trainable attribute up to it (TrainingProcessor,
 * PlayerLifecycleManager), and it is compared with `skill`, `rifle` and so on.
 * Shown next to OVR it reads lower than OVR for most pros (OVR 79, potential
 * 64), as if the player were past his peak. Every screen that puts potential
 * beside OVR should show this number instead: the OVR the player would have
 * with every trainable attribute raised to his ceiling. It is never below his
 * current OVR.
 */

import { evaluatePlayer } from "@/engine/player-evaluation"
import { NATURAL_GROWTH_STATS } from "@/engine/development-rates"
import { TRAINING_EFFECTS } from "@/types/events"
import type { PlayerSaveData } from "@/engine/save-types"

/** Attributes that weekly training or natural growth raise up to `potential`. */
export const POTENTIAL_CAPPED_STATS: readonly string[] = Array.from(new Set<string>([
    ...Object.values(TRAINING_EFFECTS).flatMap(e => [...e.primaryStats, ...e.secondaryStats] as string[]),
    ...NATURAL_GROWTH_STATS,
]))

type Evaluable = Parameters<typeof evaluatePlayer>[0]

/**
 * The player's potential as an OVR: his OVR with every trainable attribute
 * raised to max(current, potential). Falls back to the current OVR when the
 * player has no potential.
 */
export function potentialOvr(player: Evaluable | PlayerSaveData, currentWeek?: number): number {
    const p = player as Evaluable
    const ovr = evaluatePlayer(p, undefined, undefined, currentWeek).overallRating
    const ceiling = typeof p.potential === "number" && Number.isFinite(p.potential) ? p.potential : undefined
    if (ceiling === undefined) return ovr
    const raised: Record<string, unknown> = { ...(p as unknown as Record<string, unknown>) }
    for (const stat of POTENTIAL_CAPPED_STATS) {
        const v = raised[stat]
        if (typeof v === "number" && v < ceiling) raised[stat] = Math.min(100, ceiling)
    }
    const atCeiling = evaluatePlayer(raised as unknown as Evaluable, undefined, undefined, currentWeek).overallRating
    return Math.max(ovr, atCeiling)
}
