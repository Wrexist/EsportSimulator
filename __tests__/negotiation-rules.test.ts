/**
 * Market audit regressions for the signing negotiation's pure rules
 * (components/transfer/negotiation-rules.ts, used by useNegotiation):
 *   MARKET-02 a fee above the board's limit can't be offered (it collapsed only after signing)
 *   MARKET-10 the shown "sure" wage is accepted whatever clauses are set
 *   MARKET-08 the shown wage ask is the negotiation's own sure wage
 *   MARKET-17 the opening fee is the asking value within funds and the board limit
 *   MARKET-09 unscouted players don't sort by their hidden rating
 */
import {
    ACCEPT_WITHIN, acceptedWage, bandChance, chanceWithCounter, clampFeeOffer, counterOffer, durationWageFactor, FEE_BAND,
    feeCounterOffer, feeOfferBlock, parseMoneyInput, initialFeeOffer, maxFeeOffer, signingWageAsk, wageChance, wageRange, wageThreshold, WAGE_BAND,
} from "@/components/transfer/negotiation-rules"
import { NO_CLAUSES, type ClauseTerms } from "@/engine/contract-clauses"
import { getBoardSanctionedFee } from "@/engine/board-expectations"
import { negotiationBaseWage, recruitmentSalary } from "@/engine/recruitment"
import { compareByScoutedRating } from "@/engine/scouting-system"
import { SeededRNG } from "@/engine/rng"
import type { BoardState, PlayerSaveData } from "@/engine/save-types"
import { strategicRefusalEndsWeek, strategicRefusalWeek } from "@/engine/roster-rules"

describe("MARKET-02: the board's fee limit is enforced at the offer", () => {
    // The audit's repro: $100k funds, board confidence 60 -> 80% cap of $80k.
    const budget = 100_000
    const sanction = getBoardSanctionedFee({ confidence: 60, onNotice: false } as BoardState, budget)

    test("the repro's sanction is $80k", () => {
        expect(sanction).toEqual({ maxFee: 80_000, fraction: 0.8 })
    })

    test("typing a fee above the limit clamps to the limit, not to the funds", () => {
        expect(clampFeeOffer(90_000, budget, sanction)).toBe(80_000)
        expect(clampFeeOffer(150_000, budget, sanction)).toBe(80_000)
        expect(clampFeeOffer(79_999.7, budget, sanction)).toBe(79_999)
        expect(clampFeeOffer(-5, budget, sanction)).toBe(0)
        expect(clampFeeOffer(Number.NaN, budget, sanction)).toBe(0)
        // A confident board (fraction 1) caps at the funds as before.
        expect(clampFeeOffer(150_000, budget, getBoardSanctionedFee({ confidence: 80, onNotice: false } as BoardState, budget))).toBe(100_000)
    })

    test("an over-limit fee is blocked before the club can accept it", () => {
        expect(feeOfferBlock(90_000, budget, sanction)).toBe("overBoard")
        expect(feeOfferBlock(120_000, budget, sanction)).toBe("overFunds")
        expect(feeOfferBlock(0, budget, sanction)).toBe("enterFee")
        expect(feeOfferBlock(80_000, budget, sanction)).toBeNull()
    })

    test("whatever the board, an offerable fee is one the store's sanction check accepts", () => {
        for (const confidence of [10, 30, 50, 75, 95]) for (const onNotice of [false, true]) {
            const s = getBoardSanctionedFee({ confidence, onNotice } as BoardState, budget)
            for (const typed of [1, 25_000, 50_000, 80_000, 99_999, 250_000]) {
                const fee = clampFeeOffer(typed, budget, s)
                if (feeOfferBlock(fee, budget, s) === null) expect(fee).toBeLessThanOrEqual(s.maxFee)
            }
        }
    })
})

