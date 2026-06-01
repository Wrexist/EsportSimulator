/**
 * Regression tests for Phase 2 security hardening:
 *  - parseUntrustedJson strips prototype-pollution keys
 *  - mod-loader rejects unsafe portrait/logo asset paths
 */

import { parseUntrustedJson, safeParseUntrusted } from "@/lib/json-safe"
import { validateModPayload } from "@/engine/mod-loader"

describe("parseUntrustedJson — prototype-pollution guard", () => {
    afterEach(() => {
        // Ensure no test polluted the global prototype.
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it("strips a __proto__ key from parsed objects", () => {
        const parsed = parseUntrustedJson<Record<string, unknown>>(
            '{"a":1,"__proto__":{"polluted":true}}'
        )
        expect(parsed.a).toBe(1)
        expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it("strips constructor / prototype keys", () => {
        const parsed = parseUntrustedJson<Record<string, unknown>>(
            '{"constructor":{"x":1},"prototype":{"y":2},"keep":3}'
        )
        expect(parsed.keep).toBe(3)
        expect(Object.prototype.hasOwnProperty.call(parsed, "prototype")).toBe(false)
    })

    it("still parses normal nested data unchanged", () => {
        const parsed = parseUntrustedJson<{ teams: { id: string }[] }>(
            '{"teams":[{"id":"t1"},{"id":"t2"}]}'
        )
        expect(parsed.teams.map(t => t.id)).toEqual(["t1", "t2"])
    })

    it("safeParseUntrusted returns the fallback on invalid JSON", () => {
        expect(safeParseUntrusted("not json", null)).toBeNull()
        expect(safeParseUntrusted("", "fb")).toBe("fb")
    })
})

describe("validateModPayload — unsafe asset paths", () => {
    function modPlayer(portraitPath: string) {
        const stats: Record<string, number> = {}
        for (const f of [
            "skill", "awp", "rifle", "pistol", "grenades", "creativity", "clutch",
            "tactic", "leader", "teamwork", "amicability", "productivity",
            "stressResistance", "loyalty", "reaction", "eyesight", "health",
            "strength", "endurance", "potential",
        ]) stats[f] = 50
        return {
            id: "p1", name: "Real Name", nickname: "nick", age: 22,
            nationality: "SE", portraitPath, role: "RIFLER", tier: "PRO", ...stats,
        }
    }

    it("accepts a safe relative portrait path", () => {
        const r = validateModPayload({ players: [modPlayer("assets/teams/x/p.png")] })
        expect(r.ok).toBe(true)
    })

    it("rejects a javascript: URI portrait path", () => {
        const r = validateModPayload({ players: [modPlayer("javascript:alert(1)")] })
        expect(r.ok).toBe(false)
    })

    it("rejects a data: URI portrait path", () => {
        const r = validateModPayload({ players: [modPlayer("data:image/svg+xml,<svg/>")] })
        expect(r.ok).toBe(false)
    })

    it("rejects parent-directory traversal", () => {
        const r = validateModPayload({ players: [modPlayer("../../etc/passwd")] })
        expect(r.ok).toBe(false)
    })

    it("rejects a remote URL", () => {
        const r = validateModPayload({ players: [modPlayer("https://evil.example/x.png")] })
        expect(r.ok).toBe(false)
    })
})
