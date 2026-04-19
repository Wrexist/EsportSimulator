/**
 * Prospect Generator Engine
 * Phase 2: Realistic procedural generation of academy prospects
 * 
 * Features:
 * - Nationality-based name pools (Nordic, Slavic, Western, Brazilian, etc.)
 * - CS2 nickname generation patterns
 * - Age-weighted stat generation (younger = lower base, higher potential)
 * - Role-based stat biasing
 * - Personality archetypes affecting mental stats
 */

import { PlayerRole } from "../types/enums"
import { ScoutingTier } from "../types/academy"
import { PROSPECT_CONFIG } from "./academy-constants"
import { SeededRNG, generateSeed } from "./rng"

// ===== NAME POOLS BY REGION =====

const NAME_POOLS = {
    nordic: {
        nationalities: ["Sweden", "Denmark", "Norway", "Finland"],
        first: [
            "Erik", "Lukas", "Oskar", "Frederik", "Mathias", "Emil", "Rasmus", "Magnus",
            "Viktor", "Mikkel", "Jesper", "Nicolai", "Philip", "Kristian", "Jonas", "Markus",
            "William", "Alexander", "Joakim", "Henrik", "Patrik", "Simon", "Aleksander", "Ludvig"
        ],
        last: [
            "Hansen", "Larsen", "Olsen", "Nielsen", "Andersen", "Petersen", "Christensen",
            "Jensen", "Johansson", "Lindqvist", "Eriksson", "Nyström", "Bergman", "Hedberg",
            "Möller", "Sørensen", "Rasmussen", "Poulsen", "Madsen", "Kjær", "Vestergaard"
        ]
    },
    slavic: {
        nationalities: ["Russia", "Ukraine", "Poland", "Czech Republic", "Slovakia"],
        first: [
            "Aleksandr", "Dmitriy", "Sergey", "Vladislav", "Nikita", "Kirill", "Mikhail",
            "Andrey", "Pavel", "Ivan", "Yegor", "Daniil", "Ilya", "Artem", "Maksim",
            "Vasiliy", "Denis", "Roman", "Timofey", "Stanislav", "Aleksey", "Oleg"
        ],
        last: [
            "Ivanov", "Petrov", "Sidorov", "Volkov", "Kozlov", "Morozov", "Novikov",
            "Sokolov", "Popov", "Lebedev", "Kuznetsov", "Smirnov", "Fedorov", "Vasiliev",
            "Kowalski", "Nowak", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński"
        ]
    },
    western: {
        nationalities: ["Germany", "France", "Netherlands", "Belgium", "Austria", "Switzerland"],
        first: [
            "Thomas", "Michael", "Kevin", "Peter", "Daniel", "Sebastian", "Jan", "Tim",
            "Florian", "Tobias", "Max", "Johannes", "Felix", "Lukas", "Paul", "Lennart",
            "Antoine", "Pierre", "Jean", "Lucas", "Hugo", "Louis", "Mathieu", "Nicolas"
        ],
        last: [
            "Schmidt", "Weber", "Wagner", "Fischer", "Müller", "Schneider", "Becker",
            "Hoffmann", "Schäfer", "Koch", "Meyer", "Richter", "Klein", "Wolf", "Schröder",
            "Dupont", "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard",
            "de Jong", "Jansen", "de Vries", "van Dijk", "Bakker", "Visser"
        ]
    },
    brazilian: {
        nationalities: ["Brazil", "Argentina", "Chile", "Peru"],
        first: [
            "Gabriel", "Lucas", "Matheus", "Felipe", "Rafael", "Bruno", "Gustavo", "Pedro",
            "Vitor", "Leonardo", "Thiago", "Eduardo", "Henrique", "Caio", "Igor", "Yuri",
            "Kaique", "Marcelo", "André", "Fernando", "Ricardo", "Adriano", "Diego"
        ],
        last: [
            "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Ferreira",
            "Rodrigues", "Almeida", "Nascimento", "Araújo", "Carvalho", "Ribeiro", "Gomes",
            "Martins", "Rocha", "Barbosa", "Mendes", "Nunes", "Moreira", "Correia"
        ]
    },
    chinese: {
        nationalities: ["China", "Hong Kong", "Taiwan"],
        first: [
            "Wei", "Ming", "Jian", "Hao", "Xiao", "Chen", "Yu", "Tao",
            "Lei", "Yang", "Feng", "Jun", "Bin", "Cheng", "Long", "Peng",
            "Hui", "Kai", "Zhi", "Hong", "Bo", "Rui", "Sheng", "Wen"
        ],
        last: [
            "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhou",
            "Wu", "Xu", "Sun", "Ma", "Hu", "Guo", "Lin", "He",
            "Luo", "Gao", "Zheng", "Liang", "Xie", "Tang", "Han", "Deng"
        ]
    },
    anglosphere: {
        nationalities: ["United States", "United Kingdom", "Canada", "Australia"],
        first: [
            "James", "John", "Michael", "William", "David", "Richard", "Joseph", "Thomas",
            "Christopher", "Charles", "Daniel", "Matthew", "Anthony", "Mark", "Donald",
            "Steven", "Paul", "Andrew", "Joshua", "Kenneth", "Kevin", "Brian", "George",
            "Timothy", "Ronald", "Edward", "Jason", "Jeffrey", "Ryan", "Jacob"
        ],
        last: [
            "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
            "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore",
            "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee", "Harris", "Clark",
            "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright"
        ]
    },
    turkish: {
        nationalities: ["Turkey"],
        first: [
            "Mehmet", "Mustafa", "Ahmet", "Ali", "Emre", "Burak", "Enes", "Can",
            "Fatih", "Ozan", "Yusuf", "Kerem", "Arda", "Kaan", "Baran", "Özgür",
            "Serkan", "Tolga", "Onur", "Mert", "Berkay", "Tuna", "Alper", "Cem"
        ],
        last: [
            "Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Yıldız", "Yıldırım", "Öztürk",
            "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara",
            "Koç", "Kurt", "Özkan", "Şimşek", "Polat", "Korkmaz", "Yalçın", "Erdoğan"
        ]
    },
    balkan: {
        nationalities: ["Serbia", "Croatia", "Bosnia", "Montenegro", "Slovenia", "Kosovo"],
        first: [
            "Nikola", "Luka", "Marko", "Stefan", "Ivan", "Aleksandar", "Nemanja", "Milan",
            "Dragan", "Zoran", "Goran", "Dejan", "Branislav", "Petar", "Filip", "Bojan",
            "Miroslav", "Vladimir", "Srđan", "Saša", "Danilo", "Miloš", "Uroš", "Nenad"
        ],
        last: [
            "Jović", "Kovačević", "Nikolić", "Marković", "Petrović", "Đorđević", "Stojanović",
            "Ilić", "Stanković", "Pavlović", "Milošević", "Tomić", "Kostić", "Krstić",
            "Babić", "Savić", "Ristić", "Filipović", "Vasić", "Živković", "Janković"
        ]
    }
} as const