describe("MARKET-17: the opening fee", () => {
    const sanction = { maxFee: 80_000, fraction: 0.8 }
    test("opens at the asking value when it can be paid", () => {
        expect(initialFeeOffer(60_000, 100_000, sanction)).toBe(60_000)
    })
    test("never opens above the board limit or the funds (was buyout x 0.8, e.g. $1.27M with $100k)", () => {
        expect(initialFeeOffer(1_583_400, 100_000, sanction)).toBe(80_000)
        expect(initialFeeOffer(1_583_400, 50_000, { maxFee: 50_000, fraction: 1 })).toBe(50_000)
        expect(feeOfferBlock(initialFeeOffer(1_583_400, 100_000, sanction), 100_000, sanction)).toBeNull()
    })
})

describe("MARKET-10: the wage band includes the clause credits correctly", () => {
    const base = 1_000 // wage before variance and clauses
    const clauseSets: ClauseTerms[] = [
        NO_CLAUSES,
        { release: "none", appearanceBonus: 400, titleBonus: 0 },
        { release: "low", appearanceBonus: 500, titleBonus: 3_000 },
        { release: "high", appearanceBonus: 0, titleBonus: 4_500 },
        { release: "none", appearanceBonus: 5_000, titleBonus: 50_000 }, // credits at their caps
    ]

    test("an offer at the shown sure wage clears every hidden minimum the player can have", () => {
        for (const clauses of clauseSets) {
            const sure = wageRange(base, clauses)[1]
            const rng = new SeededRNG(9)
            for (let i = 0; i < 500; i++) {
                const variance = rng.range(WAGE_BAND[0], WAGE_BAND[1])
                // Same rule as useNegotiation.submitContract.
                expect(sure).toBeGreaterThanOrEqual(wageThreshold(base, variance, clauses) * ACCEPT_WITHIN)
            }
            expect(wageChance(sure, base, clauses)).toBe(1)
        }
    })

    test("the band's low end is the lowest wage that can be accepted", () => {
        for (const clauses of clauseSets) {
            const [low] = wageRange(base, clauses)
            expect(low).toBeGreaterThanOrEqual(acceptedWage(base, WAGE_BAND[0], clauses))
            expect(wageChance(low - 2, base, clauses)).toBe(0)
        }
    })

    test("the shown chance matches the acceptance rule's real odds", () => {
        const clauses = clauseSets[2]
        const [low, sure] = wageRange(base, clauses)
        for (const offer of [low, Math.round((low + sure) / 2), sure - 5]) {
            const rng = new SeededRNG(31)
            let yes = 0
            const n = 4_000
            for (let i = 0; i < n; i++) if (offer >= wageThreshold(base, rng.range(WAGE_BAND[0], WAGE_BAND[1]), clauses) * ACCEPT_WITHIN) yes++
            expect(Math.abs(wageChance(offer, base, clauses) - yes / n)).toBeLessThan(0.03)
        }
    })

    test("the old band (sure = clause-adjusted centre x 1.2) was too low with bonuses", () => {
        const clauses = clauseSets[1] // $400 appearance bonus: $200 a week of credit
        const oldSure = Math.ceil((base - 200) * WAGE_BAND[1] * ACCEPT_WITHIN)
        expect(oldSure).toBeLessThan(acceptedWage(base, WAGE_BAND[1], clauses))
        expect(wageRange(base, clauses)[1]).toBeGreaterThan(oldSure)
    })
})

describe("MARKET-08: the wage ask is the negotiation's sure wage", () => {
    const player = (overrides: Partial<PlayerSaveData> = {}) => ({
        id: "zepr", nickname: "ZepR", age: 24, role: "RIFLER", nationality: "RU",
        rifle: 52, awp: 45, pistol: 50, grenades: 48, creativity: 47, clutch: 46, tactic: 45, leader: 40, teamwork: 50, reaction: 55, eyesight: 52,
        skill: 50, potential: 60, morale: 70, form: 60, fatigue: 0, energy: 100, maxEnergy: 100,
        ...overrides,
    } as unknown as PlayerSaveData)
    const buyer = { reputation: 39 }

    test("the ask is the top of the hidden band at his ideal length, with no clauses", () => {
        const p = player()
        const base = negotiationBaseWage(p, 5, buyer)
        expect(signingWageAsk(p, 5, buyer)).toBe(wageRange(base * 0.95, NO_CLAUSES)[1])
        // A player asked at the shown ask (ideal length) accepts.
        expect(wageChance(signingWageAsk(p, 5, buyer), base * 0.95, NO_CLAUSES)).toBe(1)
    })

    test("it is no longer the AI clubs' recruitmentSalary, well above what he accepts", () => {
        const p = player({ freeAgentSinceWeek: 1 })
        expect(signingWageAsk(p, 5, buyer)).toBeLessThan(recruitmentSalary(p, 5, buyer))
    })
})

