/**
 * Live roster state for the round on screen (Phase 3, stream K): HP,
 * deaths (with the killer), grenades held, multi-kills, the round's MVP and
 * its callouts, and ADR over the match so far.
 *
 * Built once per round from the resolved round (events, per-player damage,
 * grenades thrown) and the post-buy loadouts, then sampled at the playback
 * clock. Display only; nothing here feeds the engine.
 *
 * HP comes from `roundHp` (lib/round-hp.ts), the model the radar uses too:
 * exact for rounds with per-hit data, estimated for older script-v1 rounds,
 * 100 until death for legacy-v2 rounds.
 *
 * Everything is revealed when the playback clock reaches its time
 * (`t <= time`), the rule the kill feed and the radar use.
 */

import type { MapResult, MatchEvent, RoundResult } from "@/types"
import type { RoundScript } from "@/engine/match/round-script-types"
import { MAX_HP, roundHp, type HpStep } from "./round-hp"

export type { HpStep } from "./round-hp"
export interface RoundDeath { t: number; killerId?: string; weapon?: string; headshot?: boolean }
export interface RoundThrow { t: number; kind: string }
export interface MultiKill { t: number; playerId: string; count: number }

export interface RoundTimeline {
    /** HP after each change, in time order (absent = 100 all round). */
    hp: Record<string, HpStep[]>
    deaths: Record<string, RoundDeath>
    throws: Record<string, RoundThrow[]>
    /** Grenades each player bought (post-buy loadout). */
    bought: Record<string, string[]>
    /** A player's 3rd, 4th and 5th kill of the round. */
    multiKills: MultiKill[]
    /** True when survivors' HP is an estimate (older script-v1 rounds: per-round damage only). */
    estimatedHp: boolean
    /** True when the round recorded every hit (HP is exact). */
    exactHp: boolean
}

export interface RoundTimelineSource {
    round: Pick<RoundResult, "events" | "damage" | "utility">
    homeIds: readonly string[]
    awayIds: readonly string[]
    /** Post-buy loadouts by player id (utility = grenades bought). */
    loadouts?: Readonly<Record<string, { utility?: readonly string[] } | undefined>>
    script?: Pick<RoundScript, "utility"> | null
}

/** The round's HP / death / grenade timeline. Pure. */
export function buildRoundTimeline(src: RoundTimelineSource): RoundTimeline {
    const events = [...(src.round.events ?? [])].filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time)
    const kills = events.filter((e): e is MatchEvent & { playerId: string; victimId: string } => e.type === "KILL" && !!e.playerId && !!e.victimId)
    const teamOf = new Map<string, "home" | "away">([...src.homeIds.map(id => [id, "home"] as const), ...src.awayIds.map(id => [id, "away"] as const)])

    const deaths: Record<string, RoundDeath> = {}
    const killTimes: Record<string, number[]> = {}
    const multiKills: MultiKill[] = []
    for (const k of kills) {
        if (deaths[k.victimId]) continue
        deaths[k.victimId] = { t: k.time, killerId: k.playerId, weapon: k.weapon, headshot: k.isHeadshot }
        const list = (killTimes[k.playerId] ??= [])
        list.push(k.time)
        if (list.length >= 3) multiKills.push({ t: k.time, playerId: k.playerId, count: list.length })
    }

    const hpModel = roundHp(src)
    const hp: Record<string, HpStep[]> = hpModel.steps

    // Grenades thrown (engine record, else the script's).
    const throws: Record<string, RoundThrow[]> = {}
    const thrown = src.round.utility?.length
        ? src.round.utility.map(u => ({ id: u.playerId, t: u.t, kind: u.kind }))
        : (src.script?.utility ?? []).map(u => ({ id: u.throwerId, t: u.t, kind: u.kind }))
    for (const u of thrown) if (teamOf.has(u.id) && Number.isFinite(u.t)) (throws[u.id] ??= []).push({ t: u.t, kind: u.kind })

    const bought: Record<string, string[]> = {}
    for (const id of teamOf.keys()) {
        const u = src.loadouts?.[id]?.utility
        if (u?.length) bought[id] = u.map(normalizeNade)
    }
    return { hp, deaths, throws, bought, multiKills, estimatedHp: hpModel.estimated, exactHp: hpModel.exact }
}

const normalizeNade = (kind: string) => (kind === "incendiary" || kind === "fire" || kind === "incgrenade" ? "molotov" : kind === "hegrenade" || kind === "grenade" ? "he" : kind === "flashbang" ? "flash" : kind === "smokegrenade" ? "smoke" : kind)

/** Revealed once the playback clock reaches it: the rule the kill feed and the radar share. */
export const revealed = (t: number, time: number) => t <= time
const shown = revealed

export interface LivePlayerSample {
    hp: number
    dead: boolean
    killerId?: string
    killerWeapon?: string
    /** Grenades still held. */
    nades: string[]
}

/** One player's state at playback time `time` (round seconds). */
export function samplePlayer(timeline: RoundTimeline | null, id: string, time: number): LivePlayerSample {
    if (!timeline || time < 0) return { hp: MAX_HP, dead: false, nades: timeline?.bought[id] ?? [] }
    const death = timeline.deaths[id]
    if (death && shown(death.t, time)) return { hp: 0, dead: true, killerId: death.killerId, killerWeapon: death.weapon, nades: [] }
    let hp = MAX_HP
    for (const step of timeline.hp[id] ?? []) {
        if (!shown(step.t, time)) break
        if (step.hp > 0) hp = step.hp
    }
    const nades = [...(timeline.bought[id] ?? [])]
    for (const u of timeline.throws[id] ?? []) {
        if (!shown(u.t, time)) continue
        const k = nades.indexOf(normalizeNade(u.kind))
        if (k >= 0) nades.splice(k, 1)
    }
    return { hp, dead: false, nades }
}

