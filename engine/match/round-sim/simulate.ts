/**
 * script-v1 round resolver: the round is DECIDED by what happens in it.
 *
 *   plan       T strategy + site, CT setup, the CT read (plan.ts)
 *   map ctrl   early picks on the routes' contact points: mid fights, the
 *              T AWPer holding a long angle, an aggressive CT push
 *   fake       fakers show at the other site; CTs may bite and rotate
 *   execute    T utility at the site (smokes deny holds, flashes blind,
 *              molotovs flush, HE chips) against CT utility at the entrance;
 *              the site fight is a sequence of duels with trades and
 *              crossfires while rotators arrive on real rotation times
 *   plant      3.2 s; the bomb drops with its carrier and is picked up
 *   post-plant Ts hold around the bomb, CTs retake with utility on the
 *              clock (40 s bomb, 10 s / 5 s kit defuse) or save
 *   lurk       a lurker catches a rotator from behind, or hunts late
 *   saves      an outnumbered side (a lone player against two, a pair
 *              against four), or one the clock has beaten, keeps its guns;
 *              the winners may catch a saver on the way out (exit kills)
 *   time       no plant by 1:55 is a CT win
 *
 * Every duel is P(A beats B) = logistic((rA - rB) / DUEL_SCALE) with rA from
 * aim (skill + weapon attribute), weapon vs armour, holder/peeker, utility,
 * situation (opening, trade, clutch, lurk), players alive (relative to the
 * smaller side; a last player against two or more is isolated), HP,
 * condition, day form and the capped team edge (tuning.ts). The loser dies; the winner may be
 * chipped, so damage, ADR, assists and KAST come from real numbers.
 *
 * Pure and seeded: same inputs and RNG state → same round.
 */

import type { MatchEvent, RoundResult } from "@/types"
import { SeededRNG } from "../../rng"
import type { BuyStrategy } from "../buy-phase"
import { heDamage, heLandingDistance } from "../grenade-damage"
import type { PlayerSimulationState } from "../round-outcome"
import type { SiteId, UtilityKind } from "../round-script-types"
import { aimPoints, TRAIT_AGGRESSIVE, TRAIT_CLUTCHER, TRAIT_PASSIVE, TRAIT_TRADER, type SimProfile } from "./profile"
import { TUNING as T } from "./tuning"
import { WEAPON_CLASSES, isSaveWorthy, isSniperClass, weaponClassOf, type WeaponClass, type WeaponClassSpec } from "./weapons"
import type { MapZones, ZoneSite } from "./zones"

// Math is read once: global lookups are slow inside Jest's sandbox.
const { exp, floor, max, min, round } = Math

export type TStrategy = "default" | "execute" | "rush" | "split" | "fake" | "eco"
export type CtSetup = "2-1-2" | "stack-A" | "stack-B" | "aggressive"
export type RoundPlan = NonNullable<RoundResult["plan"]>
export type UtilityThrow = NonNullable<RoundResult["utility"]>[number]

export interface SimSide {
    teamId: string
    players: readonly { id: string; nickname?: string }[]
    profiles: readonly SimProfile[]
    economy: Record<string, PlayerSimulationState>
    strategy: BuyStrategy
    playstyle?: string
    /** IGL call quality 0-100. */
    call: number
    /** Duel points for every player of this team (half the capped team edge, + regroup). */
    edge: number
    /** Player of this team the opponent anti-strats. */
    targetedId?: string
    /** Per-player day form (points), aligned with `players`. */
    dayForm: readonly number[]
}

export interface SimInput {
    rng: SeededRNG
    zones: MapZones
    round: number
    home: SimSide
    away: SimSide
    homeIsCT: boolean
    /** Stage pressure scale (0 none, 0.6 group, 1 semi, 1.6 final). */
    pressure: number
    /** Map weight on IGL reads (tactical maps read more). */
    tacticalWeight: number
}

export interface SimOutput {
    winner: "HOME" | "AWAY"
    winType: RoundResult["winType"]
    kills: RoundResult["kills"]
    deaths: NonNullable<RoundResult["deaths"]>
    events: MatchEvent[]
    plan: RoundPlan
    damage: Record<string, number>
    utility: UtilityThrow[]
    /** Grenades thrown per player (consumed from their inventory). */
    utilityUsed: Record<string, string[]>
}

type Job = "entry" | "support" | "igl" | "awp" | "lurk" | "pack" | "fake" | "ct"

interface Actor {
    i: number
    id: string
    nick: string
    home: boolean
    ct: boolean
    p: SimProfile
    weapon: string
    wc: WeaponClass
    spec: WeaponClassSpec
    kevlar: boolean
    helmet: boolean
    kit: boolean
    smoke: number
    flash: number
    molotov: number
    he: number
    used: string[]
    hp: number
    alive: boolean
    deathT: number
    base: number
    dealt: number
    dmgTo: number[]
    lastKillT: number
    roundKills: number
    /** Time of this player's last duel (fights resolved out of order never go back in time for a player). */
    lastT: number
    blindUntil: number
    blindBy: number
    smoked: boolean
    flushed: boolean
    fresh: boolean
    job: Job
    /** CT post: "A" | "B" | "mid". */
    post: string
    /** Zone id where the actor is (hold / route / site). */
    zone: string
}

interface Bomb {
    carrier: Actor | null
    lost: boolean
    planted: boolean
    plantT: number
    planter: Actor | null
}

interface Round {
    /** Base of the keyed duel rolls (see duelRoll). */
    rollKey: number
    /** One independent stream of draws per purpose (see rnd). */
    draws: Map<number, SeededRNG>
    /** Duels fought so far per pair of players this round. */
    meetings: Map<number, number>
    z: MapZones
    t: number
    all: Actor[]
    T: Actor[]
    CT: Actor[]
    events: MatchEvent[]
    firstKill: boolean
    pressure: number
    bomb: Bomb
    utility: UtilityThrow[]
    S: ZoneSite
    O: ZoneSite
}

// ─── Setup ─────────────────────────────────────────────────────────────────

function utilCount(list: readonly string[] | undefined, kind: string): number {
    let n = 0
    if (list) for (const u of list) if (u === kind || (kind === "molotov" && (u === "incendiary" || u === "fire"))) n++
    return n
}

function makeActors(input: SimInput): Actor[] {
    const out: Actor[] = []
    const add = (side: SimSide, home: boolean) => {
        const ct = home === input.homeIsCT
        side.players.forEach((pl, k) => {
            const p = side.profiles[k]
            const e = side.economy[pl.id]
            const weapon = e?.weapon || (ct ? "usp" : "glock")
            const wc = weaponClassOf(weapon)
            const pressure = input.pressure > 0 ? -T.PRESSURE * input.pressure * max(0, 60 - p.stress) : 0
            const base = aimPoints(p, wc) + p.condition + (side.dayForm[k] ?? 0) + side.edge + pressure
                + (side.targetedId === pl.id ? -T.TARGETED : 0)
                + (ct ? T.CT_BIAS + (T.MAP_CT_BIAS[input.zones.mapId] ?? 0) : 0)
            out.push({
                i: out.length, id: pl.id, nick: pl.nickname ?? pl.id, home, ct, p,
                weapon, wc, spec: WEAPON_CLASSES[wc],
                kevlar: !!e?.hasArmor, helmet: !!e?.hasArmor && !!e?.hasHelmet, kit: ct && !!e?.hasKit,
                smoke: min(1, utilCount(e?.utility, "smoke")), flash: min(2, utilCount(e?.utility, "flash")),
                molotov: min(1, utilCount(e?.utility, "molotov")), he: min(1, utilCount(e?.utility, "he")),
                used: [], hp: 100, alive: true, deathT: Infinity, base, dealt: 0, dmgTo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                lastKillT: -99, roundKills: 0, lastT: 0, blindUntil: -1, blindBy: -1, smoked: false, flushed: false, fresh: false,
                job: ct ? "ct" : "pack", post: "", zone: "",
            })
        })
    }
    add(input.home, true)
    add(input.away, false)
    return out
}

const living = (xs: readonly Actor[]) => xs.filter(a => a.alive)
const countAlive = (xs: readonly Actor[]) => { let n = 0; for (const a of xs) if (a.alive) n++; return n }
const r1 = (t: number) => round(t * 10) / 10

// ─── Duels ─────────────────────────────────────────────────────────────────

function weaponPts(a: Actor, b: Actor): number {
    return a.spec.power - (b.kevlar ? a.spec.vsKevlar : 0) - (b.helmet ? a.spec.vsHelmet : 0)
}

/**
 * The team with more players alive has more angles, information and trades.
 * What counts is the advantage relative to the smaller side: one extra player
 * in a 5v4 is map control, in a 2v1 it is a crossfire and a guaranteed trade,
 * so late man-advantages close out instead of trading down to a 1v1.
 */
