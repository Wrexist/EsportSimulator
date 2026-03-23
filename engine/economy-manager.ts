import { TacticalStrategy } from "@/types"
import { SeededRNG } from "./rng"

/**
 * EconomyManager handles all CS2-specific financial logic including
 * round bonuses, kill rewards, equipment costs, and strategic team buying behavior.
 * Updated to July 2025 Meta (CT Team-wide kill bonus).
 */

export enum WeaponType {
  PISTOL = "PISTOL",
  SMG = "SMG",
  RIFLE = "RIFLE",
  SNIPER = "SNIPER", // AWP
  SHOTGUN = "SHOTGUN",
  KNIFE = "KNIFE",
  UTILITY = "UTILITY"
}

export interface Weapon {
  id: string
  name: string
  type: WeaponType
  price: number
  killReward: number
  power: number // 0-100 impact on win probability
}

export const WEAPONS: Record<string, Weapon> = {
  // Pistols
  GLOCK: { id: "glock", name: "Glock-18", type: WeaponType.PISTOL, price: 0, killReward: 300, power: 15 },
  USP: { id: "usp", name: "USP-S", type: WeaponType.PISTOL, price: 0, killReward: 300, power: 18 },
  P250: { id: "p250", name: "P250", type: WeaponType.PISTOL, price: 300, killReward: 300, power: 25 },
  DEAGLE: { id: "deagle", name: "Desert Eagle", type: WeaponType.PISTOL, price: 700, killReward: 300, power: 42 },
  DUALIES: { id: "dualies", name: "Dual Berettas", type: WeaponType.PISTOL, price: 300, killReward: 300, power: 22 },
  TEC9: { id: "tec9", name: "Tec-9", type: WeaponType.PISTOL, price: 500, killReward: 300, power: 35 },
  FIVESEVEN: { id: "fiveseven", name: "Five-SeveN", type: WeaponType.PISTOL, price: 500, killReward: 300, power: 35 },

  // SMGs
  MAC10: { id: "mac10", name: "MAC-10", type: WeaponType.SMG, price: 1050, killReward: 600, power: 45 },
  MP9: { id: "mp9", name: "MP9", type: WeaponType.SMG, price: 1250, killReward: 600, power: 48 },
  MP7: { id: "mp7", name: "MP7", type: WeaponType.SMG, price: 1500, killReward: 600, power: 50 },
  UMP45: { id: "ump45", name: "UMP-45", type: WeaponType.SMG, price: 1200, killReward: 600, power: 48 },
  PPBIZON: { id: "ppbizon", name: "PP-Bizon", type: WeaponType.SMG, price: 1400, killReward: 600, power: 42 },
  P90: { id: "p90", name: "P90", type: WeaponType.SMG, price: 2350, killReward: 300, power: 55 },

  // Rifles
  AK47: { id: "ak47", name: "AK-47", type: WeaponType.RIFLE, price: 2700, killReward: 300, power: 85 },
  M4A4: { id: "m4a4", name: "M4A4", type: WeaponType.RIFLE, price: 3000, killReward: 300, power: 82 },
  M4A1S: { id: "m4a1s", name: "M4A1-S", type: WeaponType.RIFLE, price: 2900, killReward: 300, power: 82 },
  GALIL: { id: "galil", name: "Galil AR", type: WeaponType.RIFLE, price: 1800, killReward: 300, power: 65 },
  FAMAS: { id: "famas", name: "FAMAS", type: WeaponType.RIFLE, price: 2050, killReward: 300, power: 62 },
  AUG: { id: "aug", name: "AUG", type: WeaponType.RIFLE, price: 3300, killReward: 300, power: 85 },
  SG553: { id: "sg553", name: "SG 553", type: WeaponType.RIFLE, price: 3000, killReward: 300, power: 85 },

  // Sniper
  AWP: { id: "awp", name: "AWP", type: WeaponType.SNIPER, price: 4750, killReward: 100, power: 95 },
  SSG08: { id: "ssg08", name: "SSG 08", type: WeaponType.SNIPER, price: 1700, killReward: 300, power: 55 },

  // Shotguns
  NOVA: { id: "nova", name: "Nova", type: WeaponType.SHOTGUN, price: 1050, killReward: 900, power: 35 },
  XM1014: { id: "xm1014", name: "XM1014", type: WeaponType.SHOTGUN, price: 2000, killReward: 900, power: 50 },
  MAG7: { id: "mag7", name: "MAG-7", type: WeaponType.SHOTGUN, price: 1300, killReward: 900, power: 45 },
}

