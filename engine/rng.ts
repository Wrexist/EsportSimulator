/**
 * Seeded Random Number Generator (RNG)
 * Phase 4: Deterministic, inspectable simulation
 * 
 * Uses mulberry32 algorithm for high-quality pseudorandom numbers
 * RNG instance must be passed explicitly to all simulation functions
 * NO global randomness allowed
 */

/**
 * Mulberry32 seeded random number generator
 * High quality 32-bit PRNG with good statistical properties
 */
export class SeededRNG {
    private state: number

    constructor(seed: number) {
        this.state = seed >>> 0 // Ensure 32-bit unsigned
    }

    /**
     * Generate next random number in [0, 1) range
     * Uses mulberry32 algorithm
     */
    next(): number {
        let t = (this.state += 0x6d2b79f5)
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    /**
     * Backward-compatible alias for next()
     */
    random(): number {
        return this.next()
    }

    /**
     * Generate random number in specified range [min, max)
     */
    range(min: number, max: number): number {
        return min + this.next() * (max - min)
    }

    /**
     * Generate random integer in range [min, max] inclusive
     */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1))
    }

    /**
     * Backward-compatible alias for int()
     */
    nextInt(min: number, max: number): number {
        return this.int(min, max)
    }

    /**
     * Random boolean with specified probability (default 0.5)
     */
    bool(probability: number = 0.5): boolean {
        return this.next() < probability
    }

    /**
     * Pick random element from array
     */
    pick<T>(array: T[]): T {
        if (array.length === 0) {
            throw new Error("pick() called on empty array")
        }
        return array[Math.floor(this.next() * array.length)]
    }

    /**
     * Shuffle array (Fisher-Yates)
     */
    shuffle<T>(array: T[]): T[] {
        const result = [...array]
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1))
                ;[result[i], result[j]] = [result[j], result[i]]
        }
        return result
    }

    /**
     * Get current state (for replay/debugging)
     */
    getState(): number {
        return this.state
    }

    /**
     * Fork RNG with new seed (for isolated sub-simulations)
     */
    fork(): SeededRNG {
        return new SeededRNG(this.int(1, 2147483646))
    }
}

/**
 * Create RNG from match seed for deterministic replay
 */
export function createMatchRNG(matchSeed: number): SeededRNG {
    return new SeededRNG(matchSeed)
}

/**
 * Generate a new random seed
 */
export function generateSeed(): number {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const values = new Uint32Array(1)
        crypto.getRandomValues(values)
        return (values[0] % 2147483647) || 1
    }
    // Fallback for runtimes without Web Crypto
    const fallback = (Date.now() ^ (Date.now() >>> 7)) >>> 0
    return (fallback % 2147483647) || 1
}

// Backward-compatible alias used by legacy modules.
export { SeededRNG as SeededRandom }
