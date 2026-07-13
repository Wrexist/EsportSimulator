/**
 * Safe-branding name transforms.
 *
 * Rewrites real-world team/player/tournament identifiers to fictional
 * equivalents for the shipped build. Deterministic: the same input always
 * yields the same output, so saves, IDs, and roster references stay stable
 * across regenerations.
 *
 * Used at snapshot-sanitize time (scripts/sanitize-snapshot.js). Never called
 * at runtime.
 */

// ============================================================
// CURATED MAPS (highest-profile trademarks)
// ============================================================

export const TEAM_NAME_MAP: Record<string, string> = {
    "Natus Vincere": "Natus Vincera",
    "NAVI": "Nava",
    "FaZe Clan": "Phaze Syndicate",
    "FaZe": "Phaze",
    "G2 Esports": "G-Two Gaming",
    "G2": "G-Two",
    "Team Vitality": "Team Vitalis",
    "Vitality": "Vitalis",
    "Team Liquid": "Team Tide",
    "Liquid": "Tide",
    "Astralis": "Astraflux",
    "Fnatic": "Phanatic",
    "Cloud9": "Cumulus9",
    "MOUZ": "Mouzen",
    "mousesports": "Mousen Sports",
    "3DMAX": "3DMaximus",
    "FUT Esports": "FUTR Esports",
    "FUT": "FUTR",
    "B8": "Beta8",
    "NRG Esports": "NRGen Esports",
    "NRG": "NRGen",
    "1win": "OneWind",
    "1WIN": "ONEWIND",
    "Team Spirit": "Team Phantom",
    "Spirit": "Phantom",
    "Heroic": "Valiant",
    "ENCE": "ANCE",
    "Complexity": "Complect",
    "Evil Geniuses": "Vice Virtuosi",
    "BIG": "BIG Kings",
    "NIP": "Nova Invaders",
    "Ninjas in Pyjamas": "Nova Invaders",
    "MIBR": "MB Esports",
    "Made in Brazil": "MB Esports",
    "paiN Gaming": "Sting Gaming",
    "paiN": "Sting",
    "Imperial": "Imperius",
    "Imperial Esports": "Imperius",
    "100 Thieves": "Century Rogues",
    "FURIA": "FORIA",
    "OG": "OverGrowth",
    "Virtus.pro": "Virtus Nova",
    "Virtus Pro": "Virtus Nova",
    "forZe": "Surge",
    "Outsiders": "Outliners",
    "BetBoom": "BoomByte",
    "BetBoom Team": "BoomByte",
    "GamerLegion": "Gamer League",
    "Apeks": "Apex Peaks",
    "Monte": "Montegra",
    "9INE": "9INK",
    "Eternal Fire": "Everblaze",
    "Falcons": "Falconry",
    "Team Falcons": "Team Falconry",
    "The MongolZ": "The Nomads",
    "TYLOO": "TAROO",
    "Rare Atom": "Rare Element",
    "Lynn Vision": "Lynx Vision",
    "Grayhound": "Grayhare",
    "Renegades": "Insurgents",
    "FlyQuest": "FlyCrest",
    "Nouns": "Pronoun",
    "M80": "A81",
    "Party Astronauts": "Party Cosmonauts",
    "MIGHT": "MITE",
    "Wildcard": "Wild Ace",
    "Legacy": "Lineage",
    "RED Canids": "RED Wolves",
    "Sharks": "Hammerheads",
    "Sharks Esports": "Hammerheads",
    "Bounty Hunters": "Coin Hunters",
    "Fluxo": "Fluxion",
    "9z": "9ZED",
    "9z Team": "9ZED",
    "Case Esports": "Casket",
    "Ninjas in Pyjamas BR": "Nova Invaders BR",
}

