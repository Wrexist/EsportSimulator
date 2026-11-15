import { freeze } from "immer"

/**
 * Deep-freezes a plain data tree exactly as Immer's auto-freeze would (own
 * enumerable string keys of plain objects and arrays; anything else goes
 * through Immer's own `freeze`), but without Immer's per-object
 * `Object.entries` + plain-object test, which made it about 4x slower.
 *
 * Why the store freezes at all: the week tick and loadGame commit a plain,
 * unfrozen save. Immer then deep-freezes it inside the next producer, and it
 * must: with auto-freeze off, every later producer walked the unfrozen tree
 * instead (0.5-0.7 s per store update on a season-3 career, measured for
 * ENGINE-03). Freezing the committed save here, once and cheaply, leaves that
 * producer nothing to do.
 */
export function deepFreezeState<T>(value: T): T {
    freezeValue(value)
    return value
}

function freezeValue(value: unknown): void {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return
    if (Array.isArray(value)) {
        Object.freeze(value)
        for (let i = 0; i < value.length; i++) freezeValue(value[i])
        return
    }
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
        // Maps, Sets, class instances, other realms: Immer's own rules.
        freeze(value, true)
        return
    }
    Object.freeze(value)
    for (const key in value as Record<string, unknown>) freezeValue((value as Record<string, unknown>)[key])
}
