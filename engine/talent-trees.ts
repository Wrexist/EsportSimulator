
export interface TalentNode {
    id: string
    name: string
    description: string
    icon: string // Lucide icon name or path
    tier: number
    cost: number
    requirements: string[] // IDs of required parent talents
    position: { x: number, y: number } // For UI: 0-100 grid system? Or absolute? Let's use relative grid x:0-5, y:0-5
    effect?: {
        type: "STAT_BOOST" | "PASSIVE_BONUS" | "UNLOCK_FEATURE"
        target: string
        value: number
    }
}

export type TalentTreeId = "coach_tactical" | "coach_development" | "analyst_data" | "analyst_clutch" | "psych_mental" | "scout_vision" | "player_rifler" | "player_awper"

export const STAFF_TALENT_TREES: Record<string, TalentNode[]> = {
    // Coach - Focus on Development & Training
    coach: [
        {
            id: "coach_basics", name: "Training Fundamentals", description: "Increases training efficiency by 5%.",
            icon: "BookOpen", tier: 1, cost: 1, requirements: [], position: { x: 2, y: 0 },
            effect: { type: "PASSIVE_BONUS", target: "training_efficiency", value: 5 }
        },
        // Left Branch: Tactical
        {
            id: "coach_tac_1", name: "Tactical Drills", description: "New tactics contain 10% more mastery.",
            icon: "Crosshair", tier: 2, cost: 1, requirements: ["coach_basics"], position: { x: 1, y: 1 },
            effect: { type: "PASSIVE_BONUS", target: "tactic_mastery", value: 10 }
        },
        {
            id: "coach_tac_2", name: "Timeout Whisperer", description: "+5 Morale boost during tactical timeouts.",
            icon: "MessageSquare", tier: 3, cost: 2, requirements: ["coach_tac_1"], position: { x: 0, y: 2 },
            effect: { type: "PASSIVE_BONUS", target: "timeout_morale", value: 5 }
        },
        // Right Branch: Development
        {
            id: "coach_dev_1", name: "Youth Mentor", description: "Academy players improve 15% faster.",
            icon: "GraduationCap", tier: 2, cost: 1, requirements: ["coach_basics"], position: { x: 3, y: 1 },
            effect: { type: "PASSIVE_BONUS", target: "academy_speed", value: 15 }
        },
        {
            id: "coach_dev_2", name: "Potential Unlocker", description: "Chance to increase player potential cap on level up.",
            icon: "Unlock", tier: 3, cost: 2, requirements: ["coach_dev_1"], position: { x: 4, y: 2 },
            effect: { type: "UNLOCK_FEATURE", target: "potential_breakthrough", value: 1 }
        },
        // Capstone
        {
            id: "coach_master", name: "The Visionary", description: "All players gain +2 to random stat weekly.",
            icon: "Eye", tier: 4, cost: 3, requirements: ["coach_tac_2", "coach_dev_2"], position: { x: 2, y: 3 },
            effect: { type: "STAT_BOOST", target: "all", value: 2 }
        }
    ],

    // Analyst - Focus on Opponent Prep
    analyst: [
        {
            id: "analyst_basics", name: "Data Entry", description: "Reveals basic opponent tendencies.",
            icon: "FileSpreadsheet", tier: 1, cost: 1, requirements: [], position: { x: 2, y: 0 },
            effect: { type: "PASSIVE_BONUS", target: "scout_info", value: 1 }
        },
        {
            id: "analyst_demo", name: "Demo Review", description: "Post-match analysis grants more XP.",
            icon: "Video", tier: 2, cost: 1, requirements: ["analyst_basics"], position: { x: 1, y: 1 },
            effect: { type: "PASSIVE_BONUS", target: "xp_gain", value: 10 }
        },
        {
            id: "analyst_counter", name: "Counter Strat", description: "Reduces opponent tactic effectiveness by 5%.",
            icon: "ShieldAlert", tier: 3, cost: 2, requirements: ["analyst_demo"], position: { x: 2, y: 2 },
            effect: { type: "PASSIVE_BONUS", target: "anti_strat", value: 5 }
        }
    ],

    // Psychologist - Focus on Mental & Recovery
    psychologist: [
        {
            id: "psych_basics", name: "Active Listening", description: "Prevents major morale drops.",
            icon: "Ear", tier: 1, cost: 1, requirements: [], position: { x: 2, y: 0 },
            effect: { type: "PASSIVE_BONUS", target: "morale_floor", value: 10 }
        },
        {
            id: "psych_meditate", name: "Mindfulness", description: "Recovery tasks restore 10% more energy.",
            icon: "Flower2", tier: 2, cost: 1, requirements: ["psych_basics"], position: { x: 1, y: 1 },
            effect: { type: "PASSIVE_BONUS", target: "recovery_amount", value: 10 }
        },
        {
            id: "psych_tilt", name: "Tilt Proof", description: "Players immune to 'Tilt' status effect.",
            icon: "Anchor", tier: 3, cost: 2, requirements: ["psych_meditate"], position: { x: 2, y: 2 },
            effect: { type: "PASSIVE_BONUS", target: "tilt_immunity", value: 1 }
        }
    ],

    // Scout - Focus on Market & Hidden Stats
    scout: [
        {
            id: "scout_basics", name: "Networking", description: "Scout missions cost 10% less.",
            icon: "Users2", tier: 1, cost: 1, requirements: [], position: { x: 2, y: 0 },
            effect: { type: "PASSIVE_BONUS", target: "scout_cost", value: -10 }
        },
        {
            id: "scout_eagle", name: "Eagle Eye", description: "Reveals exact potential instead of range.",
            icon: "SearchCheck", tier: 2, cost: 2, requirements: ["scout_basics"], position: { x: 2, y: 1 },
            effect: { type: "UNLOCK_FEATURE", target: "exact_potential", value: 1 }
        },
        {
            id: "scout_gem", name: "Hidden Gem Finder", description: "Higher chance to find high potential rookies.",
            icon: "Diamond", tier: 3, cost: 3, requirements: ["scout_eagle"], position: { x: 2, y: 2 },
            effect: { type: "PASSIVE_BONUS", target: "gem_chance", value: 20 }
        }
    ]
}

