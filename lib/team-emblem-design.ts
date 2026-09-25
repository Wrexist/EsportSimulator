/** Original vector silhouettes for clubs without an authored logo. No external assets. */
export type EmblemMotif = "fox" | "raptor" | "owl" | "cobra" | "kraken" | "knight" | "comet" | "crown" | "melon" | "hive" | "panther" | "mouse" | "spirit" | "prism" | "blade" | "samurai" | "ram" | "orbit" | "monolith" | "nexus" | "wave"

/** Versioned identity studies, assigned by permanent ID so renaming a club does not change its mark. */
export const CURATED_TEAM_MOTIFS: Readonly<Record<string, EmblemMotif>> = {
    team_1_vitalis: 'hive', team_2_foria: 'panther', team_4_muxeen: 'mouse',
    team_5_phantom: 'spirit', team_7_phaze: 'prism', team_8_natusvincera: 'blade',
    team_9_gtwo: 'samurai', team_10_thenomads: 'ram', team_12_astraflux: 'orbit',
    team_13_3dmax: 'monolith', team_14_fut: 'nexus', team_15_tide: 'wave',
}

export function emblemMotifFor(seed: string, name: string): EmblemMotif {
    if (CURATED_TEAM_MOTIFS[seed]) return CURATED_TEAM_MOTIFS[seed]
    const identity = name.toLowerCase()
    if (/watermelon|wetermelon|melon/.test(identity)) return "melon"
    if (/qwintry|winter|frost|snow|owl/.test(identity)) return "owl"
    if (/fox|lynx|wolf|fang/.test(identity)) return "fox"
    if (/raven|crow|falcon|hawk|phoenix|eagle/.test(identity)) return "raptor"
    if (/snake|cobra|viper|venom/.test(identity)) return "cobra"
    if (/kraken|squid|ocean|tidal/.test(identity)) return "kraken"
    if (/knight|warden|guard|iron/.test(identity)) return "knight"
    if (/star|nova|pulsar|comet|orbit/.test(identity)) return "comet"
    if (/royal|crown|king/.test(identity)) return "crown"
    let hash = 2166136261
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
    const motifs: EmblemMotif[] = ["fox", "raptor", "owl", "cobra", "kraken", "knight", "comet", "crown"]
    return motifs[(hash >>> 0) % motifs.length]
}