export class EconomyManager {
  static MAX_CASH = 16000
  static ROUND_START_CASH = 800

  static getLossBonus(streak: number): number {
    // CS2 2023+ rules: First loss = $1900, progression +$500 each up to $3400 max
    // Both teams start with an implicit 1-round "loss streak" in competitive mode
    const levels = [1900, 2400, 2900, 3400, 3400]
    const index = Math.max(0, Math.min(streak, 4))
    return levels[index]
  }

  /**
   * Calculates the win bonus for a team.
   * @param winType ELIMINATION | BOMB | DEFUSE | TIME
   */
  static getWinBonus(winType: string): number {
    if (winType === "BOMB_EXPLODED" || winType === "BOMB_DEFUSE") return 3500
    return 3250
  }

  /**
   * July 2025 Meta: CTs get $50 team-wide for every kill.
   */
  static getCTTeamKillBonus(): number {
    return 50
  }

  /**
   * T side gets $800 bonus if the bomb was planted but they lost.
   */
  static getTPlantLossBonus(): number {
    return 800
  }

  /**
   * Strategic Buy Logic:
   * Decides what a team should do based on their average cash.
   * Updated for Phase 60: Economy Style affects thresholds.
   * @param aveCash Team's average cash
   * @param economyStyle Team's economy preference (force = more aggressive, eco = more conservative)
   */
  static getTeamStrategy(
    aveCash: number,
    economyStyle?: "standard" | "force" | "eco"
  ): "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" {
    // Economy style adjusts thresholds
    // Force: -500 to thresholds (buy earlier)
    // Eco: +500 to thresholds (save longer)
    const modifier = economyStyle === "force" ? -500 : economyStyle === "eco" ? 500 : 0

    if (aveCash <= 800) return "PISTOL"
    if (aveCash < 2000 + modifier) return "ECO"
    if (aveCash < 3200 + modifier) return "FORCE"
    if (aveCash < 4500 + modifier) return "SEMIBUY"
    return "FULL"
  }

  /**
   * Role-specific buying behavior.
   */
  static getPlayerBuy(
    cash: number,
    strategy: "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP",
    role: string,
    isCT: boolean,
    rng: SeededRNG,
    customTactic?: TacticalStrategy
  ): { weapon: Weapon, armor: boolean, kit: boolean, armorLevel: number } {
    let weapon = isCT ? WEAPONS.USP : WEAPONS.GLOCK
    let armor = false
    let kit = false

    // If custom tactic provided, try to fulfill it within budget
    if (customTactic) {
      let currentCost = 0
      const primary = WEAPONS[(customTactic.primaryWeaponId || "").toUpperCase()] || weapon
      const secondary = WEAPONS[(customTactic.secondaryWeaponId || "").toUpperCase()] || weapon

      // Try Primary
      if (cash >= primary.price) {
        weapon = primary
        currentCost += primary.price
      } else if (cash >= secondary.price) {
        weapon = secondary
        currentCost += secondary.price
      }

      // Try Armor
      const armorCost = customTactic.armorTier === "HEAVY" ? 1000 : (customTactic.armorTier === "LIGHT" ? 650 : 0)
      if (cash - currentCost >= armorCost) {
        armor = customTactic.armorTier !== "NONE"
        currentCost += armorCost
      }

      // Try Kit
      if (isCT && customTactic.hasKit && cash - currentCost >= 400) {
        kit = true
      }

      const armorLevel = armor ? (customTactic.armorTier === "HEAVY" ? 2 : 1) : 0
      return { weapon, armor, kit, armorLevel }
    }

    if (strategy === "PISTOL") {
      // Standard pistol round buy: P250 or Utility (simplified to P250/Dualies for now)
      if (cash >= 300) {
        weapon = isCT ? (role === "ENTRY" ? WEAPONS.DUALIES : WEAPONS.P250) : WEAPONS.P250
      }
    } else if (strategy === "ECO") {
      // Save for next round, maybe a P250 if we have surplus
      if (cash > 2500) {
        weapon = WEAPONS.P250
      }
    } else if (strategy === "FORCE") {
      // Aggressive low-budget buy - prioritization:
      // 1. Scout/Deagle (Sniper roles) or Rifle (Galil/Famas) if affordable
      // 2. SMG + Armor
      // 3. Pistol + Armor

      const canAffordFamasGalil = isCT ? (cash >= 2700) : (cash >= 2450) // Weapon + Armor
      const canAffordScout = cash >= 2350 // SSG08 + Armor

      if (canAffordFamasGalil && rng.next() > 0.3) {
        weapon = isCT ? WEAPONS.FAMAS : WEAPONS.GALIL
        armor = true
      } else if (role === "AWPER" && canAffordScout) {
        weapon = WEAPONS.SSG08
        armor = true
      } else if (cash >= 1700) {
        // Standard SMG Force
        weapon = isCT ? WEAPONS.MP9 : WEAPONS.MAC10
        armor = true
      } else if (cash >= 1350) {
        // Armor + Deagle
        weapon = WEAPONS.DEAGLE
        armor = true
      } else if (cash >= 1000) {
        // Armor + P250/Tec9/5-7
        weapon = isCT ? WEAPONS.FIVESEVEN : WEAPONS.TEC9
        armor = true
      } else if (cash >= 700) {
        weapon = WEAPONS.DEAGLE
        armor = false
      }
    } else if (strategy === "SEMIBUY") {
      // Mid-tier rifles/SMGs
      armor = true
      if (cash >= 2100) {
        weapon = isCT ? WEAPONS.FAMAS : WEAPONS.GALIL
      } else {
        weapon = isCT ? WEAPONS.MP9 : WEAPONS.MAC10
      }
    } else if (strategy === "FULL") {
      armor = true
      if (role === "AWPER" && cash >= 5500) {
        weapon = WEAPONS.AWP
        if (isCT && cash > 6000) kit = true
      } else {
        if (isCT) {
          weapon = cash >= 3900 ? WEAPONS.M4A4 : WEAPONS.FAMAS
          kit = cash >= 4300
        } else {
          weapon = cash >= 3700 ? WEAPONS.AK47 : WEAPONS.GALIL
        }
      }
    }

    return { weapon, armor, kit, armorLevel: armor ? 2 : 0 } // Legacy compatibility + new field
  }

