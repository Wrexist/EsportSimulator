/**
 * Final release fixes (audit 2026-11-17):
 *  - Calendar, competition owner decision 2 (a): the one-week B/C events and
 *    the Showdowns are out of the Major and RMR weeks, and every qualifier
 *    still finishes before its event (COMP-01).
 */
import { FULL_TOURNAMENT_CALENDAR, getTournamentById } from "@/data/tournament-calendar"

const lastWeek = (d: { startWeek: number; duration: number }) => d.startWeek + d.duration - 1

describe("calendar: small events stay out of Major and RMR weeks", () => {
    const big = FULL_TOURNAMENT_CALENDAR.filter(d => d.id.startsWith("major_") || d.id.includes("_rmr_"))
    const bigWeeks = new Set(big.flatMap(d => Array.from({ length: d.duration }, (_, i) => d.startWeek + i)))
    const small = FULL_TOURNAMENT_CALENDAR.filter(d => (d.duration === 1 && (d.tier === "B_TIER" || d.tier === "C_TIER")) || d.id.includes("showdown"))

    test("the Majors and RMRs keep the 2026-11-15 weeks", () => {
        expect(big.map(d => `${d.id}:${d.startWeek}+${d.duration}`).sort()).toEqual([
            "copenhagen_rmr_asia:7+3", "copenhagen_rmr_eu:7+8", "copenhagen_rmr_na:7+8",
            "major_copenhagen:15+8", "major_shanghai:38+8",
            "shanghai_rmr_asia:30+3", "shanghai_rmr_eu:30+8", "shanghai_rmr_na:30+8",
        ])
    })

    test("no one-week B/C event or Showdown plays in a Major or RMR week", () => {
        expect(small.length).toBeGreaterThanOrEqual(9)
        const inside = small.filter(d => Array.from({ length: d.duration }, (_, i) => d.startWeek + i).some(w => bigWeeks.has(w)))
        expect(inside.map(d => `${d.id}@w${d.startWeek}`)).toEqual([])
        // A one-week bracket plays its last rounds on the next weekend: that week is clear too.
        expect(small.filter(d => bigWeeks.has(lastWeek(d) + 1)).map(d => d.id)).toEqual([])
    })

    test("they stay inside the season, clear of week 1 and the season review weeks", () => {
        for (const d of small) {
            expect(d.startWeek).toBeGreaterThanOrEqual(2)
            expect(lastWeek(d)).toBeLessThanOrEqual(50)
        }
    })

    test("the Fall Showdown's circuit points are in before the World Final field is drawn", () => {
        expect(lastWeek(getTournamentById("blast_fall_showdown")!)).toBeLessThan(getTournamentById("blast_world_final")!.startWeek)
    })

    test("COMP-01: every qualifier still finishes before the event it feeds", () => {
        for (const q of FULL_TOURNAMENT_CALENDAR.filter(d => d.qualifierFor)) {
            const main = getTournamentById(q.qualifierFor!)!
            expect({ q: q.id, ends: lastWeek(q) < main.startWeek }).toEqual({ q: q.id, ends: true })
        }
    })
})
