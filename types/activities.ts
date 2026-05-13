export enum WeeklyActivityType {
    TRAINING_ONLY = "TRAINING_ONLY",
    STREAMING = "STREAMING",
    TEAM_BONDING = "TEAM_BONDING",
    MEDIA_CAMPAIGN = "MEDIA_CAMPAIGN",
    BOOTCAMP = "BOOTCAMP",
}

export interface WeeklyActivity {
    type: WeeklyActivityType
    name: string
    description: string
    cost: number
    effects: {
        money?: number // Multiplier or flat
        morale?: number
        fatigue?: number
        xp?: number // Multiplier
        reputation?: number
        fanSupport?: number
        synergy?: number
    }
}

export const WEEKLY_ACTIVITIES: Record<WeeklyActivityType, WeeklyActivity> = {
    [WeeklyActivityType.TRAINING_ONLY]: {
        type: WeeklyActivityType.TRAINING_ONLY,
        name: "Focus on Training",
        description: "Standard week. No extra distractions.",
        cost: 0,
        effects: {},
    },
    [WeeklyActivityType.STREAMING]: {
        type: WeeklyActivityType.STREAMING,
        name: "Stream Marathon",
        description: "Players stream ranked games. Earns cash but fatigues players.",
        cost: 0,
        effects: {
            money: 2500, // Base earnings per player
            morale: -5,
            fatigue: 15,
            fanSupport: 2,
        },
    },
    [WeeklyActivityType.TEAM_BONDING]: {
        type: WeeklyActivityType.TEAM_BONDING,
        name: "Team Bonding",
        description: "Dinner and fun activities to boost morale and synergy.",
        cost: 1500,
        effects: {
            morale: 15,
            synergy: 5,
            fatigue: -5, // Slight recovery boost
        },
    },
    [WeeklyActivityType.MEDIA_CAMPAIGN]: {
        type: WeeklyActivityType.MEDIA_CAMPAIGN,
        name: "Media Campaign",
        description: "Interviews and content creation to grow the brand.",
        cost: 5000,
        effects: {
            reputation: 5,
            fanSupport: 10,
            fatigue: 5,
        },
    },
    [WeeklyActivityType.BOOTCAMP]: {
        type: WeeklyActivityType.BOOTCAMP,
        name: "Intensive Bootcamp",
        description: "Hardcore training regime. Massive XP, massive fatigue.",
        cost: 10000, // Facility rental etc
        effects: {
            xp: 2.0, // 2x XP multiplier
            fatigue: 25,
            morale: -10,
        },
    },
}
