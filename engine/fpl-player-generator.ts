/**
 * FPL Non-Pro Player Generator
 * Generates FPL-specific players who are not on professional teams
 *
 * Player Types:
 * - STREAMER: Popular content creators who grind FPL
 * - SEMI_PRO: Skilled players seeking a team spot
 * - ACADEMY_REJECT: Failed academy prospects still trying
 * - GRINDER: Dedicated FPL ladder climbers
 * - RETIRED_PRO: Former professionals still competing
 * - RISING_TALENT: Young prospects climbing the ranks
 */

import { PlayerRole } from "../types/enums"
import {
    FPLPlayerType,
    FPLNonProPlayer,
    FPLTier,
    FPL_CONSTANTS
} from "../types/fpl"
import { SeededRNG } from "./rng"
import { PlayerSaveData } from "./save-types"

// ===== NAME POOLS (Reused from prospect-generator) =====

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
        "", "", "", "",
        "1", "2", "7", "9", "0",
        "x", "z", "o", "y",
        "99", "01", "13", "77", "00"
    ],
    // Streamer-specific patterns
    streamerPrefixes: ["tTV_", "YT_", "its", "The", "Real", "Official"],
    // Grinder-specific patterns
    grinderSuffixes: ["_FPL", "_rank", "_elo", "_pro", "_main"]
}

// ===== PLAYER TYPE CONFIGURATION =====

// Player type distribution by tier (percentages)
const TYPE_WEIGHTS_BY_TIER: Record<FPLTier, Record<Exclude<FPLPlayerType, 'PRO'>, number>> = {
    'FPL': {
        'STREAMER': 25,
        'SEMI_PRO': 30,
        'ACADEMY_REJECT': 5,
        'GRINDER': 10,
        'RETIRED_PRO': 20,
        'RISING_TALENT': 10
    },
    'FPL_C': {
        'STREAMER': 10,
        'SEMI_PRO': 30,
        'ACADEMY_REJECT': 15,
        'GRINDER': 25,
        'RETIRED_PRO': 5,
        'RISING_TALENT': 15
    },
    'HUBS': {
        'STREAMER': 5,
        'SEMI_PRO': 15,
        'ACADEMY_REJECT': 20,
        'GRINDER': 40,
        'RETIRED_PRO': 0,
        'RISING_TALENT': 20
    }
}

// Skill ranges by type and tier
const SKILL_RANGES: Record<Exclude<FPLPlayerType, 'PRO'>, Record<FPLTier, { min: number; max: number }>> = {
    'STREAMER': {
        'FPL': { min: 65, max: 80 },
        'FPL_C': { min: 55, max: 70 },
        'HUBS': { min: 45, max: 60 }
    },
    'SEMI_PRO': {
        'FPL': { min: 70, max: 85 },
        'FPL_C': { min: 60, max: 75 },
        'HUBS': { min: 50, max: 65 }
    },
    'ACADEMY_REJECT': {
        'FPL': { min: 60, max: 75 },
        'FPL_C': { min: 50, max: 65 },
        'HUBS': { min: 40, max: 55 }
    },
    'GRINDER': {
        'FPL': { min: 65, max: 78 },
        'FPL_C': { min: 55, max: 68 },
        'HUBS': { min: 45, max: 58 }
    },
    'RETIRED_PRO': {
        'FPL': { min: 60, max: 75 },
        'FPL_C': { min: 50, max: 65 },
        'HUBS': { min: 40, max: 55 }
    },
    'RISING_TALENT': {
        'FPL': { min: 70, max: 82 },
        'FPL_C': { min: 60, max: 75 },
        'HUBS': { min: 50, max: 70 }
    }
}

// Age ranges by player type
const AGE_RANGES: Record<Exclude<FPLPlayerType, 'PRO'>, { min: number; max: number }> = {
    'STREAMER': { min: 20, max: 32 },
    'SEMI_PRO': { min: 18, max: 26 },
    'ACADEMY_REJECT': { min: 18, max: 21 },
    'GRINDER': { min: 17, max: 28 },
    'RETIRED_PRO': { min: 27, max: 35 },
    'RISING_TALENT': { min: 16, max: 20 }
}

// ELO ranges by tier
const ELO_RANGES: Record<FPLTier, { min: number; max: number }> = {
    'FPL': { min: 2000, max: 2400 },
    'FPL_C': { min: 1500, max: 1999 },
    'HUBS': { min: 1000, max: 1499 }
}

// ===== HELPER FUNCTIONS =====

function pick<T>(array: readonly T[], rng: SeededRNG): T {
    return array[rng.int(0, array.length - 1)]
}

function pickWeighted<T extends string>(weights: Record<T, number>, rng: SeededRNG): T {
    const entries = Object.entries(weights) as [T, number][]
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = rng.next() * totalWeight

    for (const [key, weight] of entries) {
        roll -= weight
        if (roll <= 0) return key
    }
    return entries[0][0]
}