export const TOURNAMENT_NAME_MAP: Record<string, string> = {
    "IEM Katowice": "Winter Open Katova",
    "IEM Cologne": "Summer Open Colone",
    "IEM Dallas": "Dallas Masters",
    "IEM Rio": "Rio Masters",
    "IEM Sydney": "Sydney Masters",
    "IEM Chengdu": "Chengdu Masters",
    "IEM Fall": "Autumn Masters",
    "IEM Summer": "Summer Masters",
    "IEM Winter": "Winter Masters",
    "ESL Pro League": "Global Pro League",
    "ESL Challenger": "Global Challenger",
    "ESL Impact": "Elite Impact",
    "BLAST Premier": "Elite Circuit",
    "BLAST World Final": "Elite World Final",
    "BLAST Spring": "Elite Spring",
    "BLAST Fall": "Elite Fall",
    "BLAST.tv": "Elite Circuit",
    "PGL Major": "Premier Major",
    "PGL": "Premier",
    "DreamHack Open": "Dream Circuit Open",
    "DreamHack Masters": "Dream Circuit Masters",
    "DreamHack": "Dream Circuit",
    "Thunderpick World Championship": "Thunder Cup World Championship",
    "Thunderpick": "Thunder Cup",
    "Betway": "Wagerway",
    "YaLLa Compass": "Compass Cup",
    "Perfect World": "Perfect Realm",
    "WePlay": "PlayOn",
    "Gamers8": "Gamers Infinity",
    "Gamers Galaxy": "Gamers Nebula",
    "Esports World Cup": "Global Arena Cup",
    "ESL One": "Global One",
    "Intel Extreme Masters": "Winter Open Masters",
    "StarLadder": "StarArena",
    "EPICENTER": "EPICORE",
    "CCT": "CCX",
    "Champion of Champions Tour": "CCX Tour",
    "BLAST": "Elite",
    "ESL": "Global",
    "IEM": "Winter Open",
    "Elisa": "Electra",
    "ESEA": "Epic Arena",
    "Roobet": "Rookbet",
    "Skyesports": "Skyevents",
    "Sky Esports": "Skyevents",
    "HLTV": "StatCentral",
    "BetBoom": "BoomByte",
    "Dacha": "Legacy",
    "Copenhagen Major": "Northern Major",
    "Copenhagen": "Northern",
    "Shanghai Major": "Eastern Major",
    "Shanghai": "Eastern",
}

export const SPONSOR_NAME_MAP: Record<string, string> = {
    "Red Bull": "Surge Fuel",
    "redbull": "surgefuel",
    "HyperX": "HyperZ",
    "hyperx": "hyperz",
    "Monster Energy": "Meteor Energy",
    "Monster": "Meteor",
    "monster": "meteor",
    "Intel": "Cortex",
    "NVIDIA": "NVIDA",
    "Razer": "Raven",
    "Logitech": "Logitex",
    "SteelSeries": "IronArc",
    "Twitch": "Streamly",
    "HLTV": "StatCentral",
    "Betway": "Wagerway",
    "GG.Bet": "ArenaBet",
    "Thunderpick": "Thunder Cup",
}

// ============================================================
// PHRASES / VENUE NAMES in descriptions
// ============================================================

export const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
    [/LANXESS Arena/gi, "Central Arena"],
    [/Spodek Arena/gi, "Ice Spire Arena"],
    [/Avicii Arena/gi, "Aurora Arena"],
    [/O2 Arena/gi, "Atmos Arena"],
    [/Barclays Center/gi, "Metro Center"],
    [/Copper Box/gi, "Copper Hall"],
    [/Avalanche/gi, "Avalanche"],
    // Counter-Strike / CS2 / CS:GO are Valve trademarks. The shipped game
    // positions itself generically as a "tactical FPS esports manager" and
    // every player-facing string flows through this sanitizer so it never
    // leaks the trademarked product name into UI, news, commentary, etc.
    [/Counter-Strike 2/gi, "Tactical FPS"],
    [/Counter-Strike: Global Offensive/gi, "Tactical FPS"],
    [/Counter-Strike/gi, "Tactical FPS"],
    [/\bCS2\b/g, "Pro FPS"],
    [/\bCS:GO\b/gi, "Pro FPS"],
    [/\bCSGO\b/gi, "Pro FPS"],
    // Valve-specific competitive map names — flagged by the steam-ready audit's
    // A15 check. Renaming the recognisable identifier 'Dust2' to a generic
    // alias gets the trademarked label out of UI/news/save data; the engine's
    // internal map IDs were renamed in lock-step in the same release pass.
    [/\bDust2\b/gi, "Sandstone"],
    [/\bde_dust2\b/gi, "de_sandstone"],
]

