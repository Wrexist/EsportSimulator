/**
 * Personalities and the dressing room (Phase 5.2).
 *
 * Every player has one archetype and 0–2 playstyle traits. Both are derived
 * deterministically: the archetype from mental stats, age and a hash of the
 * player id (youth prospects keep the archetype they rolled), the traits from
 * attributes and role. Archetypes change real numbers, all through the
 * helpers below so the UI copy (ARCHETYPE_INFO) and the engine read the same
 * PERSONALITY_TUNING values:
 *
 *  - morale: result swings, playing time (a regular starter left out of
 *    official matches), wage fairness, promises kept or broken;
 *  - contracts: wage asks, preferred length, renewal raise (manager and AI);
 *  - transfer requests (managed club, inbox decision with a deadline);
 *  - training gain (TrainingProcessor), a mentor's extra growth;
 *  - the captain softens defeats for the lineup he plays in.
 *
 * Engine safe: no store, no React. Deterministic: no RNG draws (hashes only).
 */

import type {
    GameSave,
    PersonalityArchetype,
    PlayerAppearances,
    PlayerPersonality,
    PlayerPromise,
    PlayerSaveData,
    PromiseKind,
    TeamSaveData,
} from "./save-types"
import { AI_SQUAD_TUNING, PERSONALITY_TUNING as T } from "@/lib/balance-tuning"

export type { PersonalityArchetype, PlayerPersonality, PlayerPromise, PromiseKind }

export const ARCHETYPES: readonly PersonalityArchetype[] = [
    "PROFESSIONAL", "AMBITIOUS", "LOYAL", "MERCENARY", "HOTHEAD", "LEADER", "SHOWMAN", "QUIET",
]

/** Playstyle traits the match engine reads (engine/match/round-sim/profile.ts). */
export const PLAYSTYLE_TRAITS = ["AGGRESSIVE", "PASSIVE", "CLUTCHER", "TRADE_FRAGGER"] as const
export type PlaystyleTrait = typeof PLAYSTYLE_TRAITS[number]

// ---------------------------------------------------------------- hashing

/** FNV-1a, 32 bit. */
function fnv(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

/** Uniform [0, 1) from a string. */
export function hash01(text: string): number {
    // One extra avalanche round so ids that differ in the last character spread.
    let h = fnv(text)
    h = (h ^ (h >>> 16)) >>> 0
    h = Math.imul(h, 0x45d9f3b) >>> 0
    h = (h ^ (h >>> 16)) >>> 0
    return h / 4294967296
}

// ---------------------------------------------------------------- derivation

type StatSource = Partial<Pick<PlayerSaveData,
    "id" | "age" | "role" | "skill" | "potential" | "leader" | "teamwork" | "amicability" | "productivity"
    | "stressResistance" | "loyalty" | "creativity" | "clutch" | "reaction" | "awp">> & { entry?: number; trading?: number }

const n = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d)
const pos = (v: number): number => (v > 0 ? v : 0)

/**
 * Relative weights for each archetype from a player's stats. A weight of 0
 * rules an archetype out (a Leader needs a high leader stat, a Hothead low
 * stress resistance). Exported for the distribution test.
 */
export function archetypeWeights(p: StatSource): Record<PersonalityArchetype, number> {
    const age = n(p.age, 22)
    const leader = n(p.leader, 50)
    const teamwork = n(p.teamwork, 50)
    const amicability = n(p.amicability, 60)
    const productivity = n(p.productivity, 60)
    const stress = n(p.stressResistance, 50)
    const loyalty = n(p.loyalty, 60)
    const creativity = n(p.creativity, 50)
    const skill = n(p.skill, 50)
    const headroom = pos(n(p.potential, skill) - skill)
    return {
        LEADER: leader >= 70 ? 1.5 + (leader - 70) / 20 + (age >= 24 ? 0.6 : 0) + (teamwork >= 60 ? 0.3 : 0) : 0,
        HOTHEAD: stress < 45 ? 0.4 + (45 - stress) / 25 + (age <= 21 ? 0.3 : 0) : 0,
        PROFESSIONAL: 0.45 + pos(productivity - 70) / 40 + (age >= 25 ? 0.4 : 0) + (stress >= 60 ? 0.3 : 0),
        AMBITIOUS: 0.3 + Math.min(1, headroom / 40) + (age <= 23 ? 0.3 : 0) + (skill >= 60 ? 0.3 : 0),
        LOYAL: 0.2 + pos(loyalty - 60) / 50 + (teamwork >= 70 ? 0.3 : 0) + (age >= 27 ? 0.3 : 0),
        MERCENARY: 0.55 + pos(65 - loyalty) / 30 + (teamwork < 45 ? 0.4 : 0) + (age >= 26 ? 0.3 : 0),
        SHOWMAN: 0.2 + pos(creativity - 55) / 25 + (amicability >= 65 ? 0.15 : 0),
        QUIET: 0.5 + (amicability < 55 ? 0.3 : 0) + (stress >= 55 ? 0.3 : 0) + (creativity < 45 ? 0.3 : 0),
    }
}

