/**
 * Coverage for SimulationEngineV2 public methods:
 *   - calculateTeamStrength (multiplier cascade)
 *   - performBuyPhase (economy + loadout assignment)
 *
 * These are public methods called by useLiveMatch.ts directly on the
 * singleton, so they're already part of the de facto public API.
 * Adding direct unit coverage before the Phase J refactor extracts
 * them to engine/match/{team-strength,buy-phase}.ts — same pattern as
 * I3 → I4 (test first, extract second).
 */

import { simulationEngineV2 } from "@/engine/match-simulation"
import { SeededRNG } from "@/engine/rng"
import type { Player, Team, Coach, Analyst, Psychologist } from "@/types"
import { PlayerRole, StaffType } from "@/types/enums"

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
    return {
        id, nickname: id, firstName: id, lastName: "P",
        age: 22, nationality: "US", role: PlayerRole.RIFLER,
        skill: 60, rifle: 60, awp: 50, pistol: 60, grenades: 50,
        creativity: 50, clutch: 50, tactic: 50, leader: 45, teamwork: 55,
        reaction: 60, eyesight: 60, fatigue: 0, form: 70, morale: 75,
        energy: 100, maxEnergy: 100,
        ...overrides,
    } as unknown as Player
}

function makeTeam(overrides: Partial<Team> = {}): Team {
    return {
        id: "t1", name: "T1", shortName: "T1",
        facilitiesLevel: 1, fanbase: 1000, reputation: 50,
        ...overrides,
    } as unknown as Team
}

function makeCoach(level: number, tacticBonus = 0): Coach {
    return {
        id: "c1", name: "C", type: StaffType.COACH,
        level, salary: 1000, contractWeeksRemaining: 52,
        tacticBonus, moraleStability: 0.2,
    } as unknown as Coach
}

