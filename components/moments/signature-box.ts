import type { SigningSignature } from "@/engine/moments"

/**
 * MARKET-11 (2026-11-17): the signature's own box (its strokes, with a little
 * margin), so it fills its place above the caption instead of sitting as a
 * small mark inside the whole signing pad. Relative "l" nudges (dots) are
 * left out; they move a point by a fraction of a unit.
 */
export function signatureViewBox(sig: SigningSignature): { x: number; y: number; w: number; h: number } {
    const xs: number[] = [], ys: number[] = []
    for (const m of sig.d.matchAll(/([MQL])([^MQLl]*)/g)) {
        const nums = m[2].trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
        for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]) }
    }
    if (!xs.length) return { x: 0, y: 0, w: sig.w, h: sig.h }
    const pad = 6
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
}