/** Deterministic archetype: a hash-weighted pick over archetypeWeights. */
export function deriveArchetype(p: StatSource): PersonalityArchetype {
    const weights = archetypeWeights(p)
    const total = ARCHETYPES.reduce((s, a) => s + weights[a], 0)
    let roll = hash01(`personality|${p.id ?? ""}`) * total
    for (const a of ARCHETYPES) {
        roll -= weights[a]
        if (roll < 0) return a
    }
    return "PROFESSIONAL"
}

/**
 * Youth prospects roll one of six types (engine/prospect-generator.ts) that
 * shape their starting stats; the type is kept as their archetype.
 */
export const PROSPECT_TYPE_ARCHETYPE: Record<string, PersonalityArchetype> = {
    PRODIGY: "AMBITIOUS",
    GRINDER: "PROFESSIONAL",
    NATURAL: "QUIET",
    CLUTCH_GENE: "SHOWMAN",
    TEAM_PLAYER: "LOYAL",
    LONE_WOLF: "MERCENARY",
}

/**
 * Playstyle traits from attributes and role (0–2). Entry fraggers with an
 * aggressive profile play AGGRESSIVE; AWPers and support anchors who hold
 * play PASSIVE; high clutch with high stress resistance is CLUTCHER; high
 * trading (or teamwork when trading is unknown) is TRADE_FRAGGER.
 */
export function deriveTraits(p: StatSource): PlaystyleTrait[] {
    const role = String(p.role ?? "").toUpperCase()
    const creativity = n(p.creativity, 50)
    const reaction = n(p.reaction, 50)
    const stress = n(p.stressResistance, 50)
    const clutch = n(p.clutch, 50)
    const teamwork = n(p.teamwork, 50)
    const aggression = typeof p.entry === "number" ? (p.entry + reaction) / 2 : (reaction + creativity) / 2
    const out: PlaystyleTrait[] = []
    if (role.includes("ENTRY") && aggression >= T.TRAIT_AGGRESSIVE_MIN) out.push("AGGRESSIVE")
    else if ((role.includes("AWP") && creativity < T.TRAIT_PASSIVE_AWP_MAX_CREATIVITY)
        || (role.includes("SUPPORT") && teamwork >= T.TRAIT_PASSIVE_ANCHOR_TEAMWORK && creativity < T.TRAIT_PASSIVE_ANCHOR_MAX_CREATIVITY)) out.push("PASSIVE")
    if (clutch >= T.TRAIT_CLUTCHER_MIN && stress >= T.TRAIT_CLUTCHER_MIN - 5) out.push("CLUTCHER")
    const trading = typeof p.trading === "number" ? p.trading : null
    const trades = trading !== null ? trading >= T.TRAIT_TRADER_MIN : (teamwork + reaction) / 2 >= T.TRAIT_TRADER_PROXY_MIN && !role.includes("AWP")
    if (trades && out.length < 2) out.push("TRADE_FRAGGER")
    return out.slice(0, 2)
}

/**
 * Give a player a personality (and traits) if he has none. Idempotent: an
 * existing archetype is kept, and traits are only derived when unset (a mod
 * or legend may ship its own). `archetype` forces the archetype (youth).
 */
export function ensurePersonality(p: PlayerSaveData, archetype?: PersonalityArchetype): PlayerSaveData {
    if (!p.personality || !ARCHETYPES.includes(p.personality.archetype)) {
        p.personality = { ...(p.personality ?? {}), archetype: archetype ?? deriveArchetype(p as StatSource) }
    }
    if (!Array.isArray(p.traits)) p.traits = deriveTraits(p as StatSource)
    return p
}

