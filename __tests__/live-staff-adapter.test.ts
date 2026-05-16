/**
 * Coverage for engine/match/live-staff-adapter.ts.
 *
 * Pins the StaffSaveData → runtime staff bundle adapter used by both
 * useLiveMatch init (per-team setup) and getTeamStaff (live lookups).
 * Two consumers used to maintain separate copies of this logic before
 * Phase L4 consolidated them.
 */

import { buildRuntimeStaff } from "@/engine/match/live-staff-adapter"

function makeStaff(role: string, id = `staff_${role}`, level = 3): { id: string; name: string; level: number; salaryPerWeek: number; role: string } {
    return { id, name: id, level, salaryPerWeek: level * 500, role }
}

describe("buildRuntimeStaff", () => {
    test("empty staff array → all slots undefined", () => {
        const result = buildRuntimeStaff([])
        expect(result.coach).toBeUndefined()
        expect(result.analyst).toBeUndefined()
        expect(result.psychologist).toBeUndefined()
    })

    test("only a coach in the input → analyst + psych remain undefined", () => {
        const result = buildRuntimeStaff([makeStaff("coach")])
        expect(result.coach).toBeDefined()
        expect(result.analyst).toBeUndefined()
        expect(result.psychologist).toBeUndefined()
    })

    test("all three roles produce all three runtime objects with correct ids", () => {
        const result = buildRuntimeStaff([
            makeStaff("coach", "c1"),
            makeStaff("analyst", "a1"),
            makeStaff("psychologist", "p1"),
        ])
        expect(result.coach?.id).toBe("c1")
        expect(result.analyst?.id).toBe("a1")
        expect(result.psychologist?.id).toBe("p1")
    })

    test("two coaches → only the first is picked (single-staff-per-role contract)", () => {
        const result = buildRuntimeStaff([
            makeStaff("coach", "c1"),
            makeStaff("coach", "c2"),
        ])
        expect(result.coach?.id).toBe("c1")
    })

    test("unknown role types are ignored", () => {
        const result = buildRuntimeStaff([
            makeStaff("coach"),
            makeStaff("medic"), // not a recognised role
            makeStaff("manager"),
        ])
        expect(result.coach).toBeDefined()
        expect(result.analyst).toBeUndefined()
        expect(result.psychologist).toBeUndefined()
    })

    test("level + salary are passed through to the runtime objects", () => {
        const result = buildRuntimeStaff([makeStaff("coach", "c1", 5)])
        expect(result.coach?.level).toBe(5)
        expect(result.coach?.salary).toBe(2500) // level * 500
    })
})
