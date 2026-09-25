import type { RoundResult, MatchEvent } from '@/types/match'
import { projectRoundReplay, verifyRoundReplay, type SpatialRoundReplay } from './round-replay'

export interface CareerRoundBinding {
    matchId: string
    mapId: string
    roundNumber: number
    homeTeamId: string
    awayTeamId: string
    homeSide: 'T' | 'CT'
    /** Explicit identities: no hashing lab names into fictitious career players. */
    players: { actorId: string; playerId: string; teamId: string }[]
}

/** Read-only integration boundary. Never grants money, XP or changes a career.
 * Loadouts, attributes and polygons can be bound, but calibration and production
 * worker/save ownership remain pending. This is deliberately not a production-save payload.
 */
export async function previewCareerRound(inputReplay: SpatialRoundReplay, inputBinding: CareerRoundBinding) {
    const replay = structuredClone(inputReplay), binding = structuredClone(inputBinding)
    if (!await verifyRoundReplay(replay)) throw Error('Replay integrity check failed')
    if (binding.mapId !== replay.project.mapId || !binding.matchId || !Number.isInteger(binding.roundNumber) || binding.roundNumber < 1
        || !binding.homeTeamId || !binding.awayTeamId || binding.homeTeamId === binding.awayTeamId || !['T', 'CT'].includes(binding.homeSide)) throw Error('Invalid career round binding')
    const actors = replay.project.teams!.actors
    if (binding.players.length !== actors.length) throw Error('Every physical actor must have one career identity')
    const ids = new Set<string>(), slots = new Set<string>()
    const identities = new Map(binding.players.map(p => {
        const actor = actors.find(a => a.id === p.actorId)
        if (!actor || !p.playerId || ids.has(p.playerId) || slots.has(p.actorId)
            || p.teamId !== (actor.side === binding.homeSide ? binding.homeTeamId : binding.awayTeamId)) throw Error('Duplicate, unknown or wrong-side career identity')
        ids.add(p.playerId); slots.add(p.actorId)
        return [p.actorId, p] as const
    }))
    const end = replay.result.frames.at(-1)!.tick
    const projection = projectRoundReplay(replay, end)
    if (!projection.complete || projection.outcome === 'unresolved') throw Error('An unresolved round cannot produce a career result')
    const identity = (id?: string) => id ? identities.get(id)?.playerId : undefined
    const playerTeams = new Map(binding.players.map(p => [p.playerId, p.teamId]))
    const remaining = new Map(actors.map(a => [a.id, a.health]))
    const events: MatchEvent[] = []
    let planter: string | undefined, defuser: string | undefined
    for (const e of projection.events) {
        const time = e.tick / replay.tickRate
        if (e.type === 'plant-start') planter = identity(e.actor)
        if (e.type === 'defuse-start') defuser = identity(e.actor)
        if (e.type === 'objective-interrupted') { planter = undefined; defuser = undefined }
        if (e.type === 'planted') events.push({ type: 'PLANT', time, ...(planter ? { playerId: planter } : {}), details: `Site ${projection.frame.bomb.site}` })
        if (e.type === 'defused') events.push({ type: 'DEFUSE', time, ...(defuser ? { playerId: defuser } : {}) })
        if (e.type === 'exploded') events.push({ type: 'EXPLODE', time })
        if (!['damage', 'blast-damage', 'fire-damage'].includes(e.type) || !e.target || !e.actor) continue
        const health = remaining.get(e.target)!
        const after = Math.max(0, health - e.damage!)
        remaining.set(e.target, after)
        if (health > 0 && after === 0) events.push({ type: 'KILL', time, killerId: identity(e.actor), victimId: identity(e.target),
            playerId: identity(e.actor), weapon: e.type === 'damage' ? (e.weapon || 'LAB_RIFLE') : e.type === 'blast-damage' ? 'HE' : 'FIRE', isUtility: e.type !== 'damage', ...(e.headshot !== undefined ? { isHeadshot: e.headshot } : {}) })
    }
    const winType: RoundResult['winType'] = projection.frame.bomb.state === 'exploded' ? 'BOMB_EXPLODED'
        : projection.frame.bomb.state === 'defused' ? 'BOMB_DEFUSE'
            : projection.events.some(e => e.type === 'round-timeout') ? 'TIME' : 'ELIMINATION'
    const ctTeam = binding.homeSide === 'CT' ? binding.homeTeamId : binding.awayTeamId
    const tTeam = binding.homeSide === 'T' ? binding.homeTeamId : binding.awayTeamId
    events.push({ type: 'ROUND_END', time: end / replay.tickRate, side: projection.outcome === 'CT' ? 'ct' : 't', details: projection.reason })
    const round: RoundResult = {
        roundNumber: binding.roundNumber, winner: projection.outcome === 'CT' ? 'ct' : 't', winType, ctTeam, tTeam,
        winningTeamId: projection.outcome === 'CT' ? ctTeam : tTeam,
        kills: events.filter(e => e.type === 'KILL' && playerTeams.get(e.killerId!) !== playerTeams.get(e.victimId!))
            .map(e => ({ playerId: e.killerId!, kills: 1, weapon: e.weapon })),
        deaths: Object.entries(projection.players).filter(([, p]) => p.deaths > 0).map(([id, p]) => ({ playerId: identity(id)!, deaths: p.deaths })), events,
    }
    return {
        format: 'esim-career-round-preview' as const, version: 1 as const, careerEligible: false as const,
        replaySha256: replay.sha256, binding: structuredClone(binding), round,
        players: Object.entries(projection.players).map(([id, p]) => ({ playerId: identity(id)!, kills: p.kills, deaths: p.deaths, damage: p.damage, health: p.health })),
        blockers: [
            ...(actors.filter(a => a.side === 'T').length !== 5 || actors.filter(a => a.side === 'CT').length !== 5 ? ['A full 5v5 roster is required.'] : []),
            ...(actors.some(a => !a.loadout || !a.attributes) ? ['Career loadouts and attributes are not bound for every actor.'] : []),
            'Physical weapon and tactical calibration remains provisional.',
            ...(!replay.project.teams!.plantZones ? ['Plant polygons are not bound.'] : []),
            'Spawn/plant geometry and traversal still require review.',
            'Production career result activation remains disabled; round ownership currently covers saved rehearsals.',
        ],
    }
}