/** Assign personalities to every player missing one. Returns how many were assigned. */
export function assignPersonalities(players: PlayerSaveData[]): number {
    let assigned = 0
    for (const p of players) {
        if (!p || typeof p.id !== "string") continue
        const had = !!p.personality && ARCHETYPES.includes(p.personality.archetype) && Array.isArray(p.traits)
        ensurePersonality(p)
        if (!had) assigned++
    }
    return assigned
}

/** The player's archetype (derived on the fly for a record that predates v9). */
export function getArchetype(p: Pick<PlayerSaveData, "id"> & Partial<PlayerSaveData>): PersonalityArchetype {
    const a = p.personality?.archetype
    return a && ARCHETYPES.includes(a) ? a : deriveArchetype(p as StatSource)
}

// ---------------------------------------------------------------- effects (pure)

/** Morale result swing multiplier (win: delta > 0). */
export function resultMoraleFactor(archetype: PersonalityArchetype, delta: number): number {
    if (archetype === "HOTHEAD") return T.RESULT_HOTHEAD
    if (archetype === "QUIET") return T.RESULT_QUIET
    if (archetype === "SHOWMAN" && delta > 0) return T.RESULT_SHOWMAN_WIN
    if (archetype === "PROFESSIONAL" && delta < 0) return T.RESULT_PROFESSIONAL_LOSS
    return 1
}

/** Weekly bench morale loss multiplier. */
export function benchMoraleFactor(archetype: PersonalityArchetype): number {
    if (archetype === "AMBITIOUS" || archetype === "SHOWMAN") return T.BENCH_FACTOR_HIGH
    if (archetype === "LOYAL" || archetype === "QUIET") return T.BENCH_FACTOR_LOW
    return 1
}

/** Training gain multiplier (TrainingProcessor). */
export function trainingFactor(archetype: PersonalityArchetype): number {
    if (archetype === "PROFESSIONAL") return T.TRAINING_PROFESSIONAL
    if (archetype === "HOTHEAD" || archetype === "SHOWMAN") return T.TRAINING_DISTRACTED
    return 1
}

/** Archetypes that mind being paid below a lower-rated teammate. */
export function caresAboutWages(archetype: PersonalityArchetype): boolean {
    return archetype === "MERCENARY" || archetype === "AMBITIOUS"
}

/** Archetypes that ask to leave after weeks of low morale. */
export function mayRequestTransfer(archetype: PersonalityArchetype): boolean {
    return archetype === "AMBITIOUS" || archetype === "MERCENARY"
}

const TIER_LEVEL: Record<string, number> = { S_TIER: 3, A_TIER: 2, B_TIER: 1, C_TIER: 0 }

/** A player's level on the league-tier scale (0 = C .. 3 = S) from his overall rating. */
export function playerLevel(overallRating: number): number {
    if (overallRating >= T.LEVEL_S_OVR) return 3
    if (overallRating >= T.LEVEL_A_OVR) return 2
    if (overallRating >= T.LEVEL_B_OVR) return 1
    return 0
}

/** Tiers between the player's level and the buyer's league tier (positive = club below him). */
export function levelGap(overallRating: number, buyer?: Partial<Pick<TeamSaveData, "leagueTier">> | null): number {
    if (!buyer?.leagueTier || !(buyer.leagueTier in TIER_LEVEL)) return 0
    return playerLevel(overallRating) - TIER_LEVEL[buyer.leagueTier]
}

/**
 * Wage ask multiplier by archetype, for the manager's negotiation and every AI
 * signing (recruitmentSalary). Loyal asks less, Mercenary more, Ambitious a
 * premium to join a club AMBITIOUS_GAP or more tiers below his level.
 */
export function archetypeWageFactor(archetype: PersonalityArchetype, overallRating: number, buyer?: Partial<Pick<TeamSaveData, "leagueTier">> | null): number {
    if (archetype === "LOYAL") return T.WAGE_LOYAL
    if (archetype === "MERCENARY") return T.WAGE_MERCENARY
    if (archetype === "AMBITIOUS" && levelGap(overallRating, buyer) >= T.AMBITIOUS_GAP) return T.WAGE_AMBITIOUS_BELOW
    return 1
}

