/**
 * Tests for staff specialization → bonus wiring (engine/staff-specialization).
 *
 * Covers the full real-world vocabulary: the per-role strings emitted by
 * staff-generator ("Player Dev"/"Data Science"/"Mental Perf."/"Talent ID"),
 * the curated staff-db strings ("Tactical"/"Strategy"/"Macro & Meta"/
 * "Opponent Prep"/"Macro Analysis"/"Narrative & History"), and the legacy
 * tactical/mental/individual enum from data-generator.
 */

import {
    normalizeSpecialization,
    isSpecialist,
    getSpecializationMultiplier,
    psychologistMoraleDampen,
    SPECIALIST_MULTIPLIER,
    ROLE_PRIMARY_FOCUS,
} from "@/engine/staff-specialization"

describe("normalizeSpecialization", () => {
    test("generator strings map to their role's focus", () => {
        expect(normalizeSpecialization("Player Dev")).toBe("DEVELOPMENT")
        expect(normalizeSpecialization("Data Science")).toBe("TACTICAL")
        expect(normalizeSpecialization("Mental Perf.")).toBe("MENTAL")
        expect(normalizeSpecialization("Talent ID")).toBe("SCOUTING")
    })

    test("curated-DB analyst strings normalize to TACTICAL", () => {
        expect(normalizeSpecialization("Tactical")).toBe("TACTICAL")
        expect(normalizeSpecialization("Strategy")).toBe("TACTICAL")
        expect(normalizeSpecialization("Macro & Meta")).toBe("TACTICAL")
        expect(normalizeSpecialization("Macro Analysis")).toBe("TACTICAL")
        expect(normalizeSpecialization("Opponent Prep")).toBe("TACTICAL")
    })

    test("legacy tactical/mental/individual enum maps correctly", () => {
        expect(normalizeSpecialization("tactical")).toBe("TACTICAL")
        expect(normalizeSpecialization("mental")).toBe("MENTAL")
        expect(normalizeSpecialization("individual")).toBe("DEVELOPMENT")
    })

    test("'mental' is not shadowed by the development 'mentor' key", () => {
        expect(normalizeSpecialization("Mental Performance")).toBe("MENTAL")
    })

    test("unknown / empty strings fall back to GENERAL", () => {
        expect(normalizeSpecialization("Narrative & History")).toBe("GENERAL")
        expect(normalizeSpecialization("General")).toBe("GENERAL")
        expect(normalizeSpecialization("")).toBe("GENERAL")
        expect(normalizeSpecialization(undefined)).toBe("GENERAL")
        expect(normalizeSpecialization(null)).toBe("GENERAL")
    })
})

describe("isSpecialist — alignment with role's core domain", () => {
    test("every generated role is a true specialist by construction", () => {
        expect(isSpecialist({ role: "coach", specialization: "Player Dev" })).toBe(true)
        expect(isSpecialist({ role: "analyst", specialization: "Data Science" })).toBe(true)
        expect(isSpecialist({ role: "psychologist", specialization: "Mental Perf." })).toBe(true)
        expect(isSpecialist({ role: "scout", specialization: "Talent ID" })).toBe(true)
    })

    test("off-domain curated staff are NOT specialists", () => {
        // A coach labeled "Tactical" is tactically minded, not a development specialist.
        expect(isSpecialist({ role: "coach", specialization: "Tactical" })).toBe(false)
        expect(isSpecialist({ role: "coach", specialization: "Narrative & History" })).toBe(false)
        // A curated analyst with a strategy specialization IS aligned.
        expect(isSpecialist({ role: "analyst", specialization: "Opponent Prep" })).toBe(true)
    })

    test("ROLE_PRIMARY_FOCUS pins the four role domains", () => {
        expect(ROLE_PRIMARY_FOCUS).toEqual({
            coach: "DEVELOPMENT",
            analyst: "TACTICAL",
            psychologist: "MENTAL",
            scout: "SCOUTING",
        })
    })
})

describe("getSpecializationMultiplier — bounded, multiply-unconditionally safe", () => {
    test("specialist gets the bounded bonus, others exactly 1.0", () => {
        expect(getSpecializationMultiplier({ role: "coach", specialization: "Player Dev" })).toBe(SPECIALIST_MULTIPLIER)
        expect(getSpecializationMultiplier({ role: "coach", specialization: "Tactical" })).toBe(1)
        expect(getSpecializationMultiplier({ role: "analyst", specialization: undefined })).toBe(1)
    })

    test("unknown role yields the neutral 1.0 (no crash, no bonus)", () => {
        expect(getSpecializationMultiplier({ role: "manager", specialization: "Player Dev" })).toBe(1)
    })
})

describe("psychologistMoraleDampen — bounded defeat-morale softening", () => {
    const psych = (stressResistance: number, specialization = "Mental Perf.") =>
        ({ role: "psychologist", specialization, stats: { stressResistance } })

    test("no staff / no psychologist → 0 (safe to apply unconditionally)", () => {
        expect(psychologistMoraleDampen(undefined)).toBe(0)
        expect(psychologistMoraleDampen([])).toBe(0)
        expect(psychologistMoraleDampen([{ role: "coach", specialization: "Player Dev", stats: { stressResistance: 100 } }])).toBe(0)
    })

    test("scales with stressResistance and is capped at 0.4", () => {
        // 50 stress × 1.1 specialist = 55 → (55/100)*0.4 = 0.22
        expect(psychologistMoraleDampen([psych(50)])).toBeCloseTo(0.22, 5)
        // High stress saturates at the 0.4 cap.
        expect(psychologistMoraleDampen([psych(100)])).toBe(0.4)
    })

    test("an off-domain psychologist loses the specialist bump", () => {
        // 50 stress × 1.0 (off-domain) = 50 → 0.20
        expect(psychologistMoraleDampen([psych(50, "Tactical")])).toBeCloseTo(0.2, 5)
    })
})