export const PLAYER_TALENT_TREE: TalentNode[] = [
    {
        id: "player_basics", name: "Fundamentals", description: "+1 All Stats",
        icon: "Target", tier: 1, cost: 1, requirements: [], position: { x: 2, y: 0 },
        effect: { type: "STAT_BOOST", target: "all", value: 1 }
    },
    // Aim Branch
    {
        id: "player_aim_1", name: "Reflexes", description: "+3 Reaction Time",
        icon: "Zap", tier: 2, cost: 1, requirements: ["player_basics"], position: { x: 1, y: 1 },
        effect: { type: "STAT_BOOST", target: "reaction", value: 3 }
    },
    {
        id: "player_aim_2", name: "Headshot Machine", description: "+5 Rifle",
        icon: "Crosshair", tier: 3, cost: 2, requirements: ["player_aim_1"], position: { x: 0, y: 2 },
        effect: { type: "STAT_BOOST", target: "rifle", value: 5 }
    },
    // Brain Branch
    {
        id: "player_brain_1", name: "Game Sense", description: "+3 Tactic",
        icon: "Brain", tier: 2, cost: 1, requirements: ["player_basics"], position: { x: 3, y: 1 },
        effect: { type: "STAT_BOOST", target: "tactic", value: 3 }
    },
    {
        id: "player_brain_2", name: "Clutch King", description: "+5 Clutch",
        icon: "Crown", tier: 3, cost: 2, requirements: ["player_brain_1"], position: { x: 4, y: 2 },
        effect: { type: "STAT_BOOST", target: "clutch", value: 5 }
    },
    // Physical Branch
    {
        id: "player_fit_1", name: "Cardio Routine", description: "+10% Energy Recovery",
        icon: "Heart", tier: 2, cost: 1, requirements: ["player_basics"], position: { x: 2, y: 1 },
        effect: { type: "PASSIVE_BONUS", target: "energy_recovery", value: 10 }
    },
    {
        id: "player_fit_2", name: "Iron Lung", description: "-20% Training Fatigue",
        icon: "Dumbbell", tier: 3, cost: 2, requirements: ["player_fit_1"], position: { x: 2, y: 2 },
        effect: { type: "PASSIVE_BONUS", target: "fatigue_reduction", value: 20 }
    },
    // Capstones
    {
        id: "player_boss", name: "Global Elite", description: "+2 All Stats",
        icon: "Globe", tier: 4, cost: 3, requirements: ["player_aim_2", "player_fit_2"], position: { x: 1, y: 3 },
        effect: { type: "STAT_BOOST", target: "all", value: 2 }
    },
    {
        id: "player_clutch", name: "Clutch Minister", description: "+10 Clutch",
        icon: "Flame", tier: 4, cost: 3, requirements: ["player_brain_2"], position: { x: 4, y: 3 },
        effect: { type: "STAT_BOOST", target: "clutch", value: 10 }
    }
]

/**
 * Collect all active PASSIVE_BONUS effects from a staff member's unlocked talents.
 * Returns a map of target -> total bonus value.
 */
export function getStaffPassiveBonuses(
    staffRole: string,
    unlockedTalentIds: string[]
): Record<string, number> {
    const tree = STAFF_TALENT_TREES[staffRole]
    if (!tree || !unlockedTalentIds?.length) return {}

    const bonuses: Record<string, number> = {}
    for (const node of tree) {
        if (
            unlockedTalentIds.includes(node.id) &&
            node.effect?.type === "PASSIVE_BONUS"
        ) {
            bonuses[node.effect.target] = (bonuses[node.effect.target] || 0) + node.effect.value
        }
    }
    return bonuses
}

/**
 * Collect all active PASSIVE_BONUS effects from a player's unlocked talents.
 * Returns a map of target -> total bonus value.
 */
export function getPlayerPassiveBonuses(
    unlockedTalentIds: string[]
): Record<string, number> {
    if (!unlockedTalentIds?.length) return {}

    const bonuses: Record<string, number> = {}
    for (const node of PLAYER_TALENT_TREE) {
        if (
            unlockedTalentIds.includes(node.id) &&
            node.effect?.type === "PASSIVE_BONUS"
        ) {
            bonuses[node.effect.target] = (bonuses[node.effect.target] || 0) + node.effect.value
        }
    }
    return bonuses
}