type RegionKey = keyof typeof NAME_POOLS

// ===== NICKNAME GENERATION =====

const NICKNAME_PARTS = {
    prefixes: ["x", "z", "k", "n", "s", "d", "m", "v", "r", "f"],
    adjectives: [
        "Dark", "Cold", "Ice", "Fire", "Steel", "Iron", "Night", "Storm", "Shadow",
        "Ghost", "Silent", "Swift", "Quick", "Sharp", "Flash", "Thunder", "Frost",
        "Blaze", "Nova", "Cyber", "Neo", "Ultra", "Hyper", "Mega", "Fatal"
    ],
    nouns: [
        "Wolf", "Fox", "Hawk", "Eagle", "Tiger", "Lion", "Bear", "Viper", "Cobra",
        "Storm", "Blade", "Edge", "Fury", "Rage", "Force", "Strike", "Shot", "Ace",
        "Star", "King", "Lord", "Knight", "Ninja", "Sniper", "Hunter", "Killer",
        "Phoenix", "Dragon", "Demon", "Angel", "Reaper", "Spark", "Bolt", "Flame"
    ],
    suffixes: [
        "", "", "", "", // Empty to have many without suffix
        "1", "2", "7", "9", "0",
        "x", "z", "o", "y",
        "99", "01", "13", "77", "00"
    ],
    // Realistic CS pro-style nicknames
    proStyle: [
        "dev1xe", "v4ltz", "Zyvo0", "N1Ko", "m3NESY", "donx", "rolpz", "Tw1stz",
        "kscratto", "froozen", "b1ix", "Jumi", "sh2r0", "coldzer0", "Ax2Le", "raen",
        "broxy", "tabzeN", "YETZ", "Brollix", "Spynx", "blazeF", "Perfectonic"
    ]
}

