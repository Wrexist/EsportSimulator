
import { StaffSaveData, STAFF_ROLES } from "./save-types"
import { LEGACY_STAFF_POOL } from "./staff-db"
import { SeededRNG } from "./rng"
import { STAFF_SALARY_RANGES } from "../lib/constants"

/** Weeks a staff member released by a club stays on the market through refreshes. */
export const RELEASED_STAFF_MARKET_WEEKS = 8

const isRecentlyReleased = (s: StaffSaveData, week: number) =>
    s.releasedWeek !== undefined && week - s.releasedWeek < RELEASED_STAFF_MARKET_WEEKS

export class StaffGenerator {
    /** Kept at nine entries: the name roll draws an index in this range, so its size fixes the RNG sequence. */
    private static NAMES = ["Anderson", "Smith", "Zhang", "Popov", "Kovac", "Muller", "Jensen", "Dubois", "Silva"]
    private static NATIONALITIES = ["USA", "UK", "China", "Russia", "Serbia", "Germany", "Denmark", "France", "Brazil"]
    /** First and last names per nationality; the name roll and the seed pick from these. */
    private static NAME_POOL: Record<string, { first: string[]; last: string[] }> = {
        USA: { first: ["Mike", "Chris", "Jordan", "Tyler", "Ryan", "Kyle", "Sam", "Dana", "Alex"], last: ["Anderson", "Miller", "Brooks", "Carter", "Hayes", "Walker", "Reed", "Parker", "Coleman"] },
        UK: { first: ["James", "Oliver", "Harry", "Tom", "Callum", "Ellie", "Rhys", "Liam", "Jack"], last: ["Smith", "Taylor", "Hughes", "Wright", "Evans", "Clarke", "Turner", "Bennett", "Lloyd"] },
        China: { first: ["Wei", "Hao", "Jun", "Lei", "Ming", "Yang", "Chen", "Bo", "Tao"], last: ["Zhang", "Wang", "Li", "Liu", "Chen", "Zhao", "Huang", "Zhou", "Wu"] },
        Russia: { first: ["Dmitry", "Sergey", "Andrey", "Ivan", "Pavel", "Oleg", "Nikita", "Artem", "Yuri"], last: ["Popov", "Volkov", "Smirnov", "Petrov", "Sokolov", "Morozov", "Lebedev", "Orlov", "Kuznetsov"] },
        Serbia: { first: ["Nikola", "Marko", "Stefan", "Luka", "Milan", "Dusan", "Petar", "Vuk", "Ivan"], last: ["Kovac", "Jovanovic", "Petrovic", "Nikolic", "Markovic", "Djordjevic", "Ilic", "Savic", "Pavlovic"] },
        Germany: { first: ["Lukas", "Jonas", "Felix", "Tobias", "Jan", "Niklas", "Moritz", "Lena", "Paul"], last: ["Muller", "Schmidt", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Koch", "Richter"] },
        Denmark: { first: ["Mads", "Rasmus", "Mikkel", "Emil", "Frederik", "Jonas", "Kasper", "Anders", "Søren"], last: ["Jensen", "Nielsen", "Hansen", "Pedersen", "Andersen", "Larsen", "Sørensen", "Rasmussen", "Madsen"] },
        France: { first: ["Lucas", "Hugo", "Théo", "Mathieu", "Julien", "Kévin", "Nicolas", "Camille", "Antoine"], last: ["Dubois", "Martin", "Bernard", "Moreau", "Laurent", "Girard", "Lefèvre", "Roux", "Fournier"] },
        Brazil: { first: ["Gabriel", "Lucas", "Rafael", "Bruno", "Felipe", "Thiago", "Gustavo", "Mateus", "Caio"], last: ["Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Almeida", "Ferreira", "Lima"] },
    }

    /** A full name for a generated staff member. Psychologists carry their title. */
    private static staffName(role: string, nationality: string, nameRoll: number, seed: number, variant = 0): string {
        const pool = this.NAME_POOL[nationality] ?? this.NAME_POOL.UK
        const mix = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0)
        const first = pool.first[(mix + variant) % pool.first.length]
        const last = pool.last[(nameRoll + Math.floor(variant / pool.first.length)) % pool.last.length]
        return `${role === "psychologist" ? "Dr. " : ""}${first} ${last}`
    }

    /**
     * Gives every generated member of a market a name no one else in it has.
     * Real staff keep theirs and appear once (a rotation can draw someone already listed).
     */
    private static uniqueNames(market: StaffSaveData[]): StaffSaveData[] {
        const realSeen = new Set<string>()
        const deduped = market.filter(member => {
            if (member.id.startsWith("gen_")) return true
            if (realSeen.has(member.name)) return false
            realSeen.add(member.name)
            return true
        })
        const used = new Set(realSeen)
        return deduped.map(member => {
            if (!member.id.startsWith("gen_") || !used.has(member.name)) { used.add(member.name); return member }
            const nameRoll = Math.max(0, this.NAMES.indexOf(member.name.split(" ").pop() ?? ""))
            const seed = Number(member.id.split("_")[2]) || 0
            for (let variant = 1; variant < 81; variant++) {
                const name = this.staffName(member.role, member.nationality ?? "UK", nameRoll, seed, variant)
                if (!used.has(name)) { used.add(name); return { ...member, name } }
            }
            return member
        })
    }

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
        return this.uniqueNames(market.slice(0, count))
    }

