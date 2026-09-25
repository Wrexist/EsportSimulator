import type { CareerRoundBinding } from './career-round-adapter'
import { previewCareerRound } from './career-round-adapter'
import type { SpatialRoundReplay } from './round-replay'
import { projectRoundReplay } from './round-replay'
import { toRadar, type SpatialReference, type Vec3 } from './types'
import type { RadarBombState, RadarKillLine, RadarPlayerDot, RadarSmoke } from '@/lib/radar-position-engine'
import { UTILITY_MODEL } from './utility'
import type { PhysicalCareerJournal } from './career-round-journal'

export function savedCareerRadarBinding(journal: PhysicalCareerJournal, saveId: string, matchId: string): CareerRoundBinding | null {
    const latest=journal.latest
    if (!latest || journal.saveId!==saveId || latest.ticket.saveId!==saveId || latest.ticket.sessionId!==journal.sessionId
        || journal.settlement.matchId!==matchId) return null
    const receipts = [...Object.values(journal.settlement.receipts),...(latest.receipt?[latest.receipt]:[])]
    // A persisted settlement receipt carries identities even for older journals.
    for (const raw of receipts) {
        try {
            const receipt=JSON.parse(raw) as {replay:string;binding?:CareerRoundBinding}
            const binding=receipt.binding
            if (receipt.replay!==latest.replay.sha256 || !binding || binding.matchId!==matchId) continue
            if (latest.binding && JSON.stringify([...latest.binding.players].sort((a,b)=>a.actorId.localeCompare(b.actorId))) !== JSON.stringify(binding.players)) return null
            return binding
        } catch { /* A damaged receipt cannot authorize playback. */ }
    }
    // Never infer old-round identities from the next map's side/roster ordering.
    return null
}

/** Use the reference image paired with these world coordinates, never the editor's
 * independently registered source image. Validate once before enabling playback. */
export async function prepareCareerRadar(inputReplay: SpatialRoundReplay, inputBinding: CareerRoundBinding, inputReference: SpatialReference) {
    const replay=structuredClone(inputReplay),binding=structuredClone(inputBinding),reference=structuredClone(inputReference)
    if (reference.mapId !== replay.project.mapId || reference.sourceVersion !== replay.project.sourceVersion
        || reference.meshSha256 !== replay.meshSha256 || !(reference.transform.scale > 0)
        || ![reference.transform.pos_x, reference.transform.pos_y, reference.transform.scale].every(Number.isFinite)
        || reference.transform.rotate || reference.transform.zoom && reference.transform.zoom !== 1) throw Error('Replay radar reference mismatch')
    await previewCareerRound(replay, binding)
    return createCareerRadarProjector(replay, binding, reference)
}

export function replayFloor(point: Vec3, reference: SpatialReference): 'upper' | 'lower' {
    const lower = reference.transform.verticalsections?.lower
    return reference.radars.lower && lower && point[2] >= Number(lower.AltitudeMin) && point[2] < Number(lower.AltitudeMax) ? 'lower' : 'upper'
}

function createCareerRadarProjector(input: SpatialRoundReplay, inputBinding: CareerRoundBinding, inputReference: SpatialReference) {
    // The projector owns its validated input even if a caller later edits a draft.
    const replay = structuredClone(input), binding = structuredClone(inputBinding), reference = structuredClone(inputReference)
    const identities = new Map(binding.players.map(p => [p.actorId, p]))
    const health=new Map(replay.project.teams!.actors.map(a=>[a.id,a.health])),deathTicks=new Map<string,number>()
    for(const e of replay.result.events){
        if(!e.target||!['damage','blast-damage','fire-damage'].includes(e.type))continue
        const before=health.get(e.target)!,after=Math.max(0,before-(e.damage||0))
        health.set(e.target,after)
        if(before>0&&after===0)deathTicks.set(e.target,e.tick)
    }
    const xy = (point: Vec3) => { const [x,y] = toRadar(point, reference); return {x,y} }
    const endTick = replay.result.frames.at(-1)!.tick
    return {
        endTick,
        at(tick: number, names: Record<string, string> = {}) {
            const projection = projectRoundReplay(replay, tick)
            const dots: RadarPlayerDot[] = projection.frame.actors.map(actor => {
                const id = identities.get(actor.id)!.playerId
                // Hold recorded snapshots: straight interpolation can cut across a
                // corner or through an intervening floor between 8 Hz captures.
                const death = projection.players[actor.id].health <= 0
                const deathTick = death ? deathTicks.get(actor.id) : undefined
                return { playerId:id, nickname:names[id] || id, ...xy(actor.position), side:actor.side === 'CT' ? 'ct' : 't',
                    isAlive:!death, deathTime:deathTick === undefined ? undefined : deathTick / 64,
                    level:replayFloor(actor.position,reference), angle:-actor.yaw * Math.PI / 180 }
            })
            const killLines: RadarKillLine[] = projection.events.filter(e => e.type === 'damage' && e.from && e.point && projection.tick-e.tick <= 128)
                .flatMap(e => {
                    // A single 2D line cannot represent a shot between floors.
                    if (replayFloor(e.from!,reference) !== replayFloor(e.point!,reference)) return []
                    const a=xy(e.from!),b=xy(e.point!)
                    return [{fromX:a.x,fromY:a.y,toX:b.x,toY:b.y,time:e.tick/64,isHeadshot:!!e.headshot,weapon:e.weapon,level:replayFloor(e.point!,reference)}]
                })
            const bomb = projection.frame.bomb
            const bombState: RadarBombState = {planted:bomb.state === 'planted',position:xy(bomb.point),exploded:bomb.state === 'exploded',
                defused:bomb.state === 'defused',defuseTime:projection.events.find(e=>e.type==='defused')?.tick === undefined ? undefined : projection.events.find(e=>e.type==='defused')!.tick/64,
                level:replayFloor(bomb.point,reference)}
            const smokes: RadarSmoke[] = (replay.result.utility?.effects || []).filter(e=>e.kind==='smoke' && e.start<=projection.tick && e.end>=projection.tick)
                .map(e=>({...xy(e.point),radius:UTILITY_MODEL.smokeRadius/(reference.transform.scale*10.24),startTime:e.start/64,endTime:e.end/64,level:replayFloor(e.point,reference)}))
            const sites=replay.project.teams!.sites
            return {dots,killLines,bomb:bombState,smokes,sitePositions:{a:xy(sites.A.point),b:xy(sites.B.point)},projection}
        },
    }
}
export type CareerRadarProjector = Awaited<ReturnType<typeof prepareCareerRadar>>