const fallbackRng = new SeededRNG(generateSeed())

function random(rng?: SeededRNG): number {
    return rng ? rng.next() : fallbackRng.next()
}

function randomInt(min: number, max: number, rng?: SeededRNG): number {
    return Math.floor(random(rng) * (max - min + 1)) + min
}

function pick<T>(array: readonly T[], rng?: SeededRNG): T {
    return array[randomInt(0, array.length - 1, rng)]
}

// Generate a realistic CS2 nickname
function generateNickname(firstName: string, rng?: SeededRNG): string {
    const rand = random(rng)

    // 15% chance: Use a pro-style pattern based on first name
    if (rand < 0.15) {
        const nameBase = firstName.toLowerCase().slice(0, 4)
        const mutations = [
            nameBase,
            nameBase + randomInt(0, 9, rng),
            nameBase.charAt(0) + nameBase.slice(1).replace(/[aeiou]/i, "1"),
            nameBase.toUpperCase()
        ]
        return pick(mutations, rng)
    }

    // 20% chance: prefix + word pattern (e.g., "xStorm", "zWolf")
    if (rand < 0.35) {
        const prefix = pick(NICKNAME_PARTS.prefixes, rng)
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        return prefix + noun
    }

    // 25% chance: adjective + noun pattern (e.g., "DarkWolf", "IceStorm")
    if (rand < 0.60) {
        const adj = pick(NICKNAME_PARTS.adjectives, rng)
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        return adj + noun
    }

    // 25% chance: single word + optional suffix (e.g., "Storm", "Ace99")
    if (rand < 0.85) {
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        const suffix = pick(NICKNAME_PARTS.suffixes, rng)
        return noun.toLowerCase() + suffix
    }

    // 15% chance: name-derived (e.g., first 3-4 letters with leet speak)
    const leetMap: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5" }
    let leetName = firstName.toLowerCase().slice(0, 4)
    for (const [char, leet] of Object.entries(leetMap)) {
        if (random(rng) < 0.3) {
            leetName = leetName.replace(char, leet)
        }
    }
    return leetName
}

// ===== STAT GENERATION =====

interface GeneratedStats {
    // Technical
    skill: number
    awp: number
    rifle: number
    pistol: number
    grenades: number
    creativity: number
    clutch: number
    tactic: number
    entry: number
    trading: number

    // Mental
    leader: number
    teamwork: number
    morale: number
    amicability: number
    productivity: number
    stressResistance: number
    loyalty: number

    // Physical
    reaction: number
    eyesight: number
    health: number
    strength: number
    endurance: number

    // Dynamic
    form: number
    fatigue: number
    potential: number
    energy: number
}

// Role-specific stat weights (which stats get boosted)
const ROLE_STAT_WEIGHTS: Record<PlayerRole, (keyof GeneratedStats)[]> = {
    [PlayerRole.AWPER]: ["awp", "clutch", "reaction"],
    [PlayerRole.ENTRY_FRAGGER]: ["entry", "rifle", "stressResistance", "reaction"],
    [PlayerRole.SUPPORT]: ["grenades", "teamwork", "trading"],
    [PlayerRole.IGL]: ["leader", "tactic", "teamwork"],
    [PlayerRole.RIFLER]: ["rifle", "trading", "entry", "creativity"]
}

// Personality archetypes that influence mental stats
type PersonalityArchetype = "PRODIGY" | "GRINDER" | "NATURAL" | "CLUTCH_GENE" | "TEAM_PLAYER" | "LONE_WOLF"

const PERSONALITY_EFFECTS: Record<PersonalityArchetype, Partial<GeneratedStats>> = {
    PRODIGY: { skill: 5, creativity: 8, potential: 5, productivity: -3 },
    GRINDER: { productivity: 10, endurance: 5, loyalty: 5, creativity: -3 },
    NATURAL: { skill: 3, reaction: 5, form: 10, morale: 3 },
    CLUTCH_GENE: { clutch: 12, stressResistance: 8, morale: -3 },
    TEAM_PLAYER: { teamwork: 10, amicability: 8, trading: 5, leader: -2 },
    LONE_WOLF: { creativity: 8, clutch: 5, teamwork: -5, amicability: -5 }
}

