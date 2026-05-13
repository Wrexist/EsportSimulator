/**
 * Debug Logger Utility
 * Wraps console.log to only output in development mode
 * Prevents debug spam in production builds
 */

const IS_DEV = process.env.NODE_ENV === 'development'

export const debugLog = (...args: any[]) => {
    if (IS_DEV) {
        console.log(...args)
    }
}

export const debugWarn = (...args: any[]) => {
    if (IS_DEV) {
        console.warn(...args)
    }
}

export const debugError = (...args: any[]) => {
    if (IS_DEV) {
        console.error(...args)
    }
}

// Shorthand for common patterns
export const debug = {
    log: debugLog,
    warn: debugWarn,
    error: debugError,

    // Weekly processor step logging
    step: (week: number, step: number, message: string) => {
        if (IS_DEV) {
            console.log(`[Week ${week}] Step ${step}: ${message}`)
        }
    },

    // Match/Tournament logging
    match: (message: string) => {
        if (IS_DEV) {
            console.log(`[Match] ${message}`)
        }
    },

    tournament: (message: string) => {
        if (IS_DEV) {
            console.log(`[Tournament] ${message}`)
        }
    },

    // Guard/Navigation logging
    guard: (message: string) => {
        if (IS_DEV) {
            console.log(`[Guard] ${message}`)
        }
    }
}
