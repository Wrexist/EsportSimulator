/**
 * G14: a randomised world for a new career. The clubs stay (names, cities,
 * reputation, money), but every player gets a new handle and face, his
 * ratings move a little, and the rosters are shuffled between clubs of the
 * same tier and region, so last season's form guide means nothing and the
 * favourites have to be found again. The hand-made world stays the default.
 *
 * Runs on a freshly created career, before budgets, synergy and career
 * histories are set up (store initializeNewGame).
 */

import { SeededRNG, deriveSeed } from "./rng"
import type { GameSave, PlayerSaveData } from "./save-types"

export const RANDOM_WORLD_TUNING = {
    /** Each rating moves by up to this much either way. */
    STAT_JITTER: 5,
    /** Potential moves by up to this much, never below his skill. */
    POTENTIAL_JITTER: 6,
} as const

const RATING_KEYS = [
    "skill", "awp", "rifle", "pistol", "grenades", "creativity", "clutch", "tactic",
    "leader", "teamwork", "amicability", "productivity", "stressResistance", "loyalty",
    "reaction", "eyesight", "health", "strength", "endurance",
] as const satisfies readonly (keyof PlayerSaveData)[]

const HEADS = ["ka", "zy", "vo", "ri", "mo", "fa", "le", "xa", "tu", "ne", "sy", "bra", "ko", "dri", "pa", "gle", "fro", "nu", "qi", "sta", "vi", "ju", "ro", "ze", "ha", "mi", "lo", "sku", "tre", "wo"]
const TAILS = ["x", "n", "ro", "ve", "k", "zo", "lt", "rn", "sh", "ki", "mz", "per", "on", "ix", "ard", "us", "ly", "nt", "ck", "za", "dy", "ss", "ra", "ko", "le"]
const LEET: Record<string, string> = { e: "3", o: "0", i: "1", a: "4", s: "5" }

function pick<T>(rng: SeededRNG, list: readonly T[]): T {
    return list[Math.floor(rng.next() * list.length)]
}

/** A new player handle: two or three syllables, sometimes a digit swapped in or a capital. */
export function randomHandle(rng: SeededRNG): string {
    let s = pick(rng, HEADS) + (rng.next() < 0.35 ? pick(rng, HEADS) : "") + pick(rng, TAILS)
    if (rng.next() < 0.3) {
        const i = [...s].findIndex(c => c in LEET)
        if (i >= 0) s = s.slice(0, i) + LEET[s[i]] + s.slice(i + 1)
    }
    if (rng.next() < 0.25) s = s[0].toUpperCase() + s.slice(1)
    return s
}

function shuffle<T>(rng: SeededRNG, list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
}

const clampRating = (v: number) => Math.max(1, Math.min(100, Math.round(v)))

/** Randomise a new career's world in place (seeded by the save id, so it is the same on every load of it). */
export function randomizeWorld(save: GameSave): void {
    const rng = new SeededRNG(deriveSeed(save.saveId, "random-world"))
    const T = RANDOM_WORLD_TUNING

    // New identities: a handle nobody had before, a face from someone else.
    const taken = new Set(save.players.map(p => p.nickname.toLowerCase()))
    const portraits = shuffle(rng, save.players.map(p => p.portraitPath).filter(Boolean))
    let face = 0
    for (const p of save.players) {
        if (p.isRetired) continue
        let handle = randomHandle(rng)
        for (let tries = 0; taken.has(handle.toLowerCase()); tries++) handle = randomHandle(rng) + (tries > 20 ? String(tries) : "")
        taken.add(handle.toLowerCase())
        p.nickname = handle
        p.name = handle
        if (p.portraitPath && face < portraits.length) p.portraitPath = portraits[face++]
        p.careerTeams = []
        p.proHistory = []
        for (const key of RATING_KEYS) p[key] = clampRating(p[key] + (rng.next() * 2 - 1) * T.STAT_JITTER)
        p.potential = Math.max(p.skill, clampRating(p.potential + (rng.next() * 2 - 1) * T.POTENTIAL_JITTER))
    }

    // Shuffle the rosters between clubs of the same tier and region (so a
    // club's players still come from its scene); contracts go with the players.
    const byTier = new Map<string, GameSave["teams"]>()
    for (const t of save.teams) {
        const key = `${t.leagueTier || t.tier}|${t.region ?? ""}`
        byTier.set(key, [...(byTier.get(key) ?? []), t])
    }
    const newTeamOf = new Map<string, string>()
    for (const teams of byTier.values()) {
        if (teams.length < 2) continue
        const rosters = shuffle(rng, teams.map(t => t.rosterIds))
        teams.forEach((t, i) => {
            t.rosterIds = rosters[i]
            for (const id of t.rosterIds) newTeamOf.set(id, t.id)
        })
    }
    for (const c of save.contracts) {
        const to = newTeamOf.get(c.playerId)
        if (to) c.teamId = to
    }
    save.randomWorld = true
}
