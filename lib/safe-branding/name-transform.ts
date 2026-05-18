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
