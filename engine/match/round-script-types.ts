/**
 * Round script (Phase 2): one deterministic, timestamped description of a
 * round — the plan, where every player walks, where each duel happens, which
 * grenades land where and what the bomb does. Stats, the radar and the kill
 * feed all read the same script, so what the radar shows is what happened.
 *
 * Coordinates are radar percent space (0–100 on both axes, origin top-left),
 * the same space the radar renderer and data/map-layouts use. Multi-level
 * maps (Nuke, Vertigo) tag every point with its floor.
 *
 * Spec: docs/revamp/PHASE2_ROUND_SCRIPT.md
 */

import type { MatchEvent } from "@/types/match"

export type Side = "T" | "CT"
export type SiteId = "A" | "B"
export type Floor = "upper" | "lower"

export interface RPoint {
    x: number
    y: number
    floor: Floor
}

// ─── Baked per-map data (data/round-maps/<mapId>.json) ─────────────────────

export type RouteKind = "t-exec" | "ct-setup" | "rotate" | "lurk"

export interface RoundMapRoute {
    /** Stable id, e.g. "t-a-main", "t-a-alt", "t-b-main", "ct-a", "rot-a-b". */
    id: string
    kind: RouteKind
    /** Site the route serves (destination for t-exec/ct-setup, target for rotate). */
    site: SiteId
    from: "tSpawn" | "ctSpawn" | SiteId | "mid"
    /** Dense walkable polyline (≤ ~1.5 map-% between points), nav-mesh derived. */
    points: RPoint[]
    /** Polyline length in map-% units. */
    length: number
    /** Index into `points` where the route enters the contact zone of its site. */
    contactIndex: number
}

export type HoldKind = "site" | "anchor" | "retake" | "mid"

export interface RoundMapHold {
    id: string
    site: SiteId
    kind: HoldKind
    at: RPoint
    /** Point the holder watches (sets the view direction). */
    watch: RPoint
}

export type UtilityKind = "smoke" | "flash" | "molotov" | "he"

export interface RoundMapUtility {
    id: string
    site: SiteId
    side: Side
    kind: UtilityKind
    /** Where it lands / blooms. */
    at: RPoint
    /** Radius in map-% (smoke ~2.2, molotov ~1.6). */
    radius: number
}

export interface RoundMapSite {
    center: RPoint
    /** Plantable area outline. */
    polygon: RPoint[]
    /** ≥ 4 plausible plant positions inside the polygon. */
    plantSpots: RPoint[]
}

export interface RoundMap {
    schemaVersion: 1
    mapId: string
    floors: Floor[]
    /** ≥ 5 spawn positions per side. */
    spawns: Record<Side, RPoint[]>
    sites: Record<SiteId, RoundMapSite>
    /** ≥ 2 t-exec routes per site, ≥ 1 ct-setup route per site, rotate routes A↔B. */
    routes: RoundMapRoute[]
    /** ≥ 3 holds per site (site + anchor positions). */
    holds: RoundMapHold[]
    utility: RoundMapUtility[]
    /** Running speed with a rifle in map-% per second (≈ 215 u/s ÷ units-per-%). */
    runSpeed: number
}

// ─── Script ────────────────────────────────────────────────────────────────

export type TStrategy = "default" | "execute" | "rush" | "split" | "fake" | "eco"
export type CtSetup = "2-1-2" | "stack-A" | "stack-B" | "aggressive"
export type BuyLevel = "pistol" | "eco" | "force" | "half" | "full"

export interface RoundScriptPlayer {
    id: string
    teamId: string
    side: Side
    role: string
    /** Primary weapon id for the round (e.g. "ak47", "awp", "usp_s"). */
    weapon: string
    utility: Partial<Record<UtilityKind, number>>
    /** CT defuse kit, if known (sets the defuse start: 5 s with a kit, 10 s without). */
    hasKit?: boolean
}

export interface RoundScriptInput {
    mapId: string
    round: number
    /** Seed for this round (already derived per match/map/round). */
    seed: number
    players: RoundScriptPlayer[]
    buy: Record<Side, BuyLevel>
    /** Optional manager inputs that shape the plan. */
    tPlaystyle?: string
    ctPlaystyle?: string
    /** Resolver events for this round, `time` = seconds since round start. */
    events: MatchEvent[]
    winnerSide: Side
    endReason: "elimination" | "bomb_exploded" | "defused" | "time"
    /**
     * script-v1 rounds: the resolver's plan and grenades. When present the
     * builder uses them instead of choosing its own, and each KILL's `zone`
     * pulls its duel to that place, so the radar shows where the engine says
     * the fight happened.
     */
    plan?: { tStrategy: TStrategy; site: SiteId; ctSetup: CtSetup; execAt?: number }
    utility?: { t: number; playerId: string; kind: UtilityKind; spot: string; site: SiteId }[]
}

export interface TrackKey {
    /** Seconds since round start. */
    t: number
    x: number
    y: number
    floor: Floor
    /** View direction in radians (0 = +x, clockwise in screen space). */
    aim: number
}

export interface ScriptDeath {
    t: number
    victimId: string
    killerId: string
    /** Victim position at the kill. */
    at: RPoint
    /** Killer position at the kill. */
    from: RPoint
    weapon?: string
    headshot?: boolean
}

export interface ScriptUtility {
    t: number
    throwerId: string
    kind: UtilityKind
    at: RPoint
    radius: number
    /** Seconds the effect lasts (smoke 18, molotov 7, flash/he ~0.3). */
    duration: number
}

export interface ScriptBomb {
    /** Who holds the bomb over time (null = nobody: dropped, or planted, at `at`). */
    carrier: { t: number; carrierId: string | null; at?: RPoint }[]
    plant?: { t: number; site: SiteId; at: RPoint; planterId: string }
    defuse?: { tStart: number; tEnd: number; defuserId: string; success: boolean }
    explodeAt?: number
}

export interface RoundScript {
    version: 1
    mapId: string
    round: number
    plan: { tStrategy: TStrategy; site: SiteId; ctSetup: CtSetup }
    /** Side of every player in `tracks`. */
    sides: Record<string, Side>
    /** Per player: keyframes from t=0 to death or round end, ≤ ~0.5 s apart while moving. */
    tracks: Record<string, TrackKey[]>
    deaths: ScriptDeath[]
    utility: ScriptUtility[]
    bomb: ScriptBomb
    endTime: number
}

/** A player's interpolated state at a moment of the round. */
export interface SampledPlayer {
    id: string
    side: Side
    x: number
    y: number
    floor: Floor
    aim: number
    alive: boolean
}