function generateNickname(firstName: string, playerType: FPLPlayerType, rng: SeededRNG): string {
    const rand = rng.next()

    // Streamers get streamer-style nicknames
    if (playerType === 'STREAMER' && rand < 0.4) {
        const prefix = pick(NICKNAME_PARTS.streamerPrefixes, rng)
        const nameBase = firstName.toLowerCase().slice(0, 4)
        return prefix + nameBase
    }

    // Grinders often have FPL-related suffixes
    if (playerType === 'GRINDER' && rand < 0.3) {
        const nameBase = firstName.toLowerCase().slice(0, 4)
        const suffix = pick(NICKNAME_PARTS.grinderSuffixes, rng)
        return nameBase + suffix
    }

    // Standard nickname generation
    if (rand < 0.25) {
        const nameBase = firstName.toLowerCase().slice(0, 4)
        const mutations = [
            nameBase,
            nameBase + rng.int(0, 9),
            nameBase.charAt(0) + nameBase.slice(1).replace(/[aeiou]/i, "1"),
            nameBase.toUpperCase()
        ]
        return pick(mutations, rng)
    }

    if (rand < 0.45) {
        const prefix = pick(NICKNAME_PARTS.prefixes, rng)
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        return prefix + noun
    }

    if (rand < 0.70) {
        const adj = pick(NICKNAME_PARTS.adjectives, rng)
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        return adj + noun
    }

    if (rand < 0.90) {
        const noun = pick(NICKNAME_PARTS.nouns, rng)
        const suffix = pick(NICKNAME_PARTS.suffixes, rng)
        return noun.toLowerCase() + suffix
    }

    // Leet speak variant
    const leetMap: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5" }
    let leetName = firstName.toLowerCase().slice(0, 4)
    for (const [char, leet] of Object.entries(leetMap)) {
        if (rng.next() < 0.3) {
            leetName = leetName.replace(char, leet)
        }
    }
    return leetName
}

function selectRegion(rng: SeededRNG): RegionKey {
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
    let roll = rng.next() * totalWeight

    for (const [region, weight] of regionWeights) {
        roll -= weight
        if (roll <= 0) return region
    }
    return "western"
}

// ===== MAIN GENERATOR =====

interface GeneratedFPLPlayer {
    player: PlayerSaveData
    metadata: FPLNonProPlayer
}

/**
 * Generate a single non-pro FPL player
 */
