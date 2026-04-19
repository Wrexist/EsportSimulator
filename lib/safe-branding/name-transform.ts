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
    [/Counter-Strike 2/gi, "Counter-Strike 2"],
    [/Counter-Strike: Global Offensive/gi, "Counter-Strike 2"],
    [/\bCS2\b/g, "CS2"],
    [/\bCS:GO\b/gi, "CS2"],
    [/\bCSGO\b/gi, "CS2"],
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
            if (((h >> ((i + ti) % 24)) & 1) !== 0) {
                const pick = bucket[(h >> (swapped % 16)) % bucket.length]
                chars[i] = isUpper
                    ? pick.charAt(0).toUpperCase() + pick.slice(1)
                    : pick
                swapped++
                if (swapped >= 2) break // don't mangle
            }
        }
        let word = chars.join("")

        // Append a suffix ~30% of the time, for first token only
        if (ti === 0 && ((h >> 17) & 3) === 0 && word.length <= 8) {
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
    let swapped = 0
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i]
        const lower = c.toLowerCase()
        const rule = NICK_CHAR_SWAPS[lower]
        if (!rule) continue
        if (((h >> (i % 24)) & 1) === 0) continue
        const rep = c === lower ? rule : rule.toUpperCase()
        chars[i] = rep
        swapped++
        if (swapped >= 2) break
    }
    return chars.join("")
}

// ============================================================
// PUBLIC API
// ============================================================

export function safeTeamName(name: string): string {
    if (!name) return name
    const trimmed = name.trim()
    if (TEAM_NAME_MAP[trimmed]) return TEAM_NAME_MAP[trimmed]
    // Also try lowercase key lookup for case variance
    const lower = trimmed.toLowerCase()
    for (const [k, v] of Object.entries(TEAM_NAME_MAP)) {
        if (k.toLowerCase() === lower) return v
    }
    return generateVariant(trimmed)
}

export function safeTournamentName(name: string): string {
    if (!name) return name
    // Map longest-prefix-match so "IEM Katowice 2025" → "Winter Open Katova 2025"
    let replaced = name
    const keys = Object.keys(TOURNAMENT_NAME_MAP).sort((a, b) => b.length - a.length)
    for (const k of keys) {
        if (replaced.includes(k)) {
            const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            replaced = replaced.replace(new RegExp(esc, "gi"), TOURNAMENT_NAME_MAP[k])
        }
    }
    // Apply phrase replacements too
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

export function safeSlug(name: string): string {
    return safeTeamName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "team"
}

export function safeNickSlug(nick: string): string {
    return transformNickname(nick)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        || "player"
}

export function safeDescription(text: string): string {
    if (!text) return text
    let out = text
    for (const [re, rep] of PHRASE_REPLACEMENTS) out = out.replace(re, rep)
    // Run tournament map on descriptions too
    const keys = Object.keys(TOURNAMENT_NAME_MAP).sort((a, b) => b.length - a.length)
    for (const k of keys) {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        out = out.replace(new RegExp(esc, "gi"), TOURNAMENT_NAME_MAP[k])
    }
    const spKeys = Object.keys(SPONSOR_NAME_MAP).sort((a, b) => b.length - a.length)
    for (const k of spKeys) {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        out = out.replace(new RegExp(esc, "gi"), SPONSOR_NAME_MAP[k])
    }
    return out
}
