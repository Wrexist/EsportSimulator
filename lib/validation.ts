import { z } from 'zod'
import { CURRENT_SAVE_VERSION, MIN_SUPPORTED_VERSION } from '@/engine/save-types'

/**
 * Validation schemas for game data
 * Ensures data integrity and prevents corruption
 */

// Contract validation
export const ContractInputSchema = z.object({
    salary: z.number()
        .min(1000, 'Salary must be at least $1,000')
        .max(50000, 'Salary cannot exceed $50,000'),
    duration: z.number()
        .min(1, 'Contract must be at least 1 week')
        .max(208, 'Contract cannot exceed 4 years (208 weeks)'),
    signingBonus: z.number()
        .min(0, 'Signing bonus cannot be negative')
        .max(100000, 'Signing bonus cannot exceed $100,000')
})

export type ContractInput = z.infer<typeof ContractInputSchema>

// Transfer offer validation
export const TransferOfferSchema = z.object({
    transferFee: z.number()
        .min(0, 'Transfer fee cannot be negative')
        .max(10000000, 'Transfer fee cannot exceed $10M'),
    salary: z.number()
        .min(500, 'Salary must be at least $500')
        .max(100000, 'Salary cannot exceed $100,000'),
    duration: z.number()
        .int()
        .min(1)
        .max(208)
})

export type TransferOffer = z.infer<typeof TransferOfferSchema>

// Player stats use a 0-100 scale. 0 is valid (unrated/new player).
export const PlayerStatsSchema = z.object({
    aim: z.number().min(0).max(100),
    positioning: z.number().min(0).max(100),
    utility: z.number().min(0).max(100),
    gamesense: z.number().min(0).max(100),
    clutch: z.number().min(0).max(100),
    consistency: z.number().min(0).max(100),
    // Additional stats
    rifle: z.number().min(0).max(100).optional(),
    awp: z.number().min(0).max(100).optional(),
    creativity: z.number().min(0).max(100).optional(),
    tactic: z.number().min(0).max(100).optional(),
    teamwork: z.number().min(0).max(100).optional()
})

// Save file validation (basic structure)
export const GameSaveMetadataSchema = z.object({
    saveVersion: z.number()
        .min(MIN_SUPPORTED_VERSION, `Save version must be at least ${MIN_SUPPORTED_VERSION} (current: ${CURRENT_SAVE_VERSION})`),
    saveId: z.string().uuid(),
    saveName: z.string().min(1).max(100),
    playerTeamId: z.string(),
    currentWeek: z.number().min(0),
    createdAt: z.string(),
    updatedAt: z.string()
})

// Full save file validation (comprehensive)
export const GameSaveValidationSchema = z.object({
    // Metadata
    saveVersion: z.number(),
    saveId: z.string(),
    saveName: z.string(),
    playerTeamId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    currentWeek: z.number(),
    gameStartDate: z.string(),
    managerDetails: z.object({
        name: z.string(),
        level: z.number(),
        xp: z.number(),
        reputation: z.number(),
        careerWins: z.number(),
        careerLosses: z.number(),
        championships: z.number()
    }),

    // Core arrays
    teams: z.array(z.any()),
    players: z.array(z.any()),
    contracts: z.array(z.any()),
    tournaments: z.array(z.any()),
    staff: z.array(z.any()),
    scheduledMatches: z.array(z.any()),
    completedMatches: z.array(z.any()),
    scheduledActivities: z.array(z.any()),
    financeLedger: z.array(z.any()),
    eventsLog: z.array(z.any()),
    acknowledgedEventIds: z.array(z.string()),
    hallOfFame: z.array(z.any()),

    // Optional fields
    rngState: z.number().optional(),
    marketStaff: z.array(z.any()).optional(),
    facilityLevels: z.record(z.number()).optional()
}).passthrough() // Allow additional fields for forward compatibility

/**
 * Validate full save file
 */
export function validateSaveFile(data: unknown): {
    success: boolean
    data?: any
    errors?: string[]
} {
    const result = GameSaveValidationSchema.safeParse(data)

    if (result.success) {
        return { success: true, data: result.data }
    }

    return {
        success: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    }
}

/**
 * Validate contract input
 */
export function validateContract(input: unknown): {
    success: boolean
    data?: ContractInput
    errors?: string[]
} {
    const result = ContractInputSchema.safeParse(input)

    if (result.success) {
        return { success: true, data: result.data }
    }

    return {
        success: false,
        errors: result.error.errors.map(e => e.message)
    }
}

/**
 * Validate transfer offer
 */
export function validateTransferOffer(input: unknown): {
    success: boolean
    data?: TransferOffer
    errors?: string[]
} {
    const result = TransferOfferSchema.safeParse(input)

    if (result.success) {
        return { success: true, data: result.data }
    }

    return {
        success: false,
        errors: result.error.errors.map(e => e.message)
    }
}

/**
 * Validate save file metadata
 */
export function validateSaveMetadata(data: unknown): {
    success: boolean
    errors?: string[]
} {
    const result = GameSaveMetadataSchema.safeParse(data)

    if (result.success) {
        return { success: true }
    }

    return {
        success: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    }
}

/**
 * Create a validator with custom schema
 */
export function createValidator<T extends z.ZodType>(schema: T) {
    return (data: unknown): {
        success: boolean
        data?: z.infer<T>
        errors?: string[]
    } => {
        const result = schema.safeParse(data)

        if (result.success) {
            return { success: true, data: result.data }
        }

        return {
            success: false,
            errors: result.error.errors.map(e => e.message)
        }
    }
}