export const EMBLEM_DRAWINGS: Record<EmblemMotif, { body: string; facet: string; detail: string }> = {
    hive: {
        body: 'M50 8 79 24 84 57 65 78 50 88 35 78 16 57 21 24Z',
        facet: 'M50 8V30L31 41 35 65 50 88 35 78 16 57 21 24Z M50 30 69 41 65 65 50 73Z',
        detail: 'M50 24 64 32 50 40 36 32Z M30 43 44 49V62L31 54Z M70 43 56 49V62L69 54Z M43 68H57L50 77Z',
    },
    panther: {
        body: 'M13 18 34 23 50 17 66 23 87 18 82 48 68 72 50 85 32 72 18 48Z',
        facet: 'M13 18 32 38 24 49 37 67 50 85 32 72 18 48Z M87 18 68 38 76 49 63 67 50 85 68 72 82 48Z',
        detail: 'M28 38 43 42 39 48 31 46Z M72 38 57 42 61 48 69 46Z M40 55H60L50 63Z M36 64 45 67 42 76Z M64 64 55 67 58 76Z',
    },
    mouse: {
        body: 'M30 42C6 42 6 9 27 9 38 9 43 17 42 29L50 26 58 29C57 17 62 9 73 9 94 9 94 42 70 42L75 57 62 78 50 87 38 78 25 57Z',
        facet: 'M27 17C14 17 16 34 29 33L35 22Z M73 17C86 17 84 34 71 33L65 22Z M50 26 36 52 39 72 50 87 38 78 25 57 30 42Z',
        detail: 'M35 47 44 51 40 56Z M65 47 56 51 60 56Z M44 64H56L50 70Z',
    },
    spirit: {
        body: 'M50 9C72 9 84 28 80 51L91 72 70 67 63 87 49 75 29 86 29 65 10 70 23 47C20 27 31 9 50 9Z',
        facet: 'M50 9C33 25 35 38 32 53L22 63 29 65 29 86 49 75 42 62 48 48Z',
        detail: 'M37 31 48 39 43 47 34 42Z M68 29 54 38 58 46 69 40Z M44 54 61 50 55 62Z',
    },
    prism: {
        body: 'M50 7 89 29 79 70 50 91 21 70 11 29Z',
        facet: 'M50 7V34L28 46 21 70 11 29Z M50 34 72 46 79 70 50 91Z',
        detail: 'M50 22 72 35 64 40 50 32 36 40 28 35Z M29 49 44 58V75L34 69Z M71 49 56 58V75L66 69Z',
    },
    blade: {
        body: 'M58 6 72 16 60 52 82 61 70 73 56 66 44 91 30 85 40 60 18 51 28 39 47 45Z',
        facet: 'M58 6 53 47 60 52 72 16Z M40 60 44 67 36 87 30 85Z M18 51 56 66 70 73 64 61 28 39Z',
        detail: 'M57 25 61 22 55 47 50 51Z M30 48 33 45 67 59 65 64Z',
    },
    samurai: {
        body: 'M10 19 30 30 38 18 62 18 70 30 90 19 79 51 74 73 50 89 26 73 21 51Z',
        facet: 'M10 19 32 43 28 54 26 73 50 89 38 64 40 42 50 18 38 18 30 30Z M90 19 68 43 72 54 79 51Z',
        detail: 'M31 44 46 49 43 55 33 52Z M69 44 54 49 57 55 67 52Z M38 65 50 60 62 65 57 72 43 72Z',
    },
    ram: {
        body: 'M37 33C26 6 5 21 10 44L26 61 33 53 30 68 50 89 70 68 67 53 74 61 90 44C95 21 74 6 63 33L50 27Z',
        facet: 'M37 33 30 44 22 40 21 29C10 28 17 45 27 49L26 61 10 44C5 21 26 6 37 33Z M63 33 70 44 78 40 79 29C90 28 83 45 73 49L74 61 90 44C95 21 74 6 63 33Z',
        detail: 'M35 45 46 48 41 54Z M65 45 54 48 59 54Z M44 67H56L50 76Z',
    },
    orbit: {
        body: 'M50 8 65 29 89 28 77 50 89 72 65 71 50 92 35 71 11 72 23 50 11 28 35 29Z',
        facet: 'M50 8V36L38 43 23 50 11 28 35 29Z M50 64 65 57 77 50 89 72 65 71 50 92Z',
        detail: 'M50 31 67 41V59L50 69 33 59V41Z M50 42 42 47V53L50 58 58 53V47Z',
    },
    monolith: {
        body: 'M50 8 86 28V71L50 92 14 71V28Z',
        facet: 'M50 8V49L14 71V28Z M50 49 86 28V71L50 92Z',
        detail: 'M29 31 50 19 71 31 61 37 50 31 39 37Z M26 42 38 49V68L26 61Z M74 42V61L62 68V49Z M44 53H56V77L50 81 44 77Z',
    },
    nexus: {
        body: 'M25 10 50 27 75 10 90 30 73 50 90 70 75 90 50 73 25 90 10 70 27 50 10 30Z',
        facet: 'M25 10 50 44V56L25 90 10 70 27 50 10 30Z M50 27 75 10 65 35Z',
        detail: 'M50 35 65 50 50 65 35 50Z M21 29 26 23 39 35 34 40Z M79 71 74 77 61 65 66 60Z',
    },
    wave: {
        body: 'M11 57C20 30 33 12 57 13 79 14 91 34 87 50 77 38 65 35 54 43 45 50 45 64 59 69 72 74 82 68 90 61 86 85 63 93 40 84 24 79 15 71 11 57Z',
        facet: 'M57 13C34 27 31 43 30 57 30 72 49 83 63 86 40 84 24 79 15 71 11 57 20 30 33 12 57 13Z',
        detail: 'M62 24C75 23 82 33 82 38 72 31 60 32 51 39 55 30 57 26 62 24Z M22 63C32 78 60 85 74 77 63 89 35 86 22 63Z',
    },
    fox: {
        body: "M16 10 39 24 50 20 61 24 84 10 78 53 64 70 50 80 36 70 22 53Z",
        facet: "M16 10 38 34 27 47 50 71 36 70 22 53Z M84 10 62 34 73 47 50 71 64 70 78 53Z",
        detail: "M29 40 44 45 38 50Z M71 40 56 45 62 50Z M43 59 57 59 50 66Z",
    },
    raptor: {
        body: "M5 24 36 30 48 17 63 21 57 31 95 16 81 43 62 51 51 76 42 56 23 47Z",
        facet: "M5 24 38 41 32 46 23 47Z M95 16 61 42 66 44 81 43Z M48 17 52 34 63 21Z",
        detail: "M45 32 53 32 49 37Z M44 48 57 43 50 63Z",
    },
    owl: {
        body: "M17 13 39 24 50 21 61 24 83 13 79 55 65 72 50 81 35 72 21 55Z",
        facet: "M17 13 31 37 22 55 35 72 43 72 32 51Z M83 13 69 37 78 55 65 72 57 72 68 51Z",
        detail: "M27 35 46 42 40 52 31 48Z M73 35 54 42 60 52 69 48Z M45 55 55 55 50 63Z",
    },
    cobra: {
        body: "M50 9 70 19 81 43 74 62 61 72 50 63 39 72 26 62 19 43 30 19Z",
        facet: "M30 19 40 29 29 46 39 62 39 72 26 62 19 43Z M70 19 60 29 71 46 61 62 61 72 74 62 81 43Z",
        detail: "M35 32 46 36 40 41Z M65 32 54 36 60 41Z M41 48 59 48 55 60 53 52 47 52 45 60Z",
    },
    kraken: {
        body: "M50 11C33 11 30 31 33 43L24 55 15 43 10 49 23 70 39 59 36 75 48 68 50 79 55 68 66 75 61 59 77 70 90 49 85 43 76 55 67 43C70 31 67 11 50 11Z",
        facet: "M50 11C37 22 42 34 40 43L31 53 24 55 33 43C30 31 33 11 50 11Z M61 59 77 70 90 49 80 57 75 60Z",
        detail: "M38 35 48 40 44 46 38 43Z M62 35 52 40 56 46 62 43Z",
    },
    knight: {
        body: "M50 8 77 22 82 52 68 69 50 81 32 69 18 52 23 22Z",
        facet: "M50 8 50 23 33 31 31 59 50 81 32 69 18 52 23 22Z M50 23 67 31 64 59 50 69Z",
        detail: "M30 34 47 40 47 49 32 43Z M70 34 53 40 53 49 68 43Z M46 55 54 55 50 65Z",
    },
    comet: {
        body: "M8 14 48 29 68 21 87 35 91 55 73 73 53 75 34 59 25 43Z",
        facet: "M8 14 44 40 35 44 25 43Z M34 59 62 65 73 73 53 75Z M48 29 66 35 68 21Z",
        detail: "M65 33 70 44 82 46 73 54 75 66 64 60 54 65 56 53 47 45 59 43Z",
    },
    crown: {
        body: "M14 24 34 34 50 11 66 34 86 24 77 61 50 78 23 61Z",
        facet: "M14 24 29 47 32 60 50 70 50 78 23 61Z M86 24 71 47 68 60 50 70 77 61Z",
        detail: "M50 30 58 43 50 53 42 43Z M31 49 69 49 66 56 34 56Z",
    },
    melon: {
        body: "M8 25H92C89 54 74 75 50 82 26 75 11 54 8 25Z",
        facet: "M16 31H84C80 54 69 68 50 74 31 68 20 54 16 31Z",
        detail: "M29 40C23 47 30 52 33 46Z M50 52C43 60 50 65 54 59Z M71 40C65 45 68 51 73 46Z",
    },
}

/** A visible keyline for dark club colors on dark panels; no brand-color mutation. */
export function emblemOutlineColor(primary: string): string {
    const value = primary.replace('#', '')
    const hex = value.length === 3 ? value.split('').map(c => c + c).join('') : value
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 75 ? '#94a3b8' : '#0a1420'
}