// Generate stats based on age and role
function generateStats(age: number, role: PlayerRole, tier: ScoutingTier, rng?: SeededRNG): GeneratedStats {
    const ageConfig = PROSPECT_CONFIG.statRangesByAge[age] || PROSPECT_CONFIG.statRangesByAge[17]

    // Tier affects stat quality
    const tierBonus = tier === "INTERNATIONAL" ? 8 : tier === "REGIONAL" ? 4 : 0

    // Generate base stats
    const generateBaseStat = () => {
        const base = ageConfig.base.min + random(rng) * (ageConfig.base.max - ageConfig.base.min)
        const variance = (random(rng) - 0.5) * 2 * PROSPECT_CONFIG.statVariance
        return Math.round(Math.min(100, Math.max(1, base + variance + tierBonus)))
    }

    // Generate potential (inversely related to age, affected by tier)
    const potentialBase = ageConfig.potential.min + random(rng) * (ageConfig.potential.max - ageConfig.potential.min)
    const potentialBonus = tier === "INTERNATIONAL" ? 10 : tier === "REGIONAL" ? 5 : 0

    const stats: GeneratedStats = {
        // Technical
        skill: generateBaseStat(),
        awp: generateBaseStat(),
        rifle: generateBaseStat(),
        pistol: generateBaseStat(),
        grenades: generateBaseStat(),
        creativity: generateBaseStat(),
        clutch: generateBaseStat(),
        tactic: generateBaseStat(),
        entry: generateBaseStat(),
        trading: generateBaseStat(),

        // Mental
        leader: generateBaseStat(),
        teamwork: generateBaseStat(),
        morale: randomInt(60, 89, rng), // 60-90 starting morale
        amicability: generateBaseStat(),
        productivity: generateBaseStat(),
        stressResistance: generateBaseStat(),
        loyalty: randomInt(50, 79, rng), // 50-80 starting loyalty

        // Physical
        reaction: generateBaseStat(),
        eyesight: randomInt(70, 94, rng), // Young players have good eyesight
        health: randomInt(80, 99, rng), // Young = healthy
        strength: generateBaseStat(),
        endurance: generateBaseStat(),

        // Dynamic
        form: randomInt(50, 79, rng), // 50-80 starting form
        fatigue: randomInt(0, 19, rng), // 0-20 starting fatigue
        potential: Math.round(Math.min(100, potentialBase + potentialBonus)),
        energy: randomInt(80, 99, rng) // 80-100 starting energy
    }

    // Apply role-specific bonuses
    const roleBoosts = ROLE_STAT_WEIGHTS[role]
    const roleBonus = PROSPECT_CONFIG.roleStatBonus.min +
        random(rng) * (PROSPECT_CONFIG.roleStatBonus.max - PROSPECT_CONFIG.roleStatBonus.min)

    roleBoosts.forEach(stat => {
        stats[stat] = Math.min(100, stats[stat] + Math.round(roleBonus))
    })

    // Apply random personality archetype
    const archetypes: PersonalityArchetype[] = ["PRODIGY", "GRINDER", "NATURAL", "CLUTCH_GENE", "TEAM_PLAYER", "LONE_WOLF"]
    const personality = pick(archetypes, rng)
    const personalityEffects = PERSONALITY_EFFECTS[personality]

    for (const [stat, effect] of Object.entries(personalityEffects)) {
        const key = stat as keyof GeneratedStats
        stats[key] = Math.min(100, Math.max(1, stats[key] + (effect as number)))
    }

    return stats
}

// ===== MAIN GENERATOR =====

export interface GeneratedProspect {
    firstName: string
    lastName: string
    nickname: string
    fullName: string
    age: number
    nationality: string
    region: RegionKey
    role: PlayerRole
    stats: GeneratedStats
    portraitPath: string
}

/**
 * Generate a random academy prospect
 * @param scoutingTier Affects stat quality (higher tier = better prospects)
 * @param preferredNationality Optional: force a specific nationality
 */
