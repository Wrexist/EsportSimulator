'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useGameStore } from '@/store/game-store'
import type { LabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference } from '@/engine/spatial/types'
import type { SpatialRoundReplay } from '@/engine/spatial/round-replay'
import { SPATIAL_ROUND_ENGINE } from '@/engine/spatial/round-replay'
import type { CareerRoundPreviewRequest } from '@/engine/spatial/resolve-career-round-preview'
import type { PhysicalRoundTicket } from '@/engine/spatial/career-round-journal'
import type { BuyStrategy } from '@/engine/match/buy-phase'

export function CareerRoundRehearsal({project,reference,worker,disabled,onReplay}:{project:LabProject|null;reference:SpatialReference|null;worker:RefObject<Worker|null>;disabled:boolean;onReplay:(replay:SpatialRoundReplay)=>void}){
    const journal=useGameStore(s=>s.physicalMatchPreview),active=useGameStore(s=>s.activeMatchState),saveId=useGameStore(s=>s.saveId)
    const [busy,setBusy]=useState(false),[message,setMessage]=useState('Runs a saved series using your roster and match order. Career results, money and XP are unchanged.')
    const abort=useRef<AbortController|null>(null)
    const [homeBuy,setHomeBuy]=useState<BuyStrategy>('FULL'),[awayBuy,setAwayBuy]=useState<BuyStrategy>('FULL')
    const transition=async(type:'next-map'|'finalize')=>{
        if(!journal||busy)return
        setBusy(true)
        try{await useGameStore.getState().progressPhysicalPreview(journal.saveId,journal.sessionId,journal.revision,{type});await useGameStore.getState().saveGame();setMessage(type==='next-map'?'Next map ready. Load its geometry and five spawn slots per side.':'Series result saved. Career rewards are unchanged.')}
        catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
    }
    useEffect(()=>()=>abort.current?.abort(),[reference,project])
    const resolve=(request:CareerRoundPreviewRequest,ticket:PhysicalRoundTicket,signal:AbortSignal)=>new Promise<SpatialRoundReplay>((resolve,reject)=>{
        const instance=worker.current
        if(!instance||signal.aborted){reject(Error('Geometry worker unavailable'));return}
        const id=`career:${ticket.sessionId}:${ticket.requestId}`
        const finish=(error?:Error,replay?:SpatialRoundReplay)=>{clearTimeout(timer);instance.removeEventListener('message',receive);instance.removeEventListener('error',fail);signal.removeEventListener('abort',cancel);error?reject(error):resolve(replay!)}
        const receive=(event:MessageEvent)=>{if(event.data.id===id){if(event.data.type==='career-round-preview-result')finish(undefined,event.data.replay);else if(event.data.type==='error')finish(Error(event.data.message))}}
        const fail=()=>finish(Error('Worker failed. The reserved round can be retried.')),cancel=()=>finish(Error('Rehearsal interrupted; its saved request is preserved.'))
        const timer=setTimeout(()=>finish(Error('Rehearsal timed out. Its saved request is preserved for retry.')),60000)
        instance.addEventListener('message',receive);instance.addEventListener('error',fail);signal.addEventListener('abort',cancel,{once:true})
        instance.postMessage({type:'career-round-preview',id,...request})
    })
    const run=async()=>{
        if(!project||!reference||busy||disabled)return
        setBusy(true);const controller=new AbortController();abort.current=controller
        try{
            let saved=useGameStore.getState().physicalMatchPreview
            if(!saved){
                const state=useGameStore.getState(),match=state.scheduledMatches.find(m=>m.id===state.activeMatchState?.matchId)
                if(!state.saveId||!state.activeMatchState||!match)throw Error('Open a saved career match at its buy phase first')
                const {careerRehearsalInput}=await import('@/engine/spatial/career-rehearsal-input')
                const request=careerRehearsalInput(project,state.activeMatchState,match.homeTeamId,match.awayTeamId,state.players)
                const {resolveCanonicalSeriesMaps,resolveHomeStartsCT}=await import('@/lib/live-match-utils')
                const format=match.format
                if(format!=='BO1'&&format!=='BO3'&&format!=='BO5')throw Error('Unsupported series format')
                const maps=resolveCanonicalSeriesMaps({format:match.format,seed:match.seed,savedMaps:state.activeMatchState.playback?.maps || match.maps})
                if(project.mapId!==maps[0])throw Error(`Load the first series map (${maps[0]}) to start a full rehearsal`)
                const settlement={...request.settlement,nextRound:1,homeScore:0,awayScore:0,receipts:{}}
                const roster=(home:boolean)=>(home?state.activeMatchState!.homeRoster:state.activeMatchState!.awayRoster).map(p=>{
                    const player=state.players.find(saved=>saved.id===p.id)
                    if(!player)throw Error('Career player is missing')
                    const {id,role,rifle,awp,pistol,reaction,tactic}=player
                    return {id,role,rifle,awp,pistol,reaction,tactic}
                })
                await state.startPhysicalPreview(state.saveId,crypto.randomUUID(),0,settlement,{format,seed:match.seed,...(state.playerTeamId===match.homeTeamId?{homeTactics:state.customTactics}:{awayTactics:state.customTactics}),homePlayers:roster(true),awayPlayers:roster(false),maps:maps.map((mapId,mapIndex)=>({mapId,homeStartsCT:resolveHomeStartsCT({mapId,mapIndex,seed:match.seed,homeTeamId:match.homeTeamId,awayTeamId:match.awayTeamId,mapStartingSides:match.mapStartingSides})}))})
                saved=useGameStore.getState().physicalMatchPreview
            }
            if(saved?.series&&!saved.pending){
                if(saved.settlement.mapId!==reference.mapId)throw Error(`Load ${saved.settlement.mapId} before continuing`)
                if(saved.series.phase==='buy')await useGameStore.getState().progressPhysicalPreview(saved.saveId,saved.sessionId,saved.revision,{type:'buy',home:homeBuy,away:awayBuy})
                saved=useGameStore.getState().physicalMatchPreview!
                const {physicalSeriesRequest}=await import('@/engine/spatial/match-lifecycle')
                await useGameStore.getState().reservePhysicalPreview(physicalSeriesRequest(saved,project),reference,crypto.randomUUID())
                saved=useGameStore.getState().physicalMatchPreview
            }
            if(!saved?.pending)throw Error('This older single-round rehearsal is complete. Clear it to start a full series.')
            if(saved.pending.engine!==SPATIAL_ROUND_ENGINE)throw Error('This pending rehearsal uses older simulation rules. Clear it and start a new rehearsal. Your career match is unchanged.')
            if(saved.saveId!==useGameStore.getState().saveId||saved.pending.meshSha256!==reference.meshSha256||saved.settlement.mapId!==reference.mapId)throw Error('Open the career and map that own this rehearsal')
            await useGameStore.getState().saveGame()
            setMessage('Request saved. Resolving the copied career round…')
            const replay=await resolve(saved.pending.request,saved.pending.ticket,controller.signal)
            await useGameStore.getState().commitPhysicalPreview(saved.pending.ticket,replay)
            await useGameStore.getState().saveGame()
            if(!controller.signal.aborted){onReplay(replay);setMessage('Rehearsal saved. Replay, score and equipment carry-over share one physical result. The career match is unchanged.')}
        }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Rehearsal failed')}
        finally{setBusy(false)}
    }
    return <details><summary>Career series rehearsal</summary>
        <p>Full 5v5 series rehearsal. Starts from round one with your career roster and map order. No career rewards.</p>
        {journal?.series&&<p>Map {journal.mapIndex+1}: {journal.settlement.mapId} | {journal.settlement.homeScore}:{journal.settlement.awayScore} | Series {journal.series.homeWins}:{journal.series.awayWins} | Home {journal.series.homeSide} | {journal.series.overtimeSet?`Overtime ${journal.series.overtimeSet}`:'Regulation'} | {journal.series.phase}</p>}
        {(!journal||journal.series?.phase==='buy')&&<div>{(['Home','Away'] as const).map(team=><label key={team}>{team} buy <select disabled={busy} value={team==='Home'?homeBuy:awayBuy} onChange={e=>(team==='Home'?setHomeBuy:setAwayBuy)(e.target.value as BuyStrategy)}>{(['ECO','FORCE','SEMIBUY','FULL','DOUBLE AWP'] as const).map(buy=><option key={buy}>{buy}</option>)}</select></label>)}<p>Regulation half starts use pistol purchases automatically.</p></div>}
        <button disabled={disabled||busy||!!(journal?.series&&!['buy','ready'].includes(journal.series.phase))||!!(journal?.latest&&!journal.series)||!project?.teams||!reference||(!journal&&!active)} onClick={()=>void run()}>{busy?'Resolving...':journal?.pending?'Retry saved round':journal?'Purchase and run next round':'Start series rehearsal'}</button>
        {journal?.series?.phase==='map-complete'&&<button disabled={busy} onClick={()=>void transition('next-map')}>Continue to next map</button>}
        {journal?.series?.phase==='finished'&&<button disabled={busy} onClick={()=>void transition('finalize')}>Settle rehearsal series</button>}
        {journal?.series?.final&&<p>Final: {journal.series.final.homeWins}:{journal.series.final.awayWins}. Winner: {journal.series.final.winnerId===journal.settlement.homeTeamId?'Home':'Away'}. Saved once; no career money or XP awarded.</p>}
        {journal?.latest&&<button disabled={busy} onClick={()=>onReplay(journal.latest!.replay)}>View saved physical replay</button>}
        {journal&&<button disabled={busy} onClick={()=>{if(saveId){useGameStore.getState().clearPhysicalPreview(saveId,journal.sessionId);void useGameStore.getState().saveGame().catch(e=>setMessage(String(e)))}}}>Clear rehearsal</button>}
        <p role="status">{message}</p>
    </details>
}
