import type { LabProject } from '@/lib/spatial-lab-project'
import { applyRoundEconomy } from '@/lib/live-match-utils'
import type { SpatialReference } from './types'
import type { TeamEvent, TeamFrame, TeamResult } from './team-simulation'

export const SPATIAL_ROUND_ENGINE = 'spatial-round-v12' as const
type ReplayEngine = typeof SPATIAL_ROUND_ENGINE | 'spatial-round-v11' | 'spatial-round-v10' | 'spatial-round-v9' | 'spatial-round-v8' | 'spatial-round-v7' | 'spatial-round-v6' | 'spatial-round-v5' | 'spatial-round-v4' | 'spatial-round-v3' | 'spatial-round-v2' | 'spatial-round-v1'
const supportedEngine = (engine: string) => engine === SPATIAL_ROUND_ENGINE || engine === 'spatial-round-v11' || engine === 'spatial-round-v10' || engine === 'spatial-round-v9' || engine === 'spatial-round-v8' || engine === 'spatial-round-v7' || engine === 'spatial-round-v6' || engine === 'spatial-round-v5' || engine === 'spatial-round-v4' || engine === 'spatial-round-v3' || engine === 'spatial-round-v2' || engine === 'spatial-round-v1'
export interface SpatialRoundReplay {
    format: 'esim-round-replay'
    engine: ReplayEngine
    version: 1
    tickRate: 64
    release: 'lab-only'
    project: LabProject
    meshSha256: string
    result: TeamResult
    sha256: string
}
export interface RoundReplayCheckpoint { version: 1; engine: ReplayEngine; sha256: string; tick: number }
export interface RoundPlayerStats { kills: number; deaths: number; damage: number; health: number; reward: number }
export interface RoundProjection {
    tick: number
    frame: TeamFrame
    events: TeamEvent[]
    players: Record<string, RoundPlayerStats>
    outcome: TeamResult['outcome']
    reason: string
    complete: boolean
}

/** Hash the portable input and physical output together, without wall-clock metadata. */
async function digest(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
}

export async function sealRoundReplay(project: LabProject, reference: SpatialReference, result: TeamResult): Promise<SpatialRoundReplay> {
    if (!project.teams || project.mapId !== reference.mapId || project.sourceVersion !== reference.sourceVersion || !result.frames.length) throw Error('Replay input/reference mismatch')
    const body = structuredClone({ format: 'esim-round-replay' as const, engine: SPATIAL_ROUND_ENGINE, version: 1 as const, tickRate: 64 as const, release: 'lab-only' as const, project, meshSha256: reference.meshSha256, result })
    const replay = { ...body, sha256: await digest(body) }
    // A disagreement between physical damage and visible health is a hard failure.
    projectRoundReplay(replay, result.frames.at(-1)!.tick)
    return replay
}

export async function verifyRoundReplay(replay: SpatialRoundReplay): Promise<boolean> {
    if (replay?.format !== 'esim-round-replay' || replay.version !== 1 || !supportedEngine(replay.engine) || replay.release !== 'lab-only' || replay.tickRate !== 64) return false
    const { sha256, ...body } = replay
    return sha256 === await digest(body)
}

/** A read-only projection: seeking, dropped frames and duplicate calls cannot award twice.
 * Positions and bomb state use recorded 8 Hz frames. Combat events keep their exact 64 Hz ticks.
 * The reward column is a diagnostic round delta, not a purchased loadout or career payout.
 */