// ─── Match totals ───────────────────────────────────────────────────────────

export interface DamageTally { damage: Record<string, number>; rounds: number; hasDamage: boolean }

/**
 * Damage per player over the revealed rounds of the series: every round of
 * earlier maps plus the first `roundsOnMap` rounds of map `mapIndex`.
 */
export function tallyMatchDamage(maps: readonly MapResult[], mapIndex: number, roundsOnMap: number): DamageTally {
    const damage: Record<string, number> = {}
    let rounds = 0
    let hasDamage = false
    maps.forEach((m, i) => {
        if (i > mapIndex) return
        const list = i === mapIndex ? m.rounds.slice(0, Math.max(0, roundsOnMap)) : m.rounds
        for (const r of list) {
            rounds++
            if (!r.damage) continue
            hasDamage = true
            for (const [id, d] of Object.entries(r.damage)) damage[id] = (damage[id] ?? 0) + d
        }
    })
    return { damage, rounds, hasDamage }
}

/** Average damage per round, or undefined before any round with damage data. */
export function adrOf(tally: DamageTally, id: string): number | undefined {
    if (!tally.hasDamage || tally.rounds <= 0) return undefined
    return Math.round((tally.damage[id] ?? 0) / tally.rounds)
}

// ─── Round summary (end-of-round beat) ──────────────────────────────────────

export type RoundCallout =
    | { kind: "ace" | "4k" | "3k"; playerId: string }
    | { kind: "clutch"; playerId: string; details: string }
    | { kind: "flawless" }
    | { kind: "eco-win" | "force-win" }

export interface RoundSummary {
    winner: "home" | "away"
    winnerSide: "ct" | "t"
    winType: RoundResult["winType"]
    mvp?: { playerId: string; kills: number; damage?: number }
    callouts: RoundCallout[]
}

const LOW_BUYS = new Set(["ECO", "FORCE", "PISTOL"])
const BIG_BUYS = new Set(["FULL", "SEMIBUY", "DOUBLE AWP"])

/** Who won, how, the round MVP and the callouts the events support. Pure. */
export function summarizeRound(round: RoundResult, homeTeamId: string, homeIds: readonly string[], awayIds: readonly string[]): RoundSummary {
    const winnerId = round.winningTeamId ?? (round.winner === "ct" ? round.ctTeam : round.tTeam)
    const winner: "home" | "away" = winnerId === homeTeamId ? "home" : "away"
    const events = round.events ?? []
    const kills = new Map<string, number>()
    const victims = new Set<string>()
    for (const e of events) {
        if (e.type !== "KILL" || !e.playerId) continue
        kills.set(e.playerId, (kills.get(e.playerId) ?? 0) + 1)
        if (e.victimId) victims.add(e.victimId)
    }
    const winners = winner === "home" ? homeIds : awayIds
    const dmg = round.damage ?? {}
    let mvp: RoundSummary["mvp"]
    for (const id of winners) {
        const k = kills.get(id) ?? 0
        const d = dmg[id]
        if (!mvp || k > mvp.kills || (k === mvp.kills && (d ?? 0) > (mvp.damage ?? 0))) mvp = { playerId: id, kills: k, ...(d !== undefined ? { damage: d } : {}) }
    }
    if (mvp && mvp.kills === 0 && !mvp.damage) mvp = undefined

    const callouts: RoundCallout[] = []
    for (const [id, k] of kills) {
        if (k >= 5) callouts.push({ kind: "ace", playerId: id })
        else if (k === 4) callouts.push({ kind: "4k", playerId: id })
        else if (k === 3) callouts.push({ kind: "3k", playerId: id })
    }
    const clutch = events.find(e => e.type === "CLUTCH" && e.playerId)
    if (clutch?.playerId) callouts.push({ kind: "clutch", playerId: clutch.playerId, details: clutch.details ?? "" })
    if (winners.length && winners.every(id => !victims.has(id)) && kills.size > 0) callouts.push({ kind: "flawless" })
    const buys = round.buys
    if (buys) {
        const own = winner === "home" ? buys.home : buys.away
        const theirs = winner === "home" ? buys.away : buys.home
        if (LOW_BUYS.has(own) && own !== "PISTOL" && BIG_BUYS.has(theirs)) callouts.push({ kind: own === "ECO" ? "eco-win" : "force-win" })
    }
    const rank: Record<RoundCallout["kind"], number> = { ace: 0, clutch: 1, "4k": 2, "eco-win": 3, "force-win": 3, "3k": 4, flawless: 5 }
    callouts.sort((a, b) => rank[a.kind] - rank[b.kind])
    return { winner, winnerSide: round.winner, winType: round.winType, mvp, callouts }
}

export const WIN_TYPE_TEXT: Record<string, string> = {
    ELIMINATION: "Elimination",
    BOMB_EXPLODED: "Bomb exploded",
    BOMB_DEFUSE: "Bomb defused",
    TIME: "Time ran out",
}
