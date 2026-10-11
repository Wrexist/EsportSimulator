/**
 * Radar scene: what the canvas radar draws at one moment.
 *
 * `prepareRadarScript` indexes a round script once per round (players, sorted
 * deaths and grenades, bomb timeline, HP from the round's record via the
 * shared `roundHp` model so the roster shows the same numbers, weapon
 * classes). `sampleRadarScene` then fills a reusable `RadarScene` for
 * any time `t` without allocating (pools only grow), so the canvas can call it
 * on every animation frame. `sceneFromSnapshot` fills the same scene from the
 * snapshot props (physical replay rehearsal, tests).
 *
 * Coordinates stay in radar percent space; the renderer projects them.
 */

import type { Floor, RoundScript, Side, SiteId, TrackKey, UtilityKind } from "@/engine/match/round-script-types"
import { sampleTrack } from "@/engine/match/round-script"
import type { MatchEvent, RoundResult } from "@/types/match"
import type { RadarBombState, RadarKillLine, RadarPlayerDot, RadarScriptPlayerInfo, RadarSmoke } from "./radar-types"
import { PLANT_SECONDS, POP_SECONDS, TRACER_SECONDS, type BombPhase } from "./radar-script-frame"
import { hpAt, roundHp, type HpStep } from "./round-hp"

export { TRACER_SECONDS, PLANT_SECONDS, POP_SECONDS, type BombPhase }

/** Seconds of movement shown behind each player. */
export const TRAIL_SECONDS = 1.5
/** Seconds a damage-only hit stays visible. */
export const HIT_SECONDS = 0.8
/** Seconds from plant to explosion. */
export const BOMB_TIMER_SECONDS = 40
const SMOKE_FADE_IN = 0.6
const SMOKE_FADE_OUT = 1.5
/** Longest grenade flight the sampler looks ahead for. */
const MAX_FLIGHT = 1.8
const MAX_TRAIL_POINTS = 24

// ─── Weapons ───────────────────────────────────────────────────────────────

export type WeaponClass = "sniper" | "rifle" | "pistol" | "smg" | "shotgun"

const WEAPON_CLASS: Record<string, WeaponClass> = {
    ak47: "rifle", m4a1s: "rifle", m4a1silencer: "rifle", m4a4: "rifle", m4a1: "rifle", famas: "rifle", galilar: "rifle", galil: "rifle", aug: "rifle", sg553: "rifle", sg556: "rifle",
    awp: "sniper", ssg08: "sniper", scout: "sniper", scar20: "sniper", g3sg1: "sniper",
    usp: "pistol", usps: "pistol", glock: "pistol", glock18: "pistol", p250: "pistol", deagle: "pistol", fiveseven: "pistol", dualies: "pistol", elite: "pistol", tec9: "pistol", cz75: "pistol", cz75a: "pistol", r8: "pistol", p2000: "pistol", hkp2000: "pistol", revolver: "pistol",
    mac10: "smg", mp9: "smg", mp7: "smg", mp5: "smg", mp5sd: "smg", p90: "smg", ump45: "smg", ump: "smg", bizon: "smg", ppbizon: "smg",
    xm1014: "shotgun", mag7: "shotgun", nova: "shotgun", sawedoff: "shotgun", negev: "rifle", m249: "rifle",
}

