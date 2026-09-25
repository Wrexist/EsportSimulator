import type { LiveEconomyState } from '@/lib/live-match-utils'

/** Optional for older previews; absence retains their boolean armor interpretation. */
export interface PhysicalEconomyState extends LiveEconomyState { armorPoints?: number }
export function physicalArmor(state: PhysicalEconomyState): number {
    if (state.armorPoints === undefined) return state.hasArmor ? 100 : 0
    if (!Number.isFinite(state.armorPoints) || state.armorPoints < 0 || state.armorPoints > 100
        || state.hasArmor !== (state.armorPoints > 0)) throw Error('Invalid remaining armor')
    return state.armorPoints
}
