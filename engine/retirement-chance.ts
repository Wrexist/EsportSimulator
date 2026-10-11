import type { PlayerSaveData } from "./save-types"
import { STORY_TUNING } from "@/lib/balance-tuning"

/**
 * Chance a player aged 32–37 retires at the week-52 check
 * (EventProcessor.processRetirements; from 38 it is forced unless he
 * qualifies as a legend, and under 32 there is no check).
 *
 * Phase 5.3: a player the manager persuaded to play on this season (the
 * veteran's last-dance storyline) has it multiplied by
 * STORY_TUNING.PERSUADE_RETIREMENT_FACTOR. The storyline copy quotes this.
 */
export function retirementChance(player: Pick<PlayerSaveData, "age" | "skill" | "form" | "health"> & Partial<Pick<PlayerSaveData, "personality">>, week: number): number {
    if (player.age < 32) return 0
    let chance = 0.05 * (player.age - 31)
    if (player.skill < 60) chance += 0.1
    if (player.form < 40) chance += 0.1
    if (player.health < 50) chance += 0.15
    if (player.personality?.persuadedSeason === Math.floor((week - 1) / 52) + 1) chance *= STORY_TUNING.PERSUADE_RETIREMENT_FACTOR
    return chance
}