export function projectRoundReplay(replay: SpatialRoundReplay, requestedTick: number): RoundProjection {
    if (!supportedEngine(replay.engine) || replay.version !== 1 || !Number.isFinite(requestedTick)) throw Error('Unsupported replay or invalid time')
    const { result, project } = replay, finalTick = result.frames.at(-1)!.tick
    const tick = Math.max(0, Math.min(finalTick, Math.floor(requestedTick)))
    const players: Record<string, RoundPlayerStats> = Object.fromEntries(project.teams!.actors.map(a => [a.id, { kills: 0, deaths: 0, damage: 0, health: a.health, reward: 0 }]))
    const sides = Object.fromEntries(project.teams!.actors.map(a => [a.id, a.side]))
    const events = result.events.filter(e => e.tick <= tick)
    const physicalKills: { playerId: string; kills: number; weapon: string }[] = []
    for (const e of events) {
        if (!['damage', 'blast-damage', 'fire-damage'].includes(e.type) || !e.target || !e.actor) continue
        const target = players[e.target], actor = players[e.actor]
        if (!target || !actor || !Number.isFinite(e.damage) || e.damage! < 0) throw Error('Invalid damage identity')
        const damage = Math.min(target.health, e.damage!)
        if (sides[e.actor] !== sides[e.target]) actor.damage += damage
        target.health -= damage
        if (damage > 0 && target.health === 0) {
            target.deaths++
            if (sides[e.actor] !== sides[e.target]) {
                actor.kills++
                physicalKills.push({ playerId: e.actor, kills: 1, weapon: e.type === 'blast-damage' ? 'HE' : e.type === 'fire-damage' ? 'FIRE' : e.weapon || project.teams!.actors.find(a => a.id === e.actor)?.loadout?.weapon || (sides[e.actor] === 'T' ? 'ak47' : 'm4a4') })
            }
        }
    }
    const frame = structuredClone([...result.frames].reverse().find(f => f.tick <= tick) || result.frames[0])
    // Health is event-authoritative even between positional snapshots.
    for (const actor of frame.actors) {
        if (!players[actor.id]) throw Error('Unknown replay actor')
        if (frame.tick === tick && actor.health !== players[actor.id].health) throw Error('Physical event / radar health mismatch')
        actor.health = players[actor.id].health
    }
    const complete = tick === finalTick, outcome = complete ? result.outcome : 'unresolved'
    if (complete && outcome !== 'unresolved') {
        const ids = (side: 'T' | 'CT') => project.teams!.actors.filter(a => a.side === side).map(a => a.id)
        const start = (side: 'T' | 'CT') => Object.fromEntries(ids(side).map(id => [id, { cash: 0, weapon: project.teams!.actors.find(a => a.id === id)?.loadout?.weapon || (side === 'T' ? 'ak47' : 'm4a4'), hasArmor: false, hasHelmet: false, hasKit: false }]))
        const winType = frame.bomb.state === 'exploded' ? 'BOMB_EXPLODED' : frame.bomb.state === 'defused' ? 'BOMB_DEFUSE' : events.some(e => e.type === 'round-timeout') ? 'TIME' : 'ELIMINATION'
        const kills = replay.engine === 'spatial-round-v1' ? Object.entries(players).map(([playerId, p]) => ({ playerId, kills: p.kills, weapon: sides[playerId] === 'T' ? 'ak47' : 'm4a4' })) : physicalKills
        const rewards = applyRoundEconomy({ homeEconomy: start('T'), awayEconomy: start('CT'), homeIsCT: false, homeLossStreakBefore: 0, awayLossStreakBefore: 0, homePlayerIds: ids('T'), awayPlayerIds: ids('CT'), roundResult: { winner: outcome === 'T' ? 'HOME' : 'AWAY', winType, kills, deaths: Object.entries(players).filter(([,p]) => p.deaths).map(([playerId,p]) => ({ playerId, deaths: p.deaths })) } })
        for (const [id, economy] of Object.entries({ ...rewards.homeEconomy, ...rewards.awayEconomy })) players[id].reward = economy.cash
    }
    return { tick, frame, events, players, outcome, reason: complete ? result.reason : 'Round in progress', complete }
}

export function captureRoundPosition(replay: SpatialRoundReplay, tick: number): RoundReplayCheckpoint {
    return { version: 1, engine: replay.engine, sha256: replay.sha256, tick: projectRoundReplay(replay, tick).tick }
}
export function restoreRoundPosition(replay: SpatialRoundReplay, saved: RoundReplayCheckpoint): RoundProjection {
    if (!saved || saved.version !== 1 || saved.engine !== replay.engine || saved.sha256 !== replay.sha256 || !Number.isInteger(saved.tick) || saved.tick < 0 || saved.tick > replay.result.frames.at(-1)!.tick) throw Error('Saved position belongs to a different replay or engine')
    return projectRoundReplay(replay, saved.tick)
}
