/**
 * Safe JSON utilities.
 *
 * Wraps JSON.parse / JSON.stringify so callers don't have to repeat the same
 * try/catch boilerplate. All failures route through `logger.error` instead of
 * raw console calls.
 */

import { logger } from "./logger"

/**
 * Parse a JSON string. Returns `fallback` (defaults to `null`) if the input is
 * empty, undefined, or fails to parse.
 */
export function safeParse<T = unknown>(input: string | null | undefined, fallback: T | null = null): T | null {
    if (input == null || input === "") return fallback
    try {
        return JSON.parse(input) as T
    } catch (err) {
        logger.error("[json-safe] parse failed", err instanceof Error ? err.message : err)
        return fallback
    }
}

/**
 * Stringify a value. Returns `fallback` (defaults to `""`) on failure
 * (circular references, BigInt, etc.).
 */
export function safeStringify(value: unknown, fallback = ""): string {
    try {
        return JSON.stringify(value)
    } catch (err) {
        logger.error("[json-safe] stringify failed", err instanceof Error ? err.message : err)
        return fallback
    }
}

/**
 * Structured-clone a JSON-serializable value via parse/stringify.
 * Returns the original reference if cloning fails (caller should treat the
 * result as best-effort).
 */
export function safeClone<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T
    } catch (err) {
        logger.error("[json-safe] clone failed", err instanceof Error ? err.message : err)
        return value
    }
}