function numbersPts(mine: number, theirs: number): number {
    const lead = (mine - theirs) / max(1, min(mine, theirs))
    return max(-T.NUMBERS_CAP, min(T.NUMBERS_CAP, lead)) * T.NUMBERS_ROUND
}

/** Situation points every duel shares: last-alive clutch. */
function commonPts(R: Round, a: Actor): number {
    const mates = a.ct ? R.CT : R.T
    if (countAlive(mates) !== 1) return 0
    const foes = countAlive(a.ct ? R.T : R.CT)
    if (foes < 1) return 0
    return (a.p.clutch - 60) * T.CLUTCH + (a.p.stress - 50) * T.STRESS + (a.p.traits & TRAIT_CLUTCHER ? 3 : 0) + (foes >= 2 ? T.CLUTCH_ISOLATE : 0)
}

function holdPts(R: Round, d: Actor, holdCut = 0): number {
    if (d.blindUntil > R.t) return -T.BLIND
    const sniper = isSniperClass(d.wc)
    if (d.smoked || d.flushed || d.fresh) return sniper ? -T.AWP_PEEK / 2 : 0
    // A holder who just got a kill has been spotted: the angle is known.
    const spotted = R.t - d.lastKillT <= T.SPOTTED_SECONDS ? T.SPOTTED_HOLD : 1
    let s = (T.HOLD - holdCut + (sniper ? T.AWP_HOLD : 0)) * spotted + (d.p.eyesight - 70) * T.EYESIGHT * (sniper ? 1.6 : 1)
    if (d.p.traits & TRAIT_PASSIVE) s += 1
    if (d.p.traits & TRAIT_AGGRESSIVE) s -= 1
    return s
}

function peekPts(R: Round, a: Actor, crossfire: number): number {
    let s = -min(2, crossfire) * T.CROSSFIRE
    if (isSniperClass(a.wc)) s -= T.AWP_PEEK
    if (a.p.traits & TRAIT_AGGRESSIVE) s += 2
    if (a.p.traits & TRAIT_PASSIVE) s -= 1
    if (a.blindUntil > R.t) s -= T.BLIND
    return s
}

function openingPts(R: Round, a: Actor, peeking: boolean): number {
    if (R.firstKill) return 0
    return (a.p.reaction - 50) * T.REACTION + (peeking ? (a.p.entry - 50) * T.ENTRY : 0)
}

function tradePts(a: Actor): number {
    return T.TRADE + (a.p.trading - 50) * T.TRADING + (a.p.traits & TRAIT_TRADER ? 2 : 0)
}

/** One duel at R.t. Returns the winner; the loser dies, the winner may be chipped. */
function duel(R: Round, a: Actor, b: Actor, sa: number, sb: number, zone: string): Actor {
    if (a.lastT > R.t || b.lastT > R.t) R.t = max(a.lastT, b.lastT) + 0.4
    a.lastT = b.lastT = R.t
    sa += numbersPts(countAlive(a.ct ? R.CT : R.T), countAlive(a.ct ? R.T : R.CT))
    // Each kill already made this round costs a little: ammo, reloads, a known position.
    const ra = a.base + weaponPts(a, b) - (100 - a.hp) * T.HP_PENALTY - min(3, a.roundKills) * T.MULTI_KILL + sa
    const rb = b.base + weaponPts(b, a) - (100 - b.hp) * T.HP_PENALTY - min(3, b.roundKills) * T.MULTI_KILL + sb
    const pa = 1 / (1 + exp((rb - ra) / T.DUEL_SCALE))
    const aWins = duelRoll(R, a, b) < pa
    const w = aWins ? a : b
    const l = aWins ? b : a
    const pw = aWins ? pa : 1 - pa
    const pairKey = l.i * 16 + w.i
    let chip = 0
    if (w.hp > 1 && keyedRoll(R, 1, pairKey) < T.CHIP_BASE + T.CHIP_CLOSE * (1 - pw)) {
        const [lo, hi] = l.spec.chip
        const dmg = min(w.hp - 1, round((lo + keyedRoll(R, 2, pairKey) * (hi - lo)) * (w.kevlar ? 0.82 : 1)))
        chip = hurt(l, w, dmg)
    }
    kill(R, w, l, zone, chip)
    return w
}

/**
 * The uniform roll that decides a duel, keyed by the round, the two players
 * and how many times they have met this round (common random numbers): a
 * small change elsewhere (a manager decision, one extra point) moves the
 * duel's odds without reshuffling every later roll, so paired comparisons
 * measure the decision, not the noise. Murmur3-style integer hash.
 */
function duelRoll(R: Round, a: Actor, b: Actor): number {
    const lo = a.i < b.i ? a.i : b.i, hi = a.i < b.i ? b.i : a.i
    const u = keyedRoll(R, 0, lo * 16 + hi)
    // The roll is from the lower-indexed player's side.
    return a.i === lo ? u : 1 - u
}

/**
 * A uniform roll keyed by purpose and subject (and how often that pair has
 * been rolled this round), not by its position in one shared stream.
 */
