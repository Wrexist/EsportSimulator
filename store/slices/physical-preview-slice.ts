import type { SliceCreator, StoreState } from '@/store/types'
import type { PhysicalCareerJournal, PhysicalRoundTicket } from '@/engine/spatial/career-round-journal'
import type { CareerRoundPreviewRequest } from '@/engine/spatial/resolve-career-round-preview'
import type { RoundSettlementPreview } from '@/engine/spatial/round-settlement'
import type { SpatialRoundReplay } from '@/engine/spatial/round-replay'
import { captureRoundPosition, SPATIAL_ROUND_ENGINE } from '@/engine/spatial/round-replay'
import type { SpatialReference } from '@/engine/spatial/types'
import type { PhysicalSeriesConfig } from '@/engine/spatial/match-lifecycle'
import type { BuyStrategy } from '@/engine/match/buy-phase'

export interface PhysicalPreviewActions {
    startPhysicalPreview: (saveId: string, sessionId: string, mapIndex: number, settlement: RoundSettlementPreview, series?: PhysicalSeriesConfig) => Promise<void>
    progressPhysicalPreview: (saveId: string, sessionId: string, revision: number, action: {type:'buy'; home:BuyStrategy; away:BuyStrategy} | {type:'next-map' | 'finalize'}) => Promise<void>
    reservePhysicalPreview: (request: CareerRoundPreviewRequest, reference: SpatialReference, requestId: string) => Promise<PhysicalRoundTicket>
    commitPhysicalPreview: (ticket: PhysicalRoundTicket, replay: SpatialRoundReplay) => Promise<void>
    clearPhysicalPreview: (saveId: string, sessionId: string) => void
    savePhysicalReplayPosition: (saveId: string, sessionId: string, sha256: string, tick: number) => boolean
}
function owns(state: StoreState, journal: PhysicalCareerJournal) {
    const match=state.scheduledMatches.find(m=>m.id===journal.settlement.matchId)
    return state.saveId===journal.saveId && match?.homeTeamId===journal.settlement.homeTeamId
        && match.awayTeamId===journal.settlement.awayTeamId && !state.completedMatches.some(m=>m.id===match.id)
        && (!match.maps?.length || match.maps[journal.mapIndex]===journal.settlement.mapId)
        && (!journal.series || (match.seed===journal.series.seed && match.format===journal.series.format
            && (!match.maps?.length || match.maps.every((map,index)=>journal.series!.maps[index]?.mapId===map))))
        && (!state.activeMatchId || state.activeMatchId===match.id)
}
/** Persisted rehearsal only. These actions never replace a legacy match or award career money/XP. */
export const createPhysicalPreviewSlice: SliceCreator<PhysicalPreviewActions> = (set,get) => ({
    savePhysicalReplayPosition:(saveId,sessionId,sha256,tick)=>{
        const current=get().physicalMatchPreview
        if(!current?.latest || !owns(get(),current) || current.saveId!==saveId || current.sessionId!==sessionId || current.latest.replay.sha256!==sha256 || !Number.isFinite(tick))return false
        const checkpoint=captureRoundPosition(current.latest.replay,tick)
        let applied=false
        set(state=>{
            const journal=state.physicalMatchPreview
            if(!journal?.latest || !owns(state,journal) || journal.saveId!==saveId || journal.sessionId!==sessionId || journal.latest.replay.sha256!==sha256 || !Number.isFinite(tick))return
            journal.playback=checkpoint
            applied=true
        })
        return applied
    },
    startPhysicalPreview: async(saveId,sessionId,mapIndex,settlement,series)=>{
        const snapshot=structuredClone(settlement)
        const config=series?structuredClone(series):undefined
        const {createPhysicalJournal}=await import('@/engine/spatial/career-round-journal')
        let journal=createPhysicalJournal(saveId,sessionId,mapIndex,snapshot)
        if(config){const {initializePhysicalSeries}=await import('@/engine/spatial/match-lifecycle');journal=initializePhysicalSeries(journal,config)}
        let applied=false
        set(state=>{if(!state.physicalMatchPreview&&owns(state,journal)){state.physicalMatchPreview=journal;applied=true}})
        if(!applied)throw Error('Cannot start physical preview in this career/match context')
    },
    progressPhysicalPreview:async(saveId,sessionId,revision,action)=>{
        const current=get().physicalMatchPreview
        if(!current||!owns(get(),current)||current.saveId!==saveId||current.sessionId!==sessionId||current.revision!==revision)throw Error('Stale physical series action')
        if(current.engine!==SPATIAL_ROUND_ENGINE)throw Error('Rehearsal engine changed. Start a new rehearsal; existing recordings remain viewable.')
        const before=JSON.stringify(current),snapshot=structuredClone(current),decision=structuredClone(action)
        const {purchasePhysicalRound,progressPhysicalMap,finalizePhysicalSeries}=await import('@/engine/spatial/match-lifecycle')
        const next=decision.type==='buy'?purchasePhysicalRound(snapshot,decision.home,decision.away):decision.type==='next-map'?progressPhysicalMap(snapshot):finalizePhysicalSeries(snapshot)
        let applied=false
        set(state=>{if(owns(state,next)&&JSON.stringify(state.physicalMatchPreview)===before){state.physicalMatchPreview=next;applied=true}})
        if(!applied)throw Error('Career changed during series transition')
    },
    reservePhysicalPreview: async(request,reference,requestId)=>{
        const current=get().physicalMatchPreview
        if(!current||!owns(get(),current))throw Error('No owned physical preview')
        const before=JSON.stringify(current), snapshot=structuredClone(current), round=structuredClone(request), ref=structuredClone(reference)
        const {reservePhysicalRound}=await import('@/engine/spatial/career-round-journal')
        const next=await reservePhysicalRound(snapshot,round,ref,requestId)
        let applied=false
        set(state=>{if(owns(state,next)&&JSON.stringify(state.physicalMatchPreview)===before){state.physicalMatchPreview=next;applied=true}})
        if(!applied)throw Error('Career changed while reserving physical round')
        return structuredClone(next.pending!.ticket)
    },
    commitPhysicalPreview: async(ticket,replay)=>{
        const current=get().physicalMatchPreview
        if(!current||!owns(get(),current))throw Error('No owned physical preview')
        const before=JSON.stringify(current), snapshot=structuredClone(current), receipt=structuredClone(ticket), artifact=structuredClone(replay)
        const {commitPhysicalRound}=await import('@/engine/spatial/career-round-journal')
        const next=await commitPhysicalRound(snapshot,receipt,artifact)
        let applied=false
        // Compare again inside the synchronous store mutation, after all digest awaits.
        set(state=>{if(owns(state,next)&&(JSON.stringify(state.physicalMatchPreview)===before||JSON.stringify(state.physicalMatchPreview)===JSON.stringify(next))){state.physicalMatchPreview=next;applied=true}})
        if(!applied)throw Error('Career changed while committing physical round')
    },
    clearPhysicalPreview:(saveId,sessionId)=>set(state=>{
        if(state.saveId===saveId&&state.physicalMatchPreview?.saveId===saveId&&state.physicalMatchPreview.sessionId===sessionId)state.physicalMatchPreview=null
    }),
})
