import { HallOfFameEntry } from "./save-types"

/**
 * Founding Legends
 * Phase 23: Hall of Fame
 * 
 * Immutable list of real-world legends that populate the Hall of Fame at game start.
 * These are retired/inactive players who defined eras.
 */
export const FOUNDING_LEGENDS: HallOfFameEntry[] = [
    {
        id: "legend_get_right",
        name: "GeT_RiGhT",
        portraitPath: "/assets/legends/GeT_RiGhT.webp",
        eraStart: 2007,
        eraEnd: 2021,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "MVP", label: "Era-Defining Player", icon: "Crown" },
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Lurker Pioneer", icon: "Zap" }
        ]
    },
    {
        id: "legend_f0rest",
        name: "f0rest",
        portraitPath: "/assets/legends/f0rest.webp",
        eraStart: 2003,
        eraEnd: 2024,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "LONGEVITY", label: "Longevity Icon", icon: "Hourglass" },
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Mechanical Legend", icon: "Crosshair" }
        ]
    },
    {
        id: "legend_pasha",
        name: "pashaBiceps",
        portraitPath: "/assets/legends/pashaBiceps.webp",
        eraStart: 2004,
        eraEnd: 2019,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "PL",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Cultural Icon", icon: "Heart" },
            { type: "LOYALTY", label: "VP Legend", icon: "Shield" }
        ]
    },
    {
        id: "legend_kennys",
        name: "kennyS",
        portraitPath: "/assets/legends/kennyS.webp",
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
        id: "legend_olof",
        name: "olofmeister",
        portraitPath: "/assets/legends/olofmeister.webp",
        eraStart: 2010,
        eraEnd: 2022,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Best Player 2015", icon: "Crown" },
            { type: "IMPACT", label: "Versatility King", icon: "Puzzle" }
        ]
    },
    {
        id: "legend_zeus",
        name: "Zeus",
        portraitPath: "/assets/legends/Zeus.webp",
        eraStart: 2002,
        eraEnd: 2019,
        primaryRole: "IGL",
        category: "FOUNDING",
        nationality: "UA",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Leadership Icon", icon: "Brain" },
            { type: "LOYALTY", label: "Navi Architect", icon: "Shield" }
        ]
    },
    {
        id: "legend_s1mple",
        name: "s1mple",
        portraitPath: "/assets/legends/s1mple.webp",
        eraStart: 2013,
        eraEnd: 2024,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "UA",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "MVP", label: "4x HLTV #1", icon: "Crown" },
            { type: "IMPACT", label: "Greatest of All Time", icon: "Zap" }
        ]
    },
    {
        id: "legend_device",
        name: "dev1ce",
        portraitPath: "/assets/legends/dev1ce.webp",
        eraStart: 2013,
        eraEnd: 2023,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "Most Consistent AWPer", icon: "Crosshair" },
            { type: "IMPACT", label: "Intel Grand Slam", icon: "Star" }
        ]
    },
    {
        id: "legend_niko",
        name: "NiKo",
        portraitPath: "/assets/legends/NiKo.webp",
        eraStart: 2012,
        eraEnd: 2024,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "BA",
        inductionReasons: [
            { type: "MVP", label: "HLTV Top 3 Multiple Years", icon: "Crown" },
            { type: "IMPACT", label: "Best Aimer Ever", icon: "Crosshair" },
            { type: "MVP", label: "Superstar", icon: "Star" }
        ]
    },
    {
        id: "legend_coldzera",
        name: "coldzera",
        portraitPath: "/assets/legends/coldzera.webp",
        eraStart: 2014,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "BR",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "MVP", label: "2x HLTV #1", icon: "Crown" },
            { type: "IMPACT", label: "Jumping Double Kill", icon: "Zap" }
        ]
    },
    {
        id: "legend_fallen",
        name: "FalleN",
        portraitPath: "/assets/legends/FalleN.webp",
        eraStart: 2010,
        eraEnd: 2024,
        primaryRole: "IGL",
        category: "FOUNDING",
        nationality: "BR",
        inductionReasons: [
            { type: "CHAMPION", label: "2x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Brazilian CS Godfather", icon: "Brain" },
            { type: "LONGEVITY", label: "Legendary IGL", icon: "Hourglass" }
        ]
    },
    {
        id: "legend_guardian",
        name: "GuardiaN",
        portraitPath: "/assets/legends/GuardiaN.webp",
        eraStart: 2009,
        eraEnd: 2020,
        primaryRole: "AWPer",
        category: "FOUNDING",
        nationality: "SK",
        inductionReasons: [
            { type: "MVP", label: "HLTV Top 5 Multiple Years", icon: "Crown" },
            { type: "IMPACT", label: "CIS AWP Legend", icon: "Crosshair" },
            { type: "LOYALTY", label: "Navi Star", icon: "Shield" }
        ]
    },
    {
        id: "legend_flusha",
        name: "flusha",
        portraitPath: "/assets/legends/flusha.webp",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "SE",
        inductionReasons: [
            { type: "CHAMPION", label: "3x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Clutch Master", icon: "Zap" },
            { type: "LOYALTY", label: "Fnatic Legend", icon: "Shield" }
        ]
    },
    {
        id: "legend_dupreeh",
        name: "dupreeh",
        portraitPath: "/assets/legends/dupreeh.webp",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Entry",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Best Entry Fragger", icon: "Zap" },
            { type: "LOYALTY", label: "Astralis Core", icon: "Shield" }
        ]
    },
    {
        id: "legend_xyp9x",
        name: "Xyp9x",
        portraitPath: "/assets/legends/Xyp9x.webp",
        eraStart: 2012,
        eraEnd: 2023,
        primaryRole: "Support",
        category: "FOUNDING",
        nationality: "DK",
        inductionReasons: [
            { type: "CHAMPION", label: "4x Major Champion", icon: "Trophy" },
            { type: "IMPACT", label: "Clutch Minister", icon: "Zap" },
            { type: "MVP", label: "Best Support Ever", icon: "Star" }
        ]
    },
    {
        id: "legend_shox",
        name: "shox",
        portraitPath: "/assets/legends/shox.webp",
        eraStart: 2007,
        eraEnd: 2023,
        primaryRole: "Rifler",
        category: "FOUNDING",
        nationality: "FR",
        inductionReasons: [
            { type: "CHAMPION", label: "Major Champion", icon: "Trophy" },
            { type: "LONGEVITY", label: "French Legend", icon: "Hourglass" },
            { type: "IMPACT", label: "Style Icon", icon: "Star" }
        ]
    }
]
