/**
 * Resolver contacts: build the round's script from a resolved round and list
 * the close contacts in it, two enemies in plain sight of each other with no
 * fight between them, so the resolver can fight them out (contactsUntil in
 * simulate.ts). Only the manager's own matches run this (their rounds are the
 * ones shown on the radar); it builds the script without the cover pass.
 */

import type { PlayerSimulationState } from "../round-outcome"
import type { Player } from "@/types"
import { createContext, type Actor, type Step } from "../round-script-context"
import { choosePlan, assignRoles, buildTPhases, buildCtPhases } from "../round-script-plan"
import { runTimeline } from "../round-script-timeline"
import { assembleSteps, smokeClouds } from "../round-script-tracks"
import { scriptInputFromResolverRound } from "../round-script-input"
import { navGraphFor } from "../round-script-nav"
import { visibilityFor } from "../round-script-visibility"
import { getRoundMap } from "@/data/round-maps"
import { zonePoint, type MapZones } from "./zones"
import type { Contact, SimOutput } from "./simulate"

/** Within this (map-%), in sight, for at least CONTACT_SECONDS: the two would fight. */
export const CONTACT_RANGE = 5
export const CONTACT_SECONDS = 1
/** Seconds from first sight to the first shot. */
export const CONTACT_REACTION = 0.5

export interface ContactSource {
    mapId: string
    seed: number
    matchId: string
    mapIndex: number
    round: number
    homeIsCT: boolean
    home: { teamId: string; players: Player[]; economy: Record<string, PlayerSimulationState> }
    away: { teamId: string; players: Player[]; economy: Record<string, PlayerSimulationState> }
    zones: MapZones
}

export function findContacts(src: ContactSource, out: SimOutput): Contact[] {
    const map = getRoundMap(src.mapId)
    if (!map) return []
    const loadouts: Record<string, { weapon?: string; utility?: readonly string[]; hasKit?: boolean }> = {}
    for (const side of [src.home, src.away]) for (const p of side.players) {
        const e = side.economy[p.id]
        if (e) loadouts[p.id] = { weapon: e.weapon, utility: e.utility, hasKit: e.hasKit }
    }
    const lineup = (s: ContactSource["home"]) => ({ teamId: s.teamId, players: s.players.map(p => ({ id: p.id, role: p.role })) })
    const input = scriptInputFromResolverRound({
        mapId: src.mapId, seed: src.seed, matchId: src.matchId, mapIndex: src.mapIndex,
        round: { roundNumber: src.round, winner: out.winner === "HOME" ? src.home.teamId : src.away.teamId, winType: out.winType, ctTeam: src.homeIsCT ? src.home.teamId : src.away.teamId, events: out.events } as never,
        home: lineup(src.home), away: lineup(src.away), loadouts,
    })
    const g = navGraphFor(map), vis = visibilityFor(g)
    const DT = 0.25
    // Players' nodes on a DT grid (-1 = dead / not placed), from the script's steps before the cover
    // pass: a holder in sight is the cover pass's job, and skipping it keeps this cheap.
    const ctx = createContext(input, map)
    ctx.smokes = smokeClouds(ctx)
    choosePlan(ctx); assignRoles(ctx); buildTPhases(ctx); buildCtPhases(ctx); runTimeline(ctx)
    const steps = new Map<Actor, Step[]>()
    for (const a of ctx.actors) steps.set(a, assembleSteps(ctx, a))
    const N = Math.floor(ctx.endTime / DT)
    const ids = ctx.actors.map(a => a.id)
    const sides = ctx.actors.map(a => a.side)
    const node: Int32Array[] = []
    const moving: Uint8Array[] = []
    for (const a of ctx.actors) {
        const st = steps.get(a)!
        const nd = new Int32Array(N + 1).fill(-1), mv = new Uint8Array(N + 1)
        for (let s = 0, c = 0; s <= N && st.length; s++) {
            const t = s * DT
            if (t < st[0].t || !(a.deathT > t)) continue
            while (c + 1 < st.length && st[c + 1].t <= t) c++
            const s0 = st[c], s1 = st[c + 1]
            nd[s] = !s1 || s1.node === s0.node || (t - s0.t) < (s1.t - s0.t) / 2 ? s0.node : s1.node
            mv[s] = s1 && s1.node !== s0.node ? 1 : 0
        }
        node.push(nd); moving.push(mv)
    }
    const deaths = ctx.kills
    const zoneIds = [...src.zones.callouts.keys()]
    const zoneAt = (x: number, y: number, floor: string) => {
        let best = zoneIds[0], bd = Infinity
        for (const z of zoneIds) {
            const p = zonePoint(map, z)
            if (!p || (p.floor ?? "upper") !== floor) continue
            const d = Math.hypot(p.x - x, p.y - y)
            if (d < bd) { bd = d; best = z }
        }
        return best
    }
    const out_: Contact[] = []
    for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
        const a = ids[i], b = ids[j]
        if (sides[i] !== "T" || sides[j] !== "CT") continue
        const duels = deaths.filter(d => (d.killerId === a && d.victimId === b) || (d.killerId === b && d.victimId === a)).map(d => d.t)
        let start = -1
        for (let s = 0; s <= N + 1; s++) {
            const t = s * DT
            const n = s <= N ? node[i][s] : -1, m = s <= N ? node[j][s] : -1
            // Only contacts with someone on the move count: a holder in sight is the cover pass's job.
            const ok = n >= 0 && m >= 0 && g.floor[n] === g.floor[m] && g.dist(n, m) <= CONTACT_RANGE && vis.sees(n, m)
                && (moving[i][s] === 1 || moving[j][s] === 1)
                && !duels.some(d => d >= t && d <= t + 2.5)
            if (ok) { if (start < 0) start = s; continue }
            if (start >= 0 && (s - start) * DT >= CONTACT_SECONDS) {
                const t0 = start * DT + CONTACT_REACTION
                const pa = g.point(node[i][start]), pb = g.point(node[j][start])
                const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, fl = pa.floor ?? "upper"
                const still = moving[i][start] === moving[j][start] ? undefined : moving[i][start] ? "b" as const : "a" as const
                out_.push({ t: Math.round(t0 * 10) / 10, a, b, zone: zoneAt(mx, my, fl), ...(still ? { still } : {}), spot: { x: Math.round(mx * 100) / 100, y: Math.round(my * 100) / 100, floor: fl } })
                break
            }
            start = -1
        }
    }
    return out_.sort((x, y) => x.t - y.t)
}
