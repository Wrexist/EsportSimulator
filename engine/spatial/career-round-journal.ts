import { prepareCareerRoundProject, type CareerRoundPreviewRequest } from './resolve-career-round-preview'
import { settlePhysicalRoundPreview, type RoundSettlementPreview } from './round-settlement'
import { SPATIAL_ROUND_ENGINE, verifyRoundReplay, type SpatialRoundReplay } from './round-replay'
import type { SpatialReference } from './types'
import { advancePhysicalSeries, physicalSeriesRequest, type PhysicalSeriesState } from './match-lifecycle'
import { previewCareerRound } from './career-round-adapter'
import type { CareerRoundBinding } from './career-round-adapter'
import type { RoundReplayCheckpoint } from './round-replay'

export interface PhysicalRoundTicket { saveId: string; sessionId: string; requestId: string; revision: number; inputSha256: string }
export interface PhysicalCareerJournal {
    version: 1; mode: 'preview'; saveId: string; sessionId: string; revision: number; mapIndex: number
    engine?: SpatialRoundReplay['engine']
    settlement: RoundSettlementPreview
    pending: { ticket: PhysicalRoundTicket; projectSha256: string; meshSha256: string; request: CareerRoundPreviewRequest; engine?: SpatialRoundReplay['engine'] } | null
    latest: { ticket: PhysicalRoundTicket; replay: SpatialRoundReplay; binding?: CareerRoundBinding; mapIndex?: number; receipt?: string } | null
    playback?: RoundReplayCheckpoint
    series?: PhysicalSeriesState
}
const identifier = (s: string) => typeof s === 'string' && s.length > 0 && s.length <= 160
export async function physicalDigest(value: unknown) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))), n=>n.toString(16).padStart(2,'0')).join('')
}
export function createPhysicalJournal(saveId: string, sessionId: string, mapIndex: number, settlement: RoundSettlementPreview): PhysicalCareerJournal {
    if (!identifier(saveId) || !identifier(sessionId) || !Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex > 4 || settlement.version !== 1 || settlement.mode !== 'preview') throw Error('Invalid physical career session')
    return {version:1,mode:'preview',engine:SPATIAL_ROUND_ENGINE,saveId,sessionId,revision:0,mapIndex,settlement:structuredClone(settlement),pending:null,latest:null}
}
export async function reservePhysicalRound(input: PhysicalCareerJournal, round: CareerRoundPreviewRequest, reference: SpatialReference, requestId: string): Promise<PhysicalCareerJournal> {
    const journal=structuredClone(input),request=structuredClone(round)
    if(journal.engine!==SPATIAL_ROUND_ENGINE)throw Error('Rehearsal engine changed. Start a new rehearsal; existing recordings remain viewable.')
    if(journal.version!==1||journal.mode!=='preview'||!identifier(requestId)||journal.pending) throw Error('Physical session already owns a request or is invalid')
    if(JSON.stringify(request.settlement)!==JSON.stringify(journal.settlement)||request.binding.roundNumber!==journal.settlement.nextRound
        || request.binding.matchId!==journal.settlement.matchId || request.binding.mapId!==journal.settlement.mapId
        ||request.binding.homeTeamId!==journal.settlement.homeTeamId||request.binding.awayTeamId!==journal.settlement.awayTeamId) throw Error('Stale round inputs')
    if(journal.latest?.ticket.requestId===requestId) throw Error('Request ID has already been used')
    if (journal.series) {
        const expected = physicalSeriesRequest(journal, request.project)
        if (JSON.stringify(expected) !== JSON.stringify(request)) throw Error('Round does not match purchased series identities, side or seed')
    }
    const project=prepareCareerRoundProject(request,reference),revision=journal.revision+1
    const ticket={saveId:journal.saveId,sessionId:journal.sessionId,requestId,revision,inputSha256:await physicalDigest(request)}
    return {...journal,revision,pending:{ticket,projectSha256:await physicalDigest(project),meshSha256:reference.meshSha256,request,engine:SPATIAL_ROUND_ENGINE}}
}
/** Validate a worker artifact and derive the payout locally; worker-supplied totals are never trusted. */
export async function commitPhysicalRound(input: PhysicalCareerJournal, suppliedTicket: PhysicalRoundTicket, suppliedReplay: SpatialRoundReplay): Promise<PhysicalCareerJournal> {
    const journal=structuredClone(input),ticket=structuredClone(suppliedTicket),replay=structuredClone(suppliedReplay)
    if(journal.version!==1||journal.mode!=='preview'||ticket.saveId!==journal.saveId||ticket.sessionId!==journal.sessionId) throw Error('Physical result belongs to another career session')
    if(!await verifyRoundReplay(replay)) throw Error('Physical replay integrity failed')
    if(journal.latest && JSON.stringify(journal.latest.ticket)===JSON.stringify(ticket) && journal.latest.replay.sha256===replay.sha256) return journal
    const pending=journal.pending
    if(!pending||ticket.revision!==journal.revision||JSON.stringify(ticket)!==JSON.stringify(pending.ticket)) throw Error('Stale or cancelled physical result')
    if((pending.engine || 'spatial-round-v3')!==replay.engine)throw Error('Rehearsal engine changed. Clear the pending rehearsal and start a new one; saved replays remain viewable.')
    if(JSON.stringify(journal.settlement)!==JSON.stringify(pending.request.settlement))throw Error('Settlement changed during physical resolution')
    if(journal.series && JSON.stringify(physicalSeriesRequest(journal,pending.request.project))!==JSON.stringify(pending.request)) throw Error('Series changed during physical resolution')
    if(replay.engine!==SPATIAL_ROUND_ENGINE||replay.meshSha256!==pending.meshSha256
        ||await physicalDigest(pending.request)!==ticket.inputSha256
        ||await physicalDigest(replay.project)!==pending.projectSha256) throw Error('Physical result does not match the reserved inputs')
    const settlement=await settlePhysicalRoundPreview(journal.settlement,replay,pending.request.binding)
    const next = {...journal,revision:journal.revision+1,settlement,pending:null,playback:undefined,latest:{ticket,replay,binding:structuredClone(pending.request.binding),mapIndex:journal.mapIndex,receipt:settlement.receipts[pending.request.binding.roundNumber]}}
    if (next.series) advancePhysicalSeries(next, await previewCareerRound(replay,pending.request.binding))
    return next
}
export function cancelPhysicalRound(input: PhysicalCareerJournal): PhysicalCareerJournal {
    return {...structuredClone(input),revision:input.revision+1,pending:null}
}