/** Weapon class for the glyph; grenades, knives and unknown ids give null. */
export function weaponClassOf(weapon: string | undefined | null): WeaponClass | null {
    const id = (weapon ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    return WEAPON_CLASS[id] ?? null
}

// ─── Prepared script ───────────────────────────────────────────────────────

export interface PreparedPlayer {
    id: string
    side: Side
    name: string
    track: readonly TrackKey[]
    /** Death time (Infinity if the player survives). */
    deathT: number
    weapon: WeaponClass | null
    hasKit: boolean
    /** HP after each change (lib/round-hp), ending with 0 at the death; empty = 100 all round. */
    hp: readonly HpStep[]
    /** Times of the player's non-lethal hits, ascending (hit flash on the ring). */
    hitTimes: readonly number[]
}

export interface PreparedDeath {
    t: number
    victim: number
    killer: number
    victimSide: Side
    killerSide: Side
    ax: number; ay: number; afloor: Floor
    fx: number; fy: number; ffloor: Floor
    headshot: boolean
    weapon?: string
}

export interface PreparedUtility {
    /** Land / pop time. */
    t: number
    kind: UtilityKind
    side: Side
    thrower: number
    x: number; y: number; floor: Floor
    radius: number
    duration: number
    /** Where it was thrown from and how long it flew. */
    fromX: number; fromY: number; fromFloor: Floor
    flight: number
}

/** A damage-only hit (chip): from the dying duel loser, or from where a grenade landed. */
export interface PreparedHit {
    t: number
    player: number
    side: Side
    fromX: number; fromY: number; fromFloor: Floor
}

export interface PreparedRadarScript {
    script: RoundScript
    players: PreparedPlayer[]
    index: ReadonlyMap<string, number>
    deaths: PreparedDeath[]
    utility: PreparedUtility[]
    hits: PreparedHit[]
    /** The round has HP data (script-v1); false = no HP ring (legacy-v2). */
    hpKnown: boolean
    /** Every hit was recorded (exact HP); false = survivors' chip estimated or unknown. */
    hpExact: boolean
    carriers: { t: number; carrier: number; x: number; y: number; floor: Floor; hasAt: boolean }[]
    plant?: { t: number; site: SiteId; x: number; y: number; floor: Floor; planter: number }
    defuse?: { tStart: number; tEnd: number; defuser: number; success: boolean }
    explodeAt?: number
    endTime: number
}

export interface PrepareRadarOptions {
    /** The round's resolver events (KILL damage / chip → HP, kill weapons). */
    events?: readonly MatchEvent[]
    /** The recorded round: grenade hits and damage totals (HP); else HP from `events` only. */
    round?: Pick<RoundResult, "damage" | "utility"> | null
    /** Recorded loadouts (weapon, kit) of the round. */
    economy?: RoundResult["playerEconomy"]
    /** Names and optional weapon / kit by player id. */
    players?: Readonly<Record<string, RadarScriptPlayerInfo>>
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

/** Indexes a round script for per-frame sampling. Pure; call once per round. */
export function prepareRadarScript(script: RoundScript, opts: PrepareRadarOptions = {}): PreparedRadarScript {
    const ids = Object.keys(script.tracks).filter(id => script.tracks[id]?.length)
    const index = new Map<string, number>()
    ids.forEach((id, i) => index.set(id, i))
    const deathT = new Map<string, number>()
    for (const d of script.deaths) deathT.set(d.victimId, d.t)

    const economy = new Map((opts.economy ?? []).map(e => [e.playerId, e]))
    const killWeapon = new Map<string, string>()
    for (const e of opts.events ?? []) {
        if (e.type !== "KILL") continue
        if (e.playerId && e.weapon && weaponClassOf(e.weapon) && !killWeapon.has(e.playerId)) killWeapon.set(e.playerId, e.weapon)
    }
    // HP: the shared model (roster and radar agree); the script's sides are the lineups.
    const hp = roundHp({
        round: { events: opts.events ? [...opts.events] : undefined, damage: opts.round?.damage, utility: opts.round?.utility },
        homeIds: ids.filter(id => script.sides[id] === "CT"),
        awayIds: ids.filter(id => script.sides[id] !== "CT"),
    })
    const hitTimes = new Map<string, number[]>()
    for (const h of hp.hits) {
        const list = hitTimes.get(h.victimId)
        if (list) list.push(h.t)
        else hitTimes.set(h.victimId, [h.t])
    }

    const players: PreparedPlayer[] = ids.map(id => {
        const info = opts.players?.[id]
        const side = script.sides[id] ?? "T"
        const weapon = weaponClassOf(info?.weapon) ?? weaponClassOf(economy.get(id)?.weapon) ?? weaponClassOf(killWeapon.get(id))
        return {
            id, side, name: info?.name || id, track: script.tracks[id], deathT: deathT.get(id) ?? Infinity,
            weapon, hasKit: side === "CT" && !!(info?.hasKit ?? economy.get(id)?.hasKit),
            hp: hp.steps[id] ?? [], hitTimes: hitTimes.get(id) ?? [],
        }
    })

    const deaths: PreparedDeath[] = [...script.deaths].sort((a, b) => a.t - b.t).map(d => ({
        t: d.t,
        victim: index.get(d.victimId) ?? -1,
        killer: index.get(d.killerId) ?? -1,
        victimSide: script.sides[d.victimId] ?? "T",
        killerSide: script.sides[d.killerId] ?? "CT",
        ax: d.at.x, ay: d.at.y, afloor: d.at.floor,
        fx: d.from.x, fy: d.from.y, ffloor: d.from.floor,
        headshot: !!d.headshot,
        ...(d.weapon ? { weapon: d.weapon } : {}),
    }))

    const utility: PreparedUtility[] = [...script.utility].sort((a, b) => a.t - b.t).map(u => {
        const thrower = index.get(u.throwerId) ?? -1
        const track = thrower >= 0 ? players[thrower].track : undefined
        let from = track ? sampleTrack(track, u.t - 1) : { x: u.at.x, y: u.at.y, floor: u.at.floor }
        // ~18 map-% per second, 0.5–1.8 s.
        const flight = Math.max(0.5, Math.min(MAX_FLIGHT, dist(from.x, from.y, u.at.x, u.at.y) / 18))
        if (track) from = sampleTrack(track, u.t - flight)
        return {
            t: u.t, kind: u.kind, side: script.sides[u.throwerId] ?? "T", thrower,
            x: u.at.x, y: u.at.y, floor: u.at.floor, radius: u.radius, duration: u.duration,
            fromX: from.x, fromY: from.y, fromFloor: from.floor, flight,
        }
    })

    // Hit lines: a duel chip comes from the loser where they died, a grenade
    // from where it landed. Estimated chip without a duel has no line.
    const hits: PreparedHit[] = []
    for (const h of hp.hits) {
        const player = index.get(h.victimId)
        const attacker = h.attackerId !== undefined ? index.get(h.attackerId) : undefined
        if (player === undefined || attacker === undefined) continue
        if (h.source === "duel") {
            const d = deaths.find(x => x.victim === attacker && Math.abs(x.t - h.t) < 0.05)
            if (d) hits.push({ t: h.t, player, side: d.victimSide, fromX: d.ax, fromY: d.ay, fromFloor: d.afloor })
        } else {
            const u = utility.find(x => x.thrower === attacker && (x.kind === "he" || x.kind === "molotov") && Math.abs(x.t - h.t) < 0.05)
            if (u) hits.push({ t: h.t, player, side: u.side, fromX: u.x, fromY: u.y, fromFloor: u.floor })
        }
    }
    hits.sort((a, b) => a.t - b.t)

    const { bomb } = script
    const carriers = bomb.carrier.map(c => ({
        t: c.t,
        carrier: c.carrierId ? index.get(c.carrierId) ?? -1 : -1,
        x: c.at?.x ?? 0, y: c.at?.y ?? 0, floor: c.at?.floor ?? "upper" as Floor, hasAt: !!c.at,
    }))

    return {
        script, players, index, deaths, utility, hits, hpKnown: hp.known, hpExact: hp.exact, carriers,
        ...(bomb.plant ? { plant: { t: bomb.plant.t, site: bomb.plant.site, x: bomb.plant.at.x, y: bomb.plant.at.y, floor: bomb.plant.at.floor, planter: index.get(bomb.plant.planterId) ?? -1 } } : {}),
        ...(bomb.defuse ? { defuse: { tStart: bomb.defuse.tStart, tEnd: bomb.defuse.tEnd, defuser: index.get(bomb.defuse.defuserId) ?? -1, success: bomb.defuse.success } } : {}),
        ...(bomb.explodeAt !== undefined ? { explodeAt: bomb.explodeAt } : {}),
        endTime: script.endTime,
    }
}

// ─── Scene ─────────────────────────────────────────────────────────────────

export interface ScenePlayer {
    id: string
    side: Side
    name: string
    weapon: WeaponClass | null
    hasKit: boolean
    x: number
    y: number
    floor: Floor
    aim: number
    alive: boolean
    /** 0–100, NaN when unknown. */
    hp: number
    /** Seconds since the last damage-only hit (Infinity = none). */
    hitAge: number
    hasBomb: boolean
    planting: boolean
    defusing: boolean
    /** Planting / defusing progress 0–1. */
    progress: number
    /** Trail points newest first: x0, y0, x1, y1, … (`trailN` points) and their ages in seconds. */
    trail: Float64Array
    trailAge: Float64Array
    trailN: number
}

export interface SceneDeath { victimId: string; x: number; y: number; floor: Floor; side: Side; age: number }
export interface SceneTracer { fx: number; fy: number; tx: number; ty: number; floor: Floor; side: Side; headshot: boolean; strength: number; age: number }
export interface SceneHit { fx: number; fy: number; tx: number; ty: number; floor: Floor; side: Side; strength: number }
export interface SceneUtility { kind: UtilityKind; x: number; y: number; floor: Floor; radius: number; side: Side | null; opacity: number; progress: number; remaining: number }
export interface SceneGrenade { kind: UtilityKind; fx: number; fy: number; tx: number; ty: number; k: number; floor: Floor; side: Side }

export interface SceneBomb {
    phase: BombPhase
    hasPos: boolean
    x: number
    y: number
    floor: Floor
    carrierId: string | null
    defuserId: string | null
    progress: number
    /** Seconds since planted / defused / exploded. */
    since: number
    /** Seconds until the explosion while planted (NaN otherwise). */
    remaining: number
    site: SiteId | null
}

export interface RadarScene {
    t: number
    endTime: number
    hpKnown: boolean
    players: ScenePlayer[]
    playerCount: number
    deaths: SceneDeath[]
    deathCount: number
    tracers: SceneTracer[]
    tracerCount: number
    hits: SceneHit[]
    hitCount: number
    utility: SceneUtility[]
    utilityCount: number
    grenades: SceneGrenade[]
    grenadeCount: number
    bomb: SceneBomb
}

const newPlayer = (): ScenePlayer => ({
    id: "", side: "T", name: "", weapon: null, hasKit: false, x: 0, y: 0, floor: "upper", aim: 0, alive: false,
    hp: NaN, hitAge: Infinity, hasBomb: false, planting: false, defusing: false, progress: 0,
    trail: new Float64Array(MAX_TRAIL_POINTS * 2), trailAge: new Float64Array(MAX_TRAIL_POINTS), trailN: 0,
})
const newDeath = (): SceneDeath => ({ victimId: "", x: 0, y: 0, floor: "upper", side: "T", age: 0 })
const newTracer = (): SceneTracer => ({ fx: 0, fy: 0, tx: 0, ty: 0, floor: "upper", side: "T", headshot: false, strength: 0, age: 0 })
const newHit = (): SceneHit => ({ fx: 0, fy: 0, tx: 0, ty: 0, floor: "upper", side: "T", strength: 0 })
const newUtility = (): SceneUtility => ({ kind: "smoke", x: 0, y: 0, floor: "upper", radius: 0, side: null, opacity: 0, progress: 0, remaining: 0 })
const newGrenade = (): SceneGrenade => ({ kind: "smoke", fx: 0, fy: 0, tx: 0, ty: 0, k: 0, floor: "upper", side: "T" })

function slot<T>(pool: T[], i: number, make: () => T): T {
    if (i >= pool.length) pool.push(make())
    return pool[i]
}

export function createRadarScene(): RadarScene {
    return {
        t: 0, endTime: 0, hpKnown: false,
        players: [], playerCount: 0, deaths: [], deathCount: 0, tracers: [], tracerCount: 0,
        hits: [], hitCount: 0, utility: [], utilityCount: 0, grenades: [], grenadeCount: 0,
        bomb: { phase: "none", hasPos: false, x: 0, y: 0, floor: "upper", carrierId: null, defuserId: null, progress: 0, since: 0, remaining: NaN, site: null },
    }
}

/** Same interpolation as `sampleTrack`, written into `out` (no allocation). */
function sampleTrackInto(track: readonly TrackKey[], t: number, out: ScenePlayer): number {
    const n = track.length
    const first = track[0], last = track[n - 1]
    if (t <= first.t) { out.x = first.x; out.y = first.y; out.floor = first.floor; out.aim = first.aim; return 0 }
    if (t >= last.t) { out.x = last.x; out.y = last.y; out.floor = last.floor; out.aim = last.aim; return n - 1 }
    let lo = 0, hi = n - 1
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (track[mid].t <= t) lo = mid
        else hi = mid
    }
    const a = track[lo], b = track[hi]
    const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1
    out.x = a.x + (b.x - a.x) * u
    out.y = a.y + (b.y - a.y) * u
    out.floor = u < 0.5 ? a.floor : b.floor
    out.aim = lerpAngle(a.aim, b.aim, u)
    return lo
}

function lerpAngle(a: number, b: number, u: number): number {
    const PI = Math.PI
    let d = (b - a) % (PI * 2)
    if (d > PI) d -= PI * 2
    if (d < -PI) d += PI * 2
    let r = a + d * u
    if (r > PI) r -= PI * 2
    if (r <= -PI) r += PI * 2
    return r
}

/** Newest-first trail over the last TRAIL_SECONDS on the player's current floor. */
function fillTrail(track: readonly TrackKey[], t: number, lo: number, p: ScenePlayer): void {
    const tail = t - TRAIL_SECONDS
    let n = 0
    p.trail[0] = p.x; p.trail[1] = p.y; p.trailAge[0] = 0; n = 1
    if (t <= track[0].t) { p.trailN = 0; return }
    let prevX = p.x, prevY = p.y, prevT = t
    for (let j = Math.min(lo, track.length - 1); j >= 0 && n < MAX_TRAIL_POINTS; j--) {
        const k = track[j]
        if (k.t > t) continue
        if (k.floor !== p.floor) break
        if (k.t <= tail) {
            // Interpolated tail point at exactly TRAIL_SECONDS.
            const span = prevT - k.t
            const u = span > 0 ? (prevT - tail) / span : 0
            p.trail[n * 2] = prevX + (k.x - prevX) * u
            p.trail[n * 2 + 1] = prevY + (k.y - prevY) * u
            p.trailAge[n] = TRAIL_SECONDS
            n++
            break
        }
        p.trail[n * 2] = k.x; p.trail[n * 2 + 1] = k.y; p.trailAge[n] = t - k.t
        prevX = k.x; prevY = k.y; prevT = k.t
        n++
    }
    p.trailN = n
}

/** Seconds since the latest hit at or before `t` (Infinity = none yet). */
function lastHitAge(times: readonly number[], t: number): number {
    let age = Infinity
    for (const h of times) {
        if (h > t) break
        age = t - h
    }
    return age
}

/** Fills `scene` with everything the radar shows at `t`. No allocation once the pools are warm. */
export function sampleRadarScene(prep: PreparedRadarScript, t: number, scene: RadarScene): RadarScene {
    scene.t = t
    scene.endTime = prep.endTime
    scene.hpKnown = prep.hpKnown
    const n = prep.players.length
    for (let i = 0; i < n; i++) {
        const p = prep.players[i]
        const s = slot(scene.players, i, newPlayer)
        s.id = p.id; s.side = p.side; s.name = p.name; s.weapon = p.weapon; s.hasKit = p.hasKit
        const lo = sampleTrackInto(p.track, t, s)
        s.alive = t < p.deathT
        s.hp = !prep.hpKnown ? NaN : !s.alive ? 0 : hpAt(p.hp, t)
        s.hitAge = lastHitAge(p.hitTimes, t)
        s.hasBomb = false; s.planting = false; s.defusing = false; s.progress = 0
        if (s.alive) fillTrail(p.track, t, lo, s)
        else s.trailN = 0
    }
    scene.playerCount = n

    let dc = 0, tc = 0
    for (const d of prep.deaths) {
        if (d.t > t) break
        const age = t - d.t
        const sd = slot(scene.deaths, dc++, newDeath)
        sd.victimId = d.victim >= 0 ? prep.players[d.victim].id : ""
        sd.x = d.ax; sd.y = d.ay; sd.floor = d.afloor; sd.side = d.victimSide; sd.age = age
        if (age <= TRACER_SECONDS) {
            const tr = slot(scene.tracers, tc++, newTracer)
            tr.fx = d.fx; tr.fy = d.fy; tr.tx = d.ax; tr.ty = d.ay; tr.floor = d.afloor
            tr.side = d.killerSide; tr.headshot = d.headshot; tr.age = age; tr.strength = 1 - age / TRACER_SECONDS
        }
    }
    scene.deathCount = dc
    scene.tracerCount = tc

    let hc = 0
    for (const h of prep.hits) {
        if (h.t > t) break
        const age = t - h.t
        if (age > HIT_SECONDS) continue
        const p = scene.players[h.player]
        const sh = slot(scene.hits, hc++, newHit)
        sh.fx = h.fromX; sh.fy = h.fromY; sh.tx = p.x; sh.ty = p.y; sh.floor = p.floor; sh.side = h.side; sh.strength = 1 - age / HIT_SECONDS
    }
    scene.hitCount = hc

    let uc = 0, gc = 0
    for (const u of prep.utility) {
        if (u.t - MAX_FLIGHT > t) break
        if (t < u.t) {
            const start = u.t - u.flight
            if (t < start) continue
            const g = slot(scene.grenades, gc++, newGrenade)
            g.kind = u.kind; g.fx = u.fromX; g.fy = u.fromY; g.tx = u.x; g.ty = u.y
            g.k = (t - start) / u.flight; g.floor = g.k < 0.5 ? u.fromFloor : u.floor; g.side = u.side
            continue
        }
        const pop = u.kind === "flash" || u.kind === "he"
        const life = pop ? POP_SECONDS : u.duration
        const age = t - u.t
        if (age > life) continue
        let opacity: number
        if (pop) opacity = 1 - age / life
        else if (age < SMOKE_FADE_IN) opacity = age / SMOKE_FADE_IN
        else if (age > life - SMOKE_FADE_OUT) opacity = Math.max(0, (life - age) / SMOKE_FADE_OUT)
        else opacity = 1
        const su = slot(scene.utility, uc++, newUtility)
        su.kind = u.kind; su.x = u.x; su.y = u.y; su.floor = u.floor; su.radius = u.radius; su.side = u.side
        su.opacity = opacity; su.progress = age / life; su.remaining = life - age
    }
    scene.utilityCount = uc
    scene.grenadeCount = gc

    sampleBomb(prep, t, scene)
    return scene
}

function sampleBomb(prep: PreparedRadarScript, t: number, scene: RadarScene): void {
    const b = scene.bomb
    b.phase = "none"; b.hasPos = false; b.carrierId = null; b.defuserId = null; b.progress = 0; b.since = 0; b.remaining = NaN; b.site = null
    const { plant, defuse, explodeAt } = prep
    const id = (i: number) => (i >= 0 ? prep.players[i].id : null)
    if (plant && t >= plant.t) {
        b.hasPos = true; b.x = plant.x; b.y = plant.y; b.floor = plant.floor; b.site = plant.site
        b.remaining = Math.max(0, plant.t + BOMB_TIMER_SECONDS - t)
        if (explodeAt !== undefined && t >= explodeAt) {
            b.phase = "exploded"; b.since = t - explodeAt; b.remaining = 0
        } else if (defuse && t >= defuse.tStart && t < defuse.tEnd) {
            b.phase = "defusing"; b.defuserId = id(defuse.defuser)
            b.progress = (t - defuse.tStart) / Math.max(0.001, defuse.tEnd - defuse.tStart)
            b.since = t - plant.t
            if (defuse.defuser >= 0) { const p = scene.players[defuse.defuser]; if (p.alive) { p.defusing = true; p.progress = b.progress } }
        } else if (defuse && t >= defuse.tEnd && defuse.success) {
            b.phase = "defused"; b.defuserId = id(defuse.defuser); b.since = t - defuse.tEnd; b.remaining = NaN
        } else {
            b.phase = "planted"; b.since = t - plant.t
        }
        return
    }
    if (plant && t >= plant.t - PLANT_SECONDS && (plant.planter < 0 || prep.players[plant.planter].deathT > t)) {
        b.phase = "planting"; b.hasPos = true; b.x = plant.x; b.y = plant.y; b.floor = plant.floor; b.site = plant.site
        b.carrierId = id(plant.planter); b.progress = (t - (plant.t - PLANT_SECONDS)) / PLANT_SECONDS
        if (plant.planter >= 0) { const p = scene.players[plant.planter]; if (p.alive) { p.hasBomb = true; p.planting = true; p.progress = b.progress } }
        return
    }
    let entry = -1
    for (let i = 0; i < prep.carriers.length; i++) {
        if (prep.carriers[i].t > t) break
        entry = i
    }
    if (entry < 0) return
    const c = prep.carriers[entry]
    if (c.carrier >= 0) {
        b.phase = "carried"; b.carrierId = id(c.carrier)
        const p = scene.players[c.carrier]
        if (p.alive) p.hasBomb = true
    } else if (c.hasAt) {
        b.phase = "dropped"; b.hasPos = true; b.x = c.x; b.y = c.y; b.floor = c.floor
    }
}

/** Living players per side in a sampled scene. */
export function sceneAliveCounts(scene: RadarScene): Record<Side, number> {
    const out: Record<Side, number> = { CT: 0, T: 0 }
    for (let i = 0; i < scene.playerCount; i++) if (scene.players[i].alive) out[scene.players[i].side]++
    return out
}

// ─── Snapshot mode ─────────────────────────────────────────────────────────

export interface SnapshotInput {
    t: number
    dots?: readonly RadarPlayerDot[]
    /** Snapshot one tick ahead; living dots glide toward it by `alpha`. */
    nextDots?: readonly RadarPlayerDot[]
    alpha?: number
    killLines?: readonly RadarKillLine[]
    smokes?: readonly RadarSmoke[]
    bomb?: RadarBombState
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const clamp100 = (v: number) => Math.max(0, Math.min(100, v))
/** Seconds a snapshot kill line stays visible. */
const SNAPSHOT_LINE_SECONDS = 2

/** Fills `scene` from precomputed snapshot props (no script). */
export function sceneFromSnapshot(input: SnapshotInput, scene: RadarScene): RadarScene {
    const t = input.t
    scene.t = t
    scene.endTime = t
    const dots = input.dots ?? []
    const alpha = Math.max(0, Math.min(1, input.alpha ?? 0))
    const next = alpha > 0 && input.nextDots?.length ? input.nextDots : undefined
    let pc = 0, dc = 0, hpKnown = false
    for (const dot of dots) {
        if (!finite(dot.x) || !finite(dot.y)) continue
        const floor: Floor = dot.level ?? "upper"
        if (!dot.isAlive) {
            if (dot.deathTime === undefined || t < dot.deathTime) continue
            const sd = slot(scene.deaths, dc++, newDeath)
            sd.victimId = dot.playerId; sd.x = clamp100(dot.x); sd.y = clamp100(dot.y); sd.floor = floor
            sd.side = dot.side === "ct" ? "CT" : "T"; sd.age = t - dot.deathTime
            continue
        }
        const s = slot(scene.players, pc++, newPlayer)
        s.id = dot.playerId; s.side = dot.side === "ct" ? "CT" : "T"; s.name = dot.nickname || dot.playerId
        s.weapon = weaponClassOf(dot.weapon); s.hasKit = !!dot.hasKit && s.side === "CT"
        s.x = clamp100(dot.x); s.y = clamp100(dot.y); s.floor = floor; s.aim = finite(dot.angle) ? dot.angle : 0
        const to = next?.find(d => d.playerId === dot.playerId)
        if (to && to.isAlive && (to.level ?? "upper") === floor && finite(to.x) && finite(to.y)) {
            s.x = clamp100(s.x + (to.x - s.x) * alpha); s.y = clamp100(s.y + (to.y - s.y) * alpha)
            if (finite(to.angle)) s.aim = lerpAngle(s.aim, to.angle, alpha)
        }
        s.alive = true
        s.hp = finite(dot.hp) ? dot.hp : NaN
        if (finite(dot.hp)) hpKnown = true
        s.hitAge = Infinity; s.hasBomb = !!dot.hasBomb; s.planting = false; s.defusing = false; s.progress = 0; s.trailN = 0
    }
    scene.playerCount = pc
    scene.deathCount = dc
    scene.hpKnown = hpKnown

    let tc = 0
    for (const line of input.killLines ?? []) {
        if (!finite(line.fromX) || !finite(line.fromY) || !finite(line.toX) || !finite(line.toY) || !finite(line.time)) continue
        const age = t - line.time
        if (age < 0 || age > SNAPSHOT_LINE_SECONDS) continue
        const tr = slot(scene.tracers, tc++, newTracer)
        tr.fx = clamp100(line.fromX); tr.fy = clamp100(line.fromY); tr.tx = clamp100(line.toX); tr.ty = clamp100(line.toY)
        tr.floor = line.level ?? "upper"; tr.side = "T"; tr.headshot = line.isHeadshot; tr.age = age; tr.strength = 1 - age / SNAPSHOT_LINE_SECONDS
        // Shooter side: the living dot nearest the line's start.
        let best = Infinity
        for (let i = 0; i < pc; i++) {
            const p = scene.players[i]
            const d = dist(p.x, p.y, tr.fx, tr.fy)
            if (d < best) { best = d; tr.side = p.side }
        }
    }
    scene.tracerCount = tc
    scene.hitCount = 0
    scene.grenadeCount = 0

    let uc = 0
    for (const smoke of input.smokes ?? []) {
        if (!finite(smoke.x) || !finite(smoke.y) || !finite(smoke.radius) || !finite(smoke.startTime) || !finite(smoke.endTime)) continue
        if (t < smoke.startTime || t > smoke.endTime + SMOKE_FADE_OUT) continue
        const age = t - smoke.startTime
        const life = smoke.endTime - smoke.startTime + SMOKE_FADE_OUT
        const su = slot(scene.utility, uc++, newUtility)
        su.kind = "smoke"; su.x = clamp100(smoke.x); su.y = clamp100(smoke.y); su.floor = smoke.level ?? "upper"
        su.radius = Math.max(0, smoke.radius); su.side = null
        su.opacity = age < SMOKE_FADE_IN ? age / SMOKE_FADE_IN : t > smoke.endTime ? Math.max(0, 1 - (t - smoke.endTime) / SMOKE_FADE_OUT) : 1
        su.progress = life > 0 ? age / life : 1; su.remaining = Math.max(0, life - age)
    }
    scene.utilityCount = uc

    const b = scene.bomb
    const bs = input.bomb
    b.phase = "none"; b.hasPos = false; b.carrierId = null; b.defuserId = null; b.progress = 0; b.since = 0; b.remaining = NaN; b.site = null
    if (bs?.planted && bs.position && finite(bs.position.x) && finite(bs.position.y)) {
        b.hasPos = true; b.x = clamp100(bs.position.x); b.y = clamp100(bs.position.y); b.floor = bs.level ?? "upper"
        if (bs.exploded) b.phase = "exploded"
        else if (bs.defused) { b.phase = "defused"; b.since = bs.defuseTime !== undefined ? Math.max(0, t - bs.defuseTime) : 10 }
        else if (bs.defuseProgress != null && bs.defuseProgress > 0) { b.phase = "defusing"; b.progress = bs.defuseProgress }
        else b.phase = "planted"
    }
    return scene
}
