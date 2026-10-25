import { bestFiveOvr, marketStandings, rivalFeePremium, rivalInterest, rivalLine } from "@/engine/transfer-hype"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { buildSigningMoment } from "@/store/slices/moments-slice"
import { createLaunchFixture } from "@/scripts/launch/fixtures"
import type { PlayerSaveData } from "@/engine/save-types"

const player = (id: string, age: number, skill: number): PlayerSaveData => ({ id, age, skill, isRetired: false } as unknown as PlayerSaveData)

describe("market standing", () => {
    test("top 1% Icon, top 5% Star, young top 20% Wonderkid, by value", () => {
        const players = Array.from({ length: 200 }, (_, i) => player(`p${i}`, i % 2 ? 19 : 26, 50))
        const values = new Map(players.map((p, i) => [p.id, 1000 - i]))
        const s = marketStandings(players, 1, values)
        expect([...s.values()].filter(v => v === "ICON")).toHaveLength(2)
        expect([...s.values()].filter(v => v === "STAR")).toHaveLength(8)
        expect(s.get("p0")).toBe("ICON")
        expect(s.get("p9")).toBe("STAR")
        expect(s.get("p11")).toBe("WONDERKID") // age 19, rank 12
        expect(s.get("p12")).toBeUndefined() // age 26
        expect(s.get("p41")).toBeUndefined() // outside the top 20%
    })

    test("players missing from the values map are still ranked by their own value", () => {
        const save = createLaunchFixture("first-week")
        const full = marketStandings(save.players, save.currentWeek)
        const partial = new Map(save.players.slice(1).map(p => [p.id, evaluatePlayer(p, undefined, undefined, save.currentWeek).transferValue]))
        expect(marketStandings(save.players, save.currentWeek, partial)).toEqual(full)
    })

    test("retired players are not ranked; an empty pool is empty", () => {
        const players = [player("a", 25, 50), { ...player("b", 25, 50), isRetired: true }]
        const s = marketStandings(players, 1, new Map([["a", 1], ["b", 999]]))
        expect(s.get("a")).toBe("ICON")
        expect(s.has("b")).toBe(false)
        expect(marketStandings([], 1).size).toBe(0)
    })
})

describe("rival interest", () => {
    test("only clubs with room that would start him; never the buyer or the holder; stable within a week", () => {
        const save = createLaunchFixture("first-week")
        // The strongest player at an AI club: he starts anywhere.
        const aiIds = new Set(save.teams.filter(t => t.id !== save.playerTeamId).flatMap(t => t.rosterIds))
        const target = save.players.filter(p => aiIds.has(p.id)).sort((a, b) => evaluatePlayer(b).overallRating - evaluatePlayer(a).overallRating)[0]
        const holder = save.teams.find(t => t.rosterIds.includes(target.id))!
        const ctx = { teams: save.teams, players: save.players, currentWeek: save.currentWeek, playerTeamId: save.playerTeamId, saveId: "s" }
        // Seeded weekly roll: look across weeks for someone in the race.
        let seen = 0
        for (let week = 1; week <= 60; week++) {
            const rivals = rivalInterest(target, { ...ctx, currentWeek: week, standing: "ICON" })
            expect(rivalInterest(target, { ...ctx, currentWeek: week, standing: "ICON" })).toEqual(rivals)
            for (const r of rivals) {
                expect(r.id).not.toBe(save.playerTeamId)
                expect(r.id).not.toBe(holder.id)
                expect(save.teams.find(t => t.id === r.id)!.rosterIds.length).toBeLessThan(7)
            }
            for (let i = 1; i < rivals.length; i++) expect(rivals[i - 1].reputation).toBeGreaterThanOrEqual(rivals[i].reputation)
            seen += rivals.length
        }
        expect(seen).toBeGreaterThan(0)
        // Nobody races for a player without a standing.
        expect(rivalInterest(target, { ...ctx, standing: null })).toHaveLength(0)
    })

    test("fee premium: 3% per club, capped at four clubs", () => {
        expect(rivalFeePremium(0)).toBe(0)
        expect(rivalFeePremium(2)).toBeCloseTo(0.06)
        expect(rivalFeePremium(9)).toBeCloseTo(0.12)
    })

    test("rival line reads naturally", () => {
        expect(rivalLine(["A"], 1)).toBe("A")
        expect(rivalLine(["A", "B"], 2)).toBe("A and B")
        expect(rivalLine(["A", "B", "C"], 5)).toBe("A, B, C and 2 other clubs")
        expect(rivalLine(["A"], 2)).toBe("A and 1 other club")
    })
})

describe("signing reveal hype", () => {
    test("carries rivals, standing and the best-five change", () => {
        const save = createLaunchFixture("first-week")
        const me = save.teams.find(t => t.id === save.playerTeamId)!
        const other = save.teams.find(t => t.id !== save.playerTeamId)!
        const pid = other.rosterIds[0]
        const before = [...me.rosterIds]
        // The deal as the store leaves it: he is on the manager's roster.
        other.rosterIds = other.rosterIds.filter(id => id !== pid)
        me.rosterIds = [...me.rosterIds, pid]
        const moment = buildSigningMoment(save as never, {
            playerId: pid, fee: 1, salaryPerWeek: 1, contractEndWeek: 60, fromTeamId: other.id,
            rivalNames: ["A", "B", "C", "D"], rivalCount: 6, rosterBefore: before,
        })!
        expect(moment.rivalNames).toEqual(["A", "B", "C"])
        expect(moment.rivalCount).toBe(6)
        expect(moment.squad).toEqual({ before: bestFiveOvr(before, save.players), after: bestFiveOvr(me.rosterIds, save.players) })
        expect(moment.squad!.after).toBeGreaterThanOrEqual(moment.squad!.before)
        expect(moment.standing).toBe(marketStandings(save.players, save.currentWeek).get(pid))
    })

    test("best five is the average of the five strongest", () => {
        const save = createLaunchFixture("first-week")
        const ids = save.players.slice(0, 8).map(p => p.id)
        const ovrs = save.players.slice(0, 8).map(p => evaluatePlayer(p).overallRating).sort((a, b) => b - a).slice(0, 5)
        expect(bestFiveOvr(ids, save.players)).toBe(Math.round(ovrs.reduce((s, v) => s + v, 0) / 5))
        expect(bestFiveOvr([], save.players)).toBeNull()
    })
})