  /**
   * Enhanced Role-specific buying behavior with Armor Level.
   */
  static getPlayerBuyV2(
    cash: number,
    strategy: "ECO" | "FORCE" | "SEMIBUY" | "FULL" | "PISTOL" | "DOUBLE AWP",
    role: string,
    isCT: boolean,
    rng: SeededRNG,
    customTactic?: TacticalStrategy
  ): { weapon: Weapon, armorLevel: 0 | 1 | 2, kit: boolean } {
    let weapon = isCT ? WEAPONS.USP : WEAPONS.GLOCK
    let armorLevel: 0 | 1 | 2 = 0
    let kit = false

    // If custom tactic provided, try to fulfill it within budget
    if (customTactic) {
      let currentCost = 0
      const primary = WEAPONS[(customTactic.primaryWeaponId || "").toUpperCase()] || weapon
      const secondary = WEAPONS[(customTactic.secondaryWeaponId || "").toUpperCase()] || weapon

      // Try Primary
      if (cash >= primary.price) {
        weapon = primary
        currentCost += primary.price
      } else if (cash >= secondary.price) {
        weapon = secondary
        currentCost += secondary.price
      }

      // Try Armor
      const desiredArmor = customTactic.armorTier === "HEAVY" ? 2 : (customTactic.armorTier === "LIGHT" ? 1 : 0)
      const armorCost = desiredArmor === 2 ? 1000 : (desiredArmor === 1 ? 650 : 0)

      if (cash - currentCost >= armorCost) {
        armorLevel = desiredArmor
        currentCost += armorCost
      }

      // Try Kit
      if (isCT && customTactic.hasKit && cash - currentCost >= 400) {
        kit = true
      }

      return { weapon, armorLevel, kit }
    }

    if (strategy === "PISTOL") {
      // Standard pistol round buy: P250 or Utility (simplified to P250/Dualies for now)
      if (cash >= 650 && role === "SUPPORT") {
        armorLevel = 1 // Vest on pistol
      } else if (cash >= 300) {
        weapon = isCT ? (role === "ENTRY" ? WEAPONS.DUALIES : WEAPONS.P250) : WEAPONS.P250
      }
    } else if (strategy === "ECO") {
      // Save for next round, maybe a P250 if we have surplus
      // Sometimes buy P250 + Vest if flushed with cash but saving? Rarely.
      if (cash > 2500) {
        weapon = WEAPONS.P250
      }
    } else if (strategy === "FORCE") {
      // Force: SMG + Vest (Light Armor)
      weapon = isCT ? WEAPONS.MP9 : WEAPONS.MAC10
      armorLevel = 1

    } else if (strategy === "SEMIBUY") {
      // Semibuy: Galil/Famas + Helmet
      armorLevel = 2
      weapon = isCT ? WEAPONS.FAMAS : WEAPONS.GALIL

    } else if (strategy === "FULL") {
      // Full Buy: 1 AWP, Rest AK/M4 + Helmet + Kit
      armorLevel = 2
      if (role === "AWPER") {
        weapon = WEAPONS.AWP
      } else {
        weapon = isCT ? WEAPONS.M4A4 : WEAPONS.AK47
      }
      if (isCT) kit = true

    } else if (strategy === "DOUBLE AWP") {
      // Double AWP: 2 AWPs, Rest AK/M4 + Helmet + Kit
      armorLevel = 2
      // We handle the "who buys AWP" logic in the caller (performBuyPhase) via role assignment or budget check
      // But here we rely on the role passed in.
      // Assuming performBuyPhase correctly assigns 'AWPER' role or we need to handle it here?
      // performBuyPhase handles the 'awpsToBuy' count and temporarily sets role to AWPER.
      // So we just trust 'role' here.
      if (role === "AWPER") {
        weapon = WEAPONS.AWP
      } else {
        weapon = isCT ? WEAPONS.M4A4 : WEAPONS.AK47
      }
      if (isCT) kit = true
    }

    return { weapon, armorLevel, kit }
  }

