import { EconomyManager } from "@/engine/economy-manager"
import { MapId } from "@/types"
import {
  applyRoundEconomy,
  createRoundStartEconomy,
  getRequiredMapsForFormat,
  resolveCanonicalSeriesMaps,
  resolveHomeStartsCT,
  resetEconomyForMapStart,
  selectActiveRosterIds
} from "@/lib/live-match-utils"

describe("live-match-utils", () => {
  it("selects exactly the first five unique active roster IDs", () => {
    const selected = selectActiveRosterIds(["p1", "p2", "p2", "p3", "p4", "p5", "p6"])
    expect(selected).toEqual(["p1", "p2", "p3", "p4", "p5"])
  })

  it("resolves canonical BO map pools with deterministic fill", () => {
    const bo1Maps = resolveCanonicalSeriesMaps({
      format: "BO1",
      seed: 1234,
      urlMaps: [MapId.MIRAGE, MapId.INFERNO],
      savedMaps: [MapId.SANDSTONE],
      fallbackMaps: [MapId.ANUBIS]
    })
    expect(bo1Maps).toEqual([MapId.MIRAGE])

    const bo3Maps = resolveCanonicalSeriesMaps({
      format: "BO3",
      seed: 9876,
      urlMaps: [MapId.NUKE],
      savedMaps: [MapId.NUKE, MapId.OVERPASS],
      fallbackMaps: [MapId.ANCIENT, MapId.ANUBIS]
    })
    expect(bo3Maps).toHaveLength(3)
    expect(new Set(bo3Maps).size).toBe(3)
    expect(bo3Maps[0]).toBe(MapId.NUKE)

    const bo5Maps = resolveCanonicalSeriesMaps({
      format: "BO5",
      seed: 77,
      urlMaps: [MapId.SANDSTONE],
      savedMaps: [MapId.MIRAGE],
      fallbackMaps: [MapId.INFERNO]
    })
    expect(bo5Maps).toHaveLength(getRequiredMapsForFormat("BO5"))
    expect(new Set(bo5Maps).size).toBe(5)
    expect(bo5Maps[0]).toBe(MapId.SANDSTONE)
  })

  it("resolves per-map starting side with override and deterministic fallback", () => {
    expect(resolveHomeStartsCT({
      mapId: MapId.SANDSTONE,
      mapStartingSides: { [MapId.SANDSTONE]: "home" },
      homeTeamId: "home",
      awayTeamId: "away",
      seed: 1,
      mapIndex: 0
    })).toBe(true)

    expect(resolveHomeStartsCT({
      mapId: MapId.SANDSTONE,
      mapStartingSides: { [MapId.SANDSTONE]: "away" },
      homeTeamId: "home",
      awayTeamId: "away",
      seed: 1,
      mapIndex: 0
    })).toBe(false)

    const sideA = resolveHomeStartsCT({
      mapId: MapId.MIRAGE,
      homeTeamId: "home",
      awayTeamId: "away",
      seed: 12345,
      mapIndex: 2
    })
    const sideB = resolveHomeStartsCT({
      mapId: MapId.MIRAGE,
      homeTeamId: "home",
      awayTeamId: "away",
      seed: 12345,
      mapIndex: 2
    })
    expect(sideA).toBe(sideB)
  })

  it("builds and resets map-start economy to pistol defaults", () => {
    const economy = createRoundStartEconomy(["h1", "h2"], true)
    expect(economy.h1.cash).toBe(EconomyManager.ROUND_START_CASH)
    expect(economy.h1.weapon).toBe("usp")
    expect(economy.h2.weapon).toBe("usp")

    economy.h1.cash = 12000
    economy.h1.weapon = "m4a4"
    economy.h1.hasArmor = true
    economy.h1.hasHelmet = true
    economy.h1.hasKit = true

    const reset = resetEconomyForMapStart(economy, false)
    expect(reset.h1.cash).toBe(EconomyManager.ROUND_START_CASH)
    expect(reset.h1.weapon).toBe("glock")
    expect(reset.h1.hasArmor).toBe(false)
    expect(reset.h1.hasHelmet).toBe(false)
    expect(reset.h1.hasKit).toBe(false)
  })

  it("applies full round financials and death loadout loss", () => {
    const homeEconomy = {
      h1: { cash: 1000, weapon: "m4a4", hasArmor: true, hasHelmet: true, hasKit: true, utility: ["smoke"] },
      h2: { cash: 1000, weapon: "m4a4", hasArmor: true, hasHelmet: false, hasKit: false, utility: [] },
    }
    const awayEconomy = {
      a1: { cash: 1200, weapon: "ak47", hasArmor: true, hasHelmet: true, hasKit: false, utility: ["flash"] },
      a2: { cash: 1200, weapon: "ak47", hasArmor: true, hasHelmet: false, hasKit: false, utility: [] },
    }

    const result = applyRoundEconomy({
      homeEconomy,
      awayEconomy,
      roundResult: {
        winner: "HOME",
        winType: "BOMB_DEFUSE",
        kills: [{ playerId: "h1", kills: 2, weapon: "m4a4" }],
        deaths: [{ playerId: "h1", deaths: 1 }, { playerId: "a1", deaths: 1 }]
      },
      homeIsCT: true,
      homeLossStreakBefore: 0,
      awayLossStreakBefore: 2,
      homePlayerIds: ["h1", "h2"],
      awayPlayerIds: ["a1", "a2"]
    })

    const homeBonus = EconomyManager.getWinBonus("BOMB_DEFUSE")
    const awayBonus = EconomyManager.getLossBonus(2) // Uses pre-increment streak (awayLossStreakBefore)
    const ctKillTeamBonus = EconomyManager.getCTTeamKillBonus() * 2
    const killReward = 300 * 2
    const plantLossBonus = EconomyManager.getTPlantLossBonus()

    expect(result.homeEconomy.h1.cash).toBe(1000 + killReward + ctKillTeamBonus + homeBonus)
    expect(result.homeEconomy.h2.cash).toBe(1000 + ctKillTeamBonus + homeBonus)
    expect(result.awayEconomy.a1.cash).toBe(1200 + plantLossBonus + awayBonus)
    expect(result.awayEconomy.a2.cash).toBe(1200 + plantLossBonus + awayBonus)

    expect(result.homeEconomy.h1.weapon).toBe("usp")
    expect(result.homeEconomy.h1.hasArmor).toBe(false)
    expect(result.homeEconomy.h1.hasHelmet).toBe(false)
    expect(result.homeEconomy.h1.hasKit).toBe(false)
    expect(result.homeEconomy.h1.utility).toEqual([])

    expect(result.awayEconomy.a1.weapon).toBe("glock")
    expect(result.awayEconomy.a1.hasArmor).toBe(false)
    expect(result.awayEconomy.a1.hasHelmet).toBe(false)
    expect(result.awayEconomy.a1.hasKit).toBe(false)
    expect(result.awayEconomy.a1.utility).toEqual([])
  })
})

describe("getLossBonus — index clamping", () => {
  // Regression: a negative streak index returned `bonuses[-1]` === undefined,
  // which then propagated NaN into team economy. The lower bound is now
  // clamped so every input yields a finite payout.
  it("returns a finite payout for negative, zero, and oversized streaks", () => {
    for (const streak of [-5, -1, 0, 1, 4, 9, 99]) {
      const bonus = EconomyManager.getLossBonus(streak)
      expect(typeof bonus).toBe("number")
      expect(Number.isFinite(bonus)).toBe(true)
    }
  })

  it("treats a negative streak the same as a zero streak", () => {
    expect(EconomyManager.getLossBonus(-3)).toBe(EconomyManager.getLossBonus(0))
  })

  it("caps oversized streaks at the maximum tier", () => {
    expect(EconomyManager.getLossBonus(99)).toBe(EconomyManager.getLossBonus(4))
  })
})
