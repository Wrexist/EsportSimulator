import { StaffGenerator } from "@/engine/staff-generator"
import { SeededRNG } from "@/engine/rng"

describe("staff market names", () => {
    it("lists everyone once with a full name; only psychologists carry a title", () => {
        for (let week = 1; week <= 40; week++) {
            const market = StaffGenerator.generateWeeklyMarket(week, 20, new SeededRNG(week * 31 + 7))
            const rotated = StaffGenerator.rotateMarket(market, week + 1)
            for (const list of [market, rotated]) {
                expect(new Set(list.map(s => s.name)).size).toBe(list.length)
                for (const s of list.filter(m => m.id.startsWith("gen_"))) {
                    expect(s.name.startsWith("Dr. ")).toBe(s.role === "psychologist")
                    expect(s.name.replace(/^Dr\. /, "").split(" ")).toHaveLength(2)
                }
            }
        }
    })

    it("keeps the same market for the same seed", () => {
        const a = StaffGenerator.generateWeeklyMarket(5, 20, new SeededRNG(99))
        const b = StaffGenerator.generateWeeklyMarket(5, 20, new SeededRNG(99))
        expect(a).toEqual(b)
    })
})
