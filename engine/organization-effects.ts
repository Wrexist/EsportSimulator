import type { FacilitySaveData, StaffSaveData } from './save-types'
import { ECONOMY_CONSTANTS, FACILITY_CONSTANTS } from '@/lib/constants'
import { getSpecializationMultiplier } from './staff-specialization'
import { getStaffPassiveBonuses } from './talent-trees'

export const FACILITY_TYPES = ['TRAINING', 'RECOVERY', 'TACTICAL', 'FANZONE'] as const
export function facilityLevel(level: number): number {
    return Number.isFinite(level) ? Math.max(0, Math.min(5, Math.floor(level))) : 0
}
export function facilityWeeklyCost(level: number): number {
    return Math.pow(facilityLevel(level), FACILITY_CONSTANTS.COST_EXPONENT) * ECONOMY_CONSTANTS.FACILITY_BASE_COST
}
export function facilityEffect(type: FacilitySaveData['type'], level: number): string {
    const n = facilityLevel(level)
    switch (type) {
        case 'TRAINING': return `+${n * 10}% weekly stat gains`
        case 'RECOVERY': return `+${n} fatigue recovered / week`
        case 'TACTICAL': return `+${n * 20}% tactic, leadership & teamwork gains`
        case 'FANZONE': return `+${n * 20}% fan income; +${n * 15}% organic growth`
    }
}

/** Shared with weekly training and the staff summary. Bonuses do not award match XP. */
export function staffDevelopmentEffects(staff: StaffSaveData[]) {
    let development = 0, efficiency = 0, mastery = 0, recovery = 0, tactical = 0
    for (const member of staff) {
        const bounded = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.min(100, value!)) : 50
        const multiplier = getSpecializationMultiplier(member)
        const talents = getStaffPassiveBonuses(member.role, member.unlockedTalentIds || [])
        if (member.role === 'coach') development += bounded(member.stats?.development) * multiplier
        if (member.role === 'psychologist') recovery += bounded(member.stats?.mentalRecovery) / 10 * multiplier + (talents.recovery_amount || 0)
        if (member.role === 'analyst') tactical += bounded(member.stats?.analysis) / 20 * multiplier
        efficiency += talents.training_efficiency || 0
        mastery += talents.tactic_mastery || 0
    }
    return { trainingMultiplier: (1 + Math.min(110, development) / 200) * (1 + Math.min(100, efficiency) / 100),
        tacticMultiplier: 1 + Math.min(100, mastery) / 100, recovery: Math.min(30, recovery), tactical: Math.min(5.5, tactical) }
}