/** Preferred contract length multiplier (manager negotiation). */
export function contractLengthFactor(archetype: PersonalityArchetype): number {
    if (archetype === "LOYAL") return T.LENGTH_LOYAL
    if (archetype === "MERCENARY") return T.LENGTH_MERCENARY
    return 1
}

/** Renewal wage multiplier from the base one (1.1 → Loyal 1.05, Mercenary 1.2). */
export function renewalMultiplier(archetype: PersonalityArchetype, base: number): number {
    const raise = base - 1
    if (archetype === "LOYAL") return 1 + raise * T.RENEWAL_RAISE_LOYAL
    if (archetype === "MERCENARY") return 1 + raise * T.RENEWAL_RAISE_MERCENARY
    return base
}

/**
 * Renewed weekly wage, the same rule for the manager's Renew button and AI
 * renewals: the usual raise (AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER) scaled
 * by his archetype.
 */
export function renewalSalary(p: Pick<PlayerSaveData, "id"> & Partial<PlayerSaveData>, currentSalary: number): number {
    return Math.round(currentSalary * renewalMultiplier(getArchetype(p), AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER))
}

// ---------------------------------------------------------------- captain & mentor

type Roster = Pick<TeamSaveData, "id" | "rosterIds"> & { dressingRoom?: TeamSaveData["dressingRoom"] }
type PlayerLookup = (id: string) => PlayerSaveData | undefined

/** Highest leader stat on the roster (roster order breaks ties). */
export function defaultCaptainId(team: Roster, lookup: PlayerLookup): string | null {
    let best: PlayerSaveData | undefined
    for (const id of team.rosterIds) {
        const p = lookup(id)
        if (!p || p.isRetired) continue
        if (!best || n(p.leader, 50) > n(best.leader, 50)) best = p
    }
    return best?.id ?? null
}

/** The club's captain: the manager's pick while he is on the roster, else the default. */
export function captainId(team: Roster, lookup: PlayerLookup): string | null {
    const picked = team.dressingRoom?.captainId
    if (picked && team.rosterIds.includes(picked) && !lookup(picked)?.isRetired) return picked
    return defaultCaptainId(team, lookup)
}

/** Share of defeat morale the captain spares the lineup he plays in. */
export function captainDefeatShield(captain: Pick<PlayerSaveData, "leader"> & Partial<PlayerSaveData>): number {
    const base = n(captain.leader, 50) / T.CAPTAIN_LEADER_DIVISOR / 100
    const leader = getArchetype(captain as PlayerSaveData) === "LEADER" ? T.CAPTAIN_LEADER_BONUS : 0
    return Math.max(0, Math.min(T.CAPTAIN_MAX_SHIELD, base + leader))
}

/** Defeat shield for a lineup: the captain's when he is in it, else 0. */
export function lineupDefeatShield(team: Roster, lineupIds: readonly string[], lookup: PlayerLookup): number {
    const id = captainId(team, lookup)
    if (!id || !lineupIds.includes(id)) return 0
    const p = lookup(id)
    return p ? captainDefeatShield(p) : 0
}

/**
 * Morale delta for one player after a result: the tier/derby/psychologist
 * delta scaled by his archetype, defeats softened by the captain's shield.
 */
export function playerResultMorale(p: Pick<PlayerSaveData, "id"> & Partial<PlayerSaveData>, delta: number, shield = 0): number {
    let d = delta * resultMoraleFactor(getArchetype(p), delta)
    if (d < 0 && shield > 0) d *= 1 - shield
    return d
}

export function canMentor(p: Partial<PlayerSaveData> & Pick<PlayerSaveData, "id">): boolean {
    const a = getArchetype(p)
    return n(p.age, 0) >= T.MENTOR_MIN_AGE && (a === "LEADER" || a === "PROFESSIONAL") && !p.isRetired
}

export function canBeMentored(p: Partial<PlayerSaveData>): boolean {
    return n(p.age, 99) <= T.MENTEE_MAX_AGE && !p.isRetired
}

