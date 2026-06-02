/**
 * Radar Position Engine
 * Generates plausible player positions from match events for the live radar overlay.
 * Pure function, deterministic with the same inputs.
 */

import { MatchEvent, MapId } from "@/types"
import { SeededRNG } from "@/engine/rng"
import { Point, MAP_LAYOUTS } from "./map-radar-data"
import { projectToWalkable } from "./radar-nav"

type RadarLevel = "upper" | "lower"

export interface RadarPlayerDot {
    playerId: string
    nickname: string
    x: number
    y: number
    side: "ct" | "t"
    isAlive: boolean
    deathTime?: number
    level?: RadarLevel
    angle: number
    money?: number
}

export interface RadarKillLine {
    fromX: number
    fromY: number
    toX: number
    toY: number
    time: number
    isHeadshot: boolean
    weapon?: string
    level?: RadarLevel
}

export interface RadarBombState {
    planted: boolean
    position?: Point
    exploded: boolean
    defused: boolean
    defuseTime?: number
    defuseProgress?: number
    level?: RadarLevel
}

export interface RadarSmoke {
    x: number
    y: number
    radius: number
    startTime: number
    endTime: number
    level?: RadarLevel
}

interface PlayerInput {
    id: string
    isDead: boolean
    nickname: string
    money?: number
}

interface SimulationContext {
    mapId: MapId
    safeSeed: number
    safeRoundNumber: number
    firstKillTime: number
    plantTime: number
    hasPlant: boolean
    attackSite: "A" | "B"
    engageZone: Point
    targetSite: Point
    attackPath: Point[]
    ctRotatePath: Point[]
    isDualLevel: boolean
}

interface PlayerSimState {
    playerId: string
    nickname: string
    side: "ct" | "t"
    index: number
    sideCount: number
    money?: number
    spawnPoint: Point
    /** CT-only: their assigned hold position (where they walk to from spawn). */
    holdPoint?: Point
    deathTime?: number
    staticDead: boolean
    pos: Point
    vel: Point
    angle: number
    level?: RadarLevel
    formationOffset: Point
    seed: number
}

type TacticalPhase = "freeze" | "default" | "prePlant" | "postPlant" | "retake"

interface MotionProfile {
    maxSpeed: number
    maxAccel: number
    damping: number
    reactionDelay: number
    jitterScale: number
}

function finiteNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function hashString(input: string): number {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return Math.abs(hash >>> 0)
}

function pseudoRandom(seed: number): number {
    const value = Math.sin(seed * 12.9898) * 43758.5453123
    return value - Math.floor(value)
}

function point(x: number, y: number): Point {
    return {
        x: clamp(finiteNumber(x, 50), 0, 100),
        y: clamp(finiteNumber(y, 50), 0, 100),
    }
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

function lerpPoint(a: Point, b: Point, t: number): Point {
    return point(lerp(a.x, b.x, t), lerp(a.y, b.y, t))
}

function smoothStep(t: number): number {
    const x = clamp(t, 0, 1)
    return x * x * (3 - 2 * x)
}

function lerpAlongPath(path: Point[], t: number, fallback: Point): Point {
    if (path.length === 0) return fallback
    if (path.length === 1) return path[0]
    const clampedT = clamp(t, 0, 1)
    const segments = path.length - 1
    const rawIndex = clampedT * segments
    const segIndex = Math.min(Math.floor(rawIndex), segments - 1)
    const segT = rawIndex - segIndex
    return lerpPoint(path[segIndex], path[segIndex + 1], segT)
}

function angleTo(from: Point, to: Point): number {
    return Math.atan2(to.y - from.y, to.x - from.x)
}

function magnitude(v: Point): number {
    return Math.hypot(v.x, v.y)
}

function normalize(v: Point): Point {
    const len = magnitude(v)
    if (len <= 1e-6) return { x: 0, y: 0 }
    return { x: v.x / len, y: v.y / len }
}

function scale(v: Point, scalar: number): Point {
    return { x: v.x * scalar, y: v.y * scalar }
}

function add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y }
}

function sub(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y }
}

function clampVector(v: Point, maxLength: number): Point {
    const len = magnitude(v)
    if (len <= maxLength) return v
    const dir = normalize(v)
    return scale(dir, maxLength)
}

