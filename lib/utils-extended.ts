/**
 * Code Refactoring Utilities
 * Common patterns and helpers to reduce duplication
 */

/**
 * Safely get nested property
 */
export function safeGet<T, K extends keyof T>(
    obj: T | undefined | null,
    key: K,
    defaultValue?: T[K]
): T[K] | undefined {
    if (!obj) return defaultValue
    return obj[key] ?? defaultValue
}

/**
 * Deep get with path
 */
export function getNestedValue(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.')
    let result = obj

    for (const key of keys) {
        if (result == null) return defaultValue
        result = result[key]
    }

    return result ?? defaultValue
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

/**
 * Format currency consistently with smart abbreviation
 * e.g., $1.2M, $50k, $500
 */
export function formatCurrency(amount: number, prefix = '$', abbreviate = true): string {
    if (!abbreviate) return `${prefix}${amount.toLocaleString()}`
    const abs = Math.abs(amount)
    const sign = amount < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 10_000) return `${sign}${prefix}${Math.round(abs / 1_000)}k`
    if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}k`
    return `${sign}${prefix}${abs.toLocaleString()}`
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 0): string {
    return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Calculate average
 */
export function average(numbers: number[]): number {
    if (numbers.length === 0) return 0
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
        const groupKey = String(item[key])
        if (!result[groupKey]) {
            result[groupKey] = []
        }
        result[groupKey].push(item)
        return result
    }, {} as Record<string, T[]>)
}

/**
 * Sort array by multiple keys
 */
export function sortBy<T>(
    array: T[],
    ...keys: Array<keyof T | ((item: T) => any)>
): T[] {
    return [...array].sort((a, b) => {
        for (const key of keys) {
            const aVal = typeof key === 'function' ? key(a) : a[key]
            const bVal = typeof key === 'function' ? key(b) : b[key]

            if (aVal < bVal) return -1
            if (aVal > bVal) return 1
        }
        return 0
    })
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[], key?: keyof T): T[] {
    if (!key) {
        return [...new Set(array)]
    }

    const seen = new Set()
    return array.filter(item => {
        const value = item[key]
        if (seen.has(value)) return false
        seen.add(value)
        return true
    })
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}

/**
 * Partition array into two based on predicate
 */
export function partition<T>(
    array: T[],
    predicate: (item: T) => boolean
): [T[], T[]] {
    const pass: T[] = []
    const fail: T[] = []

    array.forEach(item => {
        if (predicate(item)) {
            pass.push(item)
        } else {
            fail.push(item)
        }
    })

    return [pass, fail]
}

/**
 * Sleep/delay helper
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry with exponential backoff
 */
export async function retry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    delay = 1000
): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error as Error
            if (attempt < maxAttempts) {
                await sleep(delay * Math.pow(2, attempt - 1))
            }
        }
    }

    throw lastError
}

/**
 * Type-safe Object.entries
 */
export function entries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
    return Object.entries(obj) as [keyof T, T[keyof T]][]
}

/**
 * Type-safe Object.keys
 */
export function keys<T extends object>(obj: T): (keyof T)[] {
    return Object.keys(obj) as (keyof T)[]
}

/**
 * Get dynamic tournament name with year based on game week
 * Replaces hardcoded years (e.g., "2025") with the calculated game year
 * @param name - Original tournament name (e.g., "Winter Open Katova 2025")
 * @param currentWeek - Current game week
 * @param baseYear - The year used in the original data (default 2025)
 */
export function getDynamicTournamentName(
    name: string,
    currentWeek: number,
    baseYear: number = 2025
): string {
    const currentSeason = Math.floor((currentWeek - 1) / 52) + 1
    const gameYear = baseYear + (currentSeason - 1)
    return name.replace(/\b20\d{2}\b/, String(gameYear))
}