// ============================================================
// DETERMINISTIC VARIANT GENERATOR (fallback for long tail)
// ============================================================

function fnv1aHash(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

const VOWEL_SWAPS: Record<string, string[]> = {
    a: ["o", "e"],
    e: ["a", "i"],
    i: ["y", "e"],
    o: ["u", "a"],
    u: ["o", "y"],
}

const CONSONANT_SWAPS: Record<string, string[]> = {
    k: ["c", "x"],
    c: ["k", "q"],
    s: ["z", "x"],
    f: ["ph", "v"],
    g: ["j", "k"],
    t: ["d", "t"],
}

const SUFFIXES = ["ra", "ro", "rix", "ium", "ex", "or", "ia", "al", "el", "or", "yx"]

/**
 * Deterministic fictional variant of a name. Uses a stable hash of the input
 * to pick swap rules, so the same input always produces the same output.
 */
export function generateVariant(name: string): string {
    if (!name) return name
    const h = fnv1aHash(name.toLowerCase())
    const tokens = name.split(/(\s+)/) // keep whitespace
    const out: string[] = []

    for (let ti = 0; ti < tokens.length; ti++) {
        const tok = tokens[ti]
        if (/^\s+$/.test(tok) || tok.length === 0) {
            out.push(tok)
            continue
        }

        const chars = tok.split("")
        let swapped = 0
        for (let i = 0; i < chars.length; i++) {
            const lower = chars[i].toLowerCase()
            const isUpper = chars[i] !== lower
            const bucket = VOWEL_SWAPS[lower] || CONSONANT_SWAPS[lower]
            if (!bucket) continue
            // Swap only certain positions, driven by the hash
            if (((h >>> ((i + ti) % 24)) & 1) !== 0) {
                const pick = bucket[(h >>> (swapped % 16)) % bucket.length]
                chars[i] = isUpper
                    ? pick.charAt(0).toUpperCase() + pick.slice(1)
                    : pick
                swapped++
                if (swapped >= 2) break // don't mangle
            }
        }
        let word = chars.join("")

        // Append a suffix ~30% of the time, for first token only
        if (ti === 0 && ((h >>> 17) & 3) === 0 && word.length <= 8) {
            const suf = SUFFIXES[h % SUFFIXES.length]
            word = word + suf
        }
        out.push(word)
    }

    return out.join("")
}

// ============================================================
// LEET-SPEAK PRESERVING NICKNAME TRANSFORM
// ============================================================

const NICK_CHAR_SWAPS: Record<string, string> = {
    "0": "8",
    "1": "7",
    "3": "9",
    "4": "6",
    "5": "2",
    "7": "1",
    "9": "3",
    s: "z",
    z: "s",
    c: "k",
    k: "c",
    g: "q",
    q: "g",
    v: "w",
    w: "v",
}

/**
 * Rewrite a player nickname while preserving leet-speak feel.
 * Deterministic: same input → same output.
 */
export function transformNickname(nick: string): string {
    if (!nick) return nick
    const h = fnv1aHash(nick.toLowerCase())
    const chars = nick.split("")

    // First pass: collect indices of swappable characters.
    const swappable: number[] = []
    for (let i = 0; i < chars.length; i++) {
        if (NICK_CHAR_SWAPS[chars[i].toLowerCase()]) swappable.push(i)
    }

    // Swap one or two chars based on the hash so every input with
    // swappable chars actually changes.
    if (swappable.length > 0) {
        const maxSwaps = Math.min(2, swappable.length)
        const targetSwaps = 1 + (h >>> 3) % maxSwaps
        let done = 0
        for (let j = 0; j < swappable.length && done < targetSwaps; j++) {
            const idx = swappable[(j + (h >>> 5)) % swappable.length]
            const c = chars[idx]
            const lower = c.toLowerCase()
            const rule = NICK_CHAR_SWAPS[lower]!
            chars[idx] = c === lower ? rule : rule.toUpperCase()
            done++
        }
    }

    let out = chars.join("")

    // If the original nickname still appears as a substring (case-insensitive) —
    // e.g. few or no swappable chars, or the swaps didn't land on unique bytes —
    // force a stronger transformation: inject a deterministic character after
    // the first alpha and, if still present, after the last alpha too.
    if (out.toLowerCase().includes(nick.toLowerCase())) {
        const injA = (h & 1 ? "x" : "z")
        const firstAlpha = out.search(/[A-Za-z]/)
        if (firstAlpha >= 0) {
            out = out.slice(0, firstAlpha + 1) + injA + out.slice(firstAlpha + 1)
        }
        if (out.toLowerCase().includes(nick.toLowerCase())) {
            const injB = ((h >>> 1) & 1) ? "q" : "v"
            out = out + injB
        }
    }
    return out
}

// ============================================================
// PREMIUM ORIGINAL BRAND GENERATOR
// ============================================================
//
// The old approach rewrote real teams into near-copies ("FURIA" -> "FORIA",
// "NAVI" -> "Natus Vincera"). That reads as a bootleg AND stays legally close
// to the trademark it apes. Instead we mint fully original, premium-sounding
// esports brands from curated word banks. Deterministic by seed, so a given
// team id always resolves to the same brand across regenerations and saves.

const CORES: readonly string[] = [
    "Obsidian", "Onyx", "Vanguard", "Tempest", "Zenith", "Eclipse", "Verdict",
    "Sable", "Cobalt", "Halcyon", "Meridian", "Requiem", "Paragon", "Odyssey",
    "Nimbus", "Solstice", "Warden", "Reverie", "Talon", "Quasar", "Pulsar",
    "Helix", "Anvil", "Bastion", "Citadel", "Vector", "Zephyr", "Kraken",
    "Griffin", "Viper", "Cobra", "Jackal", "Panther", "Lynx", "Raven", "Drake",
    "Basilisk", "Chimera", "Mirage", "Oblivion", "Vanta", "Cortex", "Synapse",
    "Crux", "Lumen", "Umbra", "Astra", "Ignis", "Valor", "Rampart", "Tundra",
    "Vortex", "Riptide", "Havoc", "Sentry", "Wyvern", "Serpent", "Monolith",
    "Summit", "Bulwark", "Aegis", "Maelstrom", "Cascade", "Zodiac", "Comet",
    "Nocturne", "Rift", "Ronin", "Sovereign", "Tempo", "Apex",
]

const PREFIXES: readonly string[] = [
    "Crimson", "Azure", "Golden", "Iron", "Frost", "Ember", "Shadow", "Solar",
    "Lunar", "Storm", "Night", "Void", "Ash", "Jade", "Scarlet", "Cobalt",
    "Violet", "Silver", "Neon", "Arctic", "Ivory", "Ruby", "Vermillion",
    "Cinder", "Onyx", "Titan", "Wild", "Ivory",
]

const ORG_SUFFIXES: readonly string[] = [
    "Esports", "Gaming", "Collective", "Union", "Syndicate", "Dynasty",
    "Athletic", "Guild", "Order", "Faction", "Legion", "Coalition",
    "Initiative", "Republic", "Corps", "Reserve",
]

const COMPOUND_HEADS: readonly string[] = [
    "Night", "Iron", "Storm", "Fire", "Frost", "Shadow", "Star", "Sun", "Moon",
    "War", "Grim", "Dark", "Steel", "Ghost", "Thunder", "Ever", "Over", "Blood",
    "Wolf", "Sky", "Void",
]

const COMPOUND_TAILS: readonly string[] = [
    "fall", "breaker", "forge", "claw", "fang", "watch", "bane", "storm",
    "veil", "wraith", "guard", "strike", "born", "hunt", "wing", "spire",
    "blade", "pulse", "core", "rift", "hawk", "howl",
]

/** Mulberry32 — small, fast, well-distributed PRNG for a 32-bit seed. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function pickFrom<T>(rng: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)]
}

function tagFor(name: string): string {
    const words = name
        .replace(/[^A-Za-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w && w.toLowerCase() !== "team")
    if (words.length >= 2) {
        return words.slice(0, 3).map(w => w[0]).join("").toUpperCase()
    }
    const w = words[0] || name
    return w.slice(0, 3).toUpperCase()
}

export interface PremiumBrand {
    name: string
    tag: string
    logoStyle: "monogram" | "mascot" | "emblem" | "wordmark"
}

/**
 * Deterministic premium esports brand for a seed (team id or real name).
 * Same seed -> same brand. `salt` lets the caller re-roll on collisions
 * without losing determinism.
 */
export function premiumTeamName(seed: string, salt = 0): PremiumBrand {
    const rng = mulberry32(fnv1aHash(`${seed}#${salt}`))
    const core = pickFrom(rng, CORES)
    const roll = rng()

    let name: string
    if (roll < 0.26) {
        name = core                                            // "Obsidian"
    } else if (roll < 0.44) {
        name = `${pickFrom(rng, PREFIXES)} ${core}`            // "Crimson Talon"
    } else if (roll < 0.58) {
        name = pickFrom(rng, COMPOUND_HEADS) + pickFrom(rng, COMPOUND_TAILS) // "Nightfall"
    } else if (roll < 0.70) {
        name = `${core} ${pickFrom(rng, ORG_SUFFIXES)}`        // "Vanguard Syndicate"
    } else if (roll < 0.80) {
        name = `Team ${core}`                                  // "Team Onyx"
    } else if (roll < 0.90) {
        name = `${core} ${rng() < 0.5 ? "Esports" : "Gaming"}` // "Talon Gaming"
    } else {
        const compound = pickFrom(rng, COMPOUND_HEADS) + pickFrom(rng, COMPOUND_TAILS)
        name = `${compound} ${pickFrom(rng, ORG_SUFFIXES)}`    // "Ironclaw Legion"
    }

    // logoStyle steers the emblem renderer: single evocative words read best as
    // a mascot mark, compounds/short brands as emblems, multi-word orgs as a
    // wordmark, and the rest as a clean monogram.
    const words = name.split(/\s+/).length
    const logoStyle: PremiumBrand["logoStyle"] =
        words === 1 ? (name.length <= 7 ? "emblem" : "mascot")
            : words >= 3 ? "wordmark"
                : "monogram"

    return { name, tag: tagFor(name), logoStyle }
}

// ============================================================
// PREMIUM ORIGINAL PLAYER HANDLE GENERATOR
// ============================================================
//
// transformNickname() only leet-swaps a char or two, so "apEX" -> "axpEX" and
// "ZywOo" -> "SyvOo" stay instantly recognisable. For the shipped build we mint
// fully original, authentic-sounding esports handles from curated syllable banks
// instead. Deterministic by seed (player id), so a player keeps the same handle
// across regenerations and saves.

const HANDLE_WHOLES: readonly string[] = [
    "Vortex", "Cinder", "Ravyn", "Quill", "Slate", "Kobalt", "Ember", "Onyx",
    "Talon", "Wraith", "Havik", "Drift", "Surge", "Rune", "Crypt", "Vandal",
    "Specter", "Blaze", "Cypher", "Echo", "Gambit", "Jinx", "Karma", "Mirage",
    "Nomad", "Omen", "Prowl", "Quake", "Reaper", "Sable", "Volt", "Zenith",
    "Fable", "Glitch", "Riot", "Nova", "Hex", "Lunar", "Vesper", "Kismet",
    "Cobalt", "Dusk", "Flint", "Gale", "Halo", "Ion", "Jolt", "Kite",
]

const HANDLE_HEADS: readonly string[] = [
    "ax", "zy", "vex", "kro", "nyx", "rai", "zen", "dro", "kel", "syn", "vor",
    "qua", "lex", "bly", "fry", "gry", "kry", "try", "vyn", "zar", "phi", "sky",
    "xan", "neo", "omn", "uly", "iri", "azu", "orb", "ryo",
]

const HANDLE_TAILS: readonly string[] = [
    "phr", "ken", "dax", "vil", "ron", "zik", "mox", "lox", "nar", "tez", "wyn",
    "dris", "kos", "pyx", "rax", "sen", "tov", "vek", "zor", "lith", "mir",
    "nox", "qel", "ruz", "syl", "vane", "wisp",
]

const LEET_MAP: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", l: "1", z: "2" }

/**
 * Deterministic premium esports player handle for a seed (e.g. player id).
 * Same seed -> same handle. `salt` lets the caller re-roll on collisions.
 */
export function premiumPlayerHandle(seed: string, salt = 0): string {
    const rng = mulberry32(fnv1aHash(`handle:${seed}#${salt}`))
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

    // Base: a coined whole word, or a head+tail syllable blend.
    let h = rng() < 0.5
        ? pickFrom(rng, HANDLE_WHOLES)
        : cap(pickFrom(rng, HANDLE_HEADS) + pickFrom(rng, HANDLE_TAILS))

    // ~35%: leet-ify exactly one eligible character (the esports staple).
    if (rng() < 0.35) {
        const idxs: number[] = []
        for (let i = 0; i < h.length; i++) if (LEET_MAP[h[i].toLowerCase()]) idxs.push(i)
        if (idxs.length) {
            const i = idxs[Math.floor(rng() * idxs.length)]
            h = h.slice(0, i) + LEET_MAP[h[i].toLowerCase()] + h.slice(i + 1)
        }
    }

    // ~22%: trailing number, as many pros use.
    if (rng() < 0.22) h = h + (1 + Math.floor(rng() * 9))

    // Casing: lowercase and mixed are both common; ALL-CAPS occasionally.
    const c = rng()
    if (c < 0.45) h = h.toLowerCase()
    else if (c < 0.6) h = h.toUpperCase()

    return h
}

// ============================================================
// PUBLIC API
// ============================================================

export function safeTeamName(name: string): string {
    if (!name) return name
    // Fully original premium brand, seeded on the source name for determinism.
    // (We no longer emit near-copies of the real trademark.)
    return premiumTeamName(name.trim()).name
}

export function safeTournamentName(name: string): string {
    if (!name) return name
    // Tournament names can embed team / sponsor / event trademarks — apply
    // all three maps. Longest-key first so compound keys win over prefixes.
    // Matching is case-insensitive so ids like "iem_katowice_2025" rewrite too.
    let replaced = name
    const allMaps: Record<string, string>[] = [TOURNAMENT_NAME_MAP, SPONSOR_NAME_MAP, TEAM_NAME_MAP]
    for (const map of allMaps) {
        const keys = Object.keys(map).sort((a, b) => b.length - a.length)
        for (const k of keys) {
            const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            replaced = replaced.replace(new RegExp(esc, "gi"), map[k])
        }
    }
    for (const [re, rep] of PHRASE_REPLACEMENTS) replaced = replaced.replace(re, rep)
    return replaced
}

export function safeSponsorName(name: string): string {
    if (!name) return name
    const trimmed = name.trim()
    const lower = trimmed.toLowerCase()
    for (const [k, v] of Object.entries(SPONSOR_NAME_MAP)) {
        if (k.toLowerCase() === lower) return v
    }
    return generateVariant(trimmed)
}

/**
 * Substrings that would trip the Steam compliance scanner even inside a
 * fictional-name slug. Applied as a last-chance stripper so that, e.g.,
 * "mouzen" doesn't leak the "mouz" trademark substring.
 */
const FORBIDDEN_SUBSTRINGS: Array<[RegExp, string]> = [
    [/faze/gi, "phae"],
    [/mouz/gi, "muxe"],
    [/monte/gi, "argon"],
    [/spirit/gi, "phanto"],
    [/\bnavi\b/gi, "nava"],
    [/vitality/gi, "vitalis"],
    [/astralis/gi, "astralix"],
    [/\bfnatic\b/gi, "phanatic"],
    [/liquid/gi, "tide"],
    [/heroic/gi, "valiant"],
    [/g2_?esports/gi, "gtwo"],
    [/cloud9/gi, "cumulus9"],
    [/mibr/gi, "mbes"],
    [/imperial/gi, "imperius"],
    [/complexity/gi, "complect"],
    [/\bhltv\b/gi, "statcentral"],
    [/redbull/gi, "surgefuel"],
    [/hyperx/gi, "hyperz"],
    [/monster_energy/gi, "meteor_energy"],
    [/betboom/gi, "boombyte"],
    [/betway/gi, "wagerway"],
    [/blast/gi, "elite"],
    [/dreamhack/gi, "dreamcircuit"],
    [/\besl\b/gi, "global"],
    [/\biem\b/gi, "wopen"],
    [/\bpgl\b/gi, "premier"],
    [/katowice/gi, "katova"],
    [/thunderpick/gi, "thundercup"],
    [/yalla/gi, "compass"],
    [/weplay/gi, "playon"],
    [/gamers8/gi, "gamersinfinity"],
    [/dacha/gi, "legacy"],
    [/elisa/gi, "electra"],
    [/\besea\b/gi, "epicarena"],
    [/roobet/gi, "rookbet"],
    [/skyesports/gi, "skyevents"],
    [/twitch/gi, "streamly"],
    [/steelseries/gi, "ironarc"],
    [/100[_-]?thieves/gi, "century_rogues"],
    [/virtus[._-]?pro/gi, "virtus_nova"],
    [/virtuspro/gi, "virtus_nova"],
    [/mousesports/gi, "mousen_sports"],
    [/outsiders/gi, "outliners"],
    [/gamerlegion/gi, "gamerleague"],
    [/furia/gi, "foria"],
    [/mongolz/gi, "nomads"],
    [/tyloo/gi, "taroo"],
    [/rare_?atom/gi, "rare_element"],
    [/lynn_?vision/gi, "lynx_vision"],
    [/eternal_?fire/gi, "everblaze"],
    [/sharks/gi, "hammerheads"],
    [/red_?canids/gi, "red_wolves"],
    [/renegades/gi, "insurgents"],
    [/wildcard/gi, "wild_ace"],
    [/\bnouns\b/gi, "pronoun"],
    [/forze/gi, "surgex"],
    [/\bheroic\b/gi, "valiant"],
    [/\bence\b/gi, "ance"],
    [/falcons/gi, "falconry"],
    [/apeks/gi, "peaks"],
    [/\bog\b/gi, "overgrowth"],
    [/grayhound/gi, "grayhare"],
    [/flyquest/gi, "flycrest"],
    [/m80/gi, "a81"],
    [/9ine/gi, "9ink"],
    [/\b9z\b/gi, "9zed"],
    [/party[-_]?astronauts/gi, "party_cosmonauts"],
    [/bounty[-_]?hunters/gi, "coin_hunters"],
    [/case[-_]?esports/gi, "casket"],
    [/legacy[-_]?esports/gi, "lineage"],
    [/fluxo/gi, "fluxion"],
]

export function stripForbidden(s: string): string {
    let out = s
    for (const [re, rep] of FORBIDDEN_SUBSTRINGS) out = out.replace(re, rep)
    return out
}

export function safeSlug(name: string): string {
    const base = safeTeamName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "team"
    return stripForbidden(base)
}

export function safeNickSlug(nick: string): string {
    const base = transformNickname(nick)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        || "player"
    return stripForbidden(base)
}

export function safeDescription(text: string): string {
    if (!text) return text
    let out = text
    for (const [re, rep] of PHRASE_REPLACEMENTS) out = out.replace(re, rep)
    // Run tournament and team maps on descriptions too
    const allMaps: Record<string, string>[] = [TOURNAMENT_NAME_MAP, TEAM_NAME_MAP, SPONSOR_NAME_MAP]
    for (const map of allMaps) {
        const keys = Object.keys(map).sort((a, b) => b.length - a.length)
        for (const k of keys) {
            const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            out = out.replace(new RegExp(esc, "gi"), map[k])
        }
    }
    return out
}