    static generateFakeStaff(role: "coach" | "analyst" | "psychologist" | "scout", seed: number, rng?: SeededRNG): StaffSaveData {
        const localRng = rng ?? new SeededRNG(seed >>> 0)
        const rnd = (min: number, max: number) => localRng.int(min, max)
        const nameRoll = rnd(0, this.NAMES.length - 1)

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

        const level = rnd(levelMin, levelMax)
        const yearsRemaining = rnd(1, 3)
        const nationality = this.NATIONALITIES[rnd(0, this.NATIONALITIES.length - 1)]
        const name = this.staffName(role, nationality, nameRoll, seed)

        return {
            id: `gen_${role}_${seed}_${name.replace(/[^a-zA-Z]/g, '')}_${rarity}`,
            name: name,
            role: role,
            level,
            specialization,
            salaryPerWeek: salary,
            teamId: "",
            yearsRemaining,
            nationality,
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

    /** Staff released by clubs in the last RELEASED_STAFF_MARKET_WEEKS weeks (kept by every refresh). */
    static recentlyReleased(currentMarket: StaffSaveData[], week: number): StaffSaveData[] {
        return currentMarket.filter(s => isRecentlyReleased(s, week))
    }

    /**
     * Partially rotates the market (keeps some, replaces others). Staff
     * released by clubs stay for RELEASED_STAFF_MARKET_WEEKS on top of that.
     */
    static rotateMarket(currentMarket: StaffSaveData[], week: number, rng?: SeededRNG): StaffSaveData[] {
        const localRng = rng ?? new SeededRNG((((week + 97) * 2654435761) >>> 0))
        const released = this.recentlyReleased(currentMarket, week)
        // Keep 50% of the rest, but limit to max 10
        const kept = [
            ...released,
            ...currentMarket.filter(s => !isRecentlyReleased(s, week)).filter(() => localRng.next() > 0.5).slice(0, 10),
        ]

        // Generate replacements (Target 20-25 total)
        const targetCount = 20 + localRng.int(0, 4)
        const needed = Math.max(0, targetCount - kept.length)

        if (needed === 0) return kept

        // Generate new batch (never a second copy of someone still listed)
        const keptIds = new Set(kept.map(s => s.id))
        const keptNames = new Set(kept.filter(s => !s.id.startsWith("gen_")).map(s => s.name))
        const newBatch = this.generateWeeklyMarket(week, needed, localRng)
            .filter(s => !keptIds.has(s.id) && (s.id.startsWith("gen_") || !keptNames.has(s.name)))

        return this.uniqueNames([...kept, ...newBatch])
    }
}