describe("MARKET-09: OVR sort doesn't rank hidden ratings", () => {
    const row = (name: string, level: "NONE" | "BASIC" | "ELITE", ovrRange: [number, number] | number) => ({ name, knowledge: { scoutingLevel: level, ovrRange } })
    const rows = [
        row("hiddenStar", "NONE", [70, 99]),
        row("scoutedMid", "BASIC", [55, 79]),
        row("hiddenAmateur", "NONE", [20, 60]),
        row("scoutedTop", "ELITE", 88),
        row("aHidden", "NONE", [40, 80]),
    ]
    const order = (dir: "asc" | "desc") => [...rows].sort((a, b) => compareByScoutedRating(a, b, dir)).map(r => r.name)

    test("unscouted players go last, by name, in both directions", () => {
        expect(order("desc")).toEqual(["scoutedTop", "scoutedMid", "aHidden", "hiddenAmateur", "hiddenStar"])
        expect(order("asc")).toEqual(["scoutedMid", "scoutedTop", "aHidden", "hiddenAmateur", "hiddenStar"])
    })
})

describe("MARKET-07: a rejected offer gets a counter-offer, not the exact hidden price", () => {
    test("the audit's cases: the counter is above the exact minimum, a plain figure, and within the sure price", () => {
        // EaB / Mul011: value $68,000, exact minimum shown was $70,064.
        // Riign Above / sweyu: exact minimum shown was $76,398.
        for (const [acceptAt, value] of [[70_064, 68_000], [76_398, 78_000]]) {
            const sure = Math.ceil(value * FEE_BAND[1] * ACCEPT_WITHIN)
            for (const roll of [1.02, 1.05, 1.1]) {
                const c = counterOffer(acceptAt, sure, roll)
                expect(c).toBeGreaterThan(acceptAt)
                expect(c).toBeLessThanOrEqual(sure)
                expect(c % 100 === 0 || c === sure).toBe(true)
            }
        }
    })

    test("a counter is always accepted by the rule that rejected the offer", () => {
        const rng = new SeededRNG(5)
        for (let i = 0; i < 2_000; i++) {
            const value = rng.range(500, 2_000_000)
            const minPrice = Math.round(value * rng.range(FEE_BAND[0], FEE_BAND[1]))
            const sure = Math.ceil(value * FEE_BAND[1] * ACCEPT_WITHIN)
            const c = counterOffer(minPrice * ACCEPT_WITHIN, sure, rng.range(1.02, 1.1))
            expect(c).toBeGreaterThanOrEqual(minPrice * ACCEPT_WITHIN) // submitBuyout's acceptance test
        }
    })

    test("wage counters use $10 steps and never pass the sure wage", () => {
        const base = 400
        const sure = wageRange(base, NO_CLAUSES)[1]
        const acceptAt = acceptedWage(base, 1.0, NO_CLAUSES)
        const c = counterOffer(acceptAt, sure, 1.04)
        expect(c).toBeGreaterThanOrEqual(acceptAt)
        expect(c).toBeLessThanOrEqual(sure)
        expect(c % 10 === 0 || c === sure).toBe(true)
    })

    test("with a counter on the table, offers at or above it show a sure yes", () => {
        const chance = bandChance(70_500 / 68_000, FEE_BAND)
        expect(chance).toBeLessThan(1)
        expect(chanceWithCounter(chance, 70_500, 71_500)).toBe(chance)
        expect(chanceWithCounter(chance, 71_500, 71_500)).toBe(1)
        expect(chanceWithCounter(chance, 71_500, null)).toBe(chance)
    })
})

