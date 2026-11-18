/**
 * MARKET-11 (2026-11-17): the signing reveal crops the signature to its own
 * strokes, so it fills its place above "Signed by the manager".
 */
import { signatureViewBox } from "@/components/moments/signature-box"

describe("signatureViewBox", () => {
    test("crops to the strokes with a small margin; dots' relative nudges are ignored", () => {
        const box = signatureViewBox({ d: "M100 60Q110 40 120 50L140 70M150 55l0.1 0", w: 360, h: 120 })
        expect(box).toEqual({ x: 94, y: 34, w: 62, h: 42 })
    })

    test("an empty path keeps the pad's own box", () => {
        expect(signatureViewBox({ d: "", w: 360, h: 120 })).toEqual({ x: 0, y: 0, w: 360, h: 120 })
    })
})
