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
 * Keys that must never survive deserialization of untrusted data — assigning
 * them during a later spread/merge can poison `Object.prototype`.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

/**
 * Parse JSON from an untrusted source (save files, community mods, imports).
 *
 * Strips prototype-pollution keys (`__proto__`, `constructor`, `prototype`) via
 * a reviver so a hand-edited file cannot poison `Object.prototype` when the
 * parsed object is later deep-merged or spread. Throws on invalid JSON, exactly
 * like `JSON.parse`, so callers keep their existing try/catch handling.
 */
export function parseUntrustedJson<T = unknown>(input: string): T {
    return JSON.parse(input, (key, value) => {
        if (DANGEROUS_KEYS.has(key)) return undefined
        return value
    }) as T
}

/**
 * Untrusted-source variant of {@link safeParse}: strips prototype-pollution
 * keys and returns `fallback` instead of throwing on invalid JSON.
 */
export function safeParseUntrusted<T = unknown>(input: string | null | undefined, fallback: T | null = null): T | null {
    if (input == null || input === "") return fallback
    try {
        return parseUntrustedJson<T>(input)
    } catch (err) {
        logger.error("[json-safe] untrusted parse failed", err instanceof Error ? err.message : err)
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