/** Training gain multiplier from a valid mentorship on this club. */
export function mentorTrainingFactor(team: Roster, playerId: string, lookup: PlayerLookup): number {
    const pair = team.dressingRoom?.mentorships?.find(m => m.menteeId === playerId)
    if (!pair || !team.rosterIds.includes(pair.mentorId) || !team.rosterIds.includes(playerId)) return 1
    const mentor = lookup(pair.mentorId), mentee = lookup(playerId)
    return mentor && mentee && canMentor(mentor) && canBeMentored(mentee) ? T.MENTOR_TRAINING : 1
}

/** Drop mentorships whose mentor left, retired or no longer qualifies, or whose mentee aged out. */
export function pruneMentorships(team: Roster & TeamSaveData, lookup: PlayerLookup): void {
    const pairs = team.dressingRoom?.mentorships
    if (!pairs?.length) return
    team.dressingRoom!.mentorships = pairs.filter(m => {
        const mentor = lookup(m.mentorId), mentee = lookup(m.menteeId)
        return !!mentor && !!mentee && team.rosterIds.includes(m.mentorId) && team.rosterIds.includes(m.menteeId)
            && canMentor(mentor) && canBeMentored(mentee)
    })
}

// ---------------------------------------------------------------- appearances

/** Official = a tournament or league match, not a scrim or friendly. */
export function isOfficialMatch(m: { tournamentId?: string | null; isScrim?: boolean }): boolean {
    return !!m.tournamentId && m.tournamentId !== "SCRIM" && !m.isScrim
}

function appsFor(p: PlayerSaveData, teamId: string): PlayerAppearances {
    const personality = ensurePersonality(p).personality!
    if (!personality.apps || personality.apps.teamId !== teamId) personality.apps = { teamId, starts: 0, benched: 0, regular: false }
    return personality.apps
}

/**
 * After an official match: the lineup started, every other fit roster player
 * sat it out. A player who starts REGULAR_STARTS in a row becomes a regular
 * starter; sitting out resets the start run and counts towards the bench
 * complaint and a "you'll start" promise.
 */
export function recordAppearances(team: Pick<TeamSaveData, "id" | "rosterIds">, lineupIds: readonly string[], lookup: PlayerLookup): void {
    const lineup = new Set(lineupIds)
    for (const id of team.rosterIds) {
        const p = lookup(id)
        if (!p || p.isRetired) continue
        const apps = appsFor(p, team.id)
        const promise = p.personality!.promise
        if (lineup.has(id)) {
            apps.starts++
            apps.benched = 0
            if (apps.starts >= T.REGULAR_STARTS) apps.regular = true
            if (promise?.kind === "START") promise.benchedRun = 0
        } else if (!p.injury) {
            apps.benched++
            apps.starts = 0
            if (promise?.kind === "START") promise.benchedRun = (promise.benchedRun ?? 0) + 1
        }
    }
}

// ---------------------------------------------------------------- promises

/** Weeks a promise of this kind runs. */
export function promiseWindow(kind: PromiseKind): number {
    return kind === "START" ? T.PROMISE_START_WEEKS : T.PROMISE_COMPETE_WEEKS
}

/**
 * Record a promise to a player (the manager's word, e.g. from a transfer
 * request). Replaces an open one. COMPETE remembers the club's world rank.
 */
export function recordPromise(save: Pick<GameSave, "currentWeek" | "teams">, player: PlayerSaveData, kind: PromiseKind, teamId?: string): PlayerPromise {
    ensurePersonality(player)
    const team = save.teams.find(t => t.id === teamId) ?? save.teams.find(t => t.rosterIds.includes(player.id))
    const promise: PlayerPromise = {
        kind,
        teamId: team?.id ?? "",
        madeWeek: save.currentWeek,
        deadlineWeek: save.currentWeek + promiseWindow(kind),
        ...(kind === "COMPETE" ? { baselineRank: team?.worldRanking ?? 999 } : { benchedRun: 0 }),
    }
    player.personality!.promise = promise
    return promise
}

/** The player's open promise, if any. */
export function activePromise(p: Partial<PlayerSaveData>): PlayerPromise | null {
    return p.personality?.promise ?? null
}

export type PromiseVerdict = "KEPT" | "BROKEN" | "OPEN"

