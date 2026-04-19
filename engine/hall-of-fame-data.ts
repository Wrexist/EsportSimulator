import { HallOfFameEntry } from "./save-types"

/**
 * Founding Legends
 * Phase 23: Hall of Fame
 *
 * Fictional legends seeded into the Hall of Fame at game start. They represent
 * era-defining archetypes (lurker, IGL architect, AWPer meta-setter, etc.)
 * without mapping to any real player. Portraits are procedural SVGs.
 */
export const FOUNDING_LEGENDS: HallOfFameEntry[] = [
    {
        id: "legend_sovran",
        name: "Sovran",
        portraitPath: "/assets/legends/Sovran.svg",
        eraStart: 2007,
        eraEnd: 2021,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "MVP", label: "Era-Defining Lurker", icon: "Crown" },
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Shadow-Play Pioneer", icon: "Zap" }
        ]
    },
    {
        id: "legend_ironbark",
        name: "Ironbark",
        portraitPath: "/assets/legends/Ironbark.svg",
        eraStart: 2003,
        eraEnd: 2024,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "LONGEVITY", label: "Two-Decade Career", icon: "Hourglass" },
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Mechanical Legend", icon: "Crosshair" }
        ]
    },
    {
        id: "legend_bastion",
        name: "Bastion",
        portraitPath: "/assets/legends/Bastion.svg",
        eraStart: 2004,
        eraEnd: 2019,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "PL",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Cultural Icon", icon: "Heart" },
            { type: "LOYALTY", label: "Polish Dynasty Core", icon: "Shield" }
        ]
    },
    {
        id: "legend_nocturn",
        name: "Nocturn",
        portraitPath: "/assets/legends/Nocturn.svg",
        eraStart: 2011,
        eraEnd: 2023,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "FR",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "AWP Meta Definer", icon: "Wand2" },
            { type: "MVP", label: "Major MVP", icon: "Star" }
        ]
    },
    {
        id: "legend_varden",
        name: "Varden",
        portraitPath: "/assets/legends/Varden.svg",
        eraStart: 2010,
        eraEnd: 2022,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Player of the Year", icon: "Crown" },
            { type: "IMPACT", label: "Versatility King", icon: "Puzzle" }
        ]
    },
    {
        id: "legend_krolon",
        name: "Krolon",
        portraitPath: "/assets/legends/Krolon.svg",
        eraStart: 2002,
        eraEnd: 2019,
        primaryRole: "IGL",
        category: "FOUNDING",
        nationality: "UA",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Leadership Icon", icon: "Brain" },
            { type: "LOYALTY", label: "Eastern Architect", icon: "Shield" }
        ]
    },
    {
        id: "legend_v4ltz",
        name: "V4ltz",
        portraitPath: "/assets/legends/V4ltz.svg",
        eraStart: 2013,
        eraEnd: 2024,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "UA",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "MVP", label: "4x Player of the Year", icon: "Crown" },
            { type: "IMPACT", label: "Generational Talent", icon: "Zap" }
        ]
    },
    {
        id: "legend_kalvera",
        name: "Kalvera",
        portraitPath: "/assets/legends/Kalvera.svg",
        eraStart: 2013,
        eraEnd: 2023,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Most Consistent AWPer", icon: "Crosshair" },
            { type: "IMPACT", label: "Grand Slam Winner", icon: "Star" }
        ]
    },
    {
        id: "legend_niklaus",
        name: "Niklaus",
        portraitPath: "/assets/legends/Niklaus.svg",
        eraStart: 2012,
        eraEnd: 2024,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "BA",
        inductionReasons: [
            { type: "MVP", label: "Multi-Year Top 3", icon: "Crown" },
            { type: "IMPACT", label: "Pure-Aim Legend", icon: "Crosshair" },
            { type: "MVP", label: "Superstar", icon: "Star" }
        ]
    },
    {
        id: "legend_frosthaven",
        name: "Frosthaven",
        portraitPath: "/assets/legends/Frosthaven.svg",
        eraStart: 2014,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "BR",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "2x Player of the Year", icon: "Crown" },
            { type: "IMPACT", label: "Signature Mid-Air Kill", icon: "Zap" }
        ]
    },
    {
        id: "legend_pyren",
        name: "Pyren",
        portraitPath: "/assets/legends/Pyren.svg",
        eraStart: 2010,
        eraEnd: 2024,
        primaryRole: "IGL",
        category: "FOUNDING",
        nationality: "BR",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Southern Scene Godfather", icon: "Brain" },
            { type: "LONGEVITY", label: "Legendary IGL", icon: "Hourglass" }
        ]
    },
    {
        id: "legend_sentryx",
        name: "Sentryx",
        portraitPath: "/assets/legends/Sentryx.svg",
        eraStart: 2009,
        eraEnd: 2020,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "SK",
        inductionReasons: [
            { type: "MVP", label: "Top 5 Multiple Years", icon: "Crown" },
            { type: "IMPACT", label: "Eastern AWP Legend", icon: "Crosshair" },
            { type: "LOYALTY", label: "Franchise Icon", icon: "Shield" }
        ]
    },
    {
        id: "legend_mirage",
        name: "Mirage",
        portraitPath: "/assets/legends/Mirage.svg",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "CHAMPION", label: "3x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Clutch Master", icon: "Zap" },
            { type: "LOYALTY", label: "Franchise Legend", icon: "Shield" }
        ]
    },
    {
        id: "legend_dupren",
        name: "Dupren",
        portraitPath: "/assets/legends/Dupren.svg",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Entry",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Best Entry Fragger", icon: "Zap" },
            { type: "LOYALTY", label: "Northern Core", icon: "Shield" }
        ]
    },
    {
        id: "legend_cipherx",
        name: "Cipherx",
        portraitPath: "/assets/legends/Cipherx.svg",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Support",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Clutch Specialist", icon: "Zap" },
            { type: "MVP", label: "Best Support Ever", icon: "Star" }
        ]
    },
    {
        id: "legend_shoen",
        name: "Shoen",
        portraitPath: "/assets/legends/Shoen.svg",
        eraStart: 2007,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "FR",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "LONGEVITY", label: "Western Legend", icon: "Hourglass" },
            { type: "IMPACT", label: "Style Icon", icon: "Star" }
        ]
    }
]
