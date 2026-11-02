/**
 * A living world: prices, wages and reputation follow what players are now,
 * and a new world does not inflate in its first season.
 * Measured with scripts/audit/world-drift.ts.
 */
import { calculateMarketValue, evaluatePlayer, updateReputationAtSeasonEnd, REPUTATION_YEARLY_KEEP, MARKET_VALUE_FLOOR } from "@/engine/player-evaluation"
import { renewalSalary, renewalMultiplier, getArchetype } from "@/engine/personality"
import { startingPotential, startingWeaponMastery } from "@/engine/development-rates"
import { distressedListingPrice } from "@/engine/ai/transfer-market"
import { runMigrationLadder } from "@/engine/save-migrations"
import { AI_SQUAD_TUNING, AI_ECONOMY_TUNING } from "@/lib/balance-tuning"
import { CURRENT_SAVE_VERSION, type GameSave, type PlayerSaveData } from "@/engine/save-types"

const base = (over: Partial<PlayerSaveData> = {}): PlayerSaveData => ({
    id: "p", name: "P", nickname: "P", age: 24, role: "RIFLER", skill: 60, rifle: 70, awp: 40, pistol: 60,
    grenades: 50, creativity: 50, clutch: 60, tactic: 50, leader: 50, teamwork: 50, reaction: 50, eyesight: 70,
    stressResistance: 50, potential: 70, loyalty: 60, amicability: 60, ...over,
} as unknown as PlayerSaveData)

describe("market values", () => {
    test("values sit on a scale clubs can pay, rounded to $1k, and rise with OVR", () => {
        const weak = evaluatePlayer(base({ skill: 40 })).transferValue
        const mid = evaluatePlayer(base({ skill: 65 })).transferValue
        const star = evaluatePlayer(base({ skill: 90, rifle: 95 })).transferValue
        expect(weak).toBeGreaterThanOrEqual(1_000)
        expect(weak).toBeLessThan(mid)
        expect(mid).toBeLessThan(star)
        expect(star).toBeLessThan(2_000_000)
        for (const v of [weak, mid, star]) expect(v % 1000).toBe(0)
        expect(calculateMarketValue(evaluatePlayer(base({ skill: 1, rifle: 1 })), 1)).toBeGreaterThanOrEqual(Math.round(MARKET_VALUE_FLOOR * 0.5 / 1000) * 1000)
    })

    test("a club in trouble lists a player below his value", () => {
        const p = base({ skill: 70 })
        const value = evaluatePlayer(p, undefined, undefined, 10).transferValue
        expect(distressedListingPrice(p, 10)).toBe(Math.round(value * AI_ECONOMY_TUNING.DISTRESSED_LISTING_SHARE))
    })
})

describe("renewals catch up with the market", () => {
    test("an underpaid player asks for more than the usual raise, in steps", () => {
        const p = base({ skill: 85, rifle: 90 })
        const usual = Math.round(100 * renewalMultiplier(getArchetype(p), AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER))
        const renewed = renewalSalary(p, 100, 10)
        expect(renewed).toBeGreaterThan(usual)
        expect(renewed).toBeLessThanOrEqual(Math.round(100 * AI_SQUAD_TUNING.RENEWAL_MAX_STEP))
    })

    test("a player already paid his worth gets only the usual raise", () => {
        const p = base({ skill: 50 })
        const usual = Math.round(5_000 * renewalMultiplier(getArchetype(p), AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER))
        expect(renewalSalary(p, 5_000, 10)).toBe(usual)
    })
})

describe("reputation is earned each season", () => {
    test("reputation fades, the season's Top 20 earns it, legends keep theirs", () => {
        const fading = base({ id: "old", prestigeScore: 100 } as never)
        const risen = base({ id: "new", prestigeScore: 0 } as never)
        const legend = base({ id: "leg", prestigeScore: 100, isLegendary: true } as never)
        updateReputationAtSeasonEnd([fading, risen, legend], [{ playerId: "new", rank: 2 }])
        expect(fading.prestigeScore).toBe(Math.round(100 * REPUTATION_YEARLY_KEEP))
        expect(risen.prestigeScore).toBe(100)
        expect(legend.prestigeScore).toBe(100)
    })
})