export function generateProspect(
    scoutingTier: ScoutingTier = "LOCAL",
    preferredNationality?: string,
    rng?: SeededRNG
): GeneratedProspect {
    // Select region
    let region: RegionKey
    let nationality: string

    if (preferredNationality) {
        // Find region containing this nationality
        const foundRegion = (Object.keys(NAME_POOLS) as RegionKey[]).find(r =>
            (NAME_POOLS[r].nationalities as readonly string[]).includes(preferredNationality)
        )
        region = foundRegion || "western"
        nationality = preferredNationality
    } else {
        // Random region weighted by esports prevalence
        const regionWeights: [RegionKey, number][] = [
            ["nordic", 20],
            ["slavic", 25],
            ["western", 15],
            ["brazilian", 12],
            ["chinese", 8],
            ["anglosphere", 10],
            ["turkish", 5],
            ["balkan", 5]
        ]

        const totalWeight = regionWeights.reduce((sum, [, w]) => sum + w, 0)
        let roll = random(rng) * totalWeight

        for (const [r, weight] of regionWeights) {
            roll -= weight
            if (roll <= 0) {
                region = r
                break
            }
        }
        region = region! || "western"

        // Random nationality from region
        const nationalities = NAME_POOLS[region].nationalities
        nationality = pick(nationalities, rng)
    }

    // Generate name
    const pool = NAME_POOLS[region]
    const firstName = pick(pool.first, rng)
    const lastName = pick(pool.last, rng)
    const nickname = generateNickname(firstName, rng)

    // Generate age
    const age = randomInt(PROSPECT_CONFIG.ageRange.min, PROSPECT_CONFIG.ageRange.max, rng)

    // Generate role (weighted by commonality)
    const roleWeights: [PlayerRole, number][] = [
        [PlayerRole.RIFLER, 40],
        [PlayerRole.ENTRY_FRAGGER, 25],
        [PlayerRole.SUPPORT, 20],
        [PlayerRole.AWPER, 10],
        [PlayerRole.IGL, 5]
    ]

    let role: PlayerRole = PlayerRole.RIFLER
    const totalRoleWeight = roleWeights.reduce((sum, [, w]) => sum + w, 0)
    let roleRandom = random(rng) * totalRoleWeight

    for (const [r, weight] of roleWeights) {
        roleRandom -= weight
        if (roleRandom <= 0) {
            role = r
            break
        }
    }

    // Generate stats
    const stats = generateStats(age, role, scoutingTier, rng)

    return {
        firstName,
        lastName,
        nickname,
        fullName: `${firstName} "${nickname}" ${lastName}`,
        age,
        nationality,
        region,
        role,
        stats,
        portraitPath: "/player_placeholder.png"
    }
}

/**
 * Generate multiple unique prospects
 */
export function generateProspectBatch(count: number, tier: ScoutingTier = "LOCAL", rng?: SeededRNG): GeneratedProspect[] {
    const prospects: GeneratedProspect[] = []
    const usedNicknames = new Set<string>()

    while (prospects.length < count) {
        const prospect = generateProspect(tier, undefined, rng)

        // Ensure unique nicknames
        if (!usedNicknames.has(prospect.nickname.toLowerCase())) {
            usedNicknames.add(prospect.nickname.toLowerCase())
            prospects.push(prospect)
        }
    }

    return prospects
}

/**
 * Convert a generated prospect to PlayerSaveData format
 */
export function prospectToPlayerData(prospect: GeneratedProspect, gameWeek: number, rng?: SeededRNG): Record<string, unknown> {
    const idSuffix = randomInt(0, 0x7fffffff, rng).toString(36)
    return {
        id: `prospect_${gameWeek}_${idSuffix}`,
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        nickname: prospect.nickname,
        name: prospect.fullName,
        age: prospect.age,
        nationality: prospect.nationality,
        portraitPath: prospect.portraitPath,
        role: prospect.role,
        secondaryRole: null,
        tier: "ROOKIE",

        // Stats from generation
        ...prospect.stats,

        // Career stats (fresh prospect)
        matchesPlayed: 0,
        roundsPlayed: 0,
        avgRating: 0,
        clutchSuccessRate: 0,

        // Contract placeholder (set when promoted)
        contract: null,

        // Progression
        level: 1,
        xp: 0,
        xpToNextLevel: 1000,
        talentPoints: 0,
        unlockedTalentIds: [],

        // Default energy
        maxEnergy: 100,

        // Track origin
        isAcademyGraduate: false,
        enrolledWeek: gameWeek
    }
}