describe("MARKET-03 / MARKET-04: opening terms", () => {
    test("a fee typed under a higher limit is brought back within a lower one", () => {
        // Audit: $78,000 typed, limit fell from $78,320 to $75,920 after a $3,000 scouting fee.
        const limit = maxFeeOffer(94_900, { maxFee: 75_920, fraction: 0.8 })
        expect(Math.min(78_000, limit)).toBe(75_920)
        expect(feeOfferBlock(Math.min(78_000, limit), 94_900, { maxFee: 75_920, fraction: 0.8 })).toBeNull()
    })

    test("at his ideal length the opening wage is the table's wage ask", () => {
        const pref = { minWeeks: 40, maxWeeks: 160, idealWeeks: 90 }
        expect(durationWageFactor(pref.idealWeeks, pref)).toBe(0.95)
        // At 104 weeks (the old opening length) he asks a little more than the column.
        expect(durationWageFactor(104, pref)).toBeGreaterThan(0.95)
    })
})

describe("MARKET-03 (2026-11-17): the fee counter never sits above a limit the club would accept", () => {
    test("audit: hidden minimum under the $78,284 limit, the counter read $82,800", () => {
        const acceptAt = 76_000
        const old = counterOffer(acceptAt, 90_000, 1.09)
        expect(old).toBeGreaterThan(78_284)
        const { counter, reachable } = feeCounterOffer(acceptAt, 90_000, 78_284, 1.09)
        expect(reachable).toBe(true)
        expect(counter).toBeLessThanOrEqual(78_284)
        expect(counter).toBeGreaterThanOrEqual(acceptAt) // still a sure yes
    })

    test("a club whose lowest price is beyond the limit keeps its counter and is flagged unreachable", () => {
        const { counter, reachable } = feeCounterOffer(100_000, 120_000, 78_284, 1.05)
        expect(reachable).toBe(false)
        expect(counter).toBe(counterOffer(100_000, 120_000, 1.05))
    })
})

describe("MARKET-05 (2026-11-17): strategic refusal is known before the offer", () => {
    const m = (week: number, home: string, away: string) => ({ week, homeTeamId: home, awayTeamId: away })
    test("a match within three weeks blocks the deal, either side at home", () => {
        expect(strategicRefusalWeek([m(2, "a", "b")], 1, "a", "b")).toBe(2)
        expect(strategicRefusalWeek([m(4, "b", "a")], 1, "a", "b")).toBe(4)
        expect(strategicRefusalWeek([m(5, "a", "b")], 1, "a", "b")).toBeNull()
        expect(strategicRefusalWeek([m(2, "a", "c")], 1, "a", "b")).toBeNull()
        expect(strategicRefusalWeek([m(3, "a", "b"), m(2, "b", "a")], 1, "a", "b")).toBe(2)
    })
    test("the panel names the first week the refusal is lifted", () => {
        expect(strategicRefusalEndsWeek([m(2, "a", "b")], 1, "a", "b")).toBe(3)
        expect(strategicRefusalEndsWeek([m(2, "a", "b"), m(5, "b", "a")], 1, "a", "b")).toBe(6)
        expect(strategicRefusalEndsWeek([], 1, "a", "b")).toBe(1)
    })
})

describe("MARKET-14: the money box reads grouped amounts", () => {
    test("separators, a pasted $ and spaces are ignored; empty is 0", () => {
        expect(parseMoneyInput("80,000")).toBe(80_000)
        expect(parseMoneyInput("$80 000")).toBe(80_000)
        expect(parseMoneyInput("80000")).toBe(80_000)
        expect(parseMoneyInput("")).toBe(0)
    })
})