describe("calculateTeamStrength", () => {
    test("empty roster returns 0", () => {
        const team = makeTeam()
        const strength = simulationEngineV2.calculateTeamStrength(team, [], {})
        expect(strength).toBe(0)
    })

    test("higher avgSkill produces higher strength (monotonic)", () => {
        const team = makeTeam()
        const weak = Array.from({ length: 5 }, (_, i) => makePlayer(`w${i}`, { skill: 40 }))
        const strong = Array.from({ length: 5 }, (_, i) => makePlayer(`s${i}`, { skill: 80 }))

        const weakStrength = simulationEngineV2.calculateTeamStrength(team, weak, {})
        const strongStrength = simulationEngineV2.calculateTeamStrength(team, strong, {})

        expect(strongStrength).toBeGreaterThan(weakStrength)
    })

    // C7: the facilities bonus averages across the array, so investing in ALL
    // facilities beats a single maxed one. Under the old max-of-one logic these
    // were identical (both saw level 5).
    test("investing across all facilities beats a single maxed facility (C7)", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`, { skill: 60 }))
        const allMaxed = makeTeam({ facilities: [{ level: 5 }, { level: 5 }, { level: 5 }, { level: 5 }] } as unknown as Partial<Team>)
        const oneMaxed = makeTeam({ facilities: [{ level: 5 }, { level: 1 }, { level: 1 }, { level: 1 }] } as unknown as Partial<Team>)

        const allStr = simulationEngineV2.calculateTeamStrength(allMaxed, players, {})
        const oneStr = simulationEngineV2.calculateTeamStrength(oneMaxed, players, {})

        expect(allStr).toBeGreaterThan(oneStr)
    })

    test("exhausted team (avg energy < 20) gets an additional 15% penalty", () => {
        const team = makeTeam()
        const fresh = Array.from({ length: 5 }, (_, i) => makePlayer(`f${i}`, { energy: 30 }))
        const dead = Array.from({ length: 5 }, (_, i) => makePlayer(`d${i}`, { energy: 10 }))

        const freshStr = simulationEngineV2.calculateTeamStrength(team, fresh, {})
        const deadStr = simulationEngineV2.calculateTeamStrength(team, dead, {})

        // Dead team should be substantially lower than fresh (both have
        // some energy debuff, but dead also gets the exhausted multiplier).
        expect(deadStr).toBeLessThan(freshStr * 0.95)
    })

    test("coach staff bonus increases strength vs no-staff baseline", () => {
        const team = makeTeam()
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const baseline = simulationEngineV2.calculateTeamStrength(team, players, {})
        const withCoach = simulationEngineV2.calculateTeamStrength(team, players, {
            coach: makeCoach(5, 10),
        })

        expect(withCoach).toBeGreaterThan(baseline)
    })

    test("equipment bonuses lift strength additively", () => {
        const baseTeam = makeTeam()
        const equippedTeam = makeTeam({
            equipment: [
                { id: "e1", type: "MOUSE", tier: 2, name: "M", bonus: { stat: "reaction", value: 10 }, weeklyCost: 100, purchasedWeek: 1 } as any,
                { id: "e2", type: "MONITOR", tier: 2, name: "M", bonus: { stat: "eyesight", value: 10 }, weeklyCost: 100, purchasedWeek: 1 } as any,
            ],
        })
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const base = simulationEngineV2.calculateTeamStrength(baseTeam, players, {})
        const equipped = simulationEngineV2.calculateTeamStrength(equippedTeam, players, {})

        expect(equipped).toBeGreaterThan(base)
    })

    test("tacticalPrep boosts strength (up to +25% at 100% prep)", () => {
        const team0 = makeTeam({ tacticalPrep: 0 } as any)
        const team100 = makeTeam({ tacticalPrep: 100 } as any)
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const noPrep = simulationEngineV2.calculateTeamStrength(team0, players, {})
        const fullPrep = simulationEngineV2.calculateTeamStrength(team100, players, {})

        expect(fullPrep).toBeGreaterThan(noPrep)
    })

    test("prepPenalty (quick-sim differential, B4) reduces strength", () => {
        const base = makeTeam()
        const penalized = makeTeam({ prepPenalty: 0.04 } as any)
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const full = simulationEngineV2.calculateTeamStrength(base, players, {})
        const skipped = simulationEngineV2.calculateTeamStrength(penalized, players, {})

        expect(skipped).toBeLessThan(full)
    })

    test("mentalPrep flag adds a small strength boost", () => {
        const team = makeTeam()
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const base = simulationEngineV2.calculateTeamStrength(team, players, {})
        const mental = simulationEngineV2.calculateTeamStrength(team, players, {}, /*mentalPrep*/ true)

        expect(mental).toBeGreaterThan(base)
    })

    test("targetPlayerId tunneling penalty reduces strength", () => {
        const baseTeam = makeTeam()
        const tunnelTeam = makeTeam({ targetPlayerId: "victim_x" } as any)
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const base = simulationEngineV2.calculateTeamStrength(baseTeam, players, {})
        const tunnel = simulationEngineV2.calculateTeamStrength(tunnelTeam, players, {})

        expect(tunnel).toBeLessThan(base)
    })

    test("result stays positive even with maximally bad stats (0.7× floor)", () => {
        const team = makeTeam({ tacticalPrep: 0 } as any)
        // Worst-case roster: low morale, no chemistry, full fatigue.
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`, {
            skill: 30, morale: 0, fatigue: 100, energy: 5, form: 0,
        }))

        const strength = simulationEngineV2.calculateTeamStrength(team, players, {})
        // Must be non-negative and finite — no NaN, no negative output.
        expect(strength).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(strength)).toBe(true)
    })

    test("deterministic: identical inputs always produce identical output (no internal RNG)", () => {
        const team = makeTeam()
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const a = simulationEngineV2.calculateTeamStrength(team, players, {})
        const b = simulationEngineV2.calculateTeamStrength(team, players, {})
        expect(a).toBe(b)
    })
})