/**
 * Where a promise stands this week. START is broken once he sits out
 * PROMISE_START_BENCH_LIMIT official matches in a row while fit, kept at the
 * deadline otherwise. COMPETE is kept by a trophy or a climb of
 * PROMISE_COMPETE_RANK_GAIN world-ranking places, broken at the deadline.
 */
export function promiseVerdict(promise: PlayerPromise, team: Pick<TeamSaveData, "worldRanking" | "trophies"> | undefined, week: number): PromiseVerdict {
    if (promise.kind === "START") {
        if ((promise.benchedRun ?? 0) >= T.PROMISE_START_BENCH_LIMIT) return "BROKEN"
        return week >= promise.deadlineWeek ? "KEPT" : "OPEN"
    }
    const trophy = (team?.trophies ?? []).some(t => t.week >= promise.madeWeek)
    const climbed = (team?.worldRanking ?? 999) <= (promise.baselineRank ?? 999) - T.PROMISE_COMPETE_RANK_GAIN
    if (trophy || climbed) return "KEPT"
    return week >= promise.deadlineWeek ? "BROKEN" : "OPEN"
}

export const PROMISE_LABEL: Record<PromiseKind, { promise: string; kept: string; broken: string }> = {
    START: { promise: "You'll start", kept: "Promise kept: started", broken: "Promise broken: benched" },
    COMPETE: { promise: "We'll compete for titles", kept: "Promise kept: competed for titles", broken: "Promise broken: no title challenge" },
}

// ---------------------------------------------------------------- UI copy

export interface ArchetypeInfo {
    label: string
    /** One line: who he is. */
    short: string
    /** Every effect the engine applies, one line each. */
    effects: string[]
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`
const plusPct = (factor: number) => `${factor >= 1 ? "+" : "−"}${pct(factor - 1)}`

/** Lines shared by every archetype (shown once on the player page). */
export const DRESSING_ROOM_RULES: string[] = [
    `A regular starter (${T.REGULAR_STARTS} official starts in a row) left out of ${T.BENCH_MATCHES}+ official matches in a row while fit loses ${T.BENCH_MORALE_PER_WEEK} morale a week (× his archetype), down to ${T.BENCH_MORALE_FLOOR}.`,
    `Results move morale by tournament tier; the captain, when he plays, spares the lineup part of a defeat's morale loss.`,
]