  /**
   * Generates a financial report for the UI.
   * Matches the logic in EconomyEngine for consistency.
   */
  generateFinancialReport(
    team: any,
    players: any[] = [],
    staff: any[] = [],
    contracts: any[] = []
  ) {
    const followers = team.followers || (team.fanbase * 7)
    const merchLevel = team.merchStoreLevel || 1
    const hypeMultiplier = (team.merchHype || 10) / 10

    // Sponsor Income (includes reputation factor)
    const repFactor = 0.7 + (team.reputation / 100) * 0.6
    const sponsors = (team.sponsors || []).reduce((sum: number, s: any) => sum + (s.weeklyPayout * repFactor), 0)

    // Fan/Merch Income
    const fanZoneFacility = team.facilities?.find((f: any) => f.type === "FANZONE")
    const fanZoneMultiplier = 1 + (fanZoneFacility?.level || 0) * 0.2
    const effectiveRate = 0.0015 // Must match BASE_FAN_INCOME_PER_FAN in economy-engine.ts
    const levelMultiplier = 1 + (merchLevel - 1) * 0.4
    const fanbaseBonus = Math.floor(followers * effectiveRate * levelMultiplier * hypeMultiplier * fanZoneMultiplier)

    // League Revenue Share (Stability)
    const leagueShare = 15000

    // Expenses: Real Salaries
    const playerWages = (team.rosterIds || []).reduce((sum: number, rid: string) => {
      const contract = contracts.find(c => c.playerId === rid)
      return sum + (contract?.salaryPerWeek || 0)
    }, 0)

    const staffWages = (team.staffIds || []).reduce((sum: number, sid: string) => {
      const member = staff.find(s => s.id === sid)
      return sum + (member?.salaryPerWeek || 0)
    }, 0)

    // Expenses: Facilities Upkeep (Exponential scale)
    const facilityUpkeep = (team.facilities || []).reduce((sum: number, f: any) => {
      return sum + Math.floor(Math.pow(f.level, 1.25) * 500)
    }, 0)

    // Training costs: Active role training sessions
    const trainingCost = ((team.activeRoleTraining || []).length) * 5000

    const weeklyIncomeTotal = Math.floor(sponsors + fanbaseBonus + leagueShare)
    const weeklyExpensesTotal = playerWages + staffWages + facilityUpkeep + trainingCost

    return {
      weeklyIncome: {
        sponsors: Math.floor(sponsors),
        fanbaseBonus,
        leagueShare,
        total: weeklyIncomeTotal
      },
      weeklyExpenses: {
        playerSalaries: playerWages + staffWages, // Combined for overview
        facilities: facilityUpkeep,
        training: trainingCost,
        total: weeklyExpensesTotal
      },
      netCashflow: weeklyIncomeTotal - weeklyExpensesTotal,
      merchandiseSales: {
        hypeMultiplier: hypeMultiplier
      }
    }
  }
}