export function generateFPLNonProPlayer(
    tier: FPLTier,
    currentWeek: number,
    rng: SeededRNG
): GeneratedFPLPlayer {
    // Select player type based on tier weights
    const playerType = pickWeighted(TYPE_WEIGHTS_BY_TIER[tier], rng)

    // Select region and nationality
    const region = selectRegion(rng)
    const pool = NAME_POOLS[region]
    const nationality = pick(pool.nationalities, rng)
    const firstName = pick(pool.first, rng)
    const lastName = pick(pool.last, rng)
    const nickname = generateNickname(firstName, playerType, rng)

    // Generate age based on player type
    const ageRange = AGE_RANGES[playerType]
    const age = rng.int(ageRange.min, ageRange.max)

    // Generate skill based on player type and tier
    const skillRange = SKILL_RANGES[playerType][tier]
    const skill = rng.int(skillRange.min, skillRange.max)

    // Generate role (weighted)
    const roleWeights: [PlayerRole, number][] = [
        [PlayerRole.RIFLER, 40],
        [PlayerRole.ENTRY_FRAGGER, 25],
        [PlayerRole.SUPPORT, 20],
        [PlayerRole.AWPER, 10],
        [PlayerRole.IGL, 5]
    ]
    const totalRoleWeight = roleWeights.reduce((sum, [, w]) => sum + w, 0)
    let roleRoll = rng.next() * totalRoleWeight
    let role: PlayerRole = PlayerRole.RIFLER
    for (const [r, weight] of roleWeights) {
        roleRoll -= weight
        if (roleRoll <= 0) {
            role = r
            break
        }
    }

    // Generate ELO based on tier
    const eloRange = ELO_RANGES[tier]
    const fplElo = rng.int(eloRange.min, eloRange.max)

    // Generate potential (rising talents have higher potential)
    let potential = rng.int(50, 80)
    if (playerType === 'RISING_TALENT') {
        potential = rng.int(70, 95)
    } else if (playerType === 'RETIRED_PRO') {
        potential = rng.int(30, 50) // Declining
    }

    // Generate other stats based on skill
    const variance = () => rng.int(-8, 8)
    const statFromSkill = (base: number) => Math.max(1, Math.min(100, base + variance()))

    const playerId = `fpl_nonpro_${currentWeek}_${rng.int(10000, 99999)}_${rng.int(1000, 9999)}`

    const player = {
        id: playerId,
        firstName,
        lastName,
        nickname,
        name: `${firstName} "${nickname}" ${lastName}`,
        age,
        nationality,
        portraitPath: "/player_placeholder.png",
        role,
        secondaryRole: undefined,
        tier: tier === 'FPL' ? 'SEMI_PRO' : 'ACADEMY',

        // Technical stats
        skill,
        awp: statFromSkill(role === PlayerRole.AWPER ? skill + 10 : skill - 5),
        rifle: statFromSkill(role === PlayerRole.RIFLER ? skill + 5 : skill),
        pistol: statFromSkill(skill - 5),
        grenades: statFromSkill(role === PlayerRole.SUPPORT ? skill + 5 : skill - 3),
        creativity: statFromSkill(skill),
        clutch: statFromSkill(skill),
        tactic: statFromSkill(role === PlayerRole.IGL ? skill + 10 : skill - 5),
        entry: statFromSkill(role === PlayerRole.ENTRY_FRAGGER ? skill + 8 : skill - 3),
        trading: statFromSkill(role === PlayerRole.SUPPORT ? skill + 5 : skill),

        // Mental stats
        leader: statFromSkill(role === PlayerRole.IGL ? skill + 10 : skill - 10),
        teamwork: statFromSkill(skill - 5),
        morale: rng.int(60, 85),
        amicability: rng.int(40, 80),
        productivity: rng.int(50, 85),
        stressResistance: statFromSkill(skill - 5),
        loyalty: rng.int(40, 70),

        // Physical stats
        reaction: statFromSkill(skill + 5),
        eyesight: rng.int(75, 95),
        health: rng.int(80, 100),
        strength: rng.int(40, 70),
        endurance: rng.int(50, 80),

        // Dynamic stats
        form: rng.int(50, 80),
        fatigue: rng.int(0, 20),
        potential,
        energy: rng.int(80, 100),
        maxEnergy: 100,

        // Career stats
        matchesPlayed: rng.int(50, 500),
        roundsPlayed: rng.int(1000, 10000),
        avgRating: 0.9 + rng.next() * 0.3,
        clutchSuccessRate: rng.int(20, 50),

        // Progression
        level: rng.int(1, 10),
        xp: rng.int(0, 5000),
        xpToNextLevel: 1000,
        talentPoints: 0,
        unlockedTalentIds: [],

        // Contract (none - free agent)
        contract: null,

        // Status
        isRetired: false,
        injury: null,

        // FPL-specific
        isFPLNonPro: true,
        initialFplElo: fplElo
    } as unknown as PlayerSaveData

    // Generate metadata
    const metadata: FPLNonProPlayer = {
        playerId,
        playerType,
        monthsGrinding: rng.int(1, 36),
        isRecruitableBy: tier === 'FPL' ? 'TIER_1' : tier === 'FPL_C' ? 'TIER_2' : 'ALL'
    }

    // Add type-specific metadata
    if (playerType === 'STREAMER') {
        metadata.streamFollowers = rng.int(1000, 500000)
    }
    if (playerType === 'RETIRED_PRO' || playerType === 'ACADEMY_REJECT') {
        const teams = ["Astralis", "NAVI", "G2", "Vitality", "FaZe", "MOUZ", "Spirit", "Heroic", "ENCE", "BIG"]
        metadata.previousTeam = pick(teams, rng)
    }

    return { player, metadata }
}

/**
 * Generate all non-pro FPL players for a new game
 */
export function generateFPLNonProPlayers(
    currentWeek: number,
    rng: SeededRNG
): { players: PlayerSaveData[]; metadata: FPLNonProPlayer[] } {
    const players: PlayerSaveData[] = []
    const metadata: FPLNonProPlayer[] = []
    const usedNicknames = new Set<string>()

    const distribution: { tier: FPLTier; count: number }[] = [
        { tier: 'FPL', count: FPL_CONSTANTS.NON_PRO_FPL_COUNT },
        { tier: 'FPL_C', count: FPL_CONSTANTS.NON_PRO_FPL_C_COUNT },
        { tier: 'HUBS', count: FPL_CONSTANTS.NON_PRO_HUBS_COUNT }
    ]

    for (const { tier, count } of distribution) {
        let generated = 0
        let attempts = 0
        const maxAttempts = count * 3

        while (generated < count && attempts < maxAttempts) {
            attempts++
            const result = generateFPLNonProPlayer(tier, currentWeek, rng)

            // Ensure unique nicknames
            if (!usedNicknames.has(result.player.nickname.toLowerCase())) {
                usedNicknames.add(result.player.nickname.toLowerCase())
                players.push(result.player)
                metadata.push(result.metadata)
                generated++
            }
        }
    }

    return { players, metadata }
}

/**
 * Get player type label for display
 */
export function getPlayerTypeLabel(type: FPLPlayerType): string {
    switch (type) {
        case 'PRO': return 'Pro Player'
        case 'STREAMER': return 'Streamer'
        case 'SEMI_PRO': return 'Semi-Pro'
        case 'ACADEMY_REJECT': return 'Ex-Academy'
        case 'GRINDER': return 'Grinder'
        case 'RETIRED_PRO': return 'Former Pro'
        case 'RISING_TALENT': return 'Rising Star'
    }
}
