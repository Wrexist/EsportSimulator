'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { prepareCareerRadar, type CareerRadarProjector } from '@/engine/spatial/career-radar'
import { restoreRoundPosition, type RoundReplayCheckpoint, type SpatialRoundReplay } from '@/engine/spatial/round-replay'
import type { CareerRoundBinding } from '@/engine/spatial/career-round-adapter'
import type { SpatialReference } from '@/engine/spatial/types'
import { MapRadarPanel } from './MapRadarPanel'
import { Button } from '@/components/ui/button'
import { MapId } from '@/types'

export function PhysicalReplayPlayer({replay,binding,names,checkpoint,onCheckpoint,onSave}:{
    replay:SpatialRoundReplay;binding:CareerRoundBinding;names:Record<string,string>
    checkpoint?:RoundReplayCheckpoint;onCheckpoint?:(tick:number)=>void;onSave?:()=>void
}) {
    const [loaded,setLoaded]=useState<{projector:CareerRadarProjector;reference:SpatialReference}|null>(null)
    const [error,setError]=useState(''),[tick,setTick]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1)
    const current=useRef(0),persist=useRef(onCheckpoint)
    persist.current=onCheckpoint
    const bindingKey=JSON.stringify(binding)
    useEffect(()=>{
        const controller=new AbortController()
        setLoaded(null);setError('');setPlaying(false)
        void (async()=>{
            try {
                const response=await fetch(`/map-studio/spatial/${encodeURIComponent(replay.project.mapId)}.json`,{signal:controller.signal})
                if(!response.ok)throw Error('The recorded map reference is unavailable.')
                const reference:SpatialReference=await response.json()
                const projector=await prepareCareerRadar(replay,JSON.parse(bindingKey),reference)
                let start=0
                try {if(checkpoint)start=restoreRoundPosition(replay,checkpoint).tick} catch { /* Stale bookmarks start safely at zero. */ }
                if(!controller.signal.aborted){current.current=start;setTick(start);setLoaded({projector,reference})}
            } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Replay could not be verified.')}
        })()
        return ()=>{controller.abort()}
        // The saved position is sampled once when this immutable replay is opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[replay,bindingKey])
    useEffect(()=>()=>{persist.current?.(current.current)},[])
    useEffect(()=>{
        if(!playing||!loaded)return
        const timer=setInterval(()=>{
            const next=Math.min(loaded.projector.endTick,current.current+8*speed)
            current.current=next;setTick(next)
            if(next===loaded.projector.endTick){setPlaying(false);persist.current?.(next)}
        },125)
        return ()=>clearInterval(timer)
    },[playing,loaded,speed])
    const data=useMemo(()=>loaded?.projector.at(tick,names),[loaded,tick,names])
    if(error)return <p role="alert" className="text-red-300 text-sm">{error} The career match has not changed.</p>
    if(!loaded||!data)return <p role="status" className="text-sm text-slate-300">Verifying recorded round…</p>
    const seek=(value:number)=>{setPlaying(false);current.current=value;setTick(value);persist.current?.(value)}
    return <div className="space-y-3" data-testid="physical-replay-player">
        <p className="text-sm text-slate-300">{binding.mapId} · Round {binding.roundNumber} · Home {binding.homeSide} · {data.projection.complete?data.projection.reason:'Round in progress'}</p>
        <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={!playing&&tick>=loaded.projector.endTick} onClick={()=>{if(playing)persist.current?.(current.current);setPlaying(!playing)}}>{playing?'Pause replay':'Play replay'}</Button>
            <Button size="sm" variant="secondary" onClick={()=>seek(0)}>Restart replay</Button>
            {onSave&&<Button size="sm" variant="secondary" onClick={()=>{persist.current?.(current.current);onSave()}}>Save replay position</Button>}
            <label className="text-sm">Speed <select aria-label="Replay speed" className="rounded-lg bg-slate-800 p-2" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[0.5,1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
            <span className="tabular-nums text-sm">{(tick/64).toFixed(1)} / {(loaded.projector.endTick/64).toFixed(1)}s</span>
        </div>
        <input className="w-full accent-white" type="range" aria-label="Replay position" aria-valuetext={`${(tick/64).toFixed(1)} seconds`} min={0} max={loaded.projector.endTick} step={1} value={tick} onChange={e=>seek(Number(e.target.value))}/>
        <MapRadarPanel currentMapId={binding.mapId as MapId} mapName={binding.mapId} referenceImages={{primary:loaded.reference.radars.upper,secondary:loaded.reference.radars.lower}}
            positionSource="physical-replay" radarDots={data.dots} bombState={data.bomb} killLines={data.killLines} smokes={data.smokes} sitePositions={data.sitePositions} currentTime={tick/64}/>
        <div className="grid grid-cols-2 gap-3" aria-label="Recorded player statistics">
            {(['ct','t'] as const).map(side=><div key={side} className="rounded-xl border border-white/10 p-3">
                <h3 className="mb-2 text-sm font-semibold">{side.toUpperCase()} · {binding.homeSide.toLowerCase()===side?'Home':'Away'}</h3>
                {data.dots.filter(p=>p.side===side).map(dot=>{
                    const actor=binding.players.find(p=>p.playerId===dot.playerId)!.actorId,stats=data.projection.players[actor]
                    return <div key={dot.playerId} className="flex justify-between gap-2 py-1 text-xs"><span className="truncate">{dot.nickname}</span><span className="shrink-0 tabular-nums">{stats.health} HP · {stats.kills}/{stats.deaths}</span></div>
                })}
            </div>)}
        </div>
        <p className="text-xs text-slate-400">Recorded simulation at 8 snapshots/second. Smoke circles show model radius. Geometry and combat calibration remain in review.</p>
    </div>
}
