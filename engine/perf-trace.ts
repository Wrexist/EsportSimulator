/**
 * Lightweight simulation perf tracer.
 *
 * Gated by `ESM_PERF_TRACE=1` so production / UI runs stay silent.
 * Emits one line per instrumented boundary (single match, weekly tick, etc.)
 * and, on flush(), a short aggregate summary.
 *
 * This module is intentionally dependency-free so it can be imported from
 * any engine file without creating cycles.
 */

const enabled =
    typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.ESM_PERF_TRACE === "1"

type Bucket = {
    count: number
    totalMs: number
    minMs: number
    maxMs: number
}

const buckets = new Map<string, Bucket>()

function now(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now()
    }
    // Fallback (should not happen in Node >= 16 or modern browsers)
    const [s, ns] = process.hrtime()
    return s * 1e3 + ns / 1e6
}

export const perfTrace = {
    enabled,
    now,

    record(label: string, startedAt: number, extra?: Record<string, unknown>): number {
        const dt = now() - startedAt
        if (!enabled) return dt
        let b = buckets.get(label)
        if (!b) {
            b = { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 }
            buckets.set(label, b)
        }
        b.count += 1
        b.totalMs += dt
        if (dt < b.minMs) b.minMs = dt
        if (dt > b.maxMs) b.maxMs = dt
        const extras = extra
            ? " " +
              Object.entries(extra)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ")
            : ""
        // eslint-disable-next-line no-console
        console.log(`[perf] ${label} ${dt.toFixed(2)}ms${extras}`)
        return dt
    },

    /** Emit a compact aggregate summary for all recorded labels, then reset. */
    flush(): void {
        if (!enabled || buckets.size === 0) return
        // eslint-disable-next-line no-console
        console.log("[perf] --- summary ---")
        for (const [label, b] of buckets) {
            const avg = b.totalMs / b.count
            // eslint-disable-next-line no-console
            console.log(
                `[perf] ${label} count=${b.count} total=${b.totalMs.toFixed(1)}ms ` +
                    `avg=${avg.toFixed(2)}ms min=${b.minMs.toFixed(2)}ms max=${b.maxMs.toFixed(2)}ms`
            )
        }
        buckets.clear()
    },

    /** Get a snapshot of aggregate numbers without clearing. */
    snapshot(): Record<string, Bucket & { avgMs: number }> {
        const out: Record<string, Bucket & { avgMs: number }> = {}
        for (const [label, b] of buckets) {
            out[label] = { ...b, avgMs: b.count > 0 ? b.totalMs / b.count : 0 }
        }
        return out
    },

    reset(): void {
        buckets.clear()
    },
}