/**
 * True if line segments (a1→a2) and (b1→b2) cross. Uses standard CCW
 * orientation tests. Endpoint-only touches don't count as a crossing so a
 * kill-line that just grazes a wall corner stays visible.
 */
function segmentsIntersect(
    a1x: number, a1y: number, a2x: number, a2y: number,
    b1x: number, b1y: number, b2x: number, b2y: number,
): boolean {
    function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
        return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax)
    }
    const d1 = ccw(b1x, b1y, b2x, b2y, a1x, a1y)
    const d2 = ccw(b1x, b1y, b2x, b2y, a2x, a2y)
    const d3 = ccw(a1x, a1y, a2x, a2y, b1x, b1y)
    const d4 = ccw(a1x, a1y, a2x, a2y, b2x, b2y)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function projectPoint(mapId: MapId, level: RadarLevel, rawPoint: Point): Point {
    const safe = point(rawPoint.x, rawPoint.y)
    return projectToWalkable(mapId, level, safe)
}

function normalizeWeaponId(weapon: string | undefined): string {
    return (weapon || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function getMaxKillLineDistance(weapon: string | undefined): number {
    const id = normalizeWeaponId(weapon)
    if (id === "knife") return 10
    if (id === "nova" || id === "mag7" || id === "sawedoff" || id === "xm1014") return 28
    if (id === "awp" || id === "ssg08") return 95

    const smgWeapons = new Set(["mac10", "mp9", "mp7", "ump45", "ppbizon", "p90"])
    if (smgWeapons.has(id)) return 60

    const rifleWeapons = new Set(["ak47", "m4a4", "m4a1s", "galil", "famas", "aug", "sg553"])
    if (rifleWeapons.has(id)) return 80

    const pistolWeapons = new Set(["glock", "usp", "p250", "deagle", "dualies", "tec9", "fiveseven"])
    if (pistolWeapons.has(id)) return 50

    return 75
}

function resolveLineLevel(
    isDualLevel: boolean,
    killerLevel?: RadarLevel,
    victimLevel?: RadarLevel
): RadarLevel | undefined {
    if (!isDualLevel) return undefined
    if (killerLevel && victimLevel && killerLevel === victimLevel) return killerLevel
    return victimLevel || killerLevel
}

function inferSiteFromText(text: string | undefined): "A" | "B" | undefined {
    if (!text) return undefined
    const normalized = text.toLowerCase()
    if (/\b(site|bombsite)\s*a\b/.test(normalized) || /\ba[-\s]?site\b/.test(normalized)) return "A"
    if (/\b(site|bombsite)\s*b\b/.test(normalized) || /\bb[-\s]?site\b/.test(normalized)) return "B"
    return undefined
}

function getDeathTime(playerId: string, events: MatchEvent[]): number | undefined {
    const killEvent = events.find(event => event.type === "KILL" && event.victimId === playerId)
    return killEvent ? finiteNumber(killEvent.time, 0) : undefined
}

function resolveAttackSite(
    events: MatchEvent[],
    seed: number,
    roundNumber: number
): "A" | "B" {
    for (const event of events) {
        const fromText = inferSiteFromText(event.details)
        if (fromText) return fromText
    }
    const rng = new SeededRNG(seed + roundNumber * 7919)
    return rng.bool(0.5) ? "A" : "B"
}

function getFormationOffset(index: number, total: number, seed: number, spread: number): Point {
    const safeTotal = Math.max(1, total)
    const angleBase = (index / safeTotal) * Math.PI * 2
    const jitter = (pseudoRandom(seed + index * 11) - 0.5) * 0.7
    const angle = angleBase + jitter
    const radius = spread * (0.65 + pseudoRandom(seed + index * 19) * 0.7)
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
    }
}

function getMicroJitter(time: number, seed: number, scaleFactor: number): Point {
    const phaseA = seed * 0.0013
    const phaseB = seed * 0.0019
    return {
        x: Math.sin(time * 1.45 + phaseA) * scaleFactor,
        y: Math.cos(time * 1.22 + phaseB) * scaleFactor,
    }
}

function getTacticalPhase(state: PlayerSimState, time: number, ctx: SimulationContext): TacticalPhase {
    if (time <= 3) return "freeze"
    if (!ctx.hasPlant || time < ctx.plantTime) {
        if (time < ctx.firstKillTime + 1.5) return "default"
        return "prePlant"
    }
    return state.side === "ct" ? "retake" : "postPlant"
}

function getMotionProfile(state: PlayerSimState, time: number, ctx: SimulationContext): MotionProfile {
    const phase = getTacticalPhase(state, time, ctx)
    const roleBias = (state.index - 2) * 0.1

    if (phase === "freeze") {
        return {
            maxSpeed: 2.0 + (state.side === "t" ? 0.2 : 0),
            maxAccel: 9.5,
            damping: 0.78,
            reactionDelay: 0.0,
            jitterScale: 0.18,
        }
    }

    if (phase === "default") {
        return {
            maxSpeed: (state.side === "t" ? 6.2 : 5.8) + (state.side === "t" ? -roleBias * 0.4 : roleBias * 0.25),
            maxAccel: 12.5,
            damping: 0.9,
            reactionDelay: 0.12 + state.index * 0.03,
            jitterScale: state.side === "t" ? 0.22 : 0.2,
        }
    }

    if (phase === "prePlant") {
        return {
            maxSpeed: (state.side === "t" ? 6.9 : 6.3) + (state.side === "t" ? -roleBias * 0.45 : roleBias * 0.35),
            maxAccel: 14.2,
            damping: 0.9,
            reactionDelay: 0.14 + state.index * 0.035,
            jitterScale: state.side === "t" ? 0.24 : 0.21,
        }
    }

    if (phase === "postPlant") {
        return {
            maxSpeed: 5.6 + roleBias * 0.25,
            maxAccel: 11.5,
            damping: 0.92,
            reactionDelay: 0.18 + state.index * 0.04,
            jitterScale: 0.16,
        }
    }

    return {
        maxSpeed: 6.9 + roleBias * 0.35,
        maxAccel: 14.8,
        damping: 0.89,
        reactionDelay: 0.16 + state.index * 0.03,
        jitterScale: 0.2,
    }
}

function getPlayerLevel(
    side: "ct" | "t",
    playerIndex: number,
    time: number,
    ctx: SimulationContext
): RadarLevel | undefined {
    if (!ctx.isDualLevel) return undefined
    if (ctx.attackSite !== "B") return "upper"

    const lowerEntryTime = ctx.hasPlant
        ? Math.max(8, ctx.plantTime - 7)
        : Math.max(10, ctx.firstKillTime + 4)

    if (side === "t") {
        const delay = playerIndex <= 2 ? playerIndex * 0.8 : 2.5 + (playerIndex - 2) * 0.8
        return time >= lowerEntryTime + delay ? "lower" : "upper"
    }

    if (ctx.hasPlant) {
        const retakeDelay = 1 + playerIndex * 0.9
        return time >= ctx.plantTime + retakeDelay ? "lower" : "upper"
    }

    if (playerIndex >= 3 && time >= lowerEntryTime + 4) return "lower"
    return "upper"
}

function resolveTTarget(state: PlayerSimState, time: number, ctx: SimulationContext, jitterScale: number): Point {
    const freezeEnd = 3
    // Ts walk out of spawn after freeze and reach contact zones over the
    // first ~12 seconds. The cap keeps engagements from happening with
    // Ts still in spawn (the "shooting across the map from spawn" feedback
    // the user flagged) while staying inside the per-second movement
    // smoothness budget the radar-position-engine test enforces.
    const preFightEnd = Math.max(
        freezeEnd + 6,
        Math.min(ctx.firstKillTime - 1, ctx.hasPlant ? ctx.plantTime - 3 : ctx.firstKillTime - 1)
    )

    const baseFormation = scale(state.formationOffset, 0.9)
    const jitter = getMicroJitter(time, state.seed, jitterScale)

    if (time <= freezeEnd) {
        return add(state.spawnPoint, add(scale(baseFormation, 0.45), jitter))
    }

    if (time < preFightEnd) {
        const progress = smoothStep((time - freezeEnd) / Math.max(1, preFightEnd - freezeEnd))
        // Push 0.12 → 0.78 along the attack path. Slightly more aggressive
        // than the original 0.08 → 0.72 so engagements land at realistic
        // contact points, but conservative enough to keep per-second jumps
        // under the smoothness invariant.
        const pathPoint = lerpAlongPath(ctx.attackPath, 0.12 + progress * 0.66, state.spawnPoint)
        return add(pathPoint, add(scale(baseFormation, 1.2), jitter))
    }

    if (ctx.hasPlant && time >= ctx.plantTime) {
        const postPlantRole = state.index % 5
        let anchor = ctx.targetSite
        if (postPlantRole === 1) anchor = lerpPoint(ctx.targetSite, ctx.engageZone, 0.25)
        else if (postPlantRole === 2) anchor = lerpPoint(ctx.targetSite, ctx.engageZone, 0.4)
        else if (postPlantRole === 3) anchor = lerpPoint(ctx.targetSite, ctx.engageZone, 0.55)
        else if (postPlantRole === 4) anchor = lerpPoint(ctx.targetSite, ctx.engageZone, 0.7)
        return add(anchor, add(scale(baseFormation, 0.95), jitter))
    }

    const fightProgress = smoothStep((time - ctx.firstKillTime) / 24)
    const pushBase = lerpPoint(ctx.engageZone, ctx.targetSite, 0.2 + fightProgress * 0.62)
    return add(pushBase, add(scale(baseFormation, 1.25), jitter))
}

function resolveCTTarget(state: PlayerSimState, time: number, ctx: SimulationContext, jitterScale: number): Point {
    const freezeEnd = 3
    const baseFormation = scale(state.formationOffset, 0.85)
    const jitter = getMicroJitter(time, state.seed + 77, jitterScale)
    // Each CT has an assigned hold (site/mid). They walk from ctSpawn → hold
    // during the freeze and the first few seconds of the round, so the radar
    // shows them rotating OUT instead of starting pre-deployed at bombsites.
    const hold = state.holdPoint || ctx.engageZone

    if (time <= freezeEnd) {
        // Edge their hold direction during freeze (slight lean-out), but
        // stay clustered around the actual CT spawn.
        const freezeTarget = lerpPoint(state.spawnPoint, hold, 0.18)
        return add(freezeTarget, add(scale(baseFormation, 0.55), jitter))
    }

    // Walk from spawn to assigned hold over ~8 seconds after the freeze ends,
    // staggered slightly by player index so they don't move in lockstep.
    const setupDuration = 8
    const setupT = clamp((time - freezeEnd - state.index * 0.35) / setupDuration, 0, 1)
    const setupProgress = smoothStep(setupT)
    const setupTarget = lerpPoint(state.spawnPoint, hold, setupProgress)

    if (time < ctx.firstKillTime) {
        return add(setupTarget, add(scale(baseFormation, 0.85), jitter))
    }

    if (ctx.hasPlant && time >= ctx.plantTime) {
        const retakeProgress = smoothStep((time - ctx.plantTime) / (17 + state.index))
        const entry = lerpPoint(hold, ctx.engageZone, 0.35)
        const retakeTarget = lerpPoint(entry, ctx.targetSite, 0.2 + retakeProgress * 0.75)
        return add(retakeTarget, add(scale(baseFormation, 0.9), jitter))
    }

    const rotateProgress = smoothStep((time - ctx.firstKillTime) / (18 + state.index))
    const rotateAnchor = lerpAlongPath(ctx.ctRotatePath, clamp(rotateProgress + state.index * 0.06, 0, 1), ctx.engageZone)
    // Blend FROM the hold (not spawn) so the rotation looks like they're
    // leaving their setup position.
    const rotateTarget = lerpPoint(hold, rotateAnchor, smoothStep(rotateProgress))
    return add(rotateTarget, add(scale(baseFormation, 1.05), jitter))
}

function getTargetForPlayer(state: PlayerSimState, time: number, ctx: SimulationContext, jitterScale: number): Point {
    if (state.side === "t") return resolveTTarget(state, time, ctx, jitterScale)
    return resolveCTTarget(state, time, ctx, jitterScale)
}

function createPlayerStates(
    players: PlayerInput[],
    side: "ct" | "t",
    spawnPoints: Point[],
    ctx: SimulationContext,
    killEvents: MatchEvent[],
    holdPoints?: Point[]
): PlayerSimState[] {
    const states: PlayerSimState[] = []
    const sideCount = Math.max(1, players.length)

    for (let index = 0; index < players.length; index++) {
        const player = players[index]
        if (!player || typeof player.id !== "string") continue

        const spawnFallback = side === "t" ? ctx.attackPath[0] : ctx.engageZone
        const spawnRaw = spawnPoints[index % Math.max(1, spawnPoints.length)] || spawnFallback
        const seed = ctx.safeSeed + ctx.safeRoundNumber * 101 + hashString(player.id)
        const level = getPlayerLevel(side, index, 0, ctx) || "upper"
        const spawnPoint = projectPoint(ctx.mapId, level, spawnRaw)
        const holdRaw = holdPoints && holdPoints.length > 0
            ? holdPoints[index % holdPoints.length]
            : undefined
        const holdPoint = holdRaw
            ? projectPoint(ctx.mapId, level, holdRaw)
            : undefined

        states.push({
            playerId: player.id,
            nickname: player.nickname || "Player",
            side,
            index,
            sideCount,
            money: Number.isFinite(player.money) ? player.money : undefined,
            spawnPoint,
            holdPoint,
            deathTime: getDeathTime(player.id, killEvents),
            staticDead: player.isDead && getDeathTime(player.id, killEvents) === undefined,
            pos: spawnPoint,
            vel: { x: 0, y: 0 },
            angle: 0,
            level,
            formationOffset: getFormationOffset(index, sideCount, seed, side === "t" ? 2.2 : 2.0),
            seed,
        })
    }

    return states
}

function simulatePlayersAtTime(
    tStates: PlayerSimState[],
    ctStates: PlayerSimState[],
    ctx: SimulationContext,
    targetTime: number
): PlayerSimState[] {
    const safeTime = Math.max(0, finiteNumber(targetTime, 0))
    const dt = 0.2
    const steps = Math.max(1, Math.ceil(safeTime / dt))
    const allStates = [...tStates, ...ctStates]

    for (let stepIndex = 1; stepIndex <= steps; stepIndex++) {
        const currentTime = Math.min(stepIndex * dt, safeTime)

        for (const state of allStates) {
            if (state.staticDead) {
                state.vel = { x: 0, y: 0 }
                continue
            }

            if (state.deathTime !== undefined && currentTime >= state.deathTime) {
                state.vel = { x: 0, y: 0 }
                continue
            }

            const profile = getMotionProfile(state, currentTime, ctx)
            const perceivedTime = Math.max(0, currentTime - profile.reactionDelay)
            const nextLevel = getPlayerLevel(state.side, state.index, currentTime, ctx) || "upper"
            const target = projectPoint(ctx.mapId, nextLevel, getTargetForPlayer(state, perceivedTime, ctx, profile.jitterScale))
            const toTarget = sub(target, state.pos)
            const distance = magnitude(toTarget)

            const maxSpeed = profile.maxSpeed
            const maxAccel = profile.maxAccel
            const desiredDir = distance > 1e-4 ? normalize(toTarget) : { x: 0, y: 0 }
            const desiredSpeed = Math.min(maxSpeed, distance / dt)
            const desiredVel = scale(desiredDir, desiredSpeed)

            const accelDelta = sub(desiredVel, state.vel)
            const cappedAccel = clampVector(accelDelta, maxAccel * dt)
            state.vel = add(state.vel, cappedAccel)

            state.vel = scale(state.vel, profile.damping)

            let nextPos = add(state.pos, scale(state.vel, dt))
            nextPos = projectPoint(ctx.mapId, nextLevel, nextPos)
            if (magnitude(sub(nextPos, state.pos)) > maxSpeed * dt * 1.2) {
                const stepDir = normalize(sub(nextPos, state.pos))
                nextPos = add(state.pos, scale(stepDir, maxSpeed * dt))
                nextPos = projectPoint(ctx.mapId, nextLevel, nextPos)
            }

            // Final safety cap. After two projections nextPos can still
            // sit further away than the velocity allows — projectToWalkable
            // snaps to the nearest walkable cell, and "nearest" can lie
            // across a wall. When that happens we'd rather stall the
            // player than teleport them. The radar-test invariant
            // (per-second jump ≤ 14) depends on this.
            const finalStep = magnitude(sub(nextPos, state.pos))
            const finalCap = maxSpeed * dt * 1.2
            if (finalStep > finalCap) {
                if (finalStep > 0) {
                    const dir = normalize(sub(nextPos, state.pos))
                    nextPos = add(state.pos, scale(dir, finalCap))
                } else {
                    nextPos = state.pos
                }
            }
            // Verify the (capped) target lands on a walkable cell. If
            // projecting moves it more than the cap, the capped point
            // sits inside a wall — freeze at the last known walkable
            // pos rather than let the snap carry the player into the
            // void. Keeps the dot strictly inside the radar's walkable
            // surface across level transitions.
            const projected = projectPoint(ctx.mapId, nextLevel, nextPos)
            if (magnitude(sub(projected, nextPos)) > finalCap) {
                nextPos = state.pos
            } else {
                nextPos = projected
            }

            const projectionCorrection = magnitude(sub(nextPos, add(state.pos, scale(state.vel, dt))))
            if (projectionCorrection > 0.35) {
                state.vel = scale(state.vel, 0.45)
            }

            // Level transition (upper ↔ lower): state.pos was walkable on
            // the OLD level but may not be on the NEW one. The dot's
            // final projection will then snap to the nearest walkable
            // cell — potentially 20+ units. Catch up here so the
            // transition presents as a bounded "stair-step" jump
            // (≤ TRANSITION_SNAP_CAP) rather than a teleport across
            // the map. Velocity is zeroed so post-switch motion
            // re-accelerates organically toward the new target.
            if (state.level && state.level !== nextLevel) {
                const targetOnNew = projectPoint(ctx.mapId, nextLevel, nextPos)
                const transitionGap = magnitude(sub(targetOnNew, nextPos))
                const TRANSITION_SNAP_CAP = 13.5
                if (transitionGap > TRANSITION_SNAP_CAP) {
                    const dir = normalize(sub(targetOnNew, nextPos))
                    nextPos = add(nextPos, scale(dir, TRANSITION_SNAP_CAP))
                } else {
                    nextPos = targetOnNew
                }
                state.vel = { x: 0, y: 0 }
            }
            state.level = nextLevel
            state.pos = nextPos

            const speed = magnitude(state.vel)
            state.angle = speed > 0.12 ? Math.atan2(state.vel.y, state.vel.x) : angleTo(state.pos, target)
        }
    }

    return allStates
}

export function computeRadarPositions(
    mapId: MapId,
    currentTime: number,
    roundEvents: MatchEvent[],
    homePlayers: PlayerInput[],
    awayPlayers: PlayerInput[],
    homeStartsCT: boolean,
    roundNumber: number,
    matchSeed: number
): { dots: RadarPlayerDot[]; bomb: RadarBombState; killLines: RadarKillLine[]; smokes: RadarSmoke[]; aSite: Point; bSite: Point } {
    const layout = MAP_LAYOUTS[mapId]
    if (!layout) {
        return {
            dots: [],
            bomb: { planted: false, exploded: false, defused: false },
            killLines: [],
            smokes: [],
            aSite: { x: 25, y: 25 },
            bSite: { x: 75, y: 25 }
        }
    }

    const safeCurrentTime = Math.max(0, finiteNumber(currentTime, 0))
    const safeRoundNumber = Math.max(1, Math.floor(finiteNumber(roundNumber, 1)))
    const safeSeed = Math.max(1, Math.floor(finiteNumber(matchSeed, 1)))

    const allEvents = Array.isArray(roundEvents) ? roundEvents : []
    const killEvents = allEvents
        .filter(event => event.type === "KILL")
        .sort((a, b) => finiteNumber(a.time, 0) - finiteNumber(b.time, 0))
    const plantEvent = allEvents.find(event => event.type === "PLANT")
    const defuseEvent = allEvents.find(event => event.type === "DEFUSE")
    const explodeEvent = allEvents.find(event => event.type === "EXPLODE")
    const roundEndEvent = allEvents.find(event => event.type === "ROUND_END")

    const firstKillTime = killEvents.length > 0 ? Math.max(4, finiteNumber(killEvents[0].time, 22)) : 22
    const plantTime = plantEvent ? finiteNumber(plantEvent.time, 999) : 999
    const roundEndTime = roundEndEvent ? finiteNumber(roundEndEvent.time, 120) : 120

    const ctPlayers = homeStartsCT ? homePlayers : awayPlayers
    const tPlayers = homeStartsCT ? awayPlayers : homePlayers

    const attackSite = resolveAttackSite(allEvents, safeSeed, safeRoundNumber)
    const engageZone = attackSite === "A" ? layout.engageA : layout.engageB
    const targetSite = attackSite === "A" ? layout.aSite : layout.bSite
    const attackPath = attackSite === "A" ? layout.tToA : layout.tToB
    const ctRotatePath = attackSite === "A" ? layout.ctRotateA : layout.ctRotateB
    const isDualLevel = layout.bSiteLevel === "lower"

    const simCtx: SimulationContext = {
        mapId,
        safeSeed,
        safeRoundNumber,
        firstKillTime,
        plantTime,
        hasPlant: !!plantEvent,
        attackSite,
        engageZone: point(engageZone.x, engageZone.y),
        targetSite: point(targetSite.x, targetSite.y),
        attackPath: attackPath.map(p => point(p.x, p.y)),
        ctRotatePath: ctRotatePath.map(p => point(p.x, p.y)),
        isDualLevel,
    }

    const dotCache = new Map<number, RadarPlayerDot[]>()
    const buildDotsAtTime = (targetTime: number): RadarPlayerDot[] => {
        const safeTime = Math.max(0, finiteNumber(targetTime, 0))
        const cacheKey = Math.round(safeTime * 100) / 100
        const cached = dotCache.get(cacheKey)
        if (cached) return cached

        const tStates = createPlayerStates(tPlayers, "t", layout.tSpawn, simCtx, killEvents)
        const ctStates = createPlayerStates(ctPlayers, "ct", layout.ctSpawn, simCtx, killEvents, layout.ctHolds)
        const finalStates = simulatePlayersAtTime(tStates, ctStates, simCtx, safeTime)

        const dots: RadarPlayerDot[] = []
        for (const state of finalStates) {
            const aliveByEvents = state.deathTime === undefined || safeTime < state.deathTime
            const isAlive = state.staticDead ? false : aliveByEvents
            if (!isAlive && state.deathTime !== undefined && safeTime - state.deathTime > 4) continue

            const level = state.level || "upper"
            const projectedPos = projectPoint(mapId, level, state.pos)
            const angle = Number.isFinite(state.angle) ? state.angle : 0

            dots.push({
                playerId: state.playerId,
                nickname: state.nickname,
                x: clamp(projectedPos.x, 0, 100),
                y: clamp(projectedPos.y, 0, 100),
                side: state.side,
                isAlive,
                deathTime: state.deathTime,
                level: isDualLevel ? level : undefined,
                angle,
                money: state.money,
            })
        }

        const filtered = dots.filter(dot => Number.isFinite(dot.x) && Number.isFinite(dot.y) && Number.isFinite(dot.angle))
        dotCache.set(cacheKey, filtered)
        return filtered
    }

    const dots = buildDotsAtTime(safeCurrentTime)

    const bombSite = inferSiteFromText(plantEvent?.details) || attackSite
    const bombLevel: RadarLevel = isDualLevel && bombSite === "B" ? "lower" : "upper"
    const bombAnchor = bombSite === "A" ? layout.aSite : layout.bSite
    const bombPosition = projectPoint(mapId, bombLevel, point(bombAnchor.x, bombAnchor.y))

    const bomb: RadarBombState = {
        planted: false,
        exploded: false,
        defused: false,
        level: isDualLevel ? bombLevel : undefined,
    }
    if (plantEvent && safeCurrentTime >= plantTime) {
        bomb.planted = true
        bomb.position = bombPosition
    }
    if (explodeEvent && safeCurrentTime >= finiteNumber(explodeEvent.time, 0)) {
        bomb.exploded = true
    }
    if (defuseEvent && safeCurrentTime >= finiteNumber(defuseEvent.time, 0)) {
        bomb.defused = true
        bomb.defuseTime = finiteNumber(defuseEvent.time, 0)
    }
    if (defuseEvent && plantEvent && !bomb.exploded) {
        const defuseTime = finiteNumber(defuseEvent.time, 0)
        if (safeCurrentTime >= defuseTime - 5 && safeCurrentTime < defuseTime) {
            bomb.defuseProgress = clamp((safeCurrentTime - (defuseTime - 5)) / 5, 0, 1)
        }
    }

    const killLines: RadarKillLine[] = []
    const KILL_LINE_DURATION = 2
    for (const kill of killEvents) {
        const killTime = finiteNumber(kill.time, 0)
        const elapsed = safeCurrentTime - killTime
        if (elapsed < 0 || elapsed >= KILL_LINE_DURATION) continue

        const snapshotDots = buildDotsAtTime(killTime + 0.05)
        const killerDot = snapshotDots.find(dot => dot.playerId === kill.killerId || dot.playerId === kill.playerId)
        const victimDot = snapshotDots.find(dot => dot.playerId === kill.victimId)
        if (!killerDot || !victimDot) continue

        const distance = Math.hypot(killerDot.x - victimDot.x, killerDot.y - victimDot.y)
        const maxDistance = getMaxKillLineDistance(kill.weapon)
        if (distance > maxDistance) continue

        // Wall plausibility: if the layout has authored walls, drop any kill
        // line that crosses one. Drawn-through-walls lines were the
        // "shooting across the map from spawn" feedback — this stops them
        // visually even when the simulator places the players unrealistically.
        if (layout.walls && layout.walls.length > 0) {
            const crosses = layout.walls.some(wall => segmentsIntersect(
                killerDot.x, killerDot.y, victimDot.x, victimDot.y,
                wall.from.x, wall.from.y, wall.to.x, wall.to.y,
            ))
            if (crosses) continue
        }

        killLines.push({
            fromX: clamp(killerDot.x, 0, 100),
            fromY: clamp(killerDot.y, 0, 100),
            toX: clamp(victimDot.x, 0, 100),
            toY: clamp(victimDot.y, 0, 100),
            time: killTime,
            isHeadshot: !!kill.isHeadshot,
            weapon: kill.weapon,
            level: resolveLineLevel(isDualLevel, killerDot.level, victimDot.level),
        })
    }

    const smokes: RadarSmoke[] = []
    const smokeRng = new SeededRNG(safeSeed + safeRoundNumber * 4999)
    // Smoke count tied to round phase. Pistol rounds (1, 13) have no
    // grenade economy so smokes don't make sense; anti-eco rounds (2, 14)
    // get at most one; everything else can range 1-3 depending on RNG.
    // Without this, eco rounds rendered the same util spam as full buys.
    const isPistol = safeRoundNumber === 1 || safeRoundNumber === 13
    const isAntiEco = safeRoundNumber === 2 || safeRoundNumber === 14
    const numSmokes = isPistol
        ? 0
        : isAntiEco
            ? (smokeRng.next() > 0.5 ? 1 : 0)
            : 1 + (smokeRng.next() > 0.35 ? 1 : 0) + (smokeRng.next() > 0.75 ? 1 : 0)
    for (let smokeIndex = 0; smokeIndex < numSmokes; smokeIndex++) {
        const smokeStart = 6 + smokeRng.next() * 4
        const smokeDuration = 15 + smokeRng.next() * 5
        // Smoke 0 = execute smoke near the target site. Smoke 1 = block CT
        // rotation. Smoke 2+ = extra util thrown along the attack path
        // (only happens on full-buy rounds).
        const base = smokeIndex === 0
            ? lerpPoint(simCtx.engageZone, simCtx.targetSite, 0.18 + smokeRng.next() * 0.25)
            : smokeIndex === 1
                ? lerpAlongPath(simCtx.ctRotatePath, 0.35 + smokeRng.next() * 0.55, simCtx.engageZone)
                : lerpAlongPath(simCtx.attackPath, 0.55 + smokeRng.next() * 0.3, simCtx.engageZone)

        const smokeLevel: RadarLevel = isDualLevel && attackSite === "B" && smokeIndex === 0 ? "lower" : "upper"
        const smokePos = projectPoint(mapId, smokeLevel, base)
        smokes.push({
            x: smokePos.x,
            y: smokePos.y,
            radius: clamp(4 + smokeRng.next() * 1.7, 2.8, 8),
            startTime: clamp(smokeStart, 0, Math.max(120, roundEndTime)),
            endTime: clamp(smokeStart + smokeDuration, 0, Math.max(140, roundEndTime + 20)),
            level: isDualLevel ? smokeLevel : undefined,
        })
    }

    const aSite = projectPoint(mapId, "upper", point(layout.aSite.x, layout.aSite.y))
    const bLevel: RadarLevel = isDualLevel ? "lower" : "upper"
    const bSite = projectPoint(mapId, bLevel, point(layout.bSite.x, layout.bSite.y))

    return {
        dots,
        bomb,
        killLines,
        smokes,
        aSite,
        bSite,
    }
}