export class SponsorGenerator {
  private static SPONSOR_NAMES = {
    TECH: ["HyperX", "Logitech", "Razer", "SteelSeries", "Corsair", "Intel", "AMD"],
    ENERGY: ["Red Bull", "Monster", "G-Fuel", "Rockstar", "Mountain Dew"],
    BETTING: ["Betway", "GG.BET", "1xBet", "PrizePicks", "Stake"],
    LIFESTYLE: ["Honda", "BMW", "DHL", "Mastercard", "Visa", "Coinbase"]
  }

  private static hashString(input: string): number {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  private static createRng(seed: number): () => number {
    let t = seed || 1
    return () => {
      t += 0x6d2b79f5
      let r = Math.imul(t ^ (t >>> 15), 1 | t)
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  static generateOffers(team: any, currentWeek: number = 1) {
    // Generate 3 offers: Standard, Premium, Elite
    return [
      this.createOffer(team, "STANDARD", currentWeek),
      this.createOffer(team, "PREMIUM", currentWeek),
      this.createOffer(team, "ELITE", currentWeek)
    ]
  }

  private static createOffer(team: any, tier: "STANDARD" | "PREMIUM" | "ELITE", currentWeek: number) {
    const followers = team.followers || 1000
    const reputation = team.reputation || 10
    const teamId = team.id || team.name || "unknown_team"
    const rng = this.createRng(this.hashString(`${teamId}:${currentWeek}:${tier}`))

    // Base Calculation
    let baseWeekly = followers * 0.05 + reputation * 200
    if (tier === "PREMIUM") baseWeekly *= 2.5
    if (tier === "ELITE") baseWeekly *= 6.0

    // Deterministic weekly variance (+- 20%)
    baseWeekly = Math.floor(baseWeekly * (0.8 + rng() * 0.4))

    // Selection
    let category: keyof typeof SponsorGenerator.SPONSOR_NAMES
    if (tier === "STANDARD") category = "TECH"
    else if (tier === "PREMIUM") category = rng() > 0.5 ? "ENERGY" : "BETTING"
    else category = "LIFESTYLE"

    const name = this.SPONSOR_NAMES[category][Math.floor(rng() * this.SPONSOR_NAMES[category].length)]

    // Requirements
    let req = "None"
    if (tier === "PREMIUM") req = "Top 30 Ranking"
    if (tier === "ELITE") req = "Top 10 Ranking or Major Participant"

    // Goals
    const goals = this.generateGoals(tier, rng, currentWeek, teamId)

    return {
      id: `offer_${teamId}_${currentWeek}_${tier}`,
      name: `${name} ${tier === "ELITE" ? "Global" : "Esports"}`,
      tier,
      weeklyPayout: baseWeekly,
      remainingWeeks: tier === "ELITE" ? 48 : tier === "PREMIUM" ? 24 : 12,
      requirements: req,
      goals
    }
  }

  private static generateGoals(
    tier: "STANDARD" | "PREMIUM" | "ELITE",
    rng: () => number,
    currentWeek: number,
    teamId: string
  ) {
    const goals = []
    const count = tier === "ELITE" ? 3 : tier === "PREMIUM" ? 2 : 1

    const potentialGoals = [
      { desc: "Win Matches", target: 5, bonus: 5000 },
      { desc: "Gain Followers", target: 1000, bonus: 2000 },
      { desc: "Win Tournament maps", target: 10, bonus: 8000 },
      { desc: "Maintain Morale > 80", target: 4, bonus: 3000 } // target is weeks
    ]

    const availableTemplates = [...potentialGoals]
    for (let i = 0; i < count; i++) {
      if (availableTemplates.length === 0) break
      const templateIndex = Math.floor(rng() * availableTemplates.length)
      const template = availableTemplates.splice(templateIndex, 1)[0]
      const multiplier = tier === "ELITE" ? 5 : tier === "PREMIUM" ? 2 : 1

      goals.push({
        id: `goal_${teamId}_${currentWeek}_${tier}_${i}`,
        description: template.desc,
        target: template.target * multiplier,
        current: 0,
        bonusPayout: template.bonus * multiplier,
        isCompleted: false
      })
    }

    return goals
  }
}