function keyedRoll(R: Round, purpose: number, subject: number): number {
    const key = purpose * 4096 + subject
    const n = R.meetings.get(key) ?? 0
    R.meetings.set(key, n + 1)
    let h = (R.rollKey ^ Math.imul(key + 1, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca77)) >>> 0
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

/** Purposes of the round's random draws, each its own stream (subject 4095 of keyedRoll). */
const P = {
    plan: 16, jobs: 17, early: 18, flow: 19, util: 20, retakeUtil: 21, pickAtt: 22, pickDef: 23, step: 24,
    fallback: 25, trade: 26, lurk: 27, late: 28, retake: 29,
} as const

/** A SeededRNG whose n-th draw is the n-th keyed roll of one purpose. */
class Draws extends SeededRNG {
    constructor(private readonly R: Round, private readonly purpose: number) { super(1) }
    next(): number { return keyedRoll(this.R, this.purpose, 4095) }
}

/**
 * The round's random draws, one independent stream per purpose (common random
 * numbers): one more save roll or trade in a paired run never shifts the
 * draws that pick the next peeker, time a rotation or land a flash, so a
 * manager decision changes what it touches and not every later coin.
 */
function rnd(R: Round, purpose: number): SeededRNG {
    let d = R.draws.get(purpose)
    if (!d) { d = new Draws(R, purpose); R.draws.set(purpose, d) }
    return d
}

/** Non-lethal damage (chip, grenades): never below 1 HP. Returns the HP taken. */
function hurt(from: Actor, to: Actor, amount: number): number {
    const dmg = min(amount, to.hp - 1)
    if (dmg <= 0) return 0
    from.dealt += dmg
    from.dmgTo[to.i] += dmg
    to.hp -= dmg
    return dmg
}

/** A grenade that hurt someone: record who and how much on its throw (reporting only). */
function hurtBy(throw_: UtilityThrow, from: Actor, to: Actor, amount: number): void {
    const dmg = hurt(from, to, amount)
    if (dmg > 0) { throw_.hit = to.id; throw_.dmg = dmg }
}

/** `chip`: HP the killer lost in this duel (recorded on the KILL, reporting only). */
function kill(R: Round, k: Actor, v: Actor, zone: string, chip = 0, util?: "he" | "molotov"): void {
    const t = R.t
    const dmg = v.hp
    k.dealt += dmg
    k.dmgTo[v.i] += dmg
    v.hp = 0
    v.alive = false
    v.deathT = t
    let assister: Actor | undefined
    let best = 40
    for (const a of R.all) if (a.home === k.home && a !== k && a.dmgTo[v.i] > best) { best = a.dmgTo[v.i]; assister = a }
    let flashAssist = false
    if (!assister && v.blindUntil >= t - 0.5 && v.blindBy >= 0) {
        const f = R.all[v.blindBy]
        if (f.home === k.home && f !== k) { assister = f; flashAssist = true }
    }
    const hs = !util && keyedRoll(R, 3, k.i * 16 + v.i) < k.spec.hs * (0.85 + 0.3 * min(1, max(0, (k.p.skill - 40) / 60)))
    k.lastKillT = t
    k.roundKills++
    const ev: MatchEvent = {
        type: "KILL", time: r1(t), playerId: k.id, victimId: v.id, weapon: util ?? k.weapon,
        isHeadshot: hs, location: R.z.callouts.get(zone) ?? zone, zone, damage: dmg,
    }
    if (chip > 0) ev.chip = chip
    if (assister) ev.assisterId = assister.id
    if (flashAssist) ev.isFlashAssist = true
    if (util) ev.isUtility = true
    if (!R.firstKill) ev.isOpening = true // provisional: killsInTimeOrder() re-marks opening and trades by time
    R.events.push(ev)
    R.firstKill = true
    if (R.bomb.carrier === v) R.bomb.carrier = null
}

// ─── Fights ────────────────────────────────────────────────────────────────

interface Fight {
    att: Actor[]
    def: Actor[]
    /** Reinforcements: [actor, arrival time]. They arrive fresh (no hold on their first duel). */
    attQ: [Actor, number][]
    defQ: [Actor, number][]
    zone: string
    entryZone: string
    tEnd: number
    /** A moving end (a retake's last defuse window shifts when the kit holder dies); overrides tEnd. */
    end?: () => number
    step: [number, number]
    attTrade: number
    defTrade: number
    holdCut: number
    /** Attackers' extra points (e.g. retakers rushed by the clock). */
    attPts?: () => number
    defPts?: number
    maxDuels: number
    /** What the fight is (hit, retake, pick, …), for debugging. */
    tag?: string
    stop?: () => boolean
    /** Site defenders left alone against a crowd fall back to retake instead of dying on the spot. */
    fallback?: boolean
}

type FightEnd = "att" | "def" | "time" | "stop" | "done"

function admit(R: Round, q: [Actor, number][], into: Actor[]): void {
    for (let k = 0; k < q.length;) {
        const [a, at] = q[k]
        if (at <= R.t) {
            q.splice(k, 1)
            if (a.alive && !into.includes(a)) { a.fresh = true; into.push(a) }
        } else k++
    }
}

function nextArrival(q: [Actor, number][]): number {
    let t = Infinity
    for (const [a, at] of q) if (a.alive && at < t) t = at
    return t
}

/**
 * Better players take more of the duels (the star gets the impactful
 * positions and swings): weight 1 + (skill - group average) / STAR_SPREAD,
 * clamped to [0.5, 2.5].
 */
function impactWeight(a: Actor, group: readonly Actor[]): number {
    let sum = 0
    for (const x of group) sum += x.p.skill
    return max(0.5, min(2.5, 1 + (a.p.skill - sum / group.length) / T.STAR_SPREAD))
}

function pickByImpact(R: Round, A: Actor[]): Actor {
    let total = 0
    const w = A.map(a => { const x = impactWeight(a, A); total += x; return x })
    let r = rnd(R, P.pickAtt).next() * total
    for (let k = 0; k < A.length; k++) { r -= w[k]; if (r < 0) return A[k] }
    return A[A.length - 1]
}

function pickHolder(R: Round, D: Actor[]): Actor {
    if (D.length === 1) return D[0]
    let total = 0
    const w = D.map(d => {
        let x = impactWeight(d, D)
        if (isSniperClass(d.wc) && !d.smoked) x *= 1.8
        if (d.blindUntil > R.t) x *= 1.5
        else if (d.smoked) x *= 0.4
        total += x
        return x
    })
    let r = rnd(R, P.pickDef).next() * total
    for (let k = 0; k < D.length; k++) { r -= w[k]; if (r < 0) return D[k] }
    return D[D.length - 1]
}

function fight(R: Round, F: Fight): FightEnd {
    let duels = 0
    for (let guard = 0; guard < 40; guard++) {
        admit(R, F.attQ, F.att)
        admit(R, F.defQ, F.def)
        const A = living(F.att)
        const D = living(F.def)
        if (!A.length) {
            const nt = nextArrival(F.attQ)
            if (nt < (F.end?.() ?? F.tEnd) && D.length) { R.t = max(R.t, nt); continue }
            return "def"
        }
        if (!D.length) {
            if (F.maxDuels < 99) return "done"
            return "att"
        }
        if (duels >= F.maxDuels) return "done"
        if (R.t >= (F.end?.() ?? F.tEnd)) return "time"
        if (F.stop?.()) return "stop"
        // The front player opens; after that whoever is in position peeks next.
        const a = duels === 0 || A.length === 1 ? A[0] : pickByImpact(R, A)
        const d = pickHolder(R, D)
        let cross = 0
        for (const x of D) if (x !== d && !x.smoked && x.blindUntil <= R.t && !x.fresh) cross++
        const zone = duels === 0 ? F.entryZone : F.zone
        // Numbers: the side with fewer players in the fight cannot cover every angle.
        const numbers = max(-3, min(3, A.length - D.length)) * T.NUMBERS
        const sa = peekPts(R, a, cross) + openingPts(R, a, true) + commonPts(R, a) + (F.attPts?.() ?? 0) + numbers
        const sd = holdPts(R, d, F.holdCut) + openingPts(R, d, false) + commonPts(R, d) + (F.defPts ?? 0)
        const w = duel(R, a, d, sa, sd, zone)
        duels++
        a.fresh = false
        d.fresh = false
        a.zone = d.zone = zone
        // Outnumbering attackers swing together: a holder who wins is traded more often.
        const swing = w === d ? max(0, living(F.att).length - living(F.def).length) * T.TRADE_PER_EXTRA : 0
        tradeChain(R, F, w, w === a ? "def" : "att", zone, swing)
        if (F.fallback) {
            const left = living(F.def)
            if (left.length === 1 && living(F.att).length >= 3 && rnd(R, P.fallback).bool(T.FALLBACK)) F.def.splice(F.def.indexOf(left[0]), 1)
        }
        R.t += rnd(R, P.step).range(F.step[0], F.step[1])
    }
    return "time"
}

/** The side that just lost a player may trade the killer, and so on (decaying). */
function tradeChain(R: Round, F: Fight, killer: Actor, side: "att" | "def", zone: string, extra = 0): void {
    let p = min(0.85, (side === "att" ? F.attTrade : F.defTrade) + extra)
    let k = killer
    let s = side
    for (let step = 0; step < 3; step++) {
        if (!k.alive || R.t + 1.8 > (F.end?.() ?? F.tEnd)) return
        const pool = living(s === "att" ? F.att : F.def).filter(x => !x.smoked || s === "att")
        if (!pool.length) return
        const trader = s === "att" ? pool[0] : pool[rnd(R, P.trade).int(0, pool.length - 1)]
        // The last player alive does not swing blind into two or more: they play for a clutch (or a save).
        const lone = countAlive(trader.ct ? R.CT : R.T) === 1 && countAlive(trader.ct ? R.T : R.CT) >= 2 ? T.TRADE_LONE : 1
        const pt = p * lone * (0.75 + 0.5 * trader.p.teamwork / 100)
        if (keyedRoll(R, 4, trader.i * 16 + k.i) >= pt) return
        R.t += rnd(R, P.trade).range(0.4, 1.8)
        const st = tradePts(trader) + commonPts(R, trader) + (s === "def" ? 2 : 0) + (s === "att" ? (F.attPts?.() ?? 0) : 0)
        const sk = -T.EXPOSED + commonPts(R, k)
        const w = duel(R, trader, k, st, sk, zone)
        trader.fresh = false
        trader.zone = zone
        p *= T.TRADE_DECAY
        if (w === trader) {
            // The trader is now exposed: the other side may re-trade.
            k = trader
            s = s === "att" ? "def" : "att"
            p = (s === "att" ? F.attTrade : F.defTrade) * T.TRADE_DECAY
        }
    }
}

// ─── Utility ───────────────────────────────────────────────────────────────

function throwUtil(R: Round, a: Actor, kind: UtilityKind, site: SiteId, side: "T" | "CT", t: number): UtilityThrow {
    const spots = R.z.sites[site].util[side][kind]
    const used = R.utility.filter(u => u.kind === kind && u.site === site).length
    const spot = spots.length ? spots[used % spots.length] : site
    const entry: UtilityThrow = { t: r1(max(0.5, t)), playerId: a.id, kind, spot, site }
    R.utility.push(entry)
    a.used.push(kind)
    a[kind]--
    return entry
}

/** T utility on the site before the execute; CT utility on the entrance. Returns the execute delay. */
function executeUtility(R: Round, hitters: Actor[], defenders: Actor[], strategy: TStrategy, tHit: number): number {
    const S = R.S.id
    const maxSmokes = strategy === "execute" ? 3 : strategy === "rush" || strategy === "eco" ? 0 : 2
    const maxFlashes = strategy === "execute" ? 4 : strategy === "rush" || strategy === "eco" ? 1 : 2
    const throwers = [...hitters].sort((a, b) => (b.job === "support" ? 1 : 0) - (a.job === "support" ? 1 : 0) || b.p.grenades - a.p.grenades)
    const targets = () => defenders.filter(d => d.alive && !d.smoked)
    // Smokes deny the AWPer and anchors first.
    let smokes = 0
    for (const a of throwers) {
        if (smokes >= maxSmokes || a.smoke <= 0) continue
        const pool = targets()
        if (pool.length <= 0) break
        const d = pool.find(x => isSniperClass(x.wc)) ?? pool[rnd(R, P.util).int(0, pool.length - 1)]
        throwUtil(R, a, "smoke", S, "T", tHit - 4 + 0.3 * smokes)
        // A well-placed smoke takes the angle away; a poor one only half the time.
        if (rnd(R, P.util).next() < 0.55 + 0.004 * a.p.grenades) d.smoked = true
        smokes++
    }
    for (const a of throwers) {
        if (a.molotov <= 0 || strategy === "rush") continue
        const pool = targets()
        if (!pool.length) break
        const d = pool[rnd(R, P.util).int(0, pool.length - 1)]
        const molotov = throwUtil(R, a, "molotov", S, "T", tHit - 2.5)
        d.flushed = true
        hurtBy(molotov, a, d, rnd(R, P.util).int(6, 22))
        break
    }
    for (const a of throwers) {
        if (a.he <= 0 || strategy === "rush" && rnd(R, P.util).next() < 0.5) continue
        const pool = defenders.filter(d => d.alive)
        if (!pool.length) break
        const d = pool[rnd(R, P.util).int(0, pool.length - 1)]
        const he = throwUtil(R, a, "he", S, "T", tHit - 1.5)
        hurtBy(he, a, d, heDamage({ distance: heLandingDistance(rnd(R, P.util).next(), a.p.grenades), armoured: d.kevlar }))
        break
    }
    let flashes = 0
    for (const a of throwers) {
        while (a.flash > 0 && flashes < maxFlashes) {
            const pool = targets()
            throwUtil(R, a, "flash", S, "T", tHit - 0.8 + 0.25 * flashes)
            flashes++
            if (!pool.length) continue
            if (rnd(R, P.util).next() < T.FLASH_BASE + T.FLASH_PER_GRENADES * a.p.grenades) {
                const d = pool[rnd(R, P.util).int(0, pool.length - 1)]
                d.blindUntil = tHit + 2.5
                d.blindBy = a.i
            }
        }
    }
    // CT utility at the entrance.
    let delay = 0
    const entry = hitters[0]
    for (const d of defenders) {
        if (!d.alive) continue
        if (d.molotov > 0 && strategy !== "rush") {
            const molotov = throwUtil(R, d, "molotov", S, "CT", tHit - 1)
            delay += rnd(R, P.util).range(1.5, 4)
            if (entry && rnd(R, P.util).next() < 0.4) hurtBy(molotov, d, entry, rnd(R, P.util).int(8, 24))
        } else if (d.he > 0 && entry && rnd(R, P.util).next() < 0.5) {
            const he = throwUtil(R, d, "he", S, "CT", tHit - 0.5)
            hurtBy(he, d, entry, heDamage({ distance: heLandingDistance(rnd(R, P.util).next(), d.p.grenades), armoured: entry.kevlar }))
        } else if (d.flash > 0 && entry && rnd(R, P.util).next() < 0.5) {
            throwUtil(R, d, "flash", S, "CT", tHit)
            if (rnd(R, P.util).next() < T.FLASH_BASE + T.FLASH_PER_GRENADES * d.p.grenades) { entry.blindUntil = tHit + delay + 2; entry.blindBy = d.i }
        } else if (d.smoke > 0 && strategy !== "rush" && rnd(R, P.util).next() < 0.5) {
            throwUtil(R, d, "smoke", S, "CT", tHit - 3)
            delay += rnd(R, P.util).range(1, 3)
        }
    }
    return delay
}

/** CT utility on a retake: flashes blind holders, a molotov flushes one, a smoke cuts a crossfire. */
function retakeUtility(R: Round, retakers: Actor[], holders: Actor[], t: number): void {
    const S = R.S.id
    let flashes = 0
    for (const a of retakers) {
        if (!a.alive) continue
        if (a.smoke > 0) {
            const pool = holders.filter(h => h.alive && !h.smoked)
            throwUtil(R, a, "smoke", S, "CT", t - 2)
            if (pool.length > 1 && rnd(R, P.retakeUtil).next() < 0.5) pool[rnd(R, P.retakeUtil).int(0, pool.length - 1)].smoked = true
        }
        if (a.molotov > 0) {
            const pool = holders.filter(h => h.alive && !h.flushed)
            const molotov = throwUtil(R, a, "molotov", S, "CT", t - 1.5)
            if (pool.length) { const h = pool[rnd(R, P.retakeUtil).int(0, pool.length - 1)]; h.flushed = true; hurtBy(molotov, a, h, rnd(R, P.retakeUtil).int(6, 25)) }
        }
        while (a.flash > 0 && flashes < 3) {
            throwUtil(R, a, "flash", S, "CT", t - 1.1 + 0.3 * flashes) // all three land before the retake swings at t
            flashes++
            const pool = holders.filter(h => h.alive)
            if (pool.length && rnd(R, P.retakeUtil).next() < T.FLASH_BASE + T.FLASH_PER_GRENADES * a.p.grenades) {
                const h = pool[rnd(R, P.retakeUtil).int(0, pool.length - 1)]
                h.blindUntil = t + 2.2
                h.blindBy = a.i
            }
        }
    }
}

// ─── Plan ──────────────────────────────────────────────────────────────────

function weighted<K extends string>(rng: SeededRNG, w: Record<K, number>): K {
    const keys = Object.keys(w) as K[]
    let total = 0
    for (const k of keys) total += max(0, w[k])
    let r = rng.next() * total
    for (const k of keys) { r -= max(0, w[k]); if (r < 0) return k }
    return keys[keys.length - 1]
}

const BUY_OF: Record<string, "pistol" | "eco" | "force" | "half" | "full"> = {
    PISTOL: "pistol", ECO: "eco", FORCE: "force", SEMIBUY: "half", FULL: "full", "DOUBLE AWP": "full",
}

interface PlanState {
    strategy: TStrategy
    site: SiteId
    setup: CtSetup
    read: "right" | "wrong" | "none"
    execAt: number
    fakeAt: number
    ecoRush: boolean
}

const BEATS: Record<string, string> = { aggressive: "structured", structured: "balanced", balanced: "aggressive" }

/** +1 when style `a` counters style `b`, -1 when `b` counters `a`, else 0 (same triangle as the strength counter). */
export function counterSign(a: string | undefined, b: string | undefined): number {
    if (!a || !b) return 0
    if (BEATS[a] === b) return 1
    if (BEATS[b] === a) return -1
    return 0
}

function choosePlan(R: Round, input: SimInput, tSide: SimSide, ctSide: SimSide): PlanState {
    const rng = rnd(R, P.plan)
    const tBuy = BUY_OF[tSide.strategy] ?? "full"
    const ctBuy = BUY_OF[ctSide.strategy] ?? "full"
    const tStyle = (tSide.playstyle ?? "").toLowerCase()
    const ctStyle = (ctSide.playstyle ?? "").toLowerCase()
    let strategy: TStrategy
    if (tBuy === "eco") strategy = "eco"
    else {
        const w: Record<Exclude<TStrategy, "eco">, number> = { default: 4, execute: 3, split: 1.5, fake: 1, rush: 1 }
        if (tBuy === "force" || tBuy === "pistol") w.rush += 3
        if (tStyle === "aggressive") { w.rush += 2; w.execute += 1; w.default -= 1 }
        if (tStyle === "structured") { w.default += 1; w.split += 1; w.fake += 0.5 }
        if (tStyle === "balanced") { w.execute += 0.5; w.default += 0.5 }
        const creative = (tSide.call - 50) / 50
        w.fake += 0.5 * creative
        w.split += 0.5 * creative
        const smokes = R.T.reduce((s, a) => s + a.smoke, 0)
        if (smokes < 2) { w.execute -= 2; w.default += 1 }
        strategy = weighted(rng, w)
    }
    const site: SiteId = rng.bool(0.5) ? "A" : "B"

    const cw: Record<CtSetup, number> = { "2-1-2": 6, "stack-A": 1, "stack-B": 1, aggressive: 1 }
    if (ctStyle === "aggressive") cw.aggressive += 2
    if (ctStyle === "structured") cw["2-1-2"] += 2
    if (ctBuy === "eco" || ctBuy === "force") { cw["stack-A"] += 1.5; cw["stack-B"] += 1.5; cw.aggressive += 1.5 }
    let setup = weighted(rng, cw)

    // The read: a better caller (and a tactical map) anticipates the T plan, and a
    // playstyle that counters the other one reads it better (the counter triangle).
    const counter = counterSign(ctStyle, tStyle)
    const edge = max(-0.2, min(0.2, T.READ_IGL * ((ctSide.call - tSide.call) / 50) * input.tacticalWeight + T.READ_COUNTER * counter))
    let read: PlanState["read"] = "none"
    if (setup === "stack-A" || setup === "stack-B") {
        const onSite = rng.bool(max(0.3, min(0.7, 0.5 + edge)))
        setup = onSite ? (site === "A" ? "stack-A" : "stack-B") : (site === "A" ? "stack-B" : "stack-A")
        read = onSite ? "right" : "wrong"
    } else {
        const roll = rng.next()
        const right = max(0.05, min(0.35, T.READ_RIGHT_BASE + edge))
        const wrong = max(0.02, min(0.15, T.READ_WRONG_BASE - edge / 2))
        read = roll < right ? "right" : roll < right + wrong ? "wrong" : "none"
    }

    const S = R.z.sites[site]
    const contact = S.main.contactTime
    let execAt: number
    let fakeAt = 0
    let ecoRush = false
    switch (strategy) {
        case "rush": execAt = contact + rng.range(0, 2); break
        case "execute": execAt = max(contact + 6, rng.range(26, 42)); break
        case "split": execAt = max(contact + 10, rng.range(40, 60)); break
        case "fake": fakeAt = max(R.z.sites[site === "A" ? "B" : "A"].main.contactTime + 2, rng.range(28, 40)); execAt = fakeAt + rng.range(10, 16); break
        case "eco":
            ecoRush = rng.bool(0.6)
            execAt = ecoRush ? contact + rng.range(0, 3) : rng.range(55, 85)
            break
        default: execAt = rng.range(52, 82)
    }
    return { strategy, site, setup, read, execAt, fakeAt, ecoRush }
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

const PLANT_PRIORITY: Record<string, number> = { support: 0, igl: 1, rifler: 2, entry: 3, awp: 4 }

function assignJobs(R: Round, plan: PlanState): { lurker: Actor | null; fakers: Actor[]; aggressor: Actor | null } {
    const ts = R.T
    for (const a of ts) a.job = isSniperClass(a.wc) ? "awp" : a.p.role === "entry" ? "entry" : a.p.role === "support" ? "support" : a.p.role === "igl" ? "igl" : "pack"
    if (!ts.some(a => a.job === "entry")) {
        const pool = ts.filter(a => a.job === "pack").sort((a, b) => b.p.entry - a.p.entry)
        const pick = pool[0] ?? ts.find(a => a.job !== "awp")
        if (pick) pick.job = "entry"
    }
    // The bomb starts with the support / IGL.
    const carrier = [...ts].sort((a, b) => (PLANT_PRIORITY[a.job === "pack" ? "rifler" : a.job] ?? 2) - (PLANT_PRIORITY[b.job === "pack" ? "rifler" : b.job] ?? 2))[0] ?? null
    R.bomb.carrier = carrier
    let lurker: Actor | null = null
    const lurks = plan.strategy === "default" || plan.strategy === "split" || plan.strategy === "fake" || (plan.strategy === "eco" && !plan.ecoRush)
    if (lurks && ts.length >= 4 && rnd(R, P.jobs).bool(0.7)) {
        const pool = ts.filter(a => a.job === "pack" && a !== carrier).sort((a, b) => b.p.creativity - a.p.creativity)
        lurker = pool[0] ?? null
        if (lurker) lurker.job = "lurk"
    }
    const fakers: Actor[] = []
    if (plan.strategy === "fake") {
        const pool = ts.filter(a => (a.job === "pack" || a.job === "support") && a !== carrier)
        for (const a of pool.slice(0, 2)) { a.job = "fake"; fakers.push(a) }
    }

    // CT posts by setup: 2-1-2, stacks 3-1-1, aggressive = 2-1-2 with a pusher.
    const cts = R.CT
    const counts: Record<string, number> = { A: 2, B: 2, mid: 1 }
    if (plan.setup === "stack-A") Object.assign(counts, { A: 3, B: 1 })
    if (plan.setup === "stack-B") Object.assign(counts, { A: 1, B: 3 })
    const awper = cts.find(a => isSniperClass(a.wc))
    const order = rnd(R, P.jobs).shuffle(cts.filter(a => a !== awper))
    if (awper) order.unshift(awper)
    const posts: string[] = []
    for (const k of ["mid", "A", "B"] as const) for (let n = 0; n < counts[k]; n++) posts.push(k)
    order.forEach((a, k) => {
        let post = posts[k] ?? "A"
        // The AWPer takes mid or a long anchor.
        if (a === awper && rnd(R, P.jobs).bool(0.3)) post = rnd(R, P.jobs).bool(0.5) ? "A" : "B"
        a.post = post
        const holds = post === "mid" ? R.z.midHolds : R.z.sites[post as SiteId].holds
        a.zone = holds.length ? holds[k % holds.length] : post
    })
    // Keep the counts after the AWPer swap: swap with someone on the AWPer's new post.
    if (awper && awper.post !== "mid" && !cts.some(a => a !== awper && a.post === "mid")) {
        const swap = cts.find(a => a !== awper && a.post === awper.post)
        if (swap) { swap.post = "mid"; swap.zone = R.z.midHolds[0] ?? "mid" }
    }
    const aggressor = plan.setup === "aggressive"
        ? (cts.find(a => a.post === "mid" && a !== awper) ?? cts.find(a => a.p.traits & TRAIT_AGGRESSIVE) ?? cts.find(a => a !== awper) ?? null)
        : (cts.find(a => a.p.traits & TRAIT_AGGRESSIVE && a !== awper && rnd(R, P.jobs).bool(0.25)) ?? null)
    // The read moves one player before the hit.
    const S = plan.site
    const O: SiteId = S === "A" ? "B" : "A"
    if (plan.read === "right" && plan.setup !== "stack-A" && plan.setup !== "stack-B") {
        const mover = cts.find(a => a.post === "mid") ?? cts.find(a => a.post === O)
        if (mover) { mover.post = S; mover.zone = R.S.holds[rnd(R, P.jobs).int(0, max(0, R.S.holds.length - 1))] ?? S }
    } else if (plan.read === "wrong" && plan.setup !== "stack-A" && plan.setup !== "stack-B") {
        const mover = cts.find(a => a.post === "mid") ?? cts.find(a => a.post === S && a !== awper)
        if (mover) { mover.post = O; mover.zone = R.O.holds[0] ?? O }
    }
    return { lurker, fakers, aggressor }
}

// ─── Round ─────────────────────────────────────────────────────────────────

const ROUND_TIME = 115
const PLANT_TIME = 3.2
const BOMB_TIME = 40
const LATEST_PLANT_START = ROUND_TIME - PLANT_TIME

export function simulateScriptRound(input: SimInput): SimOutput {
    const all = makeActors(input)
    const T_ = all.filter(a => !a.ct)
    const CT_ = all.filter(a => a.ct)
    const R: Round = {
        rollKey: input.rng.int(1, 0x7ffffffe), draws: new Map(), meetings: new Map(), z: input.zones, t: 0, all, T: T_, CT: CT_, events: [], firstKill: false, pressure: input.pressure,
        bomb: { carrier: null, lost: false, planted: false, plantT: 0, planter: null },
        utility: [], S: input.zones.sites.A, O: input.zones.sites.B,
    }
    const tSide = input.homeIsCT ? input.away : input.home
    const ctSide = input.homeIsCT ? input.home : input.away
    const plan = choosePlan(R, input, tSide, ctSide)
    R.S = input.zones.sites[plan.site]
    R.O = input.zones.sites[plan.site === "A" ? "B" : "A"]
    const { lurker, fakers, aggressor } = assignJobs(R, plan)
    for (const a of T_) a.zone = a.job === "lurk" ? (input.zones.lurk[R.O.id]?.id ?? R.O.main.id) : R.S.main.id

    const end = playRound(R, plan, lurker, fakers, aggressor)
    return finish(R, input, plan, end)
}

interface RoundEnd { winnerCT: boolean; winType: RoundResult["winType"]; t: number }

function playRound(R: Round, plan: PlanState, lurker: Actor | null, fakers: Actor[], aggressor: Actor | null): RoundEnd {
    const S = R.S, O = R.O
    const tAll = R.T, ctAll = R.CT
    const elim = (): RoundEnd | null => {
        if (!countAlive(tAll) && !R.bomb.planted) return { winnerCT: true, winType: "ELIMINATION", t: R.t }
        if (!countAlive(ctAll)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
        return null
    }

    // ── 1. Map control: early picks before the hit ──
    earlyFights(R, plan, aggressor)
    let done = elim()
    if (done) return done

    // ── 2. A side that lost the early fights badly may save ──
    if (givesUp(R, tAll, countAlive(ctAll), 0, T.SAVE_EARLY)) {
        R.t = max(R.t + 2, plan.execAt - 10)
        return tSave(R)
    }

    // ── 3. Fake: CTs may bite and send a player over ──
    let execAt = max(R.t + 2, plan.execAt)
    const rotating = new Set<Actor>()
    if (plan.strategy === "fake" && fakers.some(a => a.alive)) {
        R.t = max(R.t, plan.fakeAt)
        for (const f of fakers) {
            if (!f.alive) continue
            if (f.smoke > 0) throwUtil(R, f, "smoke", O.id, "T", R.t)
            if (f.flash > 0) throwUtil(R, f, "flash", O.id, "T", R.t + 0.5)
            if (f.molotov > 0) throwUtil(R, f, "molotov", O.id, "T", R.t + 1)
        }
        const bite = max(0.25, min(0.8, 0.55 + (plan.read === "right" ? -0.25 : plan.read === "wrong" ? 0.15 : 0)))
        if (rnd(R, P.flow).bool(bite)) {
            const mover = living(ctAll).find(a => a.post === "mid") ?? living(ctAll).find(a => a.post === S.id)
            if (mover) { mover.post = O.id; mover.zone = O.holds[0] ?? O.id; rotating.add(mover) }
        }
    }

    // ── 4. Execute ──
    const hitters = living(tAll).filter(a => a !== lurker && !fakers.includes(a))
    const late: [Actor, number][] = []
    for (const f of fakers) if (f.alive) late.push([f, execAt + O.rotateTime * 0.6])
    // The T AWPer holds the entrance and comes in last.
    const order: Record<Job, number> = { entry: 0, pack: 1, support: 2, igl: 3, fake: 4, awp: 5, lurk: 6, ct: 9 }
    hitters.sort((a, b) => order[a.job] - order[b.job])
    if (!hitters.length) return lurkerHunt(R, lurker)
    const defenders = living(ctAll).filter(a => a.post === S.id)
    // CTs elsewhere hear the execute (utility, first contact) and start rotating.
    const info = rnd(R, P.flow).range(T.ROTATE_INFO[0], T.ROTATE_INFO[1])
    const rotators: [Actor, number][] = []
    let anchorStays: Actor | null = null
    for (const c of living(ctAll)) {
        if (c.post === S.id) continue
        if (c.post === "mid") rotators.push([c, execAt + info + S.midTime])
        else if (c.post === O.id) {
            // The far anchor holds until the plant when a T is still unseen.
            if (!anchorStays && (lurker?.alive || rnd(R, P.flow).bool(0.35))) { anchorStays = c; continue }
            rotators.push([c, execAt + info + O.rotateTime])
        }
    }
    const delay = executeUtility(R, hitters, defenders, plan.strategy, execAt)
    execAt += delay
    R.t = execAt
    // A lurker catches the first rotator walking past.
    if (lurker?.alive) lurkPick(R, lurker, rotators, execAt + info)

    const split = plan.strategy === "split"
    // A hit that collapses (a lone T, or two against four) falls back and saves.
    let tCount = countAlive(tAll)
    const tGivesUp = () => {
        const n = countAlive(tAll)
        if (n === tCount) return false
        tCount = n
        return givesUp(R, tAll, countAlive(ctAll), plantUrgency(R), T.SAVE_T)
    }
    const hit: Fight = {
        att: hitters, def: defenders, attQ: late, defQ: rotators.filter(([a]) => a.alive),
        zone: S.id, entryZone: split && rnd(R, P.flow).bool(0.5) ? S.split.id : S.main.id,
        tEnd: LATEST_PLANT_START - 2, step: plan.strategy === "rush" || plan.ecoRush ? T.RUSH_STEP : T.HIT_STEP,
        attTrade: T.TRADE_HIT, defTrade: T.TRADE_HOLD, holdCut: split ? T.SPLIT_HOLD_CUT : 0, maxDuels: 99, fallback: true, tag: "hit",
        // A rush hits before the defence is set (no utility, fast swings).
        attPts: plan.strategy === "rush" || plan.ecoRush ? () => T.RUSH_SPEED : undefined,
        stop: tGivesUp,
    }
    const res = fight(R, hit)
    for (const d of defenders) { d.smoked = false; d.flushed = false }
    done = elim()
    if (done) return done
    if (res === "def") return lurkerHunt(R, lurker)
    if (res === "time" || res === "stop") return tSave(R)

    // ── 5. Plant ──
    const onSite = living(tAll).filter(a => a !== lurker && (hitters.includes(a) || late.some(([x]) => x === a)))
    if (!onSite.length) return lurkerHunt(R, lurker)
    let planter = R.bomb.carrier && R.bomb.carrier.alive && onSite.includes(R.bomb.carrier) ? R.bomb.carrier : null
    let walk = rnd(R, P.flow).range(1.2, 3)
    if (!planter) {
        // The bomb was dropped: on the way in (picked up) or lost in an early fight.
        if (R.bomb.lost) return lateRound(R, lurker)
        planter = [...onSite].sort((a, b) => (PLANT_PRIORITY[a.job] ?? 2) - (PLANT_PRIORITY[b.job] ?? 2))[0]
        R.bomb.carrier = planter
        walk += rnd(R, P.flow).range(1, 3)
    }
    let plantStart = R.t + walk
    if (plantStart > LATEST_PLANT_START) return lateRound(R, lurker)
    // Rotators arriving before the bomb is down fight the Ts holding the site.
    const early = hit.defQ.filter(([a, at]) => a.alive && at < plantStart + PLANT_TIME)
    if (early.length) {
        hit.defQ = hit.defQ.filter(x => !early.includes(x))
        R.t = max(R.t, min(...early.map(([, at]) => at)))
        const contest: Fight = {
            att: [], def: onSite, attQ: early, defQ: [], zone: S.id, entryZone: S.id, tEnd: LATEST_PLANT_START,
            step: [1, 2.5], attTrade: T.TRADE_HOLD, defTrade: T.TRADE_HOLD, holdCut: 0, maxDuels: 99,
            attPts: () => (planter && planter.alive ? 1.5 : 0), tag: "contest",
        }
        const r = fight(R, contest)
        done = elim()
        if (done) return done
        if (r === "def" && !countAlive(onSite)) return lurkerHunt(R, lurker)
        if (!planter.alive) {
            const next = living(onSite)
            if (!next.length) return lurkerHunt(R, lurker)
            planter = next[0]
            R.bomb.carrier = planter
        }
        plantStart = max(plantStart, R.t + rnd(R, P.flow).range(1, 2.5))
        if (plantStart > LATEST_PLANT_START) return lateRound(R, lurker)
    }
    R.t = plantStart + PLANT_TIME
    R.bomb.planted = true
    R.bomb.plantT = R.t
    R.bomb.planter = planter
    R.events.push({ type: "PLANT", time: r1(R.t), side: "t", playerId: planter.id, site: S.id, location: S.callout, zone: S.id, details: "Bomb has been planted" })

    // ── 6. Post-plant / retake ──
    // The far anchor who stayed joins the retake with everyone else still alive.
    return retake(R, plan, lurker, hit.defQ)
}

function earlyFights(R: Round, plan: PlanState, aggressor: Actor | null): void {
    const ts = R.T, cts = R.CT
    const fights: { t: number; run: () => void }[] = []
    const st = plan.strategy
    const z = R.z
    // Mid control.
    const pMid = st === "rush" ? 0.08 : st === "execute" ? 0.25 : st === "eco" ? (plan.ecoRush ? 0.05 : 0.4) : 0.5
    const midCT = cts.find(a => a.post === "mid" && a !== aggressor)
    if (midCT && rnd(R, P.early).bool(pMid)) {
        const t = z.midTime + rnd(R, P.early).range(2, 10)
        fights.push({
            t, run: () => {
                // The bomb carrier stays with the pack.
                const pool = living(ts).filter(a => a.job !== "lurk" && a.job !== "fake" && a !== R.bomb.carrier)
                const taker = (rnd(R, P.early).bool(0.35) ? pool.find(a => a.job === "entry") : undefined) ?? pool[rnd(R, P.early).int(0, max(0, pool.length - 1))]
                const mate = living(ts).find(a => a !== taker && (a.job === "support" || a.job === "pack" || a.job === "igl"))
                if (!taker || !midCT.alive) return
                const awpTake = taker.job === "awp"
                pick(R, awpTake ? [midCT] : [taker, ...(mate ? [mate] : [])], awpTake ? [taker] : [midCT], midCT.zone || "mid", awpTake ? T.TRADE_PICK * 0.5 : T.TRADE_PICK, 0.25)
            },
        })
    }
    // The T AWPer holds a long angle for an opening pick.
    const tAwp = ts.find(a => isSniperClass(a.wc))
    const pAwp = st === "default" ? 0.55 : st === "split" || st === "fake" ? 0.4 : st === "execute" ? 0.2 : 0
    if (tAwp && rnd(R, P.early).bool(pAwp)) {
        fights.push({
            t: rnd(R, P.early).range(14, 34), run: () => {
                const peeker = living(cts).find(a => a.post !== "mid" && !isSniperClass(a.wc)) ?? living(cts)[0]
                if (!peeker || !tAwp.alive) return
                pick(R, [peeker], [tAwp], tAwp.zone || R.S.alt.id, 0.2, T.TRADE_PICK * 0.6)
            },
        })
    }
    // An aggressive CT push up a T route.
    if (aggressor && rnd(R, P.early).bool(plan.setup === "aggressive" ? 0.85 : 1)) {
        const into = rnd(R, P.early).bool(0.5) ? R.S : R.O
        const t = min(into.main.contactTime - 2, rnd(R, P.early).range(10, 20))
        fights.push({
            t, run: () => {
                if (!aggressor.alive) return
                const tsThere = living(ts).filter(a => into === R.S ? a.job !== "lurk" && a.job !== "fake" : a.job === "lurk" || a.job === "fake")
                if (!tsThere.length || rnd(R, P.early).bool(into === R.S && st === "rush" ? 0.1 : 0.35)) {
                    // Info without a fight: the CTs read the plan.
                    if (into === R.S && plan.read === "none" && rnd(R, P.early).bool(0.5)) plan.read = "right"
                    return
                }
                const first = tsThere.find(a => a.job === "entry") ?? tsThere[0]
                const back = tsThere.filter(a => a !== first).slice(0, 1)
                aggressor.zone = into.main.id
                // The pusher peeks with surprise; the first T is walking (no hold).
                first.fresh = true
                // The pusher picks off the first T and falls back: a trade is unlikely.
                pick(R, [aggressor], [first, ...back], into.main.id, 0.15, T.TRADE_PICK * 0.5, T.PUSH_SURPRISE + (aggressor.p.creativity - 50) * 0.05)
            },
        })
    }
    fights.sort((a, b) => a.t - b.t)
    for (const f of fights) {
        if (f.t >= plan.execAt - 3) break
        R.t = max(R.t, f.t)
        f.run()
        if (!countAlive(ts) || !countAlive(cts)) return
        // A carrier killed on the way: a teammate picks the bomb up, unless the CTs hold the drop.
        if (!R.bomb.carrier && !R.bomb.lost) {
            if (rnd(R, P.early).bool(0.15)) R.bomb.lost = true
            else R.bomb.carrier = living(ts).filter(a => a.job !== "lurk" && a.job !== "fake").sort((a, b) => (PLANT_PRIORITY[a.job] ?? 2) - (PLANT_PRIORITY[b.job] ?? 2))[0] ?? null
        }
    }
}

/** A single opening fight (+ trades) between a peeker group and a holder group. */
function pick(R: Round, peekers: Actor[], holders: Actor[], zone: string, attTrade: number, defTrade: number, attBonus = 0): void {
    const F: Fight = {
        att: peekers.filter(a => a.alive), def: holders.filter(a => a.alive), attQ: [], defQ: [], zone, entryZone: zone,
        tEnd: ROUND_TIME, step: [1, 2], attTrade, defTrade, holdCut: 0, maxDuels: 1, attPts: () => attBonus, tag: "pick",
    }
    fight(R, F)
    for (const a of [...peekers, ...holders]) a.fresh = false
}

/** The lurker catches the first rotator from behind. */
function lurkPick(R: Round, lurker: Actor, rotators: [Actor, number][], t: number): void {
    if (!rotators.length || !rnd(R, P.lurk).bool(0.45 + (lurker.p.creativity - 50) * 0.004)) return
    const entry = rotators.find(([a]) => a.alive && a.post !== "mid") ?? rotators.find(([a]) => a.alive)
    if (!entry) return
    const [victim] = entry
    const saved = R.t, firstKill = R.firstKill
    R.t = t + rnd(R, P.lurk).range(1, 4)
    // Caught leaving their post: the fight is where the rotator was holding.
    const z = victim.zone || (R.z.lurk[R.O.id]?.id ?? R.O.main.id)
    const F: Fight = {
        att: [victim], def: [lurker], attQ: [], defQ: [], zone: z, entryZone: z, tEnd: ROUND_TIME, step: [1, 2],
        attTrade: 0, defTrade: 0, holdCut: 0, maxDuels: 1, defPts: T.LURK + (lurker.p.creativity - 50) * T.LURK_CREATIVITY, tag: "lurk",
    }
    fight(R, F)
    // A rotator who wins still has the whole rotation ahead of them.
    if (victim.alive) entry[1] = max(entry[1], R.t + (victim.post === "mid" ? R.S.midTime : R.O.rotateTime))
    // Resolved out of order with the hit; its events carry their own times.
    // The hit's first duel is still the round's opening one unless this pick
    // comes first in time (finish() re-marks the opening kill by time).
    R.t = saved
    R.firstKill = firstKill
}

/** Hit failed or never happened: the lurker (if any) hunts the remaining CTs until time. */
function lurkerHunt(R: Round, lurker: Actor | null): RoundEnd {
    const ts = living(R.T)
    if (!ts.length) return { winnerCT: true, winType: "ELIMINATION", t: R.t }
    return lateRound(R, lurker)
}

/** Ts alive without a plant: a last attempt (hunt / late plant) or a save. */
function lateRound(R: Round, _lurker: Actor | null): RoundEnd {
    const ts = living(R.T)
    const cts = living(R.CT)
    if (!ts.length) return { winnerCT: true, winType: "ELIMINATION", t: R.t }
    if (!cts.length) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    if (givesUp(R, R.T, cts.length, plantUrgency(R), T.SAVE_T)) return tSave(R)
    R.t += rnd(R, P.late).range(3, 8)
    let tCount = ts.length
    const F: Fight = {
        att: ts, def: cts, attQ: [], defQ: [], zone: R.S.id, entryZone: ts[0].zone || R.S.id, tEnd: LATEST_PLANT_START - 1,
        step: [2, 5], attTrade: T.TRADE_HIT * 0.6, defTrade: T.TRADE_HOLD * 0.6, holdCut: 0, maxDuels: 99, tag: "late",
        stop: () => {
            const n = countAlive(R.T)
            if (n === tCount) return false
            tCount = n
            return givesUp(R, R.T, countAlive(R.CT), plantUrgency(R), T.SAVE_T)
        },
    }
    ts[0].fresh = false
    const res = fight(R, F)
    if (!countAlive(R.T)) return { winnerCT: true, winType: "ELIMINATION", t: R.t }
    if (!countAlive(R.CT)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    if (res === "stop") return tSave(R)
    // Out of time without a plant.
    return { winnerCT: true, winType: "TIME", t: ROUND_TIME }
}

function retake(R: Round, plan: PlanState, lurker: Actor | null, pending: [Actor, number][]): RoundEnd {
    const plantT = R.bomb.plantT
    const holders = living(R.T).filter(a => a !== lurker)
    // Everyone not yet at the site comes: pending rotators, the stayed anchor, survivors elsewhere.
    const arrivals: [Actor, number][] = pending.filter(([a]) => a.alive).map(([a, at]) => [a, max(at, plantT + 1)])
    const info = rnd(R, P.retake).range(1, 3)
    for (const c of living(R.CT)) {
        if (arrivals.some(([a]) => a === c)) continue
        const at = c.post === "mid" ? plantT + info + R.S.midTime : c.post === R.S.id ? plantT + rnd(R, P.retake).range(1, 4) : plantT + info + R.O.rotateTime
        arrivals.push([c, at])
    }
    arrivals.sort((a, b) => a[1] - b[1])
    // A lurker alive on the far side catches the first rotator.
    if (lurker?.alive && arrivals.length) lurkPick(R, lurker, arrivals.filter(([a]) => a.post !== R.S.id), plantT + info)
    if (lurker?.alive) holders.push(lurker)
    const kitTime = () => (living(R.CT).some(a => a.kit) ? 5 : 10)
    // Retakers stop swinging when a defuse could no longer finish (walk + defuse + margin).
    const deadline = () => plantT + BOMB_TIME - kitTime() - 3.5
    const ctN = () => countAlive(R.CT)
    const tN = () => countAlive(R.T)
    // Retake or save: outnumbered or out of time, the CTs keep their guns.
    const wantsSave = (): boolean => givesUp(R, R.CT, tN(), max(0, min(1, (T.SAVE_CLOCK_SECONDS - (deadline() - R.t)) / T.SAVE_CLOCK_SECONDS)), T.SAVE_RETAKE)
    if (!countAlive(R.CT)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    // Retakers group up a little, but the clock decides.
    let start = arrivals.length ? arrivals[min(arrivals.length - 1, 1)][1] : plantT + 3
    start = min(max(start, plantT + 2), deadline() - 10)
    R.t = max(R.t, start)
    if (tN() && wantsSave()) return ctSave(R)
    // The lurker's pick may have killed a rotator on the way: only the living arrive.
    const present = arrivals.filter(([a, at]) => a.alive && at <= R.t).map(([a]) => a)
    const later = arrivals.filter(([a, at]) => a.alive && at > R.t)
    retakeUtility(R, present, holders, R.t)
    let lastCT = ctN()
    const F: Fight = {
        att: present, def: holders, attQ: later, defQ: [], zone: R.S.id, entryZone: R.S.retake ?? R.S.id,
        tEnd: deadline(), end: deadline, step: [1.2, 3], attTrade: T.TRADE_HOLD, defTrade: T.TRADE_HOLD, holdCut: 0, maxDuels: 99,
        attPts: () => (R.t > deadline() - 8 ? -T.RUSHED : 0), tag: "retake",
        stop: () => {
            // The kit holder may have died: the deadline moves with the defuse time.
            if (R.t > deadline()) return true
            const c = ctN()
            if (c < lastCT) { lastCT = c; return wantsSave() }
            return false
        },
    }
    const res = fight(R, F)
    if (!countAlive(R.CT)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    if (!countAlive(R.T)) {
        // Defuse if the clock allows.
        const cts = living(R.CT)
        const defuser = cts.find(a => a.kit) ?? cts[0]
        const dur = defuser.kit ? 5 : 10
        // From the last T's death (the fight clock may have run on past it).
        const lastDeath = max(...R.T.map(a => a.deathT))
        const startDefuse = lastDeath + rnd(R, P.retake).range(0.8, 2.5)
        if (startDefuse + dur <= plantT + BOMB_TIME - 0.1) {
            R.t = startDefuse + dur
            R.events.push({ type: "DEFUSE", time: r1(R.t), side: "ct", playerId: defuser.id, site: R.S.id, zone: R.S.id, location: R.S.callout, details: "Bomb has been defused" })
            return { winnerCT: true, winType: "BOMB_DEFUSE", t: R.t }
        }
        return explode(R)
    }
    if (res === "stop" || res === "time") return ctSave(R)
    return explode(R)
}

function explode(R: Round): RoundEnd {
    R.t = R.bomb.plantT + BOMB_TIME
    R.events.push({ type: "EXPLODE", time: r1(R.t), side: "t", site: R.S.id, zone: R.S.id, details: "Bomb has exploded" })
    if (!countAlive(R.CT)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    return { winnerCT: false, winType: "BOMB_EXPLODED", t: R.t }
}

function save(R: Round, who: Actor[]): void {
    if (!who.length) return
    R.events.push({ type: "SAVE", time: r1(R.t), side: who[0].ct ? "ct" : "t", details: `${who.map(a => a.nick).join(", ")} saving` })
}

// ─── Saves and exit kills ──────────────────────────────────────────────────

/**
 * Does a side that is losing the round give it up? An outnumbered side keeps
 * its guns for the next round instead of taking fights it rarely wins: the
 * more players down and the fewer left, the likelier (a lone player against
 * two, a pair against four). The clock (`urgency` 0..1, 1 = cannot win in
 * time) makes it likelier still. `scale` < 1 while there is time to play
 * (Ts before a plant, early in the round); a side with nothing worth keeping
 * saves less.
 */
function givesUp(R: Round, side: readonly Actor[], foes: number, urgency: number, scale: number): boolean {
    const mine = countAlive(side)
    if (!mine || !foes) return false
    const down = foes - mine
    let p = down > 0 ? max(0, T.SAVE_BASE + T.SAVE_PER_DOWN * down - T.SAVE_PER_LEFT * (mine - 1)) * scale : 0
    if (mine <= foes) p = max(p, urgency * T.SAVE_CLOCK)
    if (!side.some(a => a.alive && isSaveWorthy(a.wc))) p *= T.SAVE_CHEAP
    // Keyed by the situation (common random numbers): the same spot gets the same call in a paired run.
    return p > 0 && keyedRoll(R, 5, (side[0]?.ct ? 64 : 0) + mine * 8 + foes) < min(0.95, p)
}

/** How much the clock is against Ts who have not planted (0 = time to play, 1 = no time to plant). */
function plantUrgency(R: Round): number {
    return max(0, min(1, (T.SAVE_CLOCK_SECONDS - (LATEST_PLANT_START - R.t)) / T.SAVE_CLOCK_SECONDS))
}

/**
 * Savers run for it; the winners may catch one on the way out (exit kills).
 * Only while two or more hunters are alive, so a saver who wins the duel
 * never wipes the side that has already won the round.
 */
function exitHunt(R: Round, savers: readonly Actor[], hunters: readonly Actor[], until: number, chance: number, zone: string): void {
    const t0 = R.t
    let t = t0
    for (const s of savers) {
        const hs = living(hunters)
        const room = until - t0 - 2
        if (hs.length < 2 || !s.alive || room < 3) continue
        if (keyedRoll(R, 6, s.i) >= chance * min(1, room / T.EXIT_ROOM)) continue
        R.t = t0 + 2 + keyedRoll(R, 7, s.i) * (min(room, 14) - 2)
        // Caught near where they were last seen.
        duel(R, hs[min(hs.length - 1, floor(keyedRoll(R, 8, s.i) * hs.length))], s, T.EXIT_EDGE, 0, s.zone || zone)
        t = max(t, R.t)
    }
    R.t = t
}

/** Ts give the round up before a plant: they save, CTs may hunt them; the CTs win on time (or by elimination). */
function tSave(R: Round): RoundEnd {
    const savers = living(R.T)
    save(R, savers)
    exitHunt(R, savers, R.CT, ROUND_TIME, T.EXIT_HUNT_CT, R.S.main.id)
    if (!countAlive(R.T)) return { winnerCT: true, winType: "ELIMINATION", t: R.t }
    return { winnerCT: true, winType: "TIME", t: ROUND_TIME }
}

/** CTs give a planted bomb up: they save, Ts may hunt them; the bomb explodes (or the CTs are wiped). */
function ctSave(R: Round): RoundEnd {
    const savers = living(R.CT)
    save(R, savers)
    exitHunt(R, savers, R.T, R.bomb.plantT + BOMB_TIME, T.EXIT_HUNT_T, R.S.retake ?? R.S.id)
    if (!countAlive(R.CT)) return { winnerCT: false, winType: "ELIMINATION", t: R.t }
    return explode(R)
}

// ─── Output ────────────────────────────────────────────────────────────────

/**
 * Lurk picks are resolved apart from the hit, so kills are not pushed in time
 * order. With the events sorted, re-mark the opening kill and trades, and find
 * each side's first 1vX, from the kills as they happened. Returns the 1vX
 * players and their opponent counts: [T, vs, CT, vs].
 */
function killsInTimeOrder(R: Round): [Actor | null, number, Actor | null, number] {
    const byId = new Map(R.all.map(a => [a.id, a]))
    const dead = new Set<Actor>()
    const lastKill = new Map<string, number>()
    const clutch: [Actor | null, number, Actor | null, number] = [null, 0, null, 0]
    let first = true
    for (const e of R.events) {
        if (e.type !== "KILL") continue
        if (first) e.isOpening = true
        else delete e.isOpening
        first = false
        if (e.time - (lastKill.get(e.victimId!) ?? -99) <= 5) e.isTrade = true
        else delete e.isTrade
        lastKill.set(e.playerId!, e.time)
        const v = byId.get(e.victimId!)
        if (v) dead.add(v)
        const tAlive = R.T.filter(a => !dead.has(a)), ctAlive = R.CT.filter(a => !dead.has(a))
        if (!clutch[0] && tAlive.length === 1 && ctAlive.length >= 1) { clutch[0] = tAlive[0]; clutch[1] = ctAlive.length }
        if (!clutch[2] && ctAlive.length === 1 && tAlive.length >= 1) { clutch[2] = ctAlive[0]; clutch[3] = tAlive.length }
    }
    return clutch
}

function finish(R: Round, input: SimInput, plan: PlanState, end: RoundEnd): SimOutput {
    const homeWon = end.winnerCT === input.homeIsCT
    R.events.sort((a, b) => a.time - b.time)
    const endT = max(end.t, R.events.length ? R.events[R.events.length - 1].time : 0)
    // CLUTCH: the winners' last player won a 1vX.
    const [tc, tvs, cc, cvs] = killsInTimeOrder(R)
    const clutcher = end.winnerCT ? cc : tc
    const vs = end.winnerCT ? cvs : tvs
    if (clutcher && clutcher.alive) R.events.push({ type: "CLUTCH", time: r1(endT), playerId: clutcher.id, details: `1v${vs}` })
    const display = end.winType === "TIME" ? "TIME" : end.winType.replace("_", " ")
    R.events.push({ type: "ROUND_END", time: r1(endT + 2), details: `Round won via ${display}` })

    const kills: SimOutput["kills"] = []
    const deaths: SimOutput["deaths"] = []
    const byKiller = new Map<string, { playerId: string; kills: number; weapon: string }>()
    for (const e of R.events) {
        if (e.type !== "KILL") continue
        const k = byKiller.get(e.playerId!)
        if (k) k.kills++
        else { const entry = { playerId: e.playerId!, kills: 1, weapon: e.weapon ?? "" }; byKiller.set(e.playerId!, entry); kills.push(entry) }
        deaths.push({ playerId: e.victimId!, deaths: 1 })
    }
    const damage: Record<string, number> = {}
    const utilityUsed: Record<string, string[]> = {}
    for (const a of R.all) {
        if (a.dealt > 0) damage[a.id] = a.dealt
        if (a.used.length) utilityUsed[a.id] = a.used
    }
    return {
        winner: homeWon ? "HOME" : "AWAY",
        winType: end.winType,
        kills, deaths, events: R.events,
        plan: { tStrategy: plan.strategy, site: plan.site, ctSetup: plan.setup, read: plan.read, execAt: r1(plan.execAt) },
        damage,
        utility: R.utility.sort((a, b) => a.t - b.t),
        utilityUsed,
    }
}