export const ARCHETYPE_INFO: Record<PersonalityArchetype, ArchetypeInfo> = {
    PROFESSIONAL: {
        label: "Professional",
        short: "Trains hard and keeps his head.",
        effects: [
            `Training gains ${plusPct(T.TRAINING_PROFESSIONAL)}.`,
            `Defeats cost him ${pct(1 - T.RESULT_PROFESSIONAL_LOSS)} less morale.`,
            `Can mentor a player aged ${T.MENTEE_MAX_AGE} or younger once he is ${T.MENTOR_MIN_AGE}.`,
        ],
    },
    AMBITIOUS: {
        label: "Ambitious",
        short: "Wants to play, and to play at the top.",
        effects: [
            `Loses morale ${T.BENCH_FACTOR_HIGH}× as fast when benched.`,
            `Unhappy (−${T.WAGE_MORALE_PER_WEEK} morale a week, down to ${T.WAGE_MORALE_FLOOR}) when paid under ${pct(T.WAGE_FAIRNESS_SHARE)} of a teammate rated ${T.WAGE_FAIRNESS_MIN_GAP}+ lower.`,
            `Asks ${plusPct(T.WAGE_AMBITIOUS_BELOW)} wages to join a club ${T.AMBITIOUS_GAP}+ tiers below his level.`,
            `May ask to leave after ${T.REQUEST_AFTER_WEEKS} weeks below ${T.UNHAPPY_MORALE} morale.`,
        ],
    },
    LOYAL: {
        label: "Loyal",
        short: "Puts the club before the money.",
        effects: [
            `Asks ${plusPct(T.WAGE_LOYAL)} wages and prefers contracts ${plusPct(T.LENGTH_LOYAL)} longer.`,
            `Renewal raise is ${pct(T.RENEWAL_RAISE_LOYAL)} of the usual.`,
            `Loses morale ${T.BENCH_FACTOR_LOW}× as fast when benched. Never asks to leave.`,
        ],
    },
    MERCENARY: {
        label: "Mercenary",
        short: "Follows the money.",
        effects: [
            `Asks ${plusPct(T.WAGE_MERCENARY)} wages and prefers contracts ${pct(1 - T.LENGTH_MERCENARY)} shorter.`,
            `Renewal raise is ${T.RENEWAL_RAISE_MERCENARY}× the usual.`,
            `Unhappy (−${T.WAGE_MORALE_PER_WEEK} morale a week, down to ${T.WAGE_MORALE_FLOOR}) when paid under ${pct(T.WAGE_FAIRNESS_SHARE)} of a teammate rated ${T.WAGE_FAIRNESS_MIN_GAP}+ lower.`,
            `Rejecting a bid for him costs ${Math.abs(T.MERCENARY_BID_REJECT_MORALE)} morale.`,
            `May ask to leave after ${T.REQUEST_AFTER_WEEKS} weeks below ${T.UNHAPPY_MORALE} morale.`,
        ],
    },
    HOTHEAD: {
        label: "Hothead",
        short: "Big swings, short fuse.",
        effects: [
            `Results swing his morale ${T.RESULT_HOTHEAD}× as much, both ways.`,
            `Training gains ${plusPct(T.TRAINING_DISTRACTED)}.`,
        ],
    },
    LEADER: {
        label: "Leader",
        short: "Lifts the dressing room.",
        effects: [
            `As captain, spares the lineup an extra ${pct(T.CAPTAIN_LEADER_BONUS)} of a defeat's morale loss.`,
            `Can mentor a player aged ${T.MENTEE_MAX_AGE} or younger once he is ${T.MENTOR_MIN_AGE}.`,
        ],
    },
    SHOWMAN: {
        label: "Showman",
        short: "Plays for the crowd.",
        effects: [
            `Wins lift his morale ${plusPct(T.RESULT_SHOWMAN_WIN)} more.`,
            `Loses morale ${T.BENCH_FACTOR_HIGH}× as fast when benched.`,
            `Training gains ${plusPct(T.TRAINING_DISTRACTED)}.`,
        ],
    },
    QUIET: {
        label: "Quiet",
        short: "Gets on with it.",
        effects: [
            `Results move his morale ${pct(1 - T.RESULT_QUIET)} less, both ways.`,
            `Loses morale ${T.BENCH_FACTOR_LOW}× as fast when benched.`,
        ],
    },
}

/** Duel-rating effects as the script-v1 round engine applies them (round-sim/simulate.ts); 1 point ≈ 3.5 aim. */
export const TRAIT_INFO: Record<PlaystyleTrait, { label: string; effect: string }> = {
    AGGRESSIVE: { label: "Aggressive", effect: "+2 duel rating when peeking, −1 when holding; first pick for aggressive CT plays." },
    PASSIVE: { label: "Passive", effect: "+1 duel rating when holding an angle, −1 when peeking." },
    CLUTCHER: { label: "Clutcher", effect: "+3 duel rating when he is the last one alive." },
    TRADE_FRAGGER: { label: "Trade fragger", effect: "+2 duel rating when trading a fallen teammate." },
}

/** Contract-demand lines for the negotiation screen (only those that apply). */
export function contractDemandLines(archetype: PersonalityArchetype, overallRating: number, buyer?: Partial<Pick<TeamSaveData, "leagueTier">> | null): string[] {
    const info = ARCHETYPE_INFO[archetype].label
    switch (archetype) {
        case "LOYAL": return [`${info}: asks ${plusPct(T.WAGE_LOYAL)} wages and wants a ${plusPct(T.LENGTH_LOYAL)} longer deal.`]
        case "MERCENARY": return [`${info}: asks ${plusPct(T.WAGE_MERCENARY)} wages and wants a ${pct(1 - T.LENGTH_MERCENARY)} shorter deal.`]
        case "AMBITIOUS": return levelGap(overallRating, buyer) >= T.AMBITIOUS_GAP
            ? [`${info}: your club is ${T.AMBITIOUS_GAP}+ tiers below his level, so he asks ${plusPct(T.WAGE_AMBITIOUS_BELOW)} wages.`]
            : [`${info}: no premium — your club is close enough to his level.`]
        default: return [`${info}: demands are not affected by his personality.`]
    }
}
