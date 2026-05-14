
import { StaffSaveData, STAFF_ROLES } from "./save-types"
import { LEGACY_STAFF_POOL } from "./staff-db"
import { SeededRNG } from "./rng"
import { STAFF_SALARY_RANGES } from "../lib/constants"

export class StaffGenerator {
    private static NAMES = ["Anderson", "Smith", "Zhang", "Popov", "Kovac", "Muller", "Jensen", "Dubois", "Silva"]
    private static NATIONALITIES = ["USA", "UK", "China", "Russia", "Serbia", "Germany", "Denmark", "France", "Brazil"]

    /**
     * Generate a weekly market of staff
     */
    static generateWeeklyMarket(week: number, count: number = 20, rng?: SeededRNG): StaffSaveData[] {
        const market: StaffSaveData[] = []
        const roles: ("coach" | "analyst" | "psychologist" | "scout")[] = [...STAFF_ROLES]
        const localRng = rng ?? new SeededRNG((week * 2654435761) >>> 0)

        // 1. Try to pull 2-3 Real Staff
        const shuffledReal = [...LEGACY_STAFF_POOL]
        for (let i = shuffledReal.length - 1; i > 0; i--) {
            const j = localRng.int(0, i)
                ;[shuffledReal[i], shuffledReal[j]] = [shuffledReal[j], shuffledReal[i]]
        }
        const realCount = Math.min(3, shuffledReal.length)

        for (let i = 0; i < realCount; i++) {
            const real = shuffledReal[i]
            market.push({
                ...real,
                id: `${real.id}_${week}`,
                teamId: "",
                yearsRemaining: 1,
                level: real.level || 3,
                salaryPerWeek: real.salaryPerWeek || 2000,
            } as StaffSaveData)
        }

        // 2. Guarantee at least one of each type in the market
        // Only add if not already present from real staff or to ensure minimum requirements
        roles.forEach((role, idx) => {
            const existingCount = market.filter(s => s.role === role).length
            if (existingCount === 0) {
                market.push(this.generateFakeStaff(role, week * 1000 + idx, localRng))
            }
        })

        // 3. Fill rest with Generated Staff to reach exact count
        // Use a balanced rotation for the remaining slots to ensure diversity
        let roleIndex = 0
        while (market.length < count) {
            const role = roles[roleIndex % roles.length]
            market.push(this.generateFakeStaff(role, week * 100 + market.length + 10, localRng))
            roleIndex++
        }

        // Final trimming just in case of any overflow logic elsewhere
        return market.slice(0, count)
    }

    static generateFakeStaff(role: "coach" | "analyst" | "psychologist" | "scout", seed: number, rng?: SeededRNG): StaffSaveData {
        const localRng = rng ?? new SeededRNG(seed >>> 0)
        const rnd = (min: number, max: number) => localRng.int(min, max)
        const name = `Dr. ${this.NAMES[rnd(0, this.NAMES.length - 1)]}`

        // Rarity Roll
        const roll = localRng.next()
        let rarity: StaffSaveData["rarity"] = "Common"
        let salaryTier = "Low"
        let levelMin = 1, levelMax = 2

        if (roll > 0.95) { rarity = "Legendary"; salaryTier = "Legendary"; levelMin = 5; levelMax = 5 }
        else if (roll > 0.85) { rarity = "Epic"; salaryTier = "Epic"; levelMin = 4; levelMax = 5 }
        else if (roll > 0.60) { rarity = "Rare"; salaryTier = "High"; levelMin = 3; levelMax = 4 }
        else { rarity = "Common"; salaryTier = "Medium"; levelMin = 1; levelMax = 3 }

        const stats: Record<string, number> = {}
        let specialization = "General"
        let baseStatBad = 40, baseStatGood = 70

        if (rarity === "Legendary") { baseStatBad = 75; baseStatGood = 95 }
        else if (rarity === "Epic") { baseStatBad = 65; baseStatGood = 85 }
        else if (rarity === "Rare") { baseStatBad = 50; baseStatGood = 75 }

        if (role === "psychologist") {
            stats.stressResistance = rnd(baseStatBad, baseStatGood)
            stats.mentalRecovery = rnd(baseStatBad, baseStatGood)
            specialization = "Mental Perf."
        } else if (role === "coach") {
            stats.development = rnd(baseStatBad, baseStatGood)
            stats.strategy = rnd(baseStatBad, baseStatGood)
            specialization = "Player Dev"
        } else if (role === "analyst") {
            stats.analysis = rnd(baseStatBad, baseStatGood)
            stats.preparation = rnd(baseStatBad, baseStatGood)
            specialization = "Data Science"
        } else {
            // Scout
            stats.scoutingSpeed = rnd(baseStatBad, baseStatGood)
            stats.accuracy = rnd(baseStatBad, baseStatGood)
            specialization = "Talent ID"
        }

        // Salary Calculation
        const salaryRange = STAFF_SALARY_RANGES[salaryTier as keyof typeof STAFF_SALARY_RANGES]
            ?? STAFF_SALARY_RANGES.Standard
        const salary = rnd(salaryRange.min, salaryRange.max)

        return {
            id: `gen_${role}_${seed}_${name.replace(/[^a-zA-Z]/g, '')}_${rarity}`,
            name: name,
            role: role,
            level: rnd(levelMin, levelMax),
            specialization,
            salaryPerWeek: salary,
            teamId: "",
            yearsRemaining: rnd(1, 3),
            nationality: this.NATIONALITIES[rnd(0, this.NATIONALITIES.length - 1)],
            description: `Generated ${rarity} ${role} expert.`,
            stats,
            rarity,
            salaryTier,
            // Talent Tree
            xp: 0,
            xpToNextLevel: 1000,
            talentPoints: 0,
            unlockedTalentIds: []
        }
    }

    /**
     * Partially rotates the market (keeps some, replaces others)
     */
    static rotateMarket(currentMarket: StaffSaveData[], week: number, rng?: SeededRNG): StaffSaveData[] {
        const localRng = rng ?? new SeededRNG((((week + 97) * 2654435761) >>> 0))
        // Keep 50% of existing, but limit to max 10
        const kept = currentMarket.filter(() => localRng.next() > 0.5).slice(0, 10)

        // Generate replacements (Target 20-25 total)
        const targetCount = 20 + localRng.int(0, 4)
        const needed = Math.max(0, targetCount - kept.length)

        if (needed === 0) return kept

        // Generate new batch
        const newBatch = this.generateWeeklyMarket(week, needed, localRng)

        return [...kept, ...newBatch]
    }
}