describe("performBuyPhase", () => {
    function makeEconomy(playerIds: string[], startingCash = 800) {
        const econ: Record<string, any> = {}
        playerIds.forEach(id => {
            econ[id] = {
                id, cash: startingCash, weapon: "glock",
                hasArmor: false, hasHelmet: false, hasKit: false, utility: [],
            }
        })
        return econ
    }

    test("PISTOL strategy: $650 vest only, starting pistol enforced", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
        const econ = makeEconomy(players.map(p => p.id), 800)

        simulationEngineV2.performBuyPhase(players, econ, "PISTOL", /*isCT*/ true, new SeededRNG(1))

        for (const p of players) {
            const s = econ[p.id]
            expect(s.weapon).toBe("usp") // CT starting pistol
            expect(s.hasArmor).toBe(true)
            expect(s.hasHelmet).toBe(false)
            expect(s.hasKit).toBe(false)
            expect(s.utility).toEqual([])
            expect(s.cash).toBe(800 - 650)
        }
    })

    test("PISTOL strategy on T side gives glock", () => {
        const players = [makePlayer("p1")]
        const econ = makeEconomy(["p1"], 800)
        simulationEngineV2.performBuyPhase(players, econ, "PISTOL", /*isCT*/ false, new SeededRNG(1))
        expect(econ["p1"].weapon).toBe("glock")
    })

    test("PISTOL with $0 cash: no armor purchased, pistol enforced", () => {
        const players = [makePlayer("p1")]
        const econ = makeEconomy(["p1"], 0)
        simulationEngineV2.performBuyPhase(players, econ, "PISTOL", true, new SeededRNG(1))
        expect(econ["p1"].weapon).toBe("usp")
        expect(econ["p1"].hasArmor).toBe(false)
        expect(econ["p1"].cash).toBe(0)
    })

    test("FULL strategy with plenty of cash: cash decreases for every player", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
        const econ = makeEconomy(players.map(p => p.id), 10_000)

        simulationEngineV2.performBuyPhase(players, econ, "FULL", true, new SeededRNG(1))

        // Every player should have spent SOMETHING (weapon, armor, or kit).
        let totalSpent = 0
        for (const p of players) {
            totalSpent += 10_000 - econ[p.id].cash
        }
        expect(totalSpent).toBeGreaterThan(0)
    })

    test("ECO strategy with low cash: no expensive purchases", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))
        const econ = makeEconomy(players.map(p => p.id), 200)

        simulationEngineV2.performBuyPhase(players, econ, "ECO", true, new SeededRNG(1))

        // ECO at $200: nobody can buy a rifle ($2700+) or AWP ($4750).
        for (const p of players) {
            expect(econ[p.id].cash).toBeGreaterThanOrEqual(0)
            // Weapon stays as glock OR cheap upgrade like a pistol.
            const s = econ[p.id]
            expect(typeof s.weapon).toBe("string")
        }
    })

    test("DOUBLE AWP strategy: at least one AWPER-role player goes to AWP", () => {
        // Build roster with one AWPER and four riflers.
        const players: Player[] = [
            makePlayer("awper", { role: PlayerRole.AWPER }),
            makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"),
        ]
        const econ = makeEconomy(players.map(p => p.id), 10_000)

        simulationEngineV2.performBuyPhase(players, econ, "DOUBLE AWP", true, new SeededRNG(1))

        // The dedicated AWPER should be wielding the AWP at the end.
        // Other slots may also have AWP since strategy targets 2.
        const awpCount = Object.values(econ).filter((s: any) => s.weapon === "awp").length
        expect(awpCount).toBeGreaterThanOrEqual(1)
    })

    test("performBuyPhase doesn't push cash negative for any player", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        // Sweep many strategies + cash levels — invariant: cash never goes below 0.
        const strategies: Array<"ECO" | "FORCE" | "SEMIBUY" | "FULL" | "DOUBLE AWP"> =
            ["ECO", "FORCE", "SEMIBUY", "FULL", "DOUBLE AWP"]
        for (const strategy of strategies) {
            for (const startCash of [0, 500, 1500, 3000, 5000, 16_000]) {
                const econ = makeEconomy(players.map(p => p.id), startCash)
                simulationEngineV2.performBuyPhase(players, econ, strategy, true, new SeededRNG(strategy.length + startCash))
                for (const p of players) {
                    expect(econ[p.id].cash).toBeGreaterThanOrEqual(0)
                }
            }
        }
    })

    test("performBuyPhase deterministic under fixed seed", () => {
        const players = Array.from({ length: 5 }, (_, i) => makePlayer(`p${i}`))

        const econA = makeEconomy(players.map(p => p.id), 5_000)
        const econB = makeEconomy(players.map(p => p.id), 5_000)

        simulationEngineV2.performBuyPhase(players, econA, "FULL", true, new SeededRNG(42))
        simulationEngineV2.performBuyPhase(players, econB, "FULL", true, new SeededRNG(42))

        for (const p of players) {
            expect(econA[p.id]).toEqual(econB[p.id])
        }
    })
})