describe("a new world starts settled", () => {
    test("established pros start near their ceiling; teenagers keep their room to grow", () => {
        expect(startingPotential(90, 60, 28)).toBe(60)
        expect(startingPotential(90, 60, 25)).toBe(61)
        expect(startingPotential(90, 60, 21)).toBe(66)
        expect(startingPotential(90, 60, 18)).toBe(72)
        expect(startingPotential(55, 60, 18)).toBe(60)
        expect(startingPotential(undefined, 60, 18)).toBeUndefined()
    })

    test("pros start with the weapon mastery their careers have earned", () => {
        expect(startingWeaponMastery(25, "RIFLER")).toEqual({ RIFLE: 1000, AWP: 0, PISTOL: 600 })
        expect(startingWeaponMastery(25, "AWPER")).toEqual({ AWP: 1000, RIFLE: 600, PISTOL: 600 })
        expect(startingWeaponMastery(18, "RIFLER").RIFLE).toBeLessThan(1000)
    })

    test("save v12 gives older saves at least the starting mastery, keeps more, skips legends", () => {
        const fresh = base({ id: "fresh", age: 25 })
        const veteran = base({ id: "vet", age: 25, weaponMastery: { RIFLE: { xp: 5000, level: 4, kills: 900 } } } as never)
        const legend = base({ id: "leg", isLegendary: true })
        const migrated = runMigrationLadder(structuredClone({ saveVersion: 11, currentWeek: 1, players: [fresh, veteran, legend] })) as GameSave
        expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION)
        const by = new Map(migrated.players.map(p => [p.id, p]))
        expect(by.get("fresh")!.weaponMastery).toMatchObject({ RIFLE: 1000, PISTOL: 600 })
        expect(by.get("vet")!.weaponMastery!.RIFLE).toEqual({ xp: 5000, level: 4, kills: 900 })
        expect(by.get("leg")!.weaponMastery).toBeUndefined()
    })
})

describe("old saves meet the new market", () => {
    test("v12 relists listed players at their new value and withdraws bids made at the old scale", () => {
        const listed = base({ id: "l", forSale: true, transferListingPrice: 3_000_000 } as never)
        const bid = { id: "e1", type: "TRANSFER_OFFER", week: 1, acknowledged: false, data: { playerId: "l", offerAmount: 2_500_000 } }
        const answered = { id: "e2", type: "TRANSFER_OFFER", week: 1, acknowledged: true, selectedChoiceId: "accept", data: {} }
        const migrated = runMigrationLadder(structuredClone({ saveVersion: 11, currentWeek: 5, players: [listed], eventsLog: [bid, answered] })) as GameSave
        const p = migrated.players[0]
        expect(p.transferListingPrice).toBe(evaluatePlayer(p, undefined, undefined, 5).transferValue)
        expect(migrated.eventsLog[0].data.isWithdrawn).toBe(true)
        expect(migrated.eventsLog[1].data.isWithdrawn).toBeUndefined()
    })

    test("career difficulty moves with the manager to a new club", () => {
        const { switchClubManagement } = jest.requireActual("@/engine/club-management")
        const oldTeam = { id: "a", difficultySettings: { incomeMultiplier: 0.85, fansMultiplier: 0.85, tournamentPrizeMultiplier: 1 } }
        const newTeam = { id: "b" }
        const save = { playerTeamId: "a", academyPlayers: [], academyRoster: {}, players: [] }
        switchClubManagement(save, oldTeam, newTeam)
        expect(newTeam).toMatchObject({ difficultySettings: { incomeMultiplier: 0.85 } })
        expect(oldTeam.difficultySettings).toBeUndefined()
    })
})
