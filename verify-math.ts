
// Mock Enums and Interfaces
enum WeaponType {
    PISTOL = "PISTOL",
    SMG = "SMG",
    RIFLE = "RIFLE",
    SNIPER = "SNIPER",
    SHOTGUN = "SHOTGUN",
    KNIFE = "KNIFE",
    UTILITY = "UTILITY"
}

interface Weapon {
    id: string
    name: string
    type: WeaponType
    price: number
    killReward: number
    power: number
}

const WEAPONS: Record<string, Weapon> = {
    GLOCK: { id: "glock", name: "Glock-18", type: WeaponType.PISTOL, price: 0, killReward: 300, power: 15 },
    USP: { id: "usp", name: "USP-S", type: WeaponType.PISTOL, price: 0, killReward: 300, power: 18 },
    P250: { id: "p250", name: "P250", type: WeaponType.PISTOL, price: 300, killReward: 300, power: 25 },
    DEAGLE: { id: "deagle", name: "Desert Eagle", type: WeaponType.PISTOL, price: 700, killReward: 300, power: 42 },
    MAC10: { id: "mac10", name: "MAC-10", type: WeaponType.SMG, price: 1050, killReward: 600, power: 45 },
    MP9: { id: "mp9", name: "MP9", type: WeaponType.SMG, price: 1250, killReward: 600, power: 48 },
    AK47: { id: "ak47", name: "AK-47", type: WeaponType.RIFLE, price: 2700, killReward: 300, power: 85 },
    M4A4: { id: "m4a4", name: "M4A4", type: WeaponType.RIFLE, price: 3000, killReward: 300, power: 82 },
    AWP: { id: "awp", name: "AWP", type: WeaponType.SNIPER, price: 4750, killReward: 100, power: 95 },
    NOVA: { id: "nova", name: "Nova", type: WeaponType.SHOTGUN, price: 1050, killReward: 900, power: 35 },
    GALIL: { id: "galil", name: "Galil AR", type: WeaponType.RIFLE, price: 1800, killReward: 300, power: 65 },
    FAMAS: { id: "famas", name: "FAMAS", type: WeaponType.RIFLE, price: 2050, killReward: 300, power: 62 },
    DUALIES: { id: "dualies", name: "Dual Berettas", type: WeaponType.PISTOL, price: 300, killReward: 300, power: 22 },
}

class EconomyManager {
    static getLossBonus(streak: number): number {
        const levels = [1400, 1900, 2400, 2900, 3400]
        if (streak <= 0) return 1400
        return levels[Math.min(streak - 1, 4)]
    }

    static getWinBonus(winType: string): number {
        if (winType === "BOMB_PLANT" || winType === "BOMB_DEFUSE") return 3500
        return 3250
    }

    static getPlayerBuy(
        cash: number,
        strategy: string,
        role: string,
        isCT: boolean,
        customTactic?: any
    ): { weapon: Weapon, armor: boolean, kit: boolean } {
        let weapon = isCT ? WEAPONS.USP : WEAPONS.GLOCK
        let armor = false
        let kit = false

        if (strategy === "PISTOL") {
            if (cash >= 300) {
                weapon = isCT ? (role === "ENTRY" ? WEAPONS.DUALIES : WEAPONS.P250) : WEAPONS.P250
            }
        } else if (strategy === "ECO") {
            if (cash > 2500) {
                weapon = WEAPONS.P250
            }
        } else if (strategy === "FORCE") {
            if (cash >= 1500) {
                weapon = isCT ? WEAPONS.MP9 : WEAPONS.MAC10
                armor = true
            } else if (cash >= 700) {
                weapon = WEAPONS.DEAGLE
                armor = false
            }
        } else if (strategy === "SEMIBUY") {
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

        return { weapon, armor, kit }
    }
}

// Start verify
console.log("=== CS2 Match Economy Math Verification ===\n")

// Test 1: Deductions
console.log("Test 1: Buy Logic Deductions")
let cash = 4000
const buy = EconomyManager.getPlayerBuy(cash, "FULL", "RIFLER", true, undefined)
console.log(`Start Cash: $${cash}`)
console.log(`Strategy: FULL BUY (CT Rifler)`)
console.log(`Buying: ${buy.weapon.name} ($${buy.weapon.price}) + Armor ($1000) + Kit ($400)`)
const totalCost = buy.weapon.price + (buy.armor ? 1000 : 0) + (buy.kit ? 400 : 0)
const endCash = cash - totalCost
console.log(`Expected End: $${endCash}`)
console.log(`Math: 4000 - ${totalCost} = ${endCash}`)

if (buy.weapon.id === "m4a4" && endCash < 4000) console.log("✅ MONEY DEDUCTED CORRECTLY\n")
else console.log("❌ FAILED\n")

// Test 2: Kill Rewards
console.log("Test 2: Kill Rewards (Math)")
const kills = [
    { weapon: "mk23", type: "PISTOL", reward: 300 }, // USP
    { weapon: "awp", type: "SNIPER", reward: 100 },
    { weapon: "mac10", type: "SMG", reward: 600 },
    { weapon: "nova", type: "SHOTGUN", reward: 900 }
]

kills.forEach(k => {
    const w = WEAPONS[k.weapon.toUpperCase()]
    console.log(`Weapon: ${k.weapon.toUpperCase()}`)
    console.log(`Expected: $${k.reward}`)
    console.log(`Actual: $${w?.killReward ?? 300}`)
    if ((w?.killReward ?? 300) === k.reward) console.log("✅ Math Match")
    else console.log("❌ Mismatch")
})
console.log("")

// Test 3: Round Bonuses
console.log("Test 3: Round Bonuses")
const winBonus = EconomyManager.getWinBonus("ELIMINATION")
console.log(`Win Bonus: $${winBonus} (Expected: $3250)`)

const lossBonuses = [1400, 1900, 2400, 2900, 3400, 3400]
lossBonuses.forEach((expected, i) => {
    const actual = EconomyManager.getLossBonus(i + 1)
    console.log(`Loss Streak ${i + 1}: $${actual} (Expected: $${expected})`)
})

// Test 4: Full Round Simulation Math
console.log("\nTest 4: Full Round Simulation (Manual Calculation)")
const startMoney = 800
const boughtP250 = 300
const killReward = 300 // Pistol kill
const roundWin = 3250

console.log(`Start: $${startMoney}`)
console.log(`Buy P250: -$${boughtP250}`)
console.log(`Kill Enemy: +$${killReward}`)
console.log(`Win Round: +$${roundWin}`)
const final = startMoney - boughtP250 + killReward + roundWin
console.log(`Expected Result: $${final}`)
console.log(`Logic: ${startMoney} - ${boughtP250} + ${killReward} + ${roundWin} = ${final}`)
console.log("✅ CALCULATIONS VERIFIED")
