/**
 * Events and Training models for Pro FPS Esports Manager Simulation
 * Phase 3: Event system and training progression
 */

import { EventType, TrainingFocus } from "./enums"

/**
 * Game event that triggers during simulation
 */
export interface GameEvent {
    id: string
    type: EventType

    // When the event was triggered
    triggeredAt: Date
    gameWeek: number

    // Event-specific data
    data: EventData

    // Whether the event has been acknowledged by the player
    acknowledged: boolean

    // Optional choices for interactive events
    choices?: EventChoice[]

    // Selected choice (if applicable)
    selectedChoiceId?: string
}

/**
 * Event-specific data (discriminated union)
 */
export type EventData =
    | MoraleEventData
    | FinanceEventData
    | InjuryEventData
    | ContractEventData
    | MediaEventData
    | JobOfferEventData

export interface MoraleEventData {
    type: EventType.MORALE
    playerId: string
    moraleChange: number
    reason: string
}

export interface FinanceEventData {
    type: EventType.FINANCE
    amount: number
    source: string // "Sponsor", "Prize Money", "Transfer", etc.
    description: string
}

export interface InjuryEventData {
    type: EventType.INJURY
    playerId: string
    severity: "MINOR" | "MODERATE" | "SEVERE"
    weeksOut: number
    healthImpact: number
}

export interface ContractEventData {
    type: EventType.CONTRACT
    playerId: string
    action: "EXPIRING" | "RENEWAL_REQUEST" | "TRANSFER_OFFER"
    details: string
    weeksUntilExpiry?: number
    offerAmount?: number
}

export interface MediaEventData {
    type: EventType.MEDIA
    subject: string
    sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE"
    reputationImpact: number
    fanbaseImpact: number
}

/**
 * Job offer from another team for the manager
 */
export interface JobOfferEventData {
    type: EventType.JOB_OFFER
    offeringTeamId: string
    offeringTeamName: string
    offeringTeamTier: string
    salaryOffer: number        // Weekly salary offered
    signingBonus: number       // One-time bonus
    budgetAvailable: number    // Team's current budget
    worldRanking: number       // Their position in rankings
    deadlineWeek: number       // When offer expires
    reason: string             // Why they're offering (e.g. "impressed by Major run")
}

/**
 * Event choice for interactive events
 */
export interface EventChoice {
    id: string
    text: string

    // Effects of choosing this option
    effects: {
        morale?: number
        reputation?: number
        money?: number
        loyalty?: number // For specific player
        chemistry?: number
    }
}

/**
 * Training session model
 */
export interface TrainingSession {
    id: string
    week: number

    // Training parameters
    focus: TrainingFocus
    intensity: number // 1-10

    // Duration in days
    duration: number

    // Results per player
    results: TrainingResult[]
}

/**
 * Training result for a single player
 */
export interface TrainingResult {
    playerId: string

    // Stat gains based on focus
    statGains: {
        // Technical stats
        skill?: number
        awp?: number
        rifle?: number
        pistol?: number
        grenades?: number
        creativity?: number
        clutch?: number
        tactic?: number

        // Mental stats
        teamwork?: number

        // Physical stats
        reaction?: number
    }

    // Side effects
    fatigueGain: number
    moraleChange: number

    // Injury risk from training
    injuryRisk: number
}

/**
 * Training focus effects mapping
 * Defines which stats improve based on training focus
 */
export const TRAINING_EFFECTS = {
    [TrainingFocus.AIM]: {
        primaryStats: ["rifle", "awp", "pistol", "reaction"] as const,
        secondaryStats: ["skill"] as const,
        fatigueMultiplier: 1.2,
    },
    [TrainingFocus.TACTICS]: {
        primaryStats: ["tactic", "grenades", "creativity"] as const,
        secondaryStats: ["skill"] as const,
        fatigueMultiplier: 0.8,
    },
    [TrainingFocus.TEAMPLAY]: {
        primaryStats: ["teamwork"] as const,
        secondaryStats: ["tactic"] as const,
        fatigueMultiplier: 0.6,
        chemistryBonus: 5, // Improves team chemistry
    },
    [TrainingFocus.REST]: {
        primaryStats: [] as const,
        secondaryStats: [] as const,
        fatigueMultiplier: -1.5, // Reduces fatigue
        moraleBonus: 5,
    },
} as const

/**
 * Calculate training stat gains based on focus and intensity
 */
export function calculateTrainingGains(
    focus: TrainingFocus,
    intensity: number,
    playerProductivity: number,
    playerPotential: number
): TrainingResult["statGains"] {
    const effects = TRAINING_EFFECTS[focus]
    const gains: TrainingResult["statGains"] = {}

    // Base gain = intensity * productivity * potential factor
    const basePrimaryGain = (intensity / 10) * (playerProductivity / 100) * 2
    const baseSecondaryGain = basePrimaryGain * 0.5

    // Apply to primary stats
    effects.primaryStats.forEach(stat => {
        gains[stat] = basePrimaryGain * (playerPotential / 100)
    })

    // Apply to secondary stats
    effects.secondaryStats.forEach(stat => {
        gains[stat] = baseSecondaryGain * (playerPotential / 100)
    })

    return gains
}

/**
 * Calculate fatigue from training
 */
export function calculateTrainingFatigue(
    focus: TrainingFocus,
    intensity: number,
    playerEndurance: number
): number {
    const effects = TRAINING_EFFECTS[focus]
    const baseFatigue = intensity * 2 // 2-20 base fatigue
    const enduranceReduction = (playerEndurance / 100) * 0.5 // Up to 50% reduction

    return baseFatigue * effects.fatigueMultiplier * (1 - enduranceReduction)
}
